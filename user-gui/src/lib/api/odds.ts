import type { OddsEntry } from '@/types/odds';

export async function fetchJraOdds(params: { joName: string; raceNo: number }): Promise<OddsEntry[]> {
  if (!window.horsebet?.fetchOdds) {
    throw new Error('Electronアプリでのみオッズ取得が可能です');
  }
  const result = await window.horsebet.fetchOdds(params);
  if (!result?.success || !Array.isArray(result.data)) {
    throw new Error(result?.message ?? 'オッズ取得に失敗しました');
  }
  return result.data as OddsEntry[];
}
