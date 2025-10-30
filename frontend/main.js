const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const configPath = path.join(__dirname, 'curves.json');


function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false
        },
    });

    win.loadFile('index.html');
    // win.webContents.openDevTools(); // Optional
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC: HWMon Fan Count ---
ipcMain.handle('get-fan-count', (event, dirPath) => {
    try {
        const files = fs.readdirSync(dirPath);
        const count = files.filter(f => /^fan\d+(_input)?$/.test(f)).length;
        return count;
    } catch (err) {
        console.error('[Main] Error reading directory:', err);
        return 0;
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

// --- IPC: NVIDIA Fan ---
function getNvidiaFan() {
    try {
        const scriptPath = path.join(__dirname, 'scripts', 'getnvidiafan');
        const out = execSync(scriptPath, { encoding: 'utf8' });
        return parseInt(out.trim(), 10);
    } catch (err) {
        console.error("[Main] Error reading NVIDIA fan:", err);
        return 0;
    }
}
ipcMain.handle('get-nvidia-fan', () => getNvidiaFan());



// Speichern
ipcMain.handle('saveAllData', (event, data) => {
    if (!data) return console.error("❌ saveAllData: no data received!");
    fs.writeFileSync(configPath, JSON.stringify(data, null, 4), 'utf-8');
    console.log("✅ Konfiguration gespeichert:", configPath);
});

ipcMain.handle('loadAllData', () => {
    try{
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }catch{}
});
