const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const os = require("os");
const configPath = path.join(os.homedir(), ".config", "pwmctl.conf");
const temperaturePath = path.join(os.homedir(), ".cache", "pwmctl-status.json");


let tray = null;
let backendProcess = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win) {
            win.show();
            win.focus();
        }
    });
}
app.setName('pwmctl');
function createWindow() {
    const win = new BrowserWindow({
        minWidth: 1200,
        minHeight: 800,
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'assets/icon.png'),
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
        },
    });

    win.loadFile('index.html');

    const startHidden = process.argv.includes('--hidden');

    win.once('ready-to-show', () => {
        if (startHidden) {
            win.hide();
        } else {
            win.show();
        }
    });

    win.on('close', (event) => {
        event.preventDefault();
        win.hide();
    });

    tray = new Tray(path.join(__dirname, 'assets/icon.png'));
    tray.setToolTip('pwmctl.');
    tray.on('click', () => {
        win.isVisible() ? win.hide() : win.show();
    });
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Öffnen', click: () => win.show() },
        { label: 'Beenden', click: () => {
            win.removeAllListeners('close');
            app.quit();
        }},
    ]));
}

app.whenReady().then(() => {
    backendProcess = spawn('pwmctl-backend', [], { detached: false });
    backendProcess.on('error', (err) => {
        console.error('[Main] pwmctl-backend konnte nicht gestartet werden:', err);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
});

// --- IPC: HWMon Fan Speed ---
ipcMain.handle('get-speed', async (event, filePath) => {
    try {
        const data = await fs.promises.readFile(filePath, 'utf8');
        return parseInt(data.trim(), 10);
    } catch (err) {
        console.error('[Main] Error reading fan speed:', err);
        return 0;
    }
});

// Speichern
ipcMain.handle('saveAllData', (event, configpath,data) => {
    if (!data) return console.error("❌ saveAllData: no data received!");
    fs.writeFileSync(configPath, JSON.stringify(data, null, 4), 'utf-8');
    console.log("✅ Konfiguration gespeichert:", configPath);
});

ipcMain.handle('loadAllData', (event, filePath) => {
    try {
        if (!fs.existsSync(configPath)) return null;
        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {}
});
ipcMain.handle('get-paths', () => ({
    configPath,
    temperaturePath,
}));