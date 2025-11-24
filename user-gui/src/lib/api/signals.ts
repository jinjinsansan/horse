import type { BetSignal } from '@horsebet/shared/types/database.types';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export async function fetchTodaySignals() {
  const today = new Date().toISOString().split('T')[0];
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
