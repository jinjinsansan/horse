import type { BetSignal } from '@shared/types/database.types';

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

declare global {
  interface Window {
    horsebet?: {
      executeBet: (payload: {
        signal: BetSignal;
        credentials: {
          ipat?: RendererIpatCredentials;
          spat4?: RendererSpatCredentials;
        };
        headless?: boolean;
      }) => Promise<any>;
    };
  }
}

export {};
