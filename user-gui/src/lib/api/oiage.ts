import { supabase } from '@/lib/supabase';

export interface OiageRecord {
  id: number;
  user_id: string;
  bet_type: number;
  bet_type_name: string;
  current_kaime: number;
  total_investment: number;
  target_profit: number;
  is_active: boolean;
  max_steps?: number;
  base_amount?: number;
}

export async function fetchActiveOiage(userId: string, betType = 8) {
  const { data, error } = await supabase
    .from('oiage_state')
    .select('*')
    .eq('user_id', userId)
    .eq('bet_type', betType)
    .eq('is_active', true)
    .single();
  return { data: data as (OiageRecord & { base_amount?: number; max_steps?: number }) | null, error };
}

export async function upsertOiageState(params: {
  userId: string;
  betType: number;
  betTypeName: string;
  targetProfit: number;
  isActive: boolean;
}) {
  const { userId, betType, betTypeName, targetProfit, isActive } = params;
  const { data: existing } = await supabase
    .from('oiage_state')
    .select('*')
    .eq('user_id', userId)
    .eq('bet_type', betType)
    .maybeSingle();

  if (existing) {
    return supabase
      .from('oiage_state')
      .update({
        target_profit: targetProfit,
        total_investment: isActive ? existing.total_investment : 0,
        current_kaime: isActive ? existing.current_kaime : 0,
        is_active: isActive,
      })
      .eq('id', existing.id);
  }

  return supabase.from('oiage_state').insert({
    user_id: userId,
    bet_type: betType,
    bet_type_name: betTypeName,
    target_profit: targetProfit,
    total_investment: 0,
    current_kaime: 0,
    is_active: isActive,
  });
}

export async function advanceOiage(record: OiageRecord, betAmount: number) {
  return supabase
    .from('oiage_state')
    .update({
      current_kaime: record.current_kaime + 1,
      total_investment: record.total_investment + betAmount,
    })
    .eq('id', record.id);
}

export async function resetOiage(recordId: number) {
  return supabase
    .from('oiage_state')
    .update({
      is_active: false,
      current_kaime: 0,
      total_investment: 0,
    })
    .eq('id', recordId);
}
