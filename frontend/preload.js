const fs = require('fs');
const path = require('path');
const { contextBridge, ipcRenderer } = require('electron');




contextBridge.exposeInMainWorld('electronAPI', {
  searchPath: (name1, name2) => ipcRenderer.invoke('search-path', name1, name2),
  getFanSpeed: (filePath) => {
    return ipcRenderer.invoke('get-speed', filePath);
  },
  saveAllData: (path,data) => ipcRenderer.invoke('saveAllData',path, data),
  loadAllData: (path) => ipcRenderer.invoke('loadAllData',path),
  getPaths: () => ipcRenderer.invoke('get-paths'),
});

