const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,      // renderer bleibt safe
      contextIsolation: true,      // renderer safe
      sandbox: false               // wichtig, damit Preload fs benutzen kann
    },
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools(); // Optional: DevTools öffnen
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // macOS: neues Fenster, wenn keines offen ist
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // Beende App außer auf macOS
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-fan-count', (event, dirPath) => {
  console.log('[Main] IPC get-fan-count called for path:', dirPath);
  try {
    const files = fs.readdirSync(dirPath);
    const count = files.filter(f => /^fan\d+(_input)?$/.test(f)).length;
    console.log('[Main] Fan count:', count);
    return count;
  } catch (err) {
    console.error('[Main] Error reading directory:', err);
    return 0;
  }
});

ipcMain.handle('get-speed', async (event, filePath) => {
    try {
        // fs.promises.readFile gibt ein Promise zurück, daher async/await
        const data = await fs.promises.readFile(filePath, 'utf8');
        return parseInt(data.trim(), 10); // Zahlenwert zurückgeben
    } catch (err) {
        console.error('[Main] Error reading fan speed:', err);
        return 0;
    }
});

