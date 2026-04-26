import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BetSignal } from '@horsebet/shared/types/database.types';
import { fetchTodaySignals } from '@/lib/api/signals';
import { betSignalToRaceUI } from '@/services/race-mapper';
import { GzWindow, MatrixBg, Orb, Corners } from '@/components/gantz';

export default function RaceList() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetchTodaySignals().then(({ data }) => {
      if (data) setSignals(data);
      setLoading(false);
    });
  }, []);

  const races = signals.map((s) => betSignalToRaceUI(s));
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
  const jraCount = races.filter((r) => r.race_type === 'JRA').length;
  const narCount = races.filter((r) => r.race_type === 'NAR').length;

  return (
    <GzWindow title="競馬GANTZ" subtitle="RACE LIST / 本日の配信">
      <MatrixBg density={14} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <div className="gz-label">RACE LIST · {today}</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">本日の配信レース</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="gz-badge"><span className="gz-dot" />LIVE</span>
            <span className="gz-badge">JRA {jraCount}</span>
            <span className="gz-badge">NAR {narCount}</span>
            <button onClick={() => navigate('/')} className="gz-btn gz-btn-ghost">← ダッシュボード</button>
          </div>
        </div>

        {loading && (
          <div style={{ display: 'grid', placeItems: 'center', flex: 1, color: 'var(--gz-text-muted)', fontFamily: 'var(--gz-mono)' }}>
            LOADING…
          </div>
        )}

        {!loading && races.length === 0 && (
          <div
            style={{
              display: 'grid', placeItems: 'center', flex: 1,
              border: '1px dashed var(--gz-line)',
              flexDirection: 'column', gap: 12,
              fontFamily: 'var(--gz-mono)', color: 'var(--gz-text-muted)', letterSpacing: '0.2em',
            }}
          >
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 28, color: 'var(--gz-text-dim)', letterSpacing: '0.1em' }}>
              本日の配信はありません
            </div>
            <div style={{ fontSize: 11, color: 'var(--gz-text-muted)', letterSpacing: '0.15em' }}>
              競馬GANTZ は配信があった日のみ任務を受信します
            </div>
          </div>
        )}

        {!loading && races.length > 0 && (
          <div
            style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, overflowY: 'auto' }}
            className="gz-noscroll"
          >
            {races.map((r) => (
              <button
                key={r.id}
                onClick={() => navigate(`/races/${r.id}`)}
                className="gz-panel gz-card-hover"
                style={{ padding: 18, position: 'relative', textAlign: 'left', cursor: 'pointer', color: 'inherit' }}
              >
                <Corners />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div className="gz-label">{r.race_type} · {r.start_time}</div>
                    <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 26, fontWeight: 700, color: 'var(--gz-text)', marginTop: 4 }} className="gz-glow">
                      {r.jo_name}<span style={{ color: 'var(--gz-green)', marginLeft: 6 }}>{r.race_no}R</span>
                    </div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 4 }}>
                      {r.bet_type_name}
                    </div>
                  </div>
                  {/* M3: scheduleMap を持たないため 'queued'(デフォルト) は非表示 */}
                {r.schedule !== 'queued' && (
                  <span className={`gz-badge ${r.schedule === 'submitted' ? '' : r.schedule === 'scheduled' ? 'gz-badge-amber' : 'gz-badge-dim'}`}>
                    {r.schedule}
                  </span>
                )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
                  <Orb size={90}>
                    <div style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">
                      {r.kaime_data[0]}
                    </div>
                  </Orb>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 18, fontWeight: 700, color: 'var(--gz-green)' }} className="gz-glow">
                      {r.horse_name}
                    </div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)' }}>
                      {r.popularity > 0 ? `${r.popularity}人気` : '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                      <span style={{ fontFamily: 'var(--gz-display)', fontSize: 32, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">
                        {r.ai_prob.toFixed(1)}
                      </span>
                      <span style={{ color: 'var(--gz-green)' }}>%</span>
                      <span className="gz-label" style={{ marginLeft: 6 }}>AI</span>
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--gz-line)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--gz-mono)', fontSize: 10 }}>
                  <span style={{ color: 'var(--gz-text-muted)' }}>一致 {r.consensus} {r.engines}</span>
                  <span style={{ color: 'var(--gz-amber)' }}>発射 {r.fire_at}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </GzWindow>
  );
}
