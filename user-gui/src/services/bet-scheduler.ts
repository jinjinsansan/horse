/**
 * BetScheduler
 *
 * GANTZ ブリッジ等から Supabase に投入された bet_signals を、
 * レース発走時刻ベースで自動投票するスケジューラ。
 *
 * - レース発走 LEAD_MINUTES 分前に発射（デフォルト 5 分）
 * - signal.start_time が未指定の signal は即時実行（手動配信互換）
 * - すでに発走時刻を過ぎたシグナルは即時実行（遅延受信のリカバリ）
 * - 同一 signal_id を二重発射しない（in-memory + bet_history チェック）
 *
 * このスケジューラはアプリプロセス内で動作するため、Electron アプリ未起動時は
 * 投票が実行されない。常駐起動を推奨する旨を Settings 等で案内する想定。
 */

import type { BetSignal } from '@horsebet/shared/types/database.types';

export type BetExecutor = (signal: BetSignal) => Promise<void>;

export type ScheduledItemStatus =
  | 'queued'      // 受信したが未処理
  | 'scheduled'   // タイマー設定済（発走前）
  | 'firing'      // 投票実行中
  | 'submitted'   // 投票完了
  | 'failed'      // 投票失敗
  | 'skipped';    // 重複/取消等でスキップ

export interface ScheduledItem {
  signal: BetSignal;
  status: ScheduledItemStatus;
  fireAt: number | null;   // epoch ms (null = 即時実行 or 不明)
  reason?: string;
}

export interface BetSchedulerOptions {
  leadMinutes?: number;          // 発走何分前に発射するか（既定 5）
  graceSecondsAfterStart?: number; // 発走時刻からこの秒数以内なら遅延実行を許可（既定 60）
  executor: BetExecutor;
  isAlreadySubmitted: (signalId: number) => boolean;
  onChange?: (items: ReadonlyMap<number, ScheduledItem>) => void;
}

const DEFAULT_LEAD_MINUTES = 5;
const DEFAULT_GRACE_SECONDS_AFTER_START = 60;

/**
 * "YYYY-MM-DD" + "HH:MM" → epoch ms (JST 解釈)
 */
export function computeFireTimestamp(
  signalDate: string,
  startTime: string,
  leadMinutes: number,
): number | null {
  if (!startTime || !/^\d{1,2}:\d{2}$/.test(startTime)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(signalDate)) return null;

  const [hh, mm] = startTime.split(':').map((s) => parseInt(s, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;

  // JST 固定で組み立てる（"YYYY-MM-DDTHH:MM:00+09:00"）
  const iso = `${signalDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
  const startMs = new Date(iso).getTime();
  if (Number.isNaN(startMs)) return null;

  return startMs - leadMinutes * 60_000;
}

export class BetScheduler {
  private readonly leadMinutes: number;
  private readonly graceSecondsAfterStart: number;
  private readonly executor: BetExecutor;
  private readonly isAlreadySubmitted: (signalId: number) => boolean;
  private readonly onChange?: (items: ReadonlyMap<number, ScheduledItem>) => void;

  private readonly items = new Map<number, ScheduledItem>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(opts: BetSchedulerOptions) {
    this.leadMinutes = opts.leadMinutes ?? DEFAULT_LEAD_MINUTES;
    this.graceSecondsAfterStart = opts.graceSecondsAfterStart ?? DEFAULT_GRACE_SECONDS_AFTER_START;
    this.executor = opts.executor;
    this.isAlreadySubmitted = opts.isAlreadySubmitted;
    this.onChange = opts.onChange;
  }

  /**
   * シグナルを登録。既に同 ID が登録済みなら更新（再 schedule）。
   */
  schedule(signal: BetSignal): void {
    const existing = this.items.get(signal.id);
    if (existing && existing.status !== 'queued' && existing.status !== 'scheduled') {
      // 既に実行済 or 失敗 → 何もしない（再投票しない）
      return;
    }

    if (this.isAlreadySubmitted(signal.id)) {
      this.upsert({ signal, status: 'skipped', fireAt: null, reason: '当日投票済（bet_history にレコードあり）' });
      return;
    }

    const now = Date.now();

    // start_time あり → 発走時刻を計算
    if (signal.start_time) {
      const fireAt = computeFireTimestamp(signal.signal_date, signal.start_time, this.leadMinutes);
      if (fireAt === null) {
        // 解釈不能 → 即実行扱い
        this.upsert({ signal, status: 'queued', fireAt: null, reason: 'start_time 解釈失敗、即実行' });
        this.fire(signal.id);
        return;
      }

      // 既に発走時刻を 1 分以上過ぎている → grace 範囲外、skip
      const startMs = fireAt + this.leadMinutes * 60_000;
      if (now >= startMs + this.graceSecondsAfterStart * 1000) {
        this.upsert({
          signal,
          status: 'skipped',
          fireAt,
          reason: `発走時刻を${Math.round((now - startMs) / 1000)}秒超過、投票締切済`,
        });
        return;
      }

      // fireAt が現在時刻以前なら即実行
      if (fireAt <= now) {
        this.upsert({ signal, status: 'queued', fireAt, reason: '発走間近、即実行' });
        this.fire(signal.id);
        return;
      }

      // 通常スケジュール
      const delay = fireAt - now;
      this.upsert({ signal, status: 'scheduled', fireAt });
      const timer = setTimeout(() => this.fire(signal.id), delay);
      this.timers.set(signal.id, timer);
      return;
    }

    // start_time なし（手動配信等）→ 即実行
    this.upsert({ signal, status: 'queued', fireAt: null, reason: 'start_time なし、即実行' });
    this.fire(signal.id);
  }

  cancel(signalId: number, reason = 'ユーザーが取消'): void {
    const timer = this.timers.get(signalId);
    if (timer) clearTimeout(timer);
    this.timers.delete(signalId);
    const item = this.items.get(signalId);
    if (item && (item.status === 'scheduled' || item.status === 'queued')) {
      this.upsert({ ...item, status: 'skipped', reason });
    }
  }

  getItems(): ReadonlyMap<number, ScheduledItem> {
    return this.items;
  }

  /** すべての setTimeout を破棄（コンポーネント unmount 時等） */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private async fire(signalId: number): Promise<void> {
    this.timers.delete(signalId);
    const item = this.items.get(signalId);
    if (!item) return;
    if (item.status === 'submitted' || item.status === 'firing') return;

    if (this.isAlreadySubmitted(signalId)) {
      this.upsert({ ...item, status: 'skipped', reason: '直前チェックで投票済を検出' });
      return;
    }

    this.upsert({ ...item, status: 'firing' });
    try {
      await this.executor(item.signal);
      this.upsert({ ...item, status: 'submitted' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.upsert({ ...item, status: 'failed', reason: msg });
    }
  }

  private upsert(item: ScheduledItem): void {
    this.items.set(item.signal.id, item);
    if (this.onChange) this.onChange(this.items);
  }
}
