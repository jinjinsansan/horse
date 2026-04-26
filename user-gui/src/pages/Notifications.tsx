import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationStore, type NotifItem, type NotifType } from '@/services/notification-store';
import { GzWindow, MatrixBg } from '@/components/gantz';

type FilterKey = 'all' | NotifType;

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'all',       label: 'すべて' },
  { key: 'fire',      label: '投票実行' },
  { key: 'submitted', label: '投票完了' },
  { key: 'signal',    label: '配信受信' },
  { key: 'win',       label: '的中' },
  { key: 'system',    label: 'システム' },
  { key: 'error',     label: 'エラー' },
];

const ICONS: Record<NotifType, string> = {
  fire: '⚡', submitted: '✓', win: '★', signal: '◈', system: '◉', error: '✕',
};

export default function Notifications() {
  const [items, setItems] = useState<NotifItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const navigate = useNavigate();

  useEffect(() => notificationStore.subscribe(setItems), []);

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.type === filter)),
    [items, filter],
  );

  return (
    <GzWindow title="競馬GANTZ" subtitle="NOTIFICATIONS / 通知">
      <MatrixBg density={12} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="gz-label">NOTIFICATIONS · 全{items.length}件 / 表示{filtered.length}件</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">通知 / イベントログ</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="gz-badge"><span className="gz-dot" />LIVE FEED</span>
            <button onClick={() => navigate('/')} className="gz-btn gz-btn-ghost">← ダッシュボード</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, flex: 1, overflow: 'hidden' }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gz-label-strong" style={{ marginBottom: 6 }}>FILTER</div>
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`gz-btn ${filter === f.key ? '' : 'gz-btn-ghost'}`}
                style={{ justifyContent: 'flex-start', width: '100%' }}
              >
                {f.label}
              </button>
            ))}
          </aside>

          <div className="gz-panel" style={{ padding: 0, overflowY: 'auto' }}>
            <div className="gz-noscroll">
              {filtered.length === 0 && (
                <div
                  style={{
                    padding: '40px 24px', textAlign: 'center',
                    fontFamily: 'var(--gz-mono)', color: 'var(--gz-text-muted)',
                    letterSpacing: '0.2em',
                  }}
                >
                  通知はまだありません
                </div>
              )}
              {filtered.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid var(--gz-line)',
                    display: 'flex', gap: 16, alignItems: 'flex-start',
                  }}
                >
                  <div
                    style={{
                      width: 36, height: 36, flexShrink: 0,
                      border: `1px solid ${n.severity === 'win' ? 'var(--gz-amber)' : n.severity === 'error' ? 'var(--gz-red)' : 'var(--gz-green)'}`,
                      background: 'rgba(0,15,8,0.8)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--gz-mono)', fontSize: 14,
                      color: n.severity === 'win' ? 'var(--gz-amber)' : n.severity === 'error' ? 'var(--gz-red)' : 'var(--gz-green)',
                      boxShadow:
                        n.severity === 'win' ? '0 0 10px var(--gz-amber)' :
                        n.severity === 'error' ? '0 0 10px var(--gz-red)' :
                        '0 0 8px var(--gz-green-glow)',
                    }}
                  >
                    {ICONS[n.type]}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="gz-label-strong">{n.type.toUpperCase()}</span>
                      <span style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)' }}>
                        {n.time}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14, marginTop: 4,
                        color: n.severity === 'win' ? 'var(--gz-amber)' : n.severity === 'error' ? 'var(--gz-red)' : 'var(--gz-text)',
                      }}
                      className={n.severity === 'win' ? 'gz-glow' : ''}
                    >
                      {n.message}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GzWindow>
  );
}
