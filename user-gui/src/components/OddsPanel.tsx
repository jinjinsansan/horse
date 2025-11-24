import { useEffect, useState } from 'react';
import type { BetSignal } from '@shared/types/database.types';
import { fetchJraOdds } from '@/lib/api/odds';
import type { OddsEntry } from '@/types/odds';

interface OddsPanelProps {
  signal: BetSignal | null;
}

export default function OddsPanel({ signal }: OddsPanelProps) {
  const [odds, setOdds] = useState<OddsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!signal || signal.race_type !== 'JRA') {
      setOdds([]);
      return;
    }
    loadOdds(signal);
    const interval = setInterval(() => loadOdds(signal), 60_000);
    return () => clearInterval(interval);
  }, [signal?.id]);

  if (!signal || signal.race_type !== 'JRA') {
    return (
      <div className="odds-panel">
        <p className="muted">現在はJRAレースのみリアルタイムオッズを表示しています（地方競馬は準備中）</p>
      </div>
    );
  }

  const loadOdds = async (target: BetSignal) => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchJraOdds({ joName: target.jo_name, raceNo: target.race_no });
      setOdds(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'オッズ取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="odds-panel">
      <div className="odds-head">
        <div>
          <p className="label">リアルタイムオッズ</p>
          <h3>{signal.jo_name} {signal.race_no}R</h3>
        </div>
        <button className="secondary" onClick={() => loadOdds(signal)} disabled={loading}>
          {loading ? '更新中...' : '再取得'}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="odds-list">
        {odds.map((entry) => (
          <div key={entry.umaban} className="odds-row">
            <div className="odds-left">
              <span className="kaime">{entry.umaban}</span>
              <span className="muted">{entry.popularity}番人気</span>
            </div>
            <strong>{entry.odds.toFixed(1)}倍</strong>
          </div>
        ))}
        {odds.length === 0 && !loading && (
          <p className="muted">データなし</p>
        )}
      </div>
    </div>
  );
}
