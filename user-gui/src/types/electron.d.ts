interface RendererIpatCredentials {
  inetId: string;
  userCode: string;
  password: string;
  pin: string;
}

interface RendererSpatCredentials {
  userId: string;
  password: string;
}

interface RendererMinimalSignal {
  id: number;
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
}

interface ExecuteBetResult {
  success: boolean;
  message?: string;
  details?: unknown;
}

declare global {
  interface Window {
    horsebet?: {
      executeBet: (payload: {
        signal: RendererMinimalSignal;
        credentials: {
          ipat?: RendererIpatCredentials;
          spat4?: RendererSpatCredentials;
        };
        headless?: boolean;
      }) => Promise<ExecuteBetResult>;
      fetchOdds: (payload: { joName: string; raceNo: number }) => Promise<{
        success: boolean;
        message?: string;
        data?: unknown;
      }>;
      getVersion: () => Promise<string>;
      checkUpdates: () => Promise<{ available: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ success: boolean; message?: string }>;
      installUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (version: string) => void) => void;
      onUpdateDownloaded: (callback: () => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
    };
  }
}

export {};
