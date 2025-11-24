import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BetSignal } from '@shared/types/database.types';
import { supabase } from '@/lib/supabase';
import { fetchTodaySignals, subscribeToSignalFeed } from '@/lib/api/signals';
import { logBetHistory } from '@/lib/api/history';
import { fetchActiveOiage, advanceOiage, type OiageRecord } from '@/lib/api/oiage';
import { createOiageCalculator } from '@/services/oiage-calculator';
import OddsPanel from '@/components/OddsPanel';
import { Bell, Settings as SettingsIcon, LogOut } from 'lucide-react';

type MinimalSignal = {
  id: number;
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
};

export default function Dashboard() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<BetSignal | null>(null);
  const [profileName, setProfileName] = useState('');
  const [userId, setUserId] = useState('');
  const [credentials, setCredentials] = useState<{
    ipat?: { inetId: string; userCode: string; password: string; pin: string };
    spat4?: { userId: string; password: string };
  }>({});
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [oiageConfig, setOiageConfig] = useState({ baseAmount: 1000, maxSteps: 5, targetProfit: 10000 });
  const [oiageRecord, setOiageRecord] = useState<OiageRecord | null>(null);
  const [betStatus, setBetStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const [{ data }] = await Promise.all([fetchTodaySignals(), loadProfile()]);
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
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToSignalFeed((signal) => {
      setSignals((prev) => [signal, ...prev]);
      setSelectedSignal(signal);
      if (Notification.permission === 'granted') {
        new Notification('新しい買い目が届きました', {
          body: `${signal.jo_name} ${signal.race_no}R ${signal.bet_type_name}`,
        });
      }
      if (autoBetEnabled) {
        handleBetExecution(signal, true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [autoBetEnabled, credentials]);

  const todaysCount = useMemo(() => signals.length, [signals]);
  const oiageCalculator = useMemo(() => createOiageCalculator({
    baseAmount: oiageConfig.baseAmount,
    targetProfit: oiageConfig.targetProfit,
    maxSteps: oiageConfig.maxSteps,
  }), [oiageConfig]);

  const nextOiageAmount = useMemo(() => {
    if (!oiageRecord) return oiageConfig.baseAmount;
    return oiageCalculator.nextBetAmount({
      currentStep: oiageRecord.current_kaime,
      totalInvestment: oiageRecord.total_investment,
    });
  }, [oiageRecord, oiageCalculator, oiageConfig.baseAmount]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  async function loadProfile() {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    setUserId(user.user.id);
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, ipat_credentials, spat4_credentials, auto_bet_enabled, settings')
      .eq('id', user.user.id)
      .single();
    if (data?.display_name) {
      setProfileName(data.display_name);
    }
    if (data) {
      setAutoBetEnabled(data.auto_bet_enabled ?? false);
      setCredentials({
        ipat: data.ipat_credentials?.inet_id
          ? {
              inetId: data.ipat_credentials.inet_id ?? '',
              userCode: data.ipat_credentials.user_cd ?? '',
              password: data.ipat_credentials.password ?? '',
              pin: data.ipat_credentials.pin ?? '',
            }
          : undefined,
        spat4: data.spat4_credentials?.user_id
          ? {
              userId: data.spat4_credentials.user_id ?? '',
              password: data.spat4_credentials.password ?? '',
            }
          : undefined,
      });
      setOiageConfig({
        baseAmount: data.settings?.oiage?.baseAmount ?? 1000,
        maxSteps: data.settings?.oiage?.maxSteps ?? 5,
        targetProfit: data.settings?.oiage?.targetProfit ?? 10000,
      });
    }
    const { data: oiage } = await fetchActiveOiage(user.user.id, 8);
    if (oiage) {
      setOiageRecord(oiage);
    } else {
      setOiageRecord(null);
    }
  }

  const handleBetExecution = async (target: BetSignal | null, isAuto = false) => {
    if (!target) return;
    if (!window.horsebet?.executeBet) {
      if (!isAuto) {
        setBetStatus('Electron版のみ投票ボタンが利用できます');
      }
      return;
    }

    if (target.race_type === 'JRA' && !credentials.ipat) {
      if (!isAuto) {
        setBetStatus('設定画面からIPAT認証情報を登録してください');
      }
      return;
    }

    if (target.race_type === 'NAR' && !credentials.spat4) {
      if (!isAuto) {
        setBetStatus('設定画面からSPAT4認証情報を登録してください');
      }
      return;
    }

    if (!isAuto) {
      setBetStatus('投票処理を開始しています...');
    }
    const signalPayload: MinimalSignal = {
      id: target.id,
      race_type: target.race_type,
      jo_name: target.jo_name,
      race_no: target.race_no,
      bet_type_name: target.bet_type_name,
      kaime_data: target.kaime_data,
      suggested_amount: target.suggested_amount,
    };

    const result = await window.horsebet.executeBet({
      signal: signalPayload,
      credentials,
      headless: isAuto,
    });

    if (result?.success) {
      if (!isAuto) {
        setBetStatus('投票が完了しました');
      }
      if (userId) {
        await logBetHistory({
          signal: target,
          userId,
          isAuto,
          result: 'pending',
        });
      }
      if (oiageRecord?.is_active) {
        await advanceOiage(oiageRecord, target.suggested_amount);
        setOiageRecord((prev) =>
          prev
            ? {
                ...prev,
                current_kaime: prev.current_kaime + 1,
                total_investment: prev.total_investment + target.suggested_amount,
              }
            : prev,
        );
      }
    } else if (!isAuto) {
      setBetStatus(result?.message ?? '投票に失敗しました');
    }
  };

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
              <button className="primary" onClick={() => handleBetExecution(selectedSignal)}>
                手動で投票
              </button>
              <button className="secondary" onClick={() => navigate('/settings')}>
                自動投票設定を開く
              </button>
            </div>
            {betStatus && <p className="info" style={{ marginTop: '0.75rem' }}>{betStatus}</p>}
            <OddsPanel signal={selectedSignal} />
            <div className="oiage-panel">
              <div className="oiage-head">
                <p className="label">追い上げ状況</p>
                <span className={`status ${oiageRecord?.is_active ? 'active' : 'cancelled'}`}>
                  {oiageRecord?.is_active ? '稼働中' : '停止中'}
                </span>
              </div>
              <div className="oiage-grid">
                <div>
                  <p className="muted">現在ステップ</p>
                  <strong>{oiageRecord?.current_kaime ?? 0} / {oiageConfig.maxSteps}</strong>
                </div>
                <div>
                  <p className="muted">累計投資</p>
                  <strong>¥{(oiageRecord?.total_investment ?? 0).toLocaleString()}</strong>
                </div>
                <div>
                  <p className="muted">次回推奨額</p>
                  <strong>¥{nextOiageAmount.toLocaleString()}</strong>
                </div>
                <div>
                  <p className="muted">目標利益</p>
                  <strong>¥{oiageConfig.targetProfit.toLocaleString()}</strong>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <div className="empty">左の一覧から買い目を選択してください</div>
        )}
      </main>
    </div>
  );
}
