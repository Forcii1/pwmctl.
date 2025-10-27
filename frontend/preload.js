const fs = require('fs');
const path = require('path');
const { contextBridge, ipcRenderer } = require('electron');

function searchPath(name1, name2 = "") {
  const hwmonBase = '/sys/class/hwmon/';
  console.log(`[Preload] searchPath called with: ${name1}, ${name2}`);

  try {
    const entries = fs.readdirSync(hwmonBase, { withFileTypes: true });
    console.log(`[Preload] Found ${entries.length} entries in ${hwmonBase}`);

    for (const entry of entries) {
        console.log(entry.name);
        //if (!entry.isDirectory()) continue;
        const nameFile = path.join(hwmonBase, entry.name, 'name');
        console.log(entries);
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

contextBridge.exposeInMainWorld('electronAPI', {
  getFanCount: (dirPath) => {
    return ipcRenderer.invoke('get-fan-count', dirPath);
  },
  searchPath,
  getFanSpeed: (filePath) => {
    return ipcRenderer.invoke('get-fan-speed', filePath);
  }
});

