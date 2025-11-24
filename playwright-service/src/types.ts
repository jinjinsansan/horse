export type RaceType = 'JRA' | 'NAR';

export interface SignalPayload {
  id: number;
  race_type: RaceType;
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
}

export interface ExecuteBetRequestBody {
  userId: string;
  signal: SignalPayload;
  options?: {
    auto?: boolean;
    headless?: boolean;
  };
}

export interface CredentialBundle {
  ipat_credentials?: Record<string, string> | null;
  spat4_credentials?: Record<string, string> | null;
  auto_bet_enabled?: boolean;
}
