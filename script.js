class PM2Dashboard {
    constructor() {
        this.processes = [];
        this.currentLogProcess = null;
        this.logUpdateInterval = null;
        this.processUpdateInterval = null;
        this.currentView = localStorage.getItem('pm2-view-preference') || 'cards';
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.restoreViewPreference();
        this.startPeriodicUpdates();
        this.loadProcesses();
    }

    setupEventListeners() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchView(e.target.dataset.view));
        });

        document.getElementById('refreshBtn').addEventListener('click', () => this.loadProcesses());
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
        document.getElementById('logProcessSelect').addEventListener('change', (e) => this.selectLogProcess(e.target.value));
    }

    switchTab(tabName) {
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    switchView(viewType) {
        this.currentView = viewType;
        localStorage.setItem('pm2-view-preference', viewType);
        
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

    restoreViewPreference() {
        this.switchView(this.currentView);
    }

    async loadProcesses() {
        try {
            this.updateConnectionStatus('connecting');
            const response = await this.executeCommand('pm2 jlist');
            
            if (response.success) {
                this.processes = JSON.parse(response.output || '[]');
                this.renderProcesses();
                this.updateLogProcessSelect();
                this.updateConnectionStatus('connected');
            } else {
                throw new Error(response.error || 'Failed to fetch processes');
            }
        } catch (error) {
            console.error('Error loading processes:', error);
            this.showError('Failed to load processes: ' + error.message);
            this.updateConnectionStatus('error');
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
            grid.innerHTML = '<div class="loading">No PM2 processes found</div>';
            return;
        }

        grid.innerHTML = this.processes.map(proc => `
            <div class="process-card">
                <div class="process-header">
                    <div class="process-name">${proc.name || 'Unknown'}</div>
                    <div class="process-status ${this.getStatusClass(proc.pm2_env?.status)}">${proc.pm2_env?.status || 'unknown'}</div>
                </div>
                <div class="process-info">
                    <div class="info-item">
                        <span class="info-label">PID:</span>
                        <span class="info-value">${proc.pid || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">CPU:</span>
                        <span class="info-value">${proc.monit?.cpu || 0}%</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Memory:</span>
                        <span class="info-value">${this.formatMemory(proc.monit?.memory)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Uptime:</span>
                        <span class="info-value">${this.formatUptime(proc.pm2_env?.pm_uptime)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Restarts:</span>
                        <span class="info-value">${proc.pm2_env?.restart_time || 0}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Script:</span>
                        <span class="info-value">${proc.pm2_env?.pm_exec_path?.split('/').pop() || 'N/A'}</span>
                    </div>
                </div>
                <div class="process-actions">
                    <button class="action-btn stop" onclick="dashboard.stopProcess('${proc.name}')">Stop</button>
                    <button class="action-btn restart" onclick="dashboard.restartProcess('${proc.name}')">Restart</button>
                </div>
            </div>
        `).join('');
    }

    renderTableView() {
        const tableBody = document.getElementById('processTableBody');
        
        if (this.processes.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8" class="loading">No PM2 processes found</td></tr>';
            return;
        }

        tableBody.innerHTML = this.processes.map(proc => `
            <tr>
                <td class="table-process-name">${proc.name || 'Unknown'}</td>
                <td><span class="process-status ${this.getStatusClass(proc.pm2_env?.status)}">${proc.pm2_env?.status || 'unknown'}</span></td>
                <td>${proc.pid || 'N/A'}</td>
                <td>${proc.monit?.cpu || 0}%</td>
                <td>${this.formatMemory(proc.monit?.memory)}</td>
                <td>${this.formatUptime(proc.pm2_env?.pm_uptime)}</td>
                <td>${proc.pm2_env?.restart_time || 0}</td>
                <td>
                    <div class="table-actions">
                        <button class="table-action-btn stop" onclick="dashboard.stopProcess('${proc.name}')">Stop</button>
                        <button class="table-action-btn restart" onclick="dashboard.restartProcess('${proc.name}')">Restart</button>
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
        if (!bytes) return '0 MB';
        const mb = bytes / (1024 * 1024);
        return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
    }

    formatUptime(timestamp) {
        if (!timestamp) return 'N/A';
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
        try {
            const response = await this.executeCommand(`pm2 stop "${processName}"`);
            if (response.success) {
                this.loadProcesses();
            } else {
                this.showError(`Failed to stop process: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Error stopping process: ${error.message}`);
        }
    }

    async restartProcess(processName) {
        try {
            const response = await this.executeCommand(`pm2 restart "${processName}"`);
            if (response.success) {
                this.loadProcesses();
            } else {
                this.showError(`Failed to restart process: ${response.error}`);
            }
        } catch (error) {
            this.showError(`Error restarting process: ${error.message}`);
        }
    }

    updateLogProcessSelect() {
        const select = document.getElementById('logProcessSelect');
        select.innerHTML = '<option value="">Select a process</option>' + 
            this.processes.map(proc => `<option value="${proc.name}">${proc.name}</option>`).join('');
    }

    async selectLogProcess(processName) {
        this.currentLogProcess = processName;
        if (this.logUpdateInterval) {
            clearInterval(this.logUpdateInterval);
        }

        if (processName) {
            await this.loadLogs();
            this.logUpdateInterval = setInterval(() => this.loadLogs(), 2000);
        } else {
            document.getElementById('logsOutput').textContent = 'Select a process to view logs...';
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

    clearLogs() {
        document.getElementById('logsOutput').textContent = 'Select a process to view logs...';
    }

    async executeCommand(command) {
        try {
            const response = await fetch('/api/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ command })
            });

            if (!response.ok) {
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

    updateConnectionStatus(status) {
        const statusDot = document.getElementById('connectionStatus');
        const statusText = document.getElementById('connectionText');

        statusDot.className = 'status-dot';
        
        switch (status) {
            case 'connected':
                statusDot.classList.add('connected');
                statusText.textContent = 'Connected';
                break;
            case 'connecting':
                statusText.textContent = 'Connecting...';
                break;
            case 'error':
                statusText.textContent = 'Connection Error';
                break;
        }
    }

    showError(message) {
        const grid = document.getElementById('processesGrid');
        grid.innerHTML = `<div class="error">${message}</div>`;
    }

    startPeriodicUpdates() {
        this.processUpdateInterval = setInterval(() => {
            if (document.querySelector('[data-tab="processes"]').classList.contains('active')) {
                this.loadProcesses();
            }
        }, 5000);
    }

    destroy() {
        if (this.processUpdateInterval) clearInterval(this.processUpdateInterval);
        if (this.logUpdateInterval) clearInterval(this.logUpdateInterval);
    }
}

const dashboard = new PM2Dashboard();

window.addEventListener('beforeunload', () => {
    dashboard.destroy();
});