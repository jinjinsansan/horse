import { contextBridge, ipcRenderer } from 'electron';

type BridgeBetSignal = {
  id: number;
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
};

type BridgeCredentials = {
  ipat?: {
    inetId: string;
    userCode: string;
    password: string;
    pin: string;
  };
  spat4?: {
    userId: string;
    password: string;
  };
};

contextBridge.exposeInMainWorld('horsebet', {
  executeBet: (payload: {
    signal: BridgeBetSignal;
    credentials: BridgeCredentials;
    headless?: boolean;
  }) => ipcRenderer.invoke('horsebet:execute-bet', payload),
  fetchOdds: (payload: { joName: string; raceNo: number }) =>
    ipcRenderer.invoke('horsebet:fetch-odds', payload),
  getVersion: () => ipcRenderer.invoke('horsebet:get-version'),
  isPlaywrightReady: () => ipcRenderer.invoke('horsebet:is-playwright-ready'),
  checkUpdates: () => ipcRenderer.invoke('horsebet:check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('horsebet:download-update'),
  installUpdate: () => ipcRenderer.invoke('horsebet:install-update'),
  onUpdateAvailable: (callback: (version: string) => void) => {
    ipcRenderer.on('horsebet:update-available', (_event, version) => callback(version));
  },
  onUpdateDownloaded: (callback: () => void) => {
    ipcRenderer.on('horsebet:update-downloaded', () => callback());
  },
  onUpdateError: (callback: (error: string) => void) => {
    ipcRenderer.on('horsebet:update-error', (_event, error) => callback(error));
  },
});
