const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync, spawn } = require('child_process');
const os = require("os");
const configPath = path.join(os.homedir(), ".config", "pwmctl.conf");
const temperaturePath = path.join(os.homedir(), ".cache", "pwmctl-status.json");


let tray = null;
let backendProcess = null;


function searchPath(name1, name2 = "") {
  const hwmonBase = '/sys/class/hwmon/';
  console.log(`[Preload] searchPath called with: ${name1}, ${name2}`);

  try {
    const entries = fs.readdirSync(hwmonBase, { withFileTypes: true });
    console.log(`[Preload] Found ${entries.length} entries in ${hwmonBase}`);

    for (const entry of entries) {
        //if (!entry.isDirectory()) continue;
        const nameFile = path.join(hwmonBase, entry.name, 'name');
        if (fs.existsSync(nameFile)) {
            const content = fs.readFileSync(nameFile, 'utf8').trim();
            if (content.includes(name1) || (name2 && content.includes(name2))) {
            const foundPath = path.join(hwmonBase, entry.name) + '/';
            return foundPath;
            }
        }
    }
  } catch (err) {
    console.error("[Preload] Error in searchPath:", err);
  }

  console.log("[Preload] No matching HWMon path found");
  return "NONE";
}
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
            // Hauptbildschirm ermitteln und Fenster dort zentrieren
            const { screen } = require('electron');
            const primaryDisplay = screen.getPrimaryDisplay();
            const { width, height } = primaryDisplay.workAreaSize;
            const { width: winW, height: winH } = win.getBounds();
            win.setPosition(
                Math.round((width - winW) / 2),
                Math.round((height - winH) / 2)
            );
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
ipcMain.handle('saveAllData', (event, path,data) => {
    if (!data) return console.error("❌ saveAllData: no data received!");
    fs.writeFileSync(path, JSON.stringify(data, null, 4), 'utf-8');
    console.log("✅ Konfiguration gespeichert:", path);
});

ipcMain.handle('loadAllData', (event, filePath) => {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {}
});

ipcMain.handle('get-paths', () => {
  return {
    configPath,
    temperaturePath,
  };
});
ipcMain.handle('search-path', (event, name1, name2) => {
  return searchPath(name1, name2);
});