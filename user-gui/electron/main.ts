import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { executeBet } from './services/bet-executor';
import { fetchJraOdds } from './services/odds-fetcher';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'HorseBet User',
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    const indexHtml = path.join(__dirname, '../dist/index.html');
    mainWindow.loadFile(indexHtml);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  createWindow();

  if (!isDev) {
    autoUpdater.checkForUpdates();
  }

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

ipcMain.handle('horsebet:execute-bet', async (_event, payload) => {
  return executeBet(payload);
});

ipcMain.handle('horsebet:fetch-odds', async (_event, payload: { joName: string; raceNo: number }) => {
  try {
    const data = await fetchJraOdds(payload);
    return { success: true, data };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : `${error}` };
  }
});

ipcMain.handle('horsebet:get-version', () => {
  return app.getVersion();
});

ipcMain.handle('horsebet:check-updates', async () => {
  if (isDev) return { available: false };
  try {
    const result = await autoUpdater.checkForUpdates();
    return { available: result !== null, version: result?.updateInfo?.version };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : `${error}` };
  }
});

ipcMain.handle('horsebet:download-update', async () => {
  if (isDev) return { success: false };
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : `${error}` };
  }
});

ipcMain.handle('horsebet:install-update', () => {
  if (!isDev) {
    autoUpdater.quitAndInstall();
  }
});

autoUpdater.on('update-available', (info) => {
  if (mainWindow) {
    mainWindow.webContents.send('horsebet:update-available', info.version);
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('horsebet:update-downloaded');
  }
});

autoUpdater.on('error', (error) => {
  if (mainWindow) {
    mainWindow.webContents.send('horsebet:update-error', error.message);
  }
});
