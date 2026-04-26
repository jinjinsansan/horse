/**
 * BetSignal (実 DB) → UI Race 型 (デザインハンドオフ仕様) のマッパー
 *
 * GANTZ note 文字列から popularity / consensus / engines / horse_name を抽出する。
 * 実データに無い項目 (jockey / trainer / odds / estimated_3f / speed 等) は
 * 暫定で計算値や placeholder で埋める。Phase 6 で外部 API 接続時に置換予定。
 */
import type { BetSignal } from '@horsebet/shared/types/database.types';

export type RaceUI = {
  id: number;
  signal_date: string;
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  jo_code: string;
  race_no: number;
  race_name: string;
  distance: string;
  course: 'A' | 'B' | 'C';
  total_horses: number;
  start_time: string;
  bet_type_name: string;
  bet_type: number;
  suggested_amount: number;
  kaime_data: string[];
  horse_name: string;
  popularity: number;
  ai_prob: number;
  consensus: string;
  engines: string;
  source: string;
  status: 'active' | 'cancelled' | 'completed';
  odds: { win: number[] };
  jockey: string;
  trainer: string;
  estimated_3f: number;
  speed: 'S' | 'A+' | 'A' | 'B+' | 'B';
  stamina: 'S' | 'A+' | 'A' | 'B+' | 'B';
  schedule: 'queued' | 'scheduled' | 'submitted' | 'cancelled';
  fire_at: string;
  note: string;
};

function parseGantzNote(note: string | null): {
  horseName: string;
  popularity: number;
  consensus: string;
  engines: string;
} {
  if (!note) return { horseName: '—', popularity: 0, consensus: '—', engines: '—' };
  const horseMatch = note.match(/\d+番([^\s|]+)/);
  const popMatch = note.match(/(\d+)人気/);
  const consMatch = note.match(/一致(\d+)\/4(?:\(([^)]+)\))?/);
  return {
    horseName: horseMatch ? horseMatch[1] : '—',
    popularity: popMatch ? parseInt(popMatch[1], 10) : 0,
    consensus: consMatch ? `${consMatch[1]}/4` : '—',
    engines: consMatch && consMatch[2] ? consMatch[2] : '—',
  };
}

/** consensus '4/4' → 95, '3/4' → 85, '2/4' → 70 のような目安 */
function consensusToAiProb(consensus: string): number {
  const m = consensus.match(/(\d+)\/4/);
  if (!m) return 50;
  const n = parseInt(m[1], 10);
  return [40, 60, 70, 85, 95][n] ?? 50;
}

/** 発射時刻の計算: start_time の 5 分前 */
function fireAtFromStartTime(startTime: string | null): string {
  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) return '—';
  const [hh, mm] = startTime.split(':').map((s) => parseInt(s, 10));
  const total = hh * 60 + mm - 5;
  if (total < 0) return startTime;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function betSignalToRaceUI(signal: BetSignal, scheduleStatus?: string): RaceUI {
  const meta = parseGantzNote(signal.note);
  const aiProb = consensusToAiProb(meta.consensus);
  return {
    id: signal.id,
    signal_date: signal.signal_date,
    race_type: signal.race_type,
    jo_name: signal.jo_name,
    jo_code: signal.jo_code,
    race_no: signal.race_no,
    race_name: '',                    // TODO: 外部 API or note 拡張
    distance: '—',                    // TODO
    course: 'A',                      // TODO
    total_horses: 12,                 // TODO 実データ取得まで暫定
    start_time: signal.start_time ?? '—:—',
    bet_type_name: signal.bet_type_name,
    bet_type: signal.bet_type,
    suggested_amount: signal.suggested_amount,
    kaime_data: signal.kaime_data,
    horse_name: meta.horseName,
    popularity: meta.popularity,
    ai_prob: aiProb,
    consensus: meta.consensus,
    engines: meta.engines,
    source: signal.source,
    status: signal.status,
    odds: { win: [] },                // TODO 外部 API
    jockey: '—',
    trainer: '—',
    estimated_3f: 0,
    speed: 'A',
    stamina: 'A',
    schedule: (scheduleStatus as RaceUI['schedule']) ?? 'queued',
    fire_at: fireAtFromStartTime(signal.start_time),
    note: signal.note ?? '',
  };
}
