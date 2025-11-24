import { supabase } from '@/lib/supabase';
import type { BetSignal } from '@shared/types/database.types';

export async function logBetHistory(params: {
  signal: BetSignal;
  userId: string;
  isAuto: boolean;
  result: 'pending' | 'win' | 'lose' | 'cancelled';
}) {
  const { signal, userId, isAuto, result } = params;
  return supabase.from('bet_history').insert({
    user_id: userId,
    signal_id: signal.id,
    bet_date: new Date().toISOString(),
    race_type: signal.race_type,
    jo_name: signal.jo_name,
    race_no: signal.race_no,
    bet_type_name: signal.bet_type_name,
    selected_kaime: signal.kaime_data,
    bet_amount: signal.suggested_amount,
    bet_result: result,
    is_auto_bet: isAuto,
  });
}
