import type { OddsEntry } from '@/types/odds';

function fallbackOdds(params: { joName: string; raceNo: number }): OddsEntry[] {
  const seed = `${params.joName}-${params.raceNo}`;
  const pseudoRandom = (idx: number) => {
    let hash = 0;
    const text = seed + idx;
    for (let i = 0; i < text.length; i += 1) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 1000) / 10 + 1.5;
  };
  return Array.from({ length: 12 }).map((_, idx) => ({
    umaban: String(idx + 1).padStart(2, '0'),
    odds: Number(pseudoRandom(idx + 1).toFixed(1)),
    popularity: idx + 1,
  }));
}

export async function fetchJraOdds(params: { joName: string; raceNo: number }): Promise<OddsEntry[]> {
  if (!window.horsebet?.fetchOdds) {
    return fallbackOdds(params);
  }
  const result = await window.horsebet.fetchOdds(params);
  if (!result?.success || !Array.isArray(result.data)) {
    console.warn('fetchJraOdds fallback triggered', result?.message);
    return fallbackOdds(params);
  }
  return result.data as OddsEntry[];
}
