const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => require('electron').app.getVersion(),
  getPlatform: () => process.platform,

  // Window controls
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),

  // Native notifications
  showNotification: (title, body) => {
    const { Notification } = require('electron');
    new Notification({ title, body }).show();
  },

  // Open external URLs in browser
  openExternal: (url) => {
    require('electron').shell.openExternal(url);
  },

  // Get user data path for storing local files
  getUserDataPath: () => require('electron').app.getPath('userData'),
});
