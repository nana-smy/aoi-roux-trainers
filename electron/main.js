const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Disable GPU acceleration for better compatibility
app.disableHardwareAcceleration();

let mainWindow = null;

const isDev = !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Aoi Roux Trainers',
    backgroundColor: '#fafafa',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
    },
    show: false,
  });

  // Show window when ready to prevent blank flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    // In development, load from CRA dev server
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      // Fallback: try other common ports
      Promise.all([
        'http://localhost:3001',
        'http://localhost:8080',
        'http://localhost:5000',
      ].map(url => mainWindow.loadURL(url).then(() => url).catch(() => null)))
        .then(results => {
          const success = results.find(r => r !== null);
          if (!success) {
            console.error('Could not connect to dev server on any port');
            console.log('Please run: npm start');
          }
        });
    });
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built React app
    const buildPath = path.join(__dirname, '..', 'build', 'index.html');
    mainWindow.loadFile(buildPath).catch(err => {
      console.error('Failed to load build/index.html:', err);
    });
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
