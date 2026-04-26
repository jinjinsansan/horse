import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BetSignal } from '@horsebet/shared/types/database.types';
import { supabase } from '@/lib/supabase';
import { fetchTodaySignals, subscribeToSignalFeed } from '@/lib/api/signals';
import { logBetHistory, fetchSubmittedSignalIds } from '@/lib/api/history';
import { fetchActiveOiage, advanceOiage, resetOiage, type OiageRecord } from '@/lib/api/oiage';
import { createOiageCalculator } from '@/services/oiage-calculator';
import { BetScheduler, type ScheduledItem } from '@/services/bet-scheduler';
import OddsPanel from '@/components/OddsPanel';
import { UpdateNotification } from '@/components/UpdateNotification';
import { Bell, Settings as SettingsIcon, LogOut } from 'lucide-react';

type MinimalSignal = {
  id: number;
  signal_date: string;
  race_type: 'JRA' | 'NAR';
  jo_name: string;
  race_no: number;
  bet_type_name: string;
  kaime_data: string[];
  suggested_amount: number;
};

type RawSpatCredentials = Record<string, string | number | undefined> | null | undefined;

const normalizeCredential = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

const mapSpatCredentials = (raw: RawSpatCredentials) => {
  if (!raw) return undefined;
  const memberNumber = normalizeCredential(raw.member_number ?? raw.memberNumber ?? raw.user_id ?? '');
  const memberId = normalizeCredential(raw.member_id ?? raw.memberId ?? raw.password ?? '');
  const password = normalizeCredential(raw.spat_password ?? raw.ansho ?? '');
  if (!memberNumber || !memberId) return undefined;
  return { memberNumber, memberId, password };
};

function describeSubscription(status: 'trial' | 'active' | 'expired' | 'suspended'): string {
  switch (status) {
    case 'trial':     return 'トライアル';
    case 'active':    return '有効';
    case 'expired':   return '期限切れ';
    case 'suspended': return '停止中';
  }
}

/**
 * GANTZ note ("GANTZ strict | 5番ヒロイン | 6人気 | 発走15:25 | 一致3/4(D+I+V)")
 * から構造化メタ情報を抽出する。
 */
function parseGantzNote(note: string | null): {
  horseName: string | null;
  popularity: string | null;
  consensus: string | null;
  consensusEngines: string | null;
} {
  if (!note) return { horseName: null, popularity: null, consensus: null, consensusEngines: null };
  const horseMatch = note.match(/\d+番([^\s|]+)/);
  const popMatch = note.match(/(\d+)人気/);
  const consMatch = note.match(/一致(\d+)\/4(?:\(([^)]+)\))?/);
  return {
    horseName: horseMatch ? horseMatch[1] : null,
    popularity: popMatch ? popMatch[1] : null,
    consensus: consMatch ? `${consMatch[1]}/4` : null,
    consensusEngines: consMatch && consMatch[2] ? consMatch[2] : null,
  };
}

function describeScheduleStatus(item: ScheduledItem | undefined): { label: string; cls: string } | null {
  if (!item) return null;
  switch (item.status) {
    case 'queued':    return { label: '実行待ち', cls: 'sched-queued' };
    case 'scheduled': {
      const fireAt = item.fireAt ? new Date(item.fireAt) : null;
      const t = fireAt ? fireAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '';
      return { label: `${t} 発射予定`, cls: 'sched-scheduled' };
    }
    case 'firing':    return { label: '投票中…',  cls: 'sched-firing' };
    case 'submitted': return { label: '投票済',    cls: 'sched-submitted' };
    case 'failed':    return { label: '失敗',      cls: 'sched-failed' };
    case 'skipped':   return { label: '対象外',    cls: 'sched-skipped' };
    default:          return null;
  }
}

export default function Dashboard() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<BetSignal | null>(null);
  const [profileName, setProfileName] = useState('');
  const [userId, setUserId] = useState('');
  const [credentials, setCredentials] = useState<{
    ipat?: { inetId: string; userCode: string; password: string; pin: string };
    spat4?: { memberNumber: string; memberId: string; password: string };
  }>({});
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'expired' | 'suspended'>('trial');
  const [oiageConfig, setOiageConfig] = useState({ baseAmount: 1000, maxSteps: 5, targetProfit: 10000 });
  const [oiageRecord, setOiageRecord] = useState<OiageRecord | null>(null);
  const [betStatus, setBetStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [scheduleMap, setScheduleMap] = useState<Map<number, ScheduledItem>>(new Map());
  const [schedulerReady, setSchedulerReady] = useState(false);
  const submittedIdsRef = useRef<Set<number>>(new Set());
  const schedulerRef = useRef<BetScheduler | null>(null);
  // handleBetExecution の最新参照を保持する。
  // スケジューラ初期化 Effect の依存配列に handleBetExecution を含めると
  // oiageRecord 等が更新されるたびにスケジューラが再作成されてタイマーが消えるため、
  // ref 経由で呼び出すことで Effect の依存を userId のみに限定する。
  const handleBetExecutionRef = useRef<(target: BetSignal | null, isAuto?: boolean) => Promise<void>>(
    async () => { /* placeholder: 初期化前は何もしない */ }
  );
  const navigate = useNavigate();

  const loadProfile = useCallback(async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    setUserId(user.user.id);
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, ipat_credentials, spat4_credentials, auto_bet_enabled, subscription_status, settings')
      .eq('id', user.user.id)
      .single();
    if (data?.display_name) {
      setProfileName(data.display_name);
    }
    if (data) {
      setAutoBetEnabled(data.auto_bet_enabled ?? false);
      setSubscriptionStatus((data.subscription_status as typeof subscriptionStatus | null) ?? 'trial');
      const mappedSpat = mapSpatCredentials(data.spat4_credentials ?? undefined);
      console.log('[Dashboard] Loaded credentials:', {
        hasIpatInetId: !!data.ipat_credentials?.inet_id,
        hasIpatUserCode: !!data.ipat_credentials?.user_cd,
        hasIpatPassword: !!data.ipat_credentials?.password,
        hasIpatPin: !!data.ipat_credentials?.pin,
        hasSpatMemberNumber: !!mappedSpat?.memberNumber,
        hasSpatMemberId: !!mappedSpat?.memberId,
        hasSpatPassword: !!mappedSpat?.password,
      });
      setCredentials({
        ipat: data.ipat_credentials?.inet_id
          ? {
              inetId: data.ipat_credentials.inet_id ?? '',
              userCode: data.ipat_credentials.user_cd ?? '',
              password: data.ipat_credentials.password ?? '',
              pin: data.ipat_credentials.pin ?? '',
            }
          : undefined,
        spat4: mappedSpat,
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
  }, []);

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
  }, [loadProfile]);

  const todaysCount = useMemo(() => signals.length, [signals]);

  // 投票漏れ検出: 発走時刻を過ぎていて、当日の bet_history に対応行がない signals
  const missedSignals = useMemo(() => {
    const now = Date.now();
    return signals.filter((s) => {
      if (!s.start_time || !/^\d{1,2}:\d{2}$/.test(s.start_time)) return false;
      if (submittedIdsRef.current.has(s.id)) return false;
      const sched = scheduleMap.get(s.id);
      if (sched?.status === 'submitted' || sched?.status === 'firing') return false;
      const [hh, mm] = s.start_time.split(':').map((v) => parseInt(v, 10));
      const startMs = new Date(`${s.signal_date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`).getTime();
      return Number.isFinite(startMs) && now > startMs + 60_000;
    });
  }, [signals, scheduleMap]);
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
  const maxStepsReached = Boolean(oiageRecord?.is_active && oiageRecord.current_kaime >= oiageConfig.maxSteps);

  const refreshOiageState = useCallback(async () => {
    if (!userId) return;
    const { data } = await fetchActiveOiage(userId, 8);
    setOiageRecord(data ?? null);
  }, [userId]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const handleBetExecution = useCallback(async (target: BetSignal | null, isAuto = false) => {
    if (!target) return;
    if (!window.horsebet?.executeBet) {
      if (!isAuto) {
        setBetStatus('Electron版のみ投票ボタンが利用できます');
      }
      return;
    }

    // サブスクリプション gate
    if (subscriptionStatus === 'expired' || subscriptionStatus === 'suspended') {
      const msg = subscriptionStatus === 'expired'
        ? 'サブスクリプションの有効期限が切れています'
        : 'アカウントが一時停止されています';
      if (!isAuto) setBetStatus(msg);
      console.warn('[Dashboard] subscription gate blocked:', subscriptionStatus);
      if (isAuto) throw new Error(msg);
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
      signal_date: target.signal_date,
      race_type: target.race_type,
      jo_name: target.jo_name,
      race_no: target.race_no,
      bet_type_name: target.bet_type_name,
      kaime_data: target.kaime_data,
      suggested_amount: target.suggested_amount,
    };

    console.log('[Dashboard] Executing bet with credentials:', {
      hasIpat: !!credentials.ipat,
      hasSpat4: !!credentials.spat4,
      raceType: target.race_type,
    });

    try {
      const result = await window.horsebet.executeBet({
        signal: signalPayload,
        credentials,
        headless: isAuto,
      });

      console.log('[Dashboard] Bet execution result:', result);

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
        // 二重投票防止のためスケジューラの "投票済" 集合に登録
        submittedIdsRef.current.add(target.id);
        if (oiageRecord?.is_active) {
          await advanceOiage(oiageRecord, target.suggested_amount);
          await refreshOiageState();
        }
      } else {
        const detailMessage = result?.details ?? result?.detail;
        const detailText = detailMessage ? String(detailMessage) : '';
        const errorMsg = detailText
          ? `${result?.message ?? '投票に失敗しました'}: ${detailText}`
          : result?.message ?? '投票に失敗しました';
        if (!isAuto) {
          setBetStatus(errorMsg);
        }
        console.error('[Dashboard] Bet failed:', errorMsg);
        if (isAuto) {
          // スケジューラに失敗を伝えるため throw（onChange で 'failed' に更新される）
          throw new Error(errorMsg);
        }
      }
    } catch (error) {
      console.error('[Dashboard] Bet execution error:', error);
      if (!isAuto) {
        setBetStatus(`エラー: ${error instanceof Error ? error.message : String(error)}`);
      } else {
        throw error;
      }
    }
  }, [credentials, oiageRecord, refreshOiageState, userId, subscriptionStatus]);

  // ref を常に最新の handleBetExecution で上書きする（スケジューラの executor 経由で呼ばれる）
  useEffect(() => {
    handleBetExecutionRef.current = handleBetExecution;
  });

  // Realtime: 新しいシグナルを受信して state とスケジューラに反映
  useEffect(() => {
    const unsubscribe = subscribeToSignalFeed((signal) => {
      setSignals((prev) => {
        if (prev.some((s) => s.id === signal.id)) return prev;
        return [signal, ...prev];
      });
      setSelectedSignal((prev) => prev ?? signal);
      if (Notification.permission === 'granted') {
        new Notification('新しい買い目が届きました', {
          body: `${signal.jo_name} ${signal.race_no}R ${signal.bet_type_name}${signal.start_time ? ` 発走${signal.start_time}` : ''}`,
        });
      }
      if (autoBetEnabled && schedulerRef.current && schedulerReady) {
        schedulerRef.current.schedule(signal);
      }
      // schedulerReady=false 中に来た signal は signals state に入るので、
      // schedulerReady=true 後の autoBetEnabled effect で拾われる
    });
    return () => {
      unsubscribe();
    };
  }, [autoBetEnabled, schedulerReady]);

  // スケジューラ初期化（userId 確定後に1度だけ）
  // 重要: fetchSubmittedSignalIds が完了するまで schedulerReady=false にしておき、
  // 他の effect は schedulerReady を待ってからスケジュール開始する
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const scheduler = new BetScheduler({
      // ref 経由で呼ぶことで、oiageRecord 等の変化による handleBetExecution
      // 再作成がスケジューラ再初期化（タイマー全消し）を引き起こさないようにする
      executor: async (signal) => {
        await handleBetExecutionRef.current(signal, true);
      },
      isAlreadySubmitted: (id) => submittedIdsRef.current.has(id),
      onChange: (items) => setScheduleMap(new Map(items)),
    });
    schedulerRef.current = scheduler;
    setSchedulerReady(false);

    fetchSubmittedSignalIds(userId).then((ids) => {
      if (cancelled) return;
      submittedIdsRef.current = ids;
      setSchedulerReady(true);
    }).catch((err) => {
      console.error('[Dashboard] fetchSubmittedSignalIds failed:', err);
      if (!cancelled) {
        // 安全側: エラー時もスケジューラは起動するが、二重投票チェックが効かない可能性あり
        // → ユーザーに警告として bet_history 取得失敗を表示する余地あり (将来)
        setSchedulerReady(true);
      }
    });

    return () => {
      cancelled = true;
      scheduler.dispose();
      schedulerRef.current = null;
      setSchedulerReady(false);
    };
  }, [userId]); // handleBetExecution は ref 経由なので依存不要

  // autoBetEnabled の ON/OFF と、起動時の signals ロード後のキュー再構築
  // schedulerReady=true になるまで待つことで、submittedIds の取得前に schedule
  // されてしまう競合を防ぐ
  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler || !schedulerReady) return;
    if (autoBetEnabled) {
      signals.forEach((s) => scheduler.schedule(s));
    } else {
      for (const item of scheduler.getItems().values()) {
        if (item.status === 'scheduled' || item.status === 'queued') {
          scheduler.cancel(item.signal.id, '自動投票が無効化された');
        }
      }
    }
  }, [autoBetEnabled, signals, schedulerReady]);

  const handleOiageReset = async () => {
    if (!oiageRecord) return;
    await resetOiage(oiageRecord.id);
    await refreshOiageState();
    setBetStatus('追い上げステップをリセットしました');
  };

  const handleOiageStop = async () => {
    if (!oiageRecord) return;
    await resetOiage(oiageRecord.id, { deactivate: true });
    await refreshOiageState();
    setBetStatus('追い上げを停止しました');
  };

  return (
    <div className="dashboard">
      <aside className="sidebar">
        <div>
          <p className="sidebar-title">配信一覧</p>
          {loading && <p className="muted">読込中...</p>}
          {!loading && todaysCount === 0 && <p className="muted">本日の配信はありません</p>}
          <div className="signal-list">
            {signals.map((signal) => {
              const item = scheduleMap.get(signal.id);
              const statusBadge = describeScheduleStatus(item);
              return (
                <button
                  key={signal.id}
                  className={`signal-item ${selectedSignal?.id === signal.id ? 'active' : ''}`}
                  onClick={() => setSelectedSignal(signal)}
                >
                  <span className="signal-time">
                    {signal.start_time ?? new Date(signal.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div>
                    <p className="signal-title">{signal.jo_name} {signal.race_no}R</p>
                    <p className="signal-subtitle">
                      {signal.bet_type_name} / {signal.kaime_data.join(',')}
                      {statusBadge && <span className={`schedule-badge ${statusBadge.cls}`}> · {statusBadge.label}</span>}
                    </p>
                  </div>
                </button>
              );
            })}
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
            <p className="label">
              ようこそ、{profileName || '会員'} 様
              <span className={`subscription-badge sub-${subscriptionStatus}`}>{describeSubscription(subscriptionStatus)}</span>
            </p>
            <h1>買い目ダッシュボード</h1>
            <p className="muted">
              本日の買い目配信: {todaysCount} 件
              {missedSignals.length > 0 && (
                <span className="missed-warning"> ⚠️ 未投票で発走済: {missedSignals.length} 件</span>
              )}
            </p>
          </div>
          <div className="header-actions">
            <label className="autobet-switch" title="GANTZ 配信を自動投票するかどうか">
              <input
                type="checkbox"
                checked={autoBetEnabled}
                onChange={async (event) => {
                  const next = event.target.checked;
                  setAutoBetEnabled(next);
                  if (userId) {
                    await supabase
                      .from('user_profiles')
                      .update({ auto_bet_enabled: next })
                      .eq('id', userId);
                  }
                }}
              />
              <span>自動投票 {autoBetEnabled ? 'ON' : 'OFF'}</span>
            </label>
            <div className="pill">
              <Bell size={20} />
              <span>LIVE 配信中</span>
            </div>
          </div>
        </header>

        {selectedSignal ? (
          <section className="detail-card">
            <div className="detail-head">
              <div>
                <p className="label">RACE / TARGET</p>
                <h2>{selectedSignal.jo_name} {selectedSignal.race_no}R</h2>
                <p className="muted">
                  {selectedSignal.race_type} · {selectedSignal.bet_type_name} · 推奨 ¥{selectedSignal.suggested_amount.toLocaleString()}
                </p>
              </div>
              <div className={`status ${selectedSignal.status}`}>
                {selectedSignal.status}
              </div>
            </div>

            {(() => {
              const meta = parseGantzNote(selectedSignal.note);
              const sched = scheduleMap.get(selectedSignal.id);
              const schedDesc = describeScheduleStatus(sched);
              const targetHorse = selectedSignal.kaime_data[0] ?? '?';
              return (
                <div className="target-hud">
                  <span className="marquee-l">データが導く勝利</span>
                  <span className="marquee-r">未来を予測せよ</span>

                  <div className="hud-cell cell-tl">
                    <p className="hud-label">VENUE</p>
                    <p className="hud-value">{selectedSignal.jo_name}</p>
                    <p className="hud-sub">{selectedSignal.race_no}R · {selectedSignal.race_type}</p>
                  </div>

                  <div className="hud-cell cell-tr">
                    <p className="hud-label">START TIME</p>
                    <p className="hud-value">{selectedSignal.start_time ?? '—:—'}</p>
                    <p className="hud-sub">JST</p>
                  </div>

                  <div className="target-center">
                    <div className="target-core">
                      <p className="race">{selectedSignal.bet_type_name} / TARGET</p>
                      <p className="horse-num">{targetHorse}</p>
                      {meta.horseName && <p className="horse-name">{meta.horseName}</p>}
                      <p className="bet-meta">¥{selectedSignal.suggested_amount.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="hud-cell cell-ml">
                    <p className="hud-label">POPULARITY</p>
                    <p className="hud-value">{meta.popularity ?? '—'}</p>
                    <p className="hud-sub">{meta.popularity ? '人気' : 'unknown'}</p>
                  </div>

                  <div className="hud-cell cell-mr">
                    <p className="hud-label">AI CONSENSUS</p>
                    <p className="hud-value">{meta.consensus ?? '—'}</p>
                    <p className="hud-sub">{meta.consensusEngines ?? 'engines'}</p>
                  </div>

                  <div className="hud-cell cell-bl">
                    <p className="hud-label">SOURCE</p>
                    <p className="hud-value">{selectedSignal.source.toUpperCase().replace('GANTZ_', '')}</p>
                    <p className="hud-sub">SIGNAL #{selectedSignal.id}</p>
                  </div>

                  <div className="hud-cell cell-br">
                    <p className="hud-label">EXEC STATUS</p>
                    <p className="hud-value">{schedDesc?.label ?? 'STANDBY'}</p>
                    <p className="hud-sub">{autoBetEnabled ? 'AUTO ARMED' : 'MANUAL ONLY'}</p>
                  </div>
                </div>
              );
            })()}

            {selectedSignal.note && (
              <div className="note">
                <p>{selectedSignal.note}</p>
              </div>
            )}
            {(() => {
              const sched = scheduleMap.get(selectedSignal.id);
              const isMissed = missedSignals.some((s) => s.id === selectedSignal.id);
              if (!sched && !isMissed) return null;
              return (
                <div className="schedule-info">
                  {isMissed && (
                    <p className="missed-warning" style={{ fontWeight: 600 }}>
                      ⚠️ このレースは既に発走時刻を過ぎていますが、未投票です。
                      投票締切前であれば「手動で投票」から発射できます。
                    </p>
                  )}
                  {sched && (
                    <>
                      <p className="muted">
                        自動投票: <strong>{describeScheduleStatus(sched)?.label ?? '-'}</strong>
                        {selectedSignal.start_time && ` / 発走 ${selectedSignal.start_time}`}
                      </p>
                      {sched.reason && <p className="muted">{sched.reason}</p>}
                    </>
                  )}
                </div>
              );
            })()}
            <div className="actions">
              <button className="primary" onClick={() => handleBetExecution(selectedSignal)}>
                手動で投票
              </button>
              {(() => {
                const sched = scheduleMap.get(selectedSignal.id);
                if (sched && (sched.status === 'scheduled' || sched.status === 'queued')) {
                  return (
                    <button
                      className="secondary"
                      onClick={() => schedulerRef.current?.cancel(selectedSignal.id, 'ユーザー取消')}
                    >
                      自動投票を取消
                    </button>
                  );
                }
                return (
                  <button className="secondary" onClick={() => navigate('/settings')}>
                    自動投票設定を開く
                  </button>
                );
              })()}
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
              {maxStepsReached && (
                <p className="warning-text" style={{ marginBottom: '0.75rem' }}>
                  最大ステップ {oiageConfig.maxSteps} に到達しました。リセットまたは停止を行ってください。
                </p>
              )}
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
              <div className="oiage-actions">
                <button className="secondary" onClick={handleOiageReset} disabled={!oiageRecord}>
                  勝利としてリセット
                </button>
                <button className="danger" onClick={handleOiageStop} disabled={!oiageRecord}>
                  追い上げを停止
                </button>
              </div>
            </div>
          </section>
        ) : (
          <div className="empty">左の一覧から買い目を選択してください</div>
        )}
      </main>
      <UpdateNotification />
    </div>
  );
}
