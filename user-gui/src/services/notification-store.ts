/**
 * Notifications store
 *
 * in-memory、永続化なし、最大 200 件。
 * 呼び出し元が push() で直接イベントを追加する。
 * (Realtime 購読からの自動プッシュは未実装。各実行ポイントで push() を呼ぶ)
 */
export type NotifType = 'signal' | 'fire' | 'submitted' | 'win' | 'system' | 'error';
export type NotifSeverity = 'info' | 'success' | 'win' | 'error';

export type NotifItem = {
  id: number;
  ts: number;       // epoch ms
  time: string;     // 表示用 'HH:MM' or '昨日'
  type: NotifType;
  message: string;
  severity: NotifSeverity;
};

const MAX = 200;

class NotificationStore {
  private items: NotifItem[] = [];
  private listeners = new Set<(items: NotifItem[]) => void>();
  private nextId = 1;

  push(input: Omit<NotifItem, 'id' | 'ts' | 'time'>): void {
    const ts = Date.now();
    const time = new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const item: NotifItem = { id: this.nextId++, ts, time, ...input };
    this.items = [item, ...this.items].slice(0, MAX);
    this.emit();
  }

  subscribe(fn: (items: NotifItem[]) => void): () => void {
    this.listeners.add(fn);
    fn(this.items);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getAll(): NotifItem[] {
    return this.items;
  }

  unreadCount(): number {
    return this.items.length;
  }

  private emit(): void {
    for (const l of this.listeners) l(this.items);
  }
}

export const notificationStore = new NotificationStore();
