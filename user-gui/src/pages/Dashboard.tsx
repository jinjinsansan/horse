import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BetSignal } from '@shared/types/database.types';
import { supabase } from '@/lib/supabase';
import { fetchTodaySignals, subscribeToSignalFeed } from '@/lib/api/signals';
import { Bell, Settings as SettingsIcon, LogOut } from 'lucide-react';

export default function Dashboard() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<BetSignal | null>(null);
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const [{ data }] = await Promise.all([fetchTodaySignals(), loadProfileName()]);
      if (data) {
        setSignals(data);
        setSelectedSignal(data[0] ?? null);
      }
      setLoading(false);
    };
    init();

    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const unsubscribe = subscribeToSignalFeed((signal) => {
      setSignals((prev) => [signal, ...prev]);
      setSelectedSignal(signal);
      if (Notification.permission === 'granted') {
        new Notification('新しい買い目が届きました', {
          body: `${signal.jo_name} ${signal.race_no}R ${signal.bet_type_name}`,
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const todaysCount = useMemo(() => signals.length, [signals]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  async function loadProfileName() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name')
      .eq('id', user.user.id)
      .single();
    if (data?.display_name) {
      setProfileName(data.display_name);
    }
  }

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div>
          <p className="sidebar-title">配信一覧</p>
          {loading && <p className="muted">読込中...</p>}
          {!loading && todaysCount === 0 && <p className="muted">本日の配信はありません</p>}
          <div className="signal-list">
            {signals.map((signal) => (
              <button
                key={signal.id}
                className={`signal-item ${selectedSignal?.id === signal.id ? 'active' : ''}`}
                onClick={() => setSelectedSignal(signal)}
              >
                <span className="signal-time">
                  {new Date(signal.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div>
                  <p className="signal-title">{signal.jo_name} {signal.race_no}R</p>
                  <p className="signal-subtitle">{signal.bet_type_name} / {signal.kaime_data.length}点</p>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-footer">
          <button className="link" onClick={() => navigate('/settings')}>
            <SettingsIcon size={16} /> 設定
          </button>
          <button className="link" onClick={handleSignOut}>
            <LogOut size={16} /> ログアウト
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <p className="label">ようこそ</p>
            <h1>{profileName || '会員'}</h1>
            <p className="muted">本日の買い目: {todaysCount} 件</p>
          </div>
          <div className="pill">
            <Bell size={16} /> 通知ON
          </div>
        </header>

        {selectedSignal ? (
          <section className="detail-card">
            <div className="detail-head">
              <div>
                <p className="label">レース情報</p>
                <h2>{selectedSignal.jo_name} {selectedSignal.race_no}R</h2>
                <p className="muted">{selectedSignal.bet_type_name} / 推奨 ¥{selectedSignal.suggested_amount.toLocaleString()}</p>
              </div>
              <div className={`status ${selectedSignal.status}`}>
                {selectedSignal.status}
              </div>
            </div>
            {selectedSignal.note && (
              <div className="note">
                <p>{selectedSignal.note}</p>
              </div>
            )}
            <div className="kaime-grid">
              {selectedSignal.kaime_data.map((item, index) => (
                <span key={`${item}-${index}`} className="kaime">
                  {item}
                </span>
              ))}
            </div>
            <div className="actions">
              <button className="primary">手動で投票</button>
              <button className="secondary" onClick={() => navigate('/settings')}>
                自動投票設定を開く
              </button>
            </div>
          </section>
        ) : (
          <div className="empty">左の一覧から買い目を選択してください</div>
        )}
      </main>
    </div>
  );
}
