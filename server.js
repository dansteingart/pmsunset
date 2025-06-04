const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));

app.post('/api/execute', (req, res) => {
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`PM2 Sunset Dashboard running on http://localhost:${PORT}`);
});