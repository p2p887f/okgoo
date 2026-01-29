const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const devices = new Map();

app.post('/register', (req, res) => {
    const deviceId = req.get('X-Device-Id');
    if (deviceId && req.body) {
        devices.set(deviceId, {
            ...req.body,
            connected: true,
            lastSeen: Date.now()
        });
        io.emit('devices-update', Array.from(devices.entries()));
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Missing deviceId' });
    }
});

app.delete('/unregister', (req, res) => {
    const deviceId = req.get('X-Device-Id');
    if (deviceId) {
        devices.delete(deviceId);
        io.emit('devices-update', Array.from(devices.entries()));
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Missing deviceId' });
    }
});

app.post('/frame', (req, res) => {
    const deviceId = req.get('X-Device-Id');
    if (deviceId && devices.has(deviceId)) {
        const frameData = req.body;
        io.to(deviceId).emit('screen-update', frameData);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            socket.join(deviceId);
            devices.set(deviceId, { ...deviceInfo, connected: true });
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    socket.on('control', (cmd) => {
        const deviceId = cmd.deviceId;
        if (deviceId && devices.has(deviceId)) {
            io.to(deviceId).emit('control', cmd);
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Cleanup disconnected devices
setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices) {
        if (now - info.lastSeen > 60000) {
            devices.delete(deviceId);
        }
    }
    io.emit('devices-update', Array.from(devices.entries()));
}, 30000);

server.listen(3000, () => {
    console.log('🚀 Server running on http://0.0.0.0:3000');
});
