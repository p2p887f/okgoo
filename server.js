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
    pingInterval: 25000,
    maxHttpBufferSize: 100 * 1024 * 1024

});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const devices = new Map();

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
            socket.join(deviceId);
            console.log("📱 Device LIVE:", deviceId, deviceInfo.model);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // 🔥 BROADCAST SCREEN TO ALL (NOT ROOM - FIX BLACK SCREEN)
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            // BROADCAST TO ALL CLIENTS (NOT JUST ROOM)
            socket.broadcast.emit('screen-update', {
                deviceId,
                data: data.data,
                width: data.width,
                height: data.height,
                timestamp: data.timestamp
            });
        }
    });

    // 🔥 BROADCAST LAYOUT TO ALL
    socket.on('ui-layout', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            socket.broadcast.emit('ui-layout-update', data);
        }
    });

    // 🔥 CONTROL TO SPECIFIC DEVICE ROOM
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, scrollDistance } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', data);
            console.log('🎮', action, '→', deviceId);
        }
    });

    socket.on('disconnect', () => {
        for (let [deviceId, info] of devices) {
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
    console.log(`🚀 Server: http://localhost:${PORT}`);
});
