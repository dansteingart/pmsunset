const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io');

const app = express();
const server = createServer(app);
const io = new Server(server);

// Load config
let config = {
    password: 'sunset123',
    port: 4000,
    updateInterval: 1000
};

try {
    const configPath = path.join(os.homedir(), '.pmsunset-config.json');
    if (fs.existsSync(configPath)) {
        config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    }
} catch (error) {
    console.log('Using default config');
}

const PORT = process.env.PORT || config.port;

app.use(express.json());
app.use(express.static('.'));

// Authentication middleware
const authenticatedSockets = new Set();

function requireAuth(req, res, next) {
    const { password } = req.body;
    if (password !== config.password) {
        return res.status(401).json({
            success: false,
            error: 'Invalid password'
        });
    }
    next();
}

// Login endpoint
app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === config.password) {
        res.json({ success: true });
    } else {
        res.status(401).json({
            success: false,
            error: 'Invalid password'
        });
    }
});

app.post('/api/execute', requireAuth, (req, res) => {
    const { command } = req.body;
    
    if (!command || !command.startsWith('pm2')) {
        return res.status(400).json({
            success: false,
            error: 'Only PM2 commands are allowed'
        });
    }

    exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
        if (error) {
            return res.json({
                success: false,
                error: error.message,
                stderr: stderr
            });
        }

        res.json({
            success: true,
            output: stdout,
            stderr: stderr
        });
    });
});

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('authenticate', (password) => {
        if (password === config.password) {
            authenticatedSockets.add(socket.id);
            socket.emit('authenticated', true);
            
            // Start sending process updates
            sendProcessUpdates(socket);
        } else {
            socket.emit('authenticated', false);
        }
    });
    
    socket.on('disconnect', () => {
        authenticatedSockets.delete(socket.id);
        console.log('Client disconnected');
    });
});

function sendProcessUpdates(socket) {
    const interval = setInterval(() => {
        if (!authenticatedSockets.has(socket.id)) {
            clearInterval(interval);
            return;
        }
        
        exec('pm2 jlist', { timeout: 5000 }, (error, stdout, stderr) => {
            if (!error && authenticatedSockets.has(socket.id)) {
                try {
                    const processes = JSON.parse(stdout || '[]');
                    socket.emit('processUpdate', processes);
                } catch (e) {
                    console.error('Error parsing PM2 output:', e);
                }
            }
        });
    }, config.updateInterval);
    
    socket.on('disconnect', () => {
        clearInterval(interval);
    });
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

server.listen(PORT, () => {
    console.log(`pmsunset running on http://localhost:${PORT}`);
    console.log(`Config loaded from: ${path.join(os.homedir(), '.pmsunset-config.json')}`);
});