import * as path from 'path';
import { app, BrowserWindow, nativeTheme, ipcMain, Menu } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;

function getPythonBinaryPath(): string {
    // Check if running in production (packaged) or development
    const isPackaged = app.isPackaged;
    
    // In dev: Use python directly from the backend dir
    if (!isPackaged) {
        const devPath = path.join(__dirname, '../../backend/dist/app');
        return process.platform === 'win32' ? devPath + '.exe' : devPath;
    }
    
    // In production: Use the extraResources path
    const resourcePath = process.resourcesPath;
    const bundledPath = path.join(resourcePath, 'backend', 'app', 'app');
    
    // Fallback: If the binary doesn't exist (e.g. windows uses app.exe)
    if (process.platform === 'win32' && !fs.existsSync(bundledPath)) {
         return bundledPath + '.exe';
    }
    return bundledPath;
}

function createWindow(): void {
    Menu.setApplicationMenu(null);

    mainWindow = new BrowserWindow({
        width: 1000,
        height: 700,
        show: false,
        frame: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, '../preload/preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        title: 'Raleway - Standalone Booking App',
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#09090b' : '#f9fafb',
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
    } else {
        // In production, we are running from dist/main/main.js
        // The UI is in dist/renderer/index.html
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
        if (pythonProcess) {
            pythonProcess.kill();
        }
    });
}

// IPC Handlers
function setupIpc() {
    ipcMain.on('window:minimize', () => mainWindow?.minimize());
    ipcMain.on('window:maximize', () => {
        if (mainWindow?.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow?.maximize();
        }
    });
    ipcMain.on('window:close', () => mainWindow?.close());
    ipcMain.on('open-external', (_event, url) => {
        require('electron').shell.openExternal(url);
    });

    ipcMain.handle('check-system', async () => {
        const binPath = getPythonBinaryPath();
        const hasBackend = fs.existsSync(binPath);
        
        let hasChrome = false;
        try {
            // Check for chrome or chromium installation depending on OS
            if (process.platform === 'win32') {
                const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
                const chromePath86 = 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe';
                hasChrome = fs.existsSync(chromePath) || fs.existsSync(chromePath86);
            } else if (process.platform === 'darwin') {
                hasChrome = fs.existsSync('/Applications/Google Chrome.app');
            } else {
                // Linux: check via which command
                const { execSync } = require('child_process');
                try {
                    execSync('which google-chrome || which chromium || which chromium-browser', { stdio: 'ignore' });
                    hasChrome = true;
                } catch {
                    hasChrome = false;
                }
            }
        } catch (e) {
            console.error('Failed to check chrome:', e);
        }

        return { hasBackend, hasChrome, backendPath: binPath };
    });

    ipcMain.handle('start-booking', async (_event, config) => {
        if (pythonProcess) {
            pythonProcess.kill();
        }

        const binPath = getPythonBinaryPath();
        
        // Ensure binary is executable (Linux/Mac)
        if (process.platform !== 'win32' && fs.existsSync(binPath)) {
            try { fs.chmodSync(binPath, '755'); } catch (e) {}
        }

        try {
            console.log(`Starting python sidecar at: ${binPath}`);
            pythonProcess = spawn(binPath, [], {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            // Send config via stdin
            if (pythonProcess.stdin) {
                pythonProcess.stdin.write(JSON.stringify(config) + '\n');
            }

            pythonProcess.stdout?.on('data', (data) => {
                const output = data.toString();
                const lines = output.split('\n').filter(Boolean);
                
                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);
                        mainWindow?.webContents.send('backend-event', parsed);
                    } catch (e) {
                        mainWindow?.webContents.send('backend-event', { type: 'log', message: line });
                    }
                }
            });

            pythonProcess.stderr?.on('data', (data) => {
                mainWindow?.webContents.send('backend-event', { type: 'log', level: 'error', message: data.toString() });
            });

            pythonProcess.on('close', (code) => {
                mainWindow?.webContents.send('backend-event', { type: 'log', message: `Process exited with code ${code}` });
                pythonProcess = null;
            });

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.on('backend-input', (_event, input) => {
        if (pythonProcess && pythonProcess.stdin) {
            pythonProcess.stdin.write(input + '\n');
        }
    });
}

app.whenReady().then(() => {
    createWindow();
    setupIpc();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
