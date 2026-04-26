import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { BetSignal } from '@horsebet/shared/types/database.types';
import { supabase } from '@/lib/supabase';
import { betSignalToRaceUI } from '@/services/race-mapper';
import { GzWindow, MatrixBg, Orb, Corners, DataBar } from '@/components/gantz';

export default function RaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [signal, setSignal] = useState<BetSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const sid = parseInt(id ?? '', 10);
    if (!sid) { setLoading(false); return; }
    supabase
      .from('bet_signals').select('*').eq('id', sid).maybeSingle()
      .then(({ data }) => {
        setSignal(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <GzWindow title="競馬GANTZ" subtitle="RACE DETAIL">
        <MatrixBg density={10} />
        <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--gz-text-muted)', fontFamily: 'var(--gz-mono)' }}>
          LOADING…
        </div>
      </GzWindow>
    );
  }
  if (!signal) {
    return (
      <GzWindow title="競馬GANTZ" subtitle="RACE DETAIL">
        <MatrixBg density={10} />
        {/* L4: display:flex + flexDirection:column で縦並びを正しく機能させる */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--gz-red)', fontFamily: 'var(--gz-mono)', gap: 16 }}>
          <div>シグナルが見つかりません (id={id})</div>
          <button className="gz-btn" onClick={() => navigate('/races')}>← レース一覧</button>
        </div>
      </GzWindow>
    );
  }

  const r = betSignalToRaceUI(signal);

  return (
    <GzWindow title="競馬GANTZ" subtitle="RACE DETAIL">
      <MatrixBg density={14} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', overflowY: 'auto' }} className="gz-noscroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <button onClick={() => navigate('/races')} className="gz-btn gz-btn-ghost">← レース一覧</button>
          <span className="gz-badge">
            <span className="gz-dot" />
            {r.schedule.toUpperCase()} · {r.fire_at} 発射
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
          <div>
            <div className="gz-label">{r.race_type} · {r.distance} · {r.bet_type_name} · {r.start_time}</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 56, fontWeight: 900, color: 'var(--gz-text)', lineHeight: 1 }} className="gz-glow">
              {r.jo_name} <span style={{ color: 'var(--gz-green)' }}>{r.race_no}R</span>
            </div>
            {r.race_name && (
              <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 32, color: 'var(--gz-green)', fontWeight: 700, marginTop: 8 }} className="gz-glow-strong">
                {r.race_name}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 28 }}>
              {([
                ['AI 予測確率', `${r.ai_prob.toFixed(1)}%`, 'var(--gz-green)'],
                ['一致エンジン', r.consensus, 'var(--gz-green)'],
                ['人気', r.popularity > 0 ? `${r.popularity}人気` : '—', 'var(--gz-text)'],
                ['推定上がり3F', r.estimated_3f ? `${r.estimated_3f}秒` : '—', 'var(--gz-amber)'],
              ] as const).map(([k, v, c]) => (
                <div key={k} className="gz-panel gz-panel-glow" style={{ padding: 14, position: 'relative' }}>
                  <Corners />
                  <div className="gz-label">{k}</div>
                  <div style={{ fontFamily: 'var(--gz-display)', fontSize: 28, fontWeight: 900, color: c, marginTop: 6 }} className="gz-glow">
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="gz-label-strong" style={{ marginBottom: 12 }}>レースデータ解析 (GANTZ ENGINE)</div>
              <div className="gz-panel" style={{ padding: 18 }}>
                <p style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 0, marginBottom: 14 }}>
                  ※ MVP: 詳細解析データは外部接続後に実装。現在は暫定値を表示しています
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
                  <div>
                    <DataBar label="SPEED"   value={95} />
                    <DataBar label="STAMINA" value={90} />
                    <DataBar label="瞬発力"   value={88} />
                    <DataBar label="持続力"   value={84} />
                    <DataBar label="安定性"   value={92} />
                  </div>
                  <div>
                    <DataBar label="馬場"     value={85} color="var(--gz-amber)" />
                    <DataBar label="距離適性" value={91} color="var(--gz-amber)" />
                    <DataBar label="斤量"     value={78} color="var(--gz-amber)" />
                    <DataBar label="ローテ"   value={82} color="var(--gz-amber)" />
                    <DataBar label="調子"     value={89} color="var(--gz-amber)" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <Orb size={280} pulsing>
                <div className="gz-label" style={{ color: 'var(--gz-green)' }}>{r.bet_type_name} TARGET</div>
                <div style={{ fontFamily: 'var(--gz-display)', fontSize: 100, fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1, marginTop: 6 }} className="gz-glow-strong">
                  {r.kaime_data[0] ?? '—'}
                </div>
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 18, color: 'var(--gz-text)', fontWeight: 700, marginTop: 6 }} className="gz-glow">
                  {r.horse_name}
                </div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 4 }}>
                  ¥{r.suggested_amount} {r.popularity > 0 ? `· ${r.popularity}人気` : ''}
                </div>
              </Orb>
            </div>
            <div className="gz-panel" style={{ padding: 14, marginBottom: 14 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>GANTZ NOTE</div>
              <pre
                style={{
                  fontFamily: 'var(--gz-mono)', fontSize: 10,
                  color: 'var(--gz-text-dim)', whiteSpace: 'pre-wrap',
                  margin: 0,
                }}
              >
                {r.note || '—'}
              </pre>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => navigate('/')} className="gz-btn gz-btn-primary" style={{ justifyContent: 'center', padding: '14px' }}>
                ← ダッシュボードへ戻って投票
              </button>
            </div>
          </aside>
        </div>
      </div>
    </GzWindow>
  );
}
