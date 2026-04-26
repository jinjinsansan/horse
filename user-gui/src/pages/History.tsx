import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GzWindow, MatrixBg, Corners } from '@/components/gantz';

type HistoryRow = {
  id: number;
  bet_date: string;
  race_type: string;
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  selected_kaime: string[];
  bet_amount: number;
  bet_result: 'pending' | 'win' | 'lose' | 'cancelled';
  payout: number;
};

const PAGE_SIZE = 50;

export default function History() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) { setLoading(false); return; }
      const { data, count } = await supabase
        .from('bet_history')
        .select('id, bet_date, race_type, jo_name, race_no, bet_type_name, selected_kaime, bet_amount, bet_result, payout', { count: 'exact' })
        .eq('user_id', user.user.id)
        .order('bet_date', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      setRows((data ?? []) as HistoryRow[]);
      setTotal(count ?? 0);
      setLoading(false);
    })();
  }, [page]);

  // KPI 計算: 全件ではなく現在 page のみ計算（高速化のため）。本番は別 query で集計推奨
  const stats = useMemo(() => {
    const totalBets = rows.length;
    const wins = rows.filter((r) => r.bet_result === 'win').length;
    const decided = rows.filter((r) => r.bet_result === 'win' || r.bet_result === 'lose').length;
    const totalIn = rows.reduce((s, r) => s + (r.bet_amount ?? 0), 0);
    const totalOut = rows.reduce((s, r) => s + (r.payout ?? 0), 0);
    const winRate = decided > 0 ? (wins / decided) * 100 : 0;
    const recovery = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;
    return { totalBets, wins, winRate, recovery };
  }, [rows]);

  // 直近 10 日の収支
  const dailyChart = useMemo(() => {
    const buckets = new Map<string, number>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 9; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400_000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      if (r.bet_result !== 'win' && r.bet_result !== 'lose') continue;
      const day = r.bet_date.slice(0, 10);
      if (buckets.has(day)) {
        buckets.set(day, (buckets.get(day) ?? 0) + ((r.payout ?? 0) - (r.bet_amount ?? 0)));
      }
    }
    return Array.from(buckets.entries());
  }, [rows]);

  return (
    <GzWindow title="競馬GANTZ" subtitle="BET HISTORY / 履歴・収支">
      <MatrixBg density={12} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="gz-label">BET HISTORY · 全{total}件</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">履歴 / 収支</div>
          </div>
          <button onClick={() => navigate('/')} className="gz-btn gz-btn-ghost">← ダッシュボード</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {([
            ['総投票数', `${stats.totalBets}件`, 'var(--gz-text)'],
            ['的中', `${stats.wins}件`, 'var(--gz-green)'],
            ['的中率', `${stats.winRate.toFixed(1)}%`, 'var(--gz-green)'],
            ['回収率', `${stats.recovery.toFixed(1)}%`, 'var(--gz-amber)'],
          ] as const).map(([k, v, c]) => (
            <div key={k} className="gz-panel gz-panel-glow" style={{ padding: 18, position: 'relative' }}>
              <Corners />
              <div className="gz-label">{k}</div>
              <div style={{ fontFamily: 'var(--gz-display)', fontSize: 38, fontWeight: 900, color: c, marginTop: 6 }} className="gz-glow-strong">
                {v}
              </div>
            </div>
          ))}
        </div>

        <div className="gz-panel" style={{ padding: 18, marginBottom: 20 }}>
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>収支推移 (直近10日)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {(() => {
              // L3: データ最大値に合わせて高さを正規化 (最小 1 で除算ゼロ回避)
              const maxAbs = Math.max(...dailyChart.map(([, v]) => Math.abs(v)), 1);
              return dailyChart.map(([day, v], i) => {
              const h = (Math.abs(v) / maxAbs) * 90;
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <div
                    style={{
                      width: '100%',
                      height: `${h}px`,
                      background: v >= 0 ? 'var(--gz-green)' : 'var(--gz-red)',
                      boxShadow: v >= 0 ? '0 0 10px var(--gz-green)' : '0 0 10px var(--gz-red)',
                    }}
                  />
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 9, color: 'var(--gz-text-muted)', marginTop: 4 }}>
                    {day.slice(5).replace('-', '/')}
                  </div>
                </div>
              );
            });
            })()}
          </div>
        </div>

        <div className="gz-panel" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto' }} className="gz-noscroll">
            <table className="gz-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(2,12,7,0.95)' }}>
                <tr>
                  <th>日時</th><th>区分</th><th>会場</th><th>R</th><th>馬券</th><th>選択</th>
                  <th>投票額</th><th>結果</th><th>払戻</th><th>差引</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--gz-text-muted)' }}>LOADING…</td></tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: 24, color: 'var(--gz-text-muted)' }}>
                    投票履歴はまだありません
                  </td></tr>
                )}
                {!loading && rows.map((r) => {
                  const profit = (r.payout ?? 0) - (r.bet_amount ?? 0);
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--gz-text-muted)' }}>{new Date(r.bet_date).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{r.race_type}</td>
                      <td>{r.jo_name}</td>
                      <td style={{ color: 'var(--gz-green)' }}>{r.race_no}R</td>
                      <td>{r.bet_type_name}</td>
                      <td style={{ fontFamily: 'var(--gz-jp)' }}>{(r.selected_kaime ?? []).join(',')}</td>
                      <td>¥{r.bet_amount}</td>
                      <td>
                        <span className={`gz-badge ${r.bet_result === 'win' ? '' : r.bet_result === 'lose' ? 'gz-badge-red' : 'gz-badge-dim'}`}>
                          {r.bet_result === 'win' ? '的中' : r.bet_result === 'lose' ? '不的中' : r.bet_result === 'pending' ? '判定待ち' : 'キャンセル'}
                        </span>
                      </td>
                      <td style={{ color: r.payout > 0 ? 'var(--gz-amber)' : 'var(--gz-text-muted)', fontWeight: 700 }}>¥{r.payout ?? 0}</td>
                      <td style={{ color: profit > 0 ? 'var(--gz-green)' : profit < 0 ? 'var(--gz-red)' : 'var(--gz-text-muted)', fontWeight: 700 }}>
                        {profit > 0 ? '+' : ''}¥{profit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {total > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <div className="gz-label">PAGE {page + 1} / {Math.ceil(total / PAGE_SIZE)}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="gz-btn gz-btn-ghost">前</button>
              <button onClick={() => setPage((p) => p + 1)} disabled={(page + 1) * PAGE_SIZE >= total} className="gz-btn gz-btn-ghost">次</button>
            </div>
          </div>
        )}
      </div>
    </GzWindow>
  );
}
