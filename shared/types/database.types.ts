export type RaceType = 'JRA' | 'NAR';
export type BetResult = 'pending' | 'win' | 'lose' | 'cancelled';
export type SignalStatus = 'active' | 'cancelled' | 'completed';
export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'suspended';

export interface BetSignal {
  id: number;
  signal_date: string;
  race_type: RaceType;
  jo_code: string;
  jo_name: string;
  race_no: number;
  bet_type: number;
  bet_type_name: string;
  method: number;
  suggested_amount: number;
  kaime_data: string[];
  note: string | null;
  status: SignalStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  subscription_status: SubscriptionStatus;
  auto_bet_enabled: boolean;
  settings: Record<string, unknown>;
}

export interface BetHistory {
  id: number;
  user_id: string;
  signal_id: number | null;
  bet_date: string;
  race_type: RaceType;
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  selected_kaime: string[];
  bet_amount: number;
  bet_result: BetResult;
  payout: number;
  is_auto_bet: boolean;
}
