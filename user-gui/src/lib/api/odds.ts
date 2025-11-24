import { JO_CODES } from '@shared/types/business.types';

export type OddsEntry = {
  umaban: string;
  odds: number;
  popularity: number;
};

function getJoCodeByName(name: string) {
  const entry = Object.entries(JO_CODES).find(([, label]) => label === name);
  return entry?.[0] ?? '05';
}

export async function fetchJraOdds(params: { joName: string; raceNo: number }): Promise<OddsEntry[]> {
  const joCode = getJoCodeByName(params.joName);

  // Placeholder: generate stable pseudo odds so UI can function until real scraper is wired.
  const seed = `${joCode}-${params.raceNo}`;
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
