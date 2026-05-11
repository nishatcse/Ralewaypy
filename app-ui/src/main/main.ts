import * as path from 'path';
import { app, BrowserWindow, nativeTheme, ipcMain, Menu, safeStorage } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';

let mainWindow: BrowserWindow | null = null;
let pythonProcess: ChildProcess | null = null;

function sendBackendEvent(event: Record<string, unknown>): void {
    mainWindow?.webContents.send('backend-event', event);
}

function validateBookingConfig(config: any): string | null {
    if (!config || typeof config !== 'object') return 'Missing booking configuration.';
    if (!String(config.MOBILE_NUMBER || '').trim()) return 'Mobile number is required.';
    if (!String(config.PASSWORD || '').trim()) return 'Password is required.';
    if (!String(config.FROM_CITY || '').trim()) return 'From city is required.';
    if (!String(config.TO_CITY || '').trim()) return 'To city is required.';
    if (!String(config.DATE_OF_JOURNEY || '').trim()) return 'Journey date is required.';
    if (!String(config.SEAT_CLASS || '').trim()) return 'Seat class is required.';

    const trainNumber = Number(config.TRAIN_NUMBER);
    if (!Number.isInteger(trainNumber) || trainNumber <= 0) return 'Train number must be a positive number.';

    const seatCount = Number(config.MAX_SELECTABLE_SEAT);
    if (!Number.isInteger(seatCount) || seatCount < 1 || seatCount > 4) return 'Seat count must be between 1 and 4.';

    return null;
}

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
        try {
            const parsed = new URL(String(url));
            if (parsed.protocol === 'https:') {
                require('electron').shell.openExternal(parsed.toString());
            } else {
                sendBackendEvent({ type: 'log', level: 'error', message: 'Invalid payment URL blocked.' });
            }
        } catch {
            sendBackendEvent({ type: 'log', level: 'error', message: 'Invalid payment URL blocked.' });
        }
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
            return { success: false, error: 'A booking process is already running.' };
        }

        const validationError = validateBookingConfig(config);
        if (validationError) {
            return { success: false, error: validationError };
        }

        const isPackaged = app.isPackaged;
        let binPath = '';
        let spawnCmd = '';
        let spawnArgs: string[] = [];

        if (!isPackaged) {
            // In dev: Use python3 to run the script directly for fast iteration
            binPath = path.join(__dirname, '../../backend/app.py');
            spawnCmd = 'python3';
            spawnArgs = [binPath];
        } else {
            // In production: Use the bundled binary
            binPath = getPythonBinaryPath();
            spawnCmd = binPath;
            spawnArgs = [];
        }

        try {
            console.log(`Starting python process: ${spawnCmd} ${spawnArgs.join(' ')}`);
            pythonProcess = spawn(spawnCmd, spawnArgs, {
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdoutBuffer = '';

            // Send config via stdin
            if (pythonProcess.stdin) {
                pythonProcess.stdin.write(JSON.stringify(config) + '\n');
            }

            pythonProcess.stdout?.on('data', (data) => {
                stdoutBuffer += data.toString();
                const lines = stdoutBuffer.split('\n');
                stdoutBuffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const parsed = JSON.parse(line);
                        sendBackendEvent(parsed);
                    } catch (e) {
                        sendBackendEvent({ type: 'log', message: line });
                    }
                }
            });

            pythonProcess.stderr?.on('data', (data) => {
                sendBackendEvent({ type: 'log', level: 'error', message: data.toString() });
            });

            pythonProcess.on('error', (error) => {
                sendBackendEvent({ type: 'log', level: 'error', message: `Failed to start process: ${error.message}` });
                sendBackendEvent({ type: 'backend_exit', code: null, signal: null, error: error.message });
            });

            pythonProcess.on('close', (code, signal) => {
                if (stdoutBuffer.trim()) {
                    try {
                        sendBackendEvent(JSON.parse(stdoutBuffer));
                    } catch {
                        sendBackendEvent({ type: 'log', message: stdoutBuffer.trim() });
                    }
                }
                sendBackendEvent({ type: 'log', message: `Process exited with code ${code}${signal ? ` (${signal})` : ''}` });
                sendBackendEvent({ type: 'backend_exit', code, signal });
                pythonProcess = null;
            });

            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('stop-booking', () => {
        if (pythonProcess) {
            const stopped = pythonProcess.kill('SIGTERM');
            return stopped ? { success: true } : { success: false, error: 'Failed to send stop signal' };
        }
        return { success: false, error: 'No process running' };
    });

    ipcMain.on('backend-input', (_event, input) => {
        if (pythonProcess && pythonProcess.stdin) {
            pythonProcess.stdin.write(input + '\n');
        }
    });

    ipcMain.handle('safe-encrypt', (_event, str: string) => {
        if (safeStorage.isEncryptionAvailable()) {
            return safeStorage.encryptString(str).toString('base64');
        }
        return str; // Fallback
    });

    ipcMain.handle('safe-decrypt', (_event, str: string) => {
        if (safeStorage.isEncryptionAvailable() && str) {
            try {
                return safeStorage.decryptString(Buffer.from(str, 'base64'));
            } catch (e) {
                return str;
            }
        }
        return str;
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
