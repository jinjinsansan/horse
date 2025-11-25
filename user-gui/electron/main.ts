import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { executeBet } from './services/bet-executor';
import { fetchJraOdds } from './services/odds-fetcher';

const isDev = process.env.NODE_ENV === 'development';
let mainWindow: BrowserWindow | null = null;

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
