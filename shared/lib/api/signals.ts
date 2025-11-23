import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { BetSignal } from '../../types/database.types';
import type { CreateSignalRequest } from '../../types/business.types';
import { JO_CODES, BET_TYPES } from '../../types/business.types';

function getJoName(joCode: string): string {
  return JO_CODES[joCode as keyof typeof JO_CODES] ?? '不明';
}

function getBetTypeName(betType: number): string {
  return BET_TYPES[betType as keyof typeof BET_TYPES] ?? '不明';
}

export async function createSignal(request: CreateSignalRequest) {
  const payload = {
    ...request,
    jo_name: getJoName(request.jo_code),
    bet_type_name: getBetTypeName(request.bet_type)
  };

  const { data, error } = await supabase
    .from('bet_signals')
    .insert(payload)
    .select()
    .single();

  return { data, error };
}

export async function getTodaySignals() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('bet_signals')
    .select('*')
    .eq('signal_date', today)
    .eq('status', 'active')
    .order('race_no', { ascending: true });

  return { data, error };
}

export function subscribeToSignals(onSignalReceived: (signal: BetSignal) => void) {
  const channel = supabase
    .channel('bet_signals_changes')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'bet_signals'
    }, (payload: RealtimePostgresChangesPayload<BetSignal>) => {
      if (payload.new && 'id' in payload.new) {
        onSignalReceived(payload.new as BetSignal);
      }
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}
