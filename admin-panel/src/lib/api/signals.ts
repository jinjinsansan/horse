'use client';

import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { BetSignal } from '@shared/types/database.types';
import type { CreateSignalRequest } from '@shared/types/business.types';
import { BET_TYPES, JO_CODES } from '@shared/types/business.types';

const getJoName = (code: string) => JO_CODES[code as keyof typeof JO_CODES] ?? '不明';
const getBetTypeName = (betType: number) => BET_TYPES[betType as keyof typeof BET_TYPES] ?? '不明';

export async function createSignal(request: CreateSignalRequest) {
  const payload = {
    ...request,
    jo_name: getJoName(request.jo_code),
    bet_type_name: getBetTypeName(request.bet_type),
  };

  const { data, error } = await supabase
    .from('bet_signals')
    .insert(payload)
    .select()
    .single();

  return { data, error };
}

export async function fetchTodaySignals() {
  const today = new Date().toISOString().split('T')[0];
  const { data, error } = await supabase
    .from('bet_signals')
    .select('*')
    .eq('signal_date', today)
    .order('race_no', { ascending: true });
  return { data, error };
}

export function subscribeToSignalInsert(cb: (signal: BetSignal) => void) {
  const channel = supabase
    .channel('bet_signals_changes')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'bet_signals',
    }, (payload: RealtimePostgresChangesPayload<BetSignal>) => {
      if (payload.new && 'id' in payload.new) {
        cb(payload.new as BetSignal);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
