class PM2Dashboard {
    constructor() {
        this.processes = [];
        this.currentLogProcess = null;
        this.logUpdateInterval = null;
        this.processUpdateInterval = null;
        this.currentView = localStorage.getItem('pmsunset-view-preference') || 'cards';
        this.currentTheme = localStorage.getItem('pmsunset-theme-preference') || 'light';
        this.authenticated = false;
        this.socket = null;
        this.userPassword = localStorage.getItem('pmsunset-password') || '';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.restorePreferences();
        this.showLoginIfNeeded();
    }

    setupEventListeners() {
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));
        });

        document.getElementById('themeBtn').addEventListener('click', () => this.toggleTheme());
        document.getElementById('refreshBtn').addEventListener('click', () => this.loadProcesses());
        document.getElementById('closeLogsBtn').addEventListener('click', () => this.closeLogs());
        
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });
    }

    showLogs(processName) {
        this.currentLogProcess = processName;
        const logsSection = document.getElementById('logsSection');
        const logsTitle = document.getElementById('logsTitle');
        
        logsTitle.textContent = `${processName} logs`;
        logsSection.classList.remove('hidden');
        
        if (this.logUpdateInterval) {
            clearInterval(this.logUpdateInterval);
        }
        
        this.loadLogs();
        this.logUpdateInterval = setInterval(() => this.loadLogs(), 2000);
    }

    closeLogs() {
        const logsSection = document.getElementById('logsSection');
        logsSection.classList.add('hidden');
        
        if (this.logUpdateInterval) {
            clearInterval(this.logUpdateInterval);
            this.logUpdateInterval = null;
        }
        
        this.currentLogProcess = null;
    }

    toggleTheme() {
        this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        localStorage.setItem('pmsunset-theme-preference', this.currentTheme);
        this.applyTheme();
    }

    applyTheme() {
        const themeBtn = document.getElementById('themeBtn');
        if (this.currentTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeBtn.textContent = 'light';
        } else {
            document.documentElement.removeAttribute('data-theme');
            themeBtn.textContent = 'dark';
        }
    }

    switchView(viewType) {
        this.currentView = viewType;
        localStorage.setItem('pmsunset-view-preference', viewType);
        
        document.querySelectorAll('.view-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-view="${viewType}"]`).classList.add('active');
        
        const gridView = document.getElementById('processesGrid');
        const tableView = document.getElementById('processesTable');
        
        if (viewType === 'cards') {
            gridView.classList.remove('hidden');
            tableView.classList.add('hidden');
        } else {
            gridView.classList.add('hidden');
            tableView.classList.remove('hidden');
        }
        
        this.renderProcesses();
    }

    showLoginIfNeeded() {
        if (this.userPassword) {
            this.tryAutoLogin();
        } else {
            this.showLogin();
        }
    }

    async tryAutoLogin() {
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: this.userPassword })
            });

            if (response.ok) {
                this.hideLogin();
                this.setupSocketConnection();
            } else {
                localStorage.removeItem('pmsunset-password');
                this.showLogin();
            }
        } catch (error) {
            this.showLogin();
        }
    }

    async handleLogin() {
        const password = document.getElementById('passwordInput').value;
        const errorDiv = document.getElementById('loginError');
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            const result = await response.json();
            
            if (result.success) {
                this.userPassword = password;
                localStorage.setItem('pmsunset-password', password);
                this.hideLogin();
                this.setupSocketConnection();
            } else {
                errorDiv.textContent = 'invalid password';
            }
        } catch (error) {
            errorDiv.textContent = 'connection error';
        }
    }

    showLogin() {
        document.getElementById('loginOverlay').classList.remove('hidden');
        document.getElementById('passwordInput').focus();
    }

    hideLogin() {
        document.getElementById('loginOverlay').classList.add('hidden');
        document.getElementById('loginError').textContent = '';
    }

    setupSocketConnection() {
        this.socket = io();
        
        this.socket.on('connect', () => {
            this.socket.emit('authenticate', this.userPassword);
        });
        
        this.socket.on('authenticated', (success) => {
            if (success) {
                this.authenticated = true;
            } else {
                localStorage.removeItem('pmsunset-password');
                this.showLogin();
            }
        });
        
        this.socket.on('processUpdate', (processes) => {
            this.processes = processes;
            this.renderProcesses();
        });
        
        this.socket.on('disconnect', () => {
            this.authenticated = false;
        });
    }

    restorePreferences() {
        this.applyTheme();
        this.switchView(this.currentView);
    }

    async loadProcesses() {
        // Manual refresh - only used when not using socket.io
        if (!this.authenticated) return;
        
        try {
            const response = await this.executeCommand('pm2 jlist');
            
            if (response.success) {
                this.processes = JSON.parse(response.output || '[]');
                this.renderProcesses();
            } else {
                throw new Error(response.error || 'Failed to fetch processes');
            }
        } catch (error) {
            console.error('Error loading processes:', error);
            this.showError('failed to load processes: ' + error.message);
        }
    }

    renderProcesses() {
        if (this.currentView === 'cards') {
            this.renderCardsView();
        } else {
            this.renderTableView();
        }
    }

    renderCardsView() {
        const grid = document.getElementById('processesGrid');
        
        if (this.processes.length === 0) {
            grid.innerHTML = '<div class="loading">no processes found</div>';
            return;
        }

        grid.innerHTML = this.processes.map(proc => `
            <div class="process-card">
                <div class="process-header">
                    <div class="process-name" onclick="dashboard.showLogs('${proc.name}')">${proc.name || 'unknown'}</div>
                    <div class="process-status ${this.getStatusClass(proc.pm2_env?.status)}">${proc.pm2_env?.status || 'unknown'}</div>
                </div>
                <div class="process-info">
                    <div class="info-item">
                        <span class="info-label">pid:</span>
                        <span class="info-value">${proc.pid || 'n/a'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">cpu:</span>
                        <span class="info-value">${proc.monit?.cpu || 0}%</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">memory:</span>
                        <span class="info-value">${this.formatMemory(proc.monit?.memory)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">uptime:</span>
                        <span class="info-value">${this.formatUptime(proc.pm2_env?.pm_uptime)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">restarts:</span>
                        <span class="info-value">${proc.pm2_env?.restart_time || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">script:</span>
                        <span class="info-value">${proc.pm2_env?.pm_exec_path?.split('/').pop() || 'n/a'}</span>
                    </div>
                </div>
                <div class="process-actions">
                    <button class="action-btn stop" onclick="dashboard.stopProcess('${proc.name}')">stop</button>
                    <button class="action-btn restart" onclick="dashboard.restartProcess('${proc.name}')">restart</button>
                </div>
            </div>
        `).join('');
    }

    renderTableView() {
        const tableBody = document.getElementById('processTableBody');
        
        if (this.processes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="loading">no processes found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.processes.map(proc => `
            <tr>
                <td class="table-process-name" onclick="dashboard.showLogs('${proc.name}')">${proc.name || 'unknown'}</td>
                <td><span class="process-status ${this.getStatusClass(proc.pm2_env?.status)}">${proc.pm2_env?.status || 'unknown'}</span></td>
                <td>${proc.pid || 'n/a'}</td>
                <td>${proc.monit?.cpu || 0}%</td>
                <td>${this.formatMemory(proc.monit?.memory)}</td>
                <td>${this.formatUptime(proc.pm2_env?.pm_uptime)}</td>
                <td>${proc.pm2_env?.restart_time || 0}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn stop" onclick="dashboard.stopProcess('${proc.name}')">stop</button>
                        <button class="table-action-btn restart" onclick="dashboard.restartProcess('${proc.name}')">restart</button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    getStatusClass(status) {
        if (!status) return 'errored';
        return status.toLowerCase();
    }

    formatMemory(bytes) {
        if (!bytes) return '0mb';
        const mb = bytes / (1024 * 1024);
        return mb >= 1024 ? `${(mb / 1024).toFixed(1)}gb` : `${mb.toFixed(1)}mb`;
    }

    formatUptime(timestamp) {
        if (!timestamp) return 'n/a';
        const uptime = Date.now() - timestamp;
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }

    async stopProcess(processName) {
        if (!this.authenticated) return;
        
        try {
            const response = await this.executeCommand(`pm2 stop "${processName}"`);
            if (!response.success) {
                this.showError(`Failed to stop process: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Error stopping process: ${error.message}`);
        }
    }

    async restartProcess(processName) {
        if (!this.authenticated) return;
        
        try {
            const response = await this.executeCommand(`pm2 restart "${processName}"`);
            if (!response.success) {
                this.showError(`Failed to restart process: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Error restarting process: ${error.message}`);
        }
    }


    async loadLogs() {
        if (!this.currentLogProcess) return;

        try {
            const response = await this.executeCommand(`pm2 logs "${this.currentLogProcess}" --lines 100 --nostream`);
            if (response.success) {
                const logsOutput = document.getElementById('logsOutput');
                logsOutput.textContent = response.output || 'No logs available';
                logsOutput.scrollTop = logsOutput.scrollHeight;
            }
        } catch (error) {
            console.error('Error loading logs:', error);
        }
    }


    async executeCommand(command) {
        if (!this.authenticated) {
            return { success: false, error: 'Not authenticated' };
        }
        
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                    command,
                    password: this.userPassword 
                })
            });

            if (!response.ok) {
                if (response.status === 401) {
                    localStorage.removeItem('pmsunset-password');
                    this.showLogin();
                    return { success: false, error: 'Authentication failed' };
                }
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Command execution error:', error);
            
            if (error.message.includes('fetch')) {
                return this.simulateCommand(command);
            }
            
            throw error;
        }
    }

    simulateCommand(command) {
        console.log('Simulating command:', command);
        
        if (command === 'pm2 jlist') {
            return {
                success: true,
                output: JSON.stringify([
                    {
                        name: 'web-server',
                        pid: 1234,
                        pm2_env: {
                            status: 'online',
                            pm_uptime: Date.now() - 3600000,
                            restart_time: 2,
                            pm_exec_path: '/app/server.js'
                        },
                        monit: {
                            cpu: 15,
                            memory: 67108864
                        }
                    },
                    {
                        name: 'api-service',
                        pid: 5678,
                        pm2_env: {
                            status: 'stopped',
                            pm_uptime: Date.now() - 1800000,
                            restart_time: 0,
                            pm_exec_path: '/app/api.js'
                        },
                        monit: {
                            cpu: 0,
                            memory: 0
                        }
                    },
                    {
                        name: 'worker',
                        pid: 9012,
                        pm2_env: {
                            status: 'online',
                            pm_uptime: Date.now() - 7200000,
                            restart_time: 5,
                            pm_exec_path: '/app/worker.js'
                        },
                        monit: {
                            cpu: 8,
                            memory: 134217728
                        }
                    }
                ])
            };
        }

        if (command.includes('pm2 logs')) {
            const logs = [
                `2024-01-01 12:00:01: Server started on port 3000`,
                `2024-01-01 12:00:05: Database connection established`,
                `2024-01-01 12:01:15: Received GET request to /api/users`,
                `2024-01-01 12:01:16: Query executed: SELECT * FROM users`,
                `2024-01-01 12:01:17: Response sent: 200 OK`,
                `2024-01-01 12:02:30: Received POST request to /api/auth`,
                `2024-01-01 12:02:31: User authentication successful`,
                `2024-01-01 12:02:32: JWT token generated`,
                `2024-01-01 12:03:45: WebSocket connection established`,
                `2024-01-01 12:04:10: Real-time data push initiated`
            ];
            return {
                success: true,
                output: logs.join('\n')
            };
        }

        if (command.includes('pm2 stop') || command.includes('pm2 restart')) {
            return {
                success: true,
                output: 'Command executed successfully'
            };
        }

        return {
            success: false,
            error: 'Command not supported in demo mode'
        };
    }


    showError(message) {
        const grid = document.getElementById('processesGrid');
        grid.innerHTML = `<div class="error">${message}</div>`;
    }

    destroy() {
        if (this.processUpdateInterval) clearInterval(this.processUpdateInterval);
        if (this.logUpdateInterval) clearInterval(this.logUpdateInterval);
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

const dashboard = new PM2Dashboard();

window.addEventListener('beforeunload', () => {
    dashboard.destroy();
});