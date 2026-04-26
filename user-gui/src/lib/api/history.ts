import { supabase } from '@/lib/supabase';
import type { BetSignal } from '@horsebet/shared/types/database.types';

export async function logBetHistory(params: {
  signal: BetSignal;
  userId: string;
  isAuto: boolean;
  result: 'pending' | 'win' | 'lose' | 'cancelled';
  /** H1: ユーザー設定の投票金額。省略時は signal.suggested_amount を使用 */
  betAmount?: number;
}) {
  const { signal, userId, isAuto, result, betAmount } = params;
  return supabase.from('bet_history').insert({
    user_id: userId,
    signal_id: signal.id,
    bet_date: new Date().toISOString(),
    race_type: signal.race_type,
    jo_name: signal.jo_name,
    race_no: signal.race_no,
    bet_type_name: signal.bet_type_name,
    selected_kaime: signal.kaime_data,
    bet_amount: betAmount ?? signal.suggested_amount,
    bet_result: result,
    is_auto_bet: isAuto,
  });
}

/**
 * 当日 user_id が投票済みの signal_id 集合を返す（重複投票防止用）
 */
export async function fetchSubmittedSignalIds(userId: string): Promise<Set<number>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('bet_history')
    .select('signal_id')
    .eq('user_id', userId)
    .gte('bet_date', startOfDay.toISOString())
    .not('signal_id', 'is', null);
  if (error || !data) return new Set();
  return new Set(data.map((row) => row.signal_id as number).filter(Boolean));
}

export type TodayBet = {
  id: number;
  bet_amount: number;
  payout: number;
  bet_result: 'pending' | 'win' | 'lose' | 'cancelled';
};

/**
 * 当日 user_id の投票履歴（金額・払戻・結果）
 */
export async function fetchTodayHistory(userId: string): Promise<TodayBet[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from('bet_history')
    .select('id, bet_amount, payout, bet_result')
    .eq('user_id', userId)
    .gte('bet_date', startOfDay.toISOString());
  if (error || !data) return [];
  return data as TodayBet[];
}

/**
 * 自分の bet_history に変更（INSERT or UPDATE）が起きたら callback。
 * 結果反映スクリプト (update_bet_results.py) で payout が確定すると発火。
 */
export function subscribeToHistoryUpdates(userId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`bet_history_${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'bet_history', filter: `user_id=eq.${userId}` },
      () => onChange(),
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
