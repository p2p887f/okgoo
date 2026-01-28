const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const devices = new Map(); // deviceId -> {unlockToken, used: false}

app.use(cors());
app.use(express.json());

app.get('/api/device', (req, res) => {
    const { action, device, data, model, android, unlock } = req.query;
    
    if (action === 'register') {
        devices.set(device, {
            model: model || 'Unknown',
            android: android || 'Unknown',
            unlockToken: Math.random().toString(36).substr(2, 9),
            used: false
        });
        console.log(`Device registered: ${device} (${model}, Android ${android})`);
        res.json({ status: 'registered', deviceId: device, token: devices.get(device).unlockToken });
    }
    
    else if (action === 'unlock_data') {
        if (devices.has(device)) {
            console.log(`Unlock data from ${device}: ${data}`);
            res.json({ status: 'received', device });
        } else {
            res.status(404).json({ error: 'Device not registered' });
        }
    }
    
    else if (action === 'unlock' || unlock === 'true') {
        if (devices.has(device)) {
            const dev = devices.get(device);
            if (!dev.used) {
                dev.used = true;
                console.log(`UNLOCK TRIGGERED for ${device}`);
                res.json({ status: 'UNLOCK' });
            } else {
                console.log(`Unlock already used for ${device}`);
                res.json({ status: 'ALREADY_USED' });
            }
        } else {
            res.status(404).json({ error: 'Device not registered' });
        }
    }
    
    else {
        res.json({
            devices: Array.from(devices.entries()).map(([id, data]) => ({
                id,
                model: data.model,
                android: data.android,
                unlockToken: data.unlockToken,
                used: data.used
            }))
        });
    }
});

const server = http.createServer(app);
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log(`Usage: /api/device?$deviceid&unlock=true`);
});

module.exports = app;
