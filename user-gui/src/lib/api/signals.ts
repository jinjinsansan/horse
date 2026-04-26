import type { BetSignal } from '@horsebet/shared/types/database.types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export async function fetchTodaySignals() {
  // L7: dlogic-agent は JST で signal_date を記録するため UTC ではなく JST 日付を使う
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('bet_signals')
    .select('*')
    .eq('signal_date', today)
    .order('race_no', { ascending: true });
  return { data, error };
}

export function subscribeToSignalFeed(onInsert: (signal: BetSignal) => void) {
  const channel = supabase
    .channel('bet_signals_feed')
    .on('postgres_changes', {
      schema: 'public',
      table: 'bet_signals',
      event: 'INSERT',
    }, (payload: RealtimePostgresChangesPayload<BetSignal>) => {
      if (payload.new && 'id' in payload.new) {
        onInsert(payload.new as BetSignal);
      }
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}

/**
 * bet_signals の UPDATE を購読（outcome_* 変更検知用）。
 * update_bet_results.py がレース結果を書き込むと発火する。
 */
export function subscribeToSignalUpdates(onUpdate: (signal: BetSignal) => void) {
  const channel = supabase
    .channel('bet_signals_updates')
    .on('postgres_changes', {
      schema: 'public',
      table: 'bet_signals',
      event: 'UPDATE',
    }, (payload: RealtimePostgresChangesPayload<BetSignal>) => {
      if (payload.new && 'id' in payload.new) {
        onUpdate(payload.new as BetSignal);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
