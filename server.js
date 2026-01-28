const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require(path);
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
const deviceSockets = new Map(); // Track device -> socket mapping

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
    console.log('🔌 Socket connected:', socket.id);

    // 🔥 DEVICE REGISTRATION - Track socket properly
    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        console.log('📱 Device register:', deviceId);
        
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            deviceSockets.set(deviceId, socket); // 🔥 DIRECT SOCKET REFERENCE
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log(`✅ Device ${deviceId} → Socket ${socket.id}`);
        }
    });

    // ✅ SCREEN STREAMING
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        socket.broadcast.emit('screen-update', data);
    });

    // 🔥 CONTROL COMMANDS - FIXED 100%
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        console.log(`🎮 CONTROL [${deviceId}] ${action}`, {x,y,startX,startY,endX,endY});
        
        const deviceSocket = deviceSockets.get(deviceId);
        if (deviceSocket) {
            // ✅ DIRECT SOCKET EMIT + ROOM EMIT (DOUBLE SURE)
            deviceSocket.emit('control', {
                action, x: parseFloat(x)||0, y: parseFloat(y)||0,
                startX: parseFloat(startX)||0, startY: parseFloat(startY)||0,
                endX: parseFloat(endX)||0, endY: parseFloat(endY)||0
            });
            io.to(deviceId).emit('control', {
                action, x: parseFloat(x)||0, y: parseFloat(y)||0,
                startX: parseFloat(startX)||0, startY: parseFloat(startY)||0,
                endX: parseFloat(endX)||0, endY: parseFloat(endY)||0
            });
            console.log(`✅ SENT to ${deviceId} (${deviceSocket.id})`);
        } else {
            console.log(`❌ Device socket not found: ${deviceId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('🔌 Socket disconnected:', socket.id);
        // Cleanup device mapping
        for (const [deviceId, deviceSocket] of deviceSockets.entries()) {
            if (deviceSocket.id === socket.id) {
                devices.set(deviceId, { ...devices.get(deviceId), connected: false });
                deviceSockets.delete(deviceId);
                io.emit('devices-update', Array.from(devices.entries()));
                console.log(`📴 Device disconnected: ${deviceId}`);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`✅ FULL CONTROL + SCREEN READY`);
});
