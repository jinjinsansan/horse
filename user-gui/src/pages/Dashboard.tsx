import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BetSignal } from '@horsebet/shared/types/database.types';
import { supabase } from '@/lib/supabase';
import { fetchTodaySignals, subscribeToSignalFeed, subscribeToSignalUpdates } from '@/lib/api/signals';
import {
  logBetHistory,
  fetchSubmittedSignalIds,
  fetchTodayHistory,
  subscribeToHistoryUpdates,
  type TodayBet,
} from '@/lib/api/history';
import { fetchActiveOiage, advanceOiage, type OiageRecord } from '@/lib/api/oiage';
import { BetScheduler, type ScheduledItem } from '@/services/bet-scheduler';
import { betSignalToRaceUI } from '@/services/race-mapper';
import { notificationStore, type NotifItem } from '@/services/notification-store';
import {
  GzWindow,
  MatrixBg,
  Orb,
  Corners,
  HorseSvg,
  CourseTrack,
  DataBar,
  Vertical,
} from '@/components/gantz';

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

function scheduleStatusToBadge(status?: ScheduledItem['status']): {
  label: string;
  cls: string;
} {
  switch (status) {
    case 'submitted': return { label: '済',     cls: '' };
    case 'firing':    return { label: '送信中', cls: 'gz-badge-amber' };
    case 'scheduled': return { label: '予約',   cls: 'gz-badge-amber' };
    case 'failed':    return { label: '失敗',   cls: 'gz-badge-red' };
    case 'skipped':   return { label: '対象外', cls: 'gz-badge-dim' };
    default:          return { label: '待機',   cls: 'gz-badge-dim' };
  }
}

export default function Dashboard() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState('');
  const [userId, setUserId] = useState('');
  const [credentials, setCredentials] = useState<{
    ipat?: { inetId: string; userCode: string; password: string; pin: string };
    spat4?: { memberNumber: string; memberId: string; password: string };
  }>({});
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [betMode, setBetMode] = useState<'manual' | 'bulk' | 'first_only' | 'sequential'>('manual');
  const [subscriptionStatus, setSubscriptionStatus] =
    useState<'trial' | 'active' | 'expired' | 'suspended'>('trial');
  const [oiageRecord, setOiageRecord] = useState<OiageRecord | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100);
  const [betting, setBetting] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState<number>(() => Date.now());
  const [betStatus, setBetStatus] = useState('');
  const [scheduleMap, setScheduleMap] = useState<Map<number, ScheduledItem>>(new Map());
  const [schedulerReady, setSchedulerReady] = useState(false);
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [todayBets, setTodayBets] = useState<TodayBet[]>([]);
  const submittedIdsRef = useRef<Set<number>>(new Set());
  const schedulerRef = useRef<BetScheduler | null>(null);
  const handleBetExecutionRef = useRef<(target: BetSignal | null, isAuto?: boolean) => Promise<void>>(
    async () => { /* placeholder */ }
  );
  // B2: 二重投票防止 — 現在 executeBet 実行中の signal ID セット
  const inFlightRef = useRef<Set<number>>(new Set());
  // M1: モード切替と signals 変化を区別するための前回 betMode 記録 (null = 初回)
  const prevBetModeRef = useRef<typeof betMode | null>(null);
  // M4: 通知を最後に表示した時刻 (未読カウント計算用)
  const [lastViewedNotifTs, setLastViewedNotifTs] = useState<number>(0);
  const navigate = useNavigate();

  // STANDBY モード時にオーブ内で循環表示する短文
  const STANDBY_CYCLE = useMemo(
    () => ['SCANNING…', 'WAITING SIGNAL', 'GANTZ ARMED', 'SYSTEM READY', '配信受信待ち'],
    [],
  );
  const [standbyIdx, setStandbyIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStandbyIdx((i) => (i + 1) % STANDBY_CYCLE.length), 2200);
    return () => clearInterval(t);
  }, [STANDBY_CYCLE.length]);

  // ───── プロフィール読み込み ─────
  const loadProfile = useCallback(async () => {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    setUserId(user.user.id);
    const { data } = await supabase
      .from('user_profiles')
      .select('display_name, ipat_credentials, spat4_credentials, auto_bet_enabled, subscription_status, settings')
      .eq('id', user.user.id)
      .single();
    if (data?.display_name) setProfileName(data.display_name);
    if (data) {
      setAutoBetEnabled(data.auto_bet_enabled ?? false);
      const savedMode = (data.settings?.bet_mode as typeof betMode | undefined)
        ?? (data.auto_bet_enabled ? 'sequential' : 'manual');
      setBetMode(savedMode);
      setSubscriptionStatus((data.subscription_status as 'trial' | 'active' | 'expired' | 'suspended' | null) ?? 'trial');
      setBetAmount(data.settings?.bet_amount ?? 100);
      const mappedSpat = mapSpatCredentials(data.spat4_credentials ?? undefined);
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
    }
    const { data: oiage } = await fetchActiveOiage(user.user.id, 8);
    setOiageRecord(oiage ?? null);
  }, []);

  // ───── 初期化 ─────
  useEffect(() => {
    const init = async () => {
      const [{ data }] = await Promise.all([fetchTodaySignals(), loadProfile()]);
      if (data) {
        setSignals(data);
        if (data.length > 0) setSelectedId(data[0].id);
      }
      notificationStore.push({
        type: 'system',
        message: '競馬GANTZ システム起動 — 配信受信待機中',
        severity: 'success',
      });
    };
    init();
    if (Notification.permission === 'default') Notification.requestPermission();
  }, [loadProfile]);

  // ───── notifications 購読 ─────
  useEffect(() => {
    return notificationStore.subscribe((items) => setNotifications(items));
  }, []);

  // ───── 時刻更新 (10秒毎、active race 判定用) ─────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);

  // ───── bet_signals UPDATE 購読 (outcome_* 変更検知用) ─────
  useEffect(() => {
    const unsub = subscribeToSignalUpdates((updated) => {
      setSignals((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    });
    // fallback ポーリング: Realtime 漏れに備えて 60 秒毎に当日 signals を再取得
    const poll = setInterval(() => {
      fetchTodaySignals().then(({ data }) => {
        if (data) setSignals(data);
      });
    }, 60_000);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, []);

  // ───── 当日 bet_history (回収率計算用) ─────
  useEffect(() => {
    if (!userId) return;
    const refresh = () => fetchTodayHistory(userId).then(setTodayBets);
    refresh();
    // Realtime 購読 (publication 未追加でも fallback として 60 秒ポーリング)
    const unsub = subscribeToHistoryUpdates(userId, refresh);
    const poll = setInterval(refresh, 60_000);
    return () => {
      unsub();
      clearInterval(poll);
    };
  }, [userId]);

  // ───── あなたの本日収支 (個人 bet_history ベース) ─────
  const recovery = useMemo(() => {
    const decided = todayBets.filter((b) => b.bet_result === 'win' || b.bet_result === 'lose');
    const totalIn = decided.reduce((s, b) => s + (b.bet_amount ?? 0), 0);
    const totalOut = decided.reduce((s, b) => s + (b.payout ?? 0), 0);
    const wins = decided.filter((b) => b.bet_result === 'win').length;
    const pct = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;
    return {
      pct,
      totalIn,
      totalOut,
      decidedCount: decided.length,
      wins,
      profit: totalOut - totalIn,
    };
  }, [todayBets]);

  // ───── 未読通知数 (M4: ページ訪問時刻以降の件数) ─────
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.ts > lastViewedNotifTs).length,
    [notifications, lastViewedNotifTs],
  );

  // ───── GANTZ 全体の本日回収率 (100円ベース・購入有無に関わらず) ─────
  const gantzRecovery = useMemo(() => {
    // L7: JST (UTC+9) の日付で比較 (UTC midnight ≠ JST midnight 対策)
    const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
    const gantzToday = signals.filter(
      (s) =>
        s.signal_date === today &&
        (s.source === 'gantz_strict' || s.source === 'gantz_loose'),
    );
    const decided = gantzToday.filter(
      (s) => s.outcome_status === 'win' || s.outcome_status === 'lose',
    );
    const totalIn = decided.length * 100; // 100円固定
    const totalOut = decided.reduce(
      (sum, s) => sum + (s.outcome_status === 'win' ? (s.outcome_payout_per_100 ?? 0) : 0),
      0,
    );
    const wins = decided.filter((s) => s.outcome_status === 'win').length;
    const pct = totalIn > 0 ? (totalOut / totalIn) * 100 : 0;
    return {
      pct,
      totalIn,
      totalOut,
      decidedCount: decided.length,
      wins,
      totalCount: gantzToday.length,
      profit: totalOut - totalIn,
    };
  }, [signals]);

  // ───── 投票実行 ─────
  const handleBetExecution = useCallback(
    async (target: BetSignal | null, isAuto = false) => {
      if (!target) return;
      if (!window.horsebet?.executeBet) {
        if (!isAuto) setBetStatus('Electron版のみ投票ボタンが利用できます');
        return;
      }

      if (subscriptionStatus === 'expired' || subscriptionStatus === 'suspended') {
        const msg = subscriptionStatus === 'expired'
          ? 'サブスクリプションの有効期限が切れています'
          : 'アカウントが一時停止されています';
        if (!isAuto) setBetStatus(msg);
        if (isAuto) throw new Error(msg);
        return;
      }
      if (target.race_type === 'JRA' && !credentials.ipat) {
        if (!isAuto) setBetStatus('設定画面からIPAT認証情報を登録してください');
        return;
      }
      if (target.race_type === 'NAR' && !credentials.spat4) {
        if (!isAuto) setBetStatus('設定画面からSPAT4認証情報を登録してください');
        return;
      }

      if (!isAuto) {
        setBetting(target.id);
        setBetStatus('投票処理を開始しています...');
      }
      // H1: ユーザーが設定した betAmount を使用 (GANTZ suggested_amount ではなく)
      const signalPayload: MinimalSignal = {
        id: target.id,
        signal_date: target.signal_date,
        race_type: target.race_type,
        jo_name: target.jo_name,
        race_no: target.race_no,
        bet_type_name: target.bet_type_name,
        kaime_data: target.kaime_data,
        suggested_amount: betAmount,
      };
      notificationStore.push({
        type: 'fire',
        message: `${target.jo_name} ${target.race_no}R 投票処理開始 ${isAuto ? '(自動)' : '(手動)'}`,
        severity: 'info',
      });

      try {
        const result = await window.horsebet.executeBet({
          signal: signalPayload,
          credentials,
          headless: isAuto,
        });
        if (result?.success) {
          if (!isAuto) setBetStatus('投票が完了しました');
          if (userId) {
            await logBetHistory({ signal: target, userId, isAuto, result: 'pending', betAmount });
          }
          submittedIdsRef.current.add(target.id);
          if (oiageRecord?.is_active) {
            await advanceOiage(oiageRecord, target.suggested_amount);
            const { data: oiage } = await fetchActiveOiage(userId, 8);
            setOiageRecord(oiage ?? null);
          }
          notificationStore.push({
            type: 'submitted',
            message: `${target.jo_name} ${target.race_no}R ${target.bet_type_name} ${target.kaime_data.join(',')}番 / ¥${target.suggested_amount} 投票完了`,
            severity: 'success',
          });
        } else {
          const detailText = result?.detail ? String(result.detail) : '';
          const rawMsg = result?.message ?? '投票に失敗しました';
          const fullText = `${rawMsg} ${detailText}`.toLowerCase();
          // よくあるエラー類型を判別してわかりやすい日本語に変換
          let humanMsg = rawMsg;
          if (fullText.includes('残高') || fullText.includes('balance') || fullText.includes('入金')) {
            humanMsg = '残高不足のため投票できませんでした';
          } else if (fullText.includes('時間外') || fullText.includes('締切') || fullText.includes('deadline')) {
            humanMsg = '投票締切時刻を過ぎています';
          } else if (fullText.includes('login') || fullText.includes('ログイン') || fullText.includes('誤りがあります')) {
            humanMsg = 'ログインに失敗しました(認証情報を確認してください)';
          } else if (fullText.includes('取消')) {
            humanMsg = '対象馬が出走取消のためスキップされました';
          } else if (detailText) {
            humanMsg = `${rawMsg}: ${detailText.slice(0, 80)}`;
          }
          if (!isAuto) setBetStatus(humanMsg);
          notificationStore.push({
            type: 'error',
            message: `${target.jo_name} ${target.race_no}R 投票失敗 — ${humanMsg}`,
            severity: 'error',
          });
          if (isAuto) throw new Error(humanMsg);
        }
      } catch (error) {
        if (!isAuto) {
          setBetStatus(`エラー: ${error instanceof Error ? error.message : String(error)}`);
        } else {
          throw error;
        }
      } finally {
        if (!isAuto) setBetting(null);
      }
    },
    [credentials, oiageRecord, userId, subscriptionStatus, betAmount],
  );

  useEffect(() => {
    handleBetExecutionRef.current = handleBetExecution;
  }, [handleBetExecution]);

  // ───── スケジューラ初期化 (userId 確定後 1 度だけ、handleBetExecution は ref 経由) ─────
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const scheduler = new BetScheduler({
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
    }).catch(() => { if (!cancelled) setSchedulerReady(true); });

    return () => {
      cancelled = true;
      scheduler.dispose();
      schedulerRef.current = null;
      setSchedulerReady(false);
    };
  }, [userId]);

  // ───── Realtime: 新着 signal 受信 ─────
  useEffect(() => {
    const unsub = subscribeToSignalFeed((signal) => {
      setSignals((prev) => (prev.some((s) => s.id === signal.id) ? prev : [signal, ...prev]));
      setSelectedId((prev) => prev ?? signal.id);
      notificationStore.push({
        type: 'signal',
        message: `配信受信: ${signal.jo_name} ${signal.race_no}R ${signal.bet_type_name}`,
        severity: 'info',
      });
      // mode 別:
      //  - bulk: 受信即実行
      //  - sequential: scheduler に投入（10分前発射）
      //  - first_only: signals 全体を見て最早判定するため effect 側で
      //  - manual: 何もしない
      if (!schedulerReady) return;
      if (betMode === 'bulk') {
        // B2: inFlightRef で二重投票防止 (betMode effect との競合を防ぐ)
        if (!submittedIdsRef.current.has(signal.id) && !inFlightRef.current.has(signal.id)) {
          inFlightRef.current.add(signal.id);
          handleBetExecutionRef.current(signal, true)
            .catch(() => {})
            .finally(() => inFlightRef.current.delete(signal.id));
        }
      } else if (betMode === 'sequential' && schedulerRef.current) {
        schedulerRef.current.schedule(signal);
      }
    });
    return () => { unsub(); };
  }, [betMode, schedulerReady]);

  // ───── betMode 切替 / signals 変化 → スケジューラ再構成 ─────
  // M1: prevBetModeRef で「モード切替」と「新着シグナル」を区別する
  // B1: first_only のソートを分単位数値比較に変更
  // B2: bulk/first_only に inFlightRef チェックを追加
  useEffect(() => {
    const scheduler = schedulerRef.current;
    if (!scheduler || !schedulerReady) return;

    const modeChanged = prevBetModeRef.current !== betMode;
    prevBetModeRef.current = betMode;

    // モード切替時のみ既存スケジュールをリセット
    // (signals 変化時はリセットしない → sequential の発射タイマーを保護)
    if (modeChanged) {
      for (const item of scheduler.getItems().values()) {
        if (item.status === 'scheduled' || item.status === 'queued') {
          scheduler.cancel(item.signal.id, 'モード切替');
        }
      }
    }

    if (betMode === 'manual') return;

    if (betMode === 'sequential') {
      signals.forEach((s) => scheduler.schedule(s));
      return;
    }

    if (betMode === 'bulk') {
      // 新着シグナルは Realtime ハンドラが処理するため、モード切替時のみ全発火
      if (!modeChanged) return;
      for (const s of signals) {
        if (!inFlightRef.current.has(s.id) && !submittedIdsRef.current.has(s.id)) {
          inFlightRef.current.add(s.id);
          handleBetExecutionRef.current(s, true)
            .catch(() => {})
            .finally(() => inFlightRef.current.delete(s.id));
        }
      }
      return;
    }

    if (betMode === 'first_only') {
      // B1: localeCompare では 1桁時刻 ('9:00') が '10:00' より後にソートされるため
      //     分換算の数値比較を使用
      const toMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };
      const earliest = [...signals]
        .filter((s) => s.start_time && !submittedIdsRef.current.has(s.id) && !inFlightRef.current.has(s.id))
        .sort((a, b) => toMin(a.start_time ?? '0:00') - toMin(b.start_time ?? '0:00'))[0];
      if (earliest) {
        inFlightRef.current.add(earliest.id);
        handleBetExecutionRef.current(earliest, true)
          .catch(() => {})
          .finally(() => inFlightRef.current.delete(earliest.id));
      }
    }
  }, [betMode, signals, schedulerReady]);

  // ───── handlers ─────
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  const updateBetMode = async (next: typeof betMode) => {
    const prev = betMode;
    setBetMode(next);
    setAutoBetEnabled(next !== 'manual');
    if (!userId) return;
    const { data: profile } = await supabase.from('user_profiles').select('settings').eq('id', userId).single();
    const merged = { ...(profile?.settings ?? {}), bet_mode: next };
    const { error } = await supabase.from('user_profiles').update({
      auto_bet_enabled: next !== 'manual',
      settings: merged,
    }).eq('id', userId);
    // L1: DB 保存失敗時は UI をロールバック
    if (error) {
      setBetMode(prev);
      setAutoBetEnabled(prev !== 'manual');
    }
  };

  const BET_MODE_LABELS: Record<typeof betMode, { short: string; full: string }> = {
    manual:     { short: '手動',         full: '手動 (購入しない)' },
    bulk:       { short: '一気購入',     full: '一気購入 (受信即時)' },
    first_only: { short: '早いレース1本', full: '早いレース1本のみ' },
    sequential: { short: '順次購入',     full: '順次購入 (各5分前)' },
  };

  // ───── activeRace: 発走 10 分前〜発走 + 3 分の窓に入る signal ─────
  // この間だけ中央オーブが「BET 詳細」モードに切替。それ以外は STANDBY。
  const FOCUS_BEFORE_MS = 10 * 60_000;
  const FOCUS_AFTER_MS = 3 * 60_000;
  const activeSignal = useMemo(() => {
    let best: BetSignal | null = null;
    let bestStart = Infinity;
    for (const s of signals) {
      if (!s.start_time || !/^\d{1,2}:\d{2}$/.test(s.start_time)) continue;
      const [hh, mm] = s.start_time.split(':').map((v) => parseInt(v, 10));
      const startMs = new Date(
        `${s.signal_date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`,
      ).getTime();
      if (!Number.isFinite(startMs)) continue;
      const winS = startMs - FOCUS_BEFORE_MS;
      const winE = startMs + FOCUS_AFTER_MS;
      if (currentTime >= winS && currentTime <= winE && startMs < bestStart) {
        best = s;
        bestStart = startMs;
      }
    }
    return best;
  }, [signals, currentTime]);

  // ───── 中央オーブが表示する race (active 優先、無ければ null = STANDBY) ─────
  const focusedRace = useMemo(() => {
    if (!activeSignal) return null;
    const sched = scheduleMap.get(activeSignal.id);
    return betSignalToRaceUI(activeSignal, sched?.status);
  }, [activeSignal, scheduleMap]);

  // 次のレース発走までの残り分
  const nextStartCountdown = useMemo(() => {
    let bestMs = Infinity;
    for (const s of signals) {
      if (!s.start_time || !/^\d{1,2}:\d{2}$/.test(s.start_time)) continue;
      const [hh, mm] = s.start_time.split(':').map((v) => parseInt(v, 10));
      const startMs = new Date(
        `${s.signal_date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`,
      ).getTime();
      if (Number.isFinite(startMs) && startMs > currentTime && startMs < bestMs) {
        bestMs = startMs;
      }
    }
    if (!Number.isFinite(bestMs)) return null;
    const diffMin = Math.ceil((bestMs - currentTime) / 60_000);
    return diffMin;
  }, [signals, currentTime]);

  // ───── KPI: 本日成績 ─────
  const todayStats = useMemo(() => {
    const items = [...scheduleMap.values()];
    return {
      submitted: items.filter((i) => i.status === 'submitted').length,
      scheduled: items.filter((i) => i.status === 'scheduled').length,
      failed: items.filter((i) => i.status === 'failed').length,
      skipped: items.filter((i) => i.status === 'skipped').length,
    };
  }, [scheduleMap]);

  // 次の発射予定 (時刻順 上位 3 件)
  const upcomingFires = useMemo(() => {
    return [...scheduleMap.values()]
      .filter((item) => item.status === 'scheduled' && item.fireAt)
      .sort((a, b) => (a.fireAt ?? 0) - (b.fireAt ?? 0))
      .slice(0, 3);
  }, [scheduleMap]);

  return (
    <GzWindow title="競馬GANTZ" subtitle="DASHBOARD / ORB MODE" live>
      <MatrixBg density={26} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'grid',
          gridTemplateColumns: '280px 1fr 280px',
        }}
      >
        {/* 左サイドバー */}
        <aside
          style={{
            borderRight: '1px solid var(--gz-line)',
            padding: '20px 16px',
            overflowY: 'auto',
            background: 'linear-gradient(90deg, rgba(0,20,10,0.6), transparent)',
          }}
          className="gz-noscroll"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span className="gz-label-strong">SIGNALS / 配信</span>
            <span className="gz-badge"><span className="gz-dot" />{signals.length}</span>
          </div>

          {signals.length === 0 && (
            <div
              style={{
                padding: 18,
                border: '1px dashed var(--gz-line)',
                fontFamily: 'var(--gz-mono)',
                fontSize: 11,
                color: 'var(--gz-text-muted)',
                textAlign: 'center',
                lineHeight: 1.7,
              }}
            >
              本日の配信は<br />まだ受信していません
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map((s) => {
              const sched = scheduleMap.get(s.id);
              const badge = scheduleStatusToBadge(sched?.status);
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`gz-panel gz-card-hover ${s.id === selectedId ? 'active' : ''}`}
                  style={{ padding: 12, textAlign: 'left', cursor: 'pointer', position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', letterSpacing: '0.1em' }}>
                        {s.race_type} · {s.start_time ?? '—'}
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gz-text)', marginTop: 2 }}>
                        {s.jo_name} {s.race_no}R
                      </div>
                    </div>
                    <span className={`gz-badge ${badge.cls}`} style={{ fontSize: 9 }}>
                      {badge.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-green)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{s.bet_type_name} {s.kaime_data[0]}番</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="gz-divider" />
            <div className="gz-label" style={{ marginBottom: 8 }}>NAV</div>
            <button onClick={() => navigate('/races')} className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>レース一覧</button>
            <button onClick={() => navigate('/history')} className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>履歴 / 収支</button>
            <button onClick={() => navigate('/settings')} className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>設定</button>
            <button onClick={handleSignOut} className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>ログアウト</button>
          </div>
        </aside>

        {/* 中央ステージ */}
        <section style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* ヘッダー */}
          <header
            style={{
              padding: '20px 32px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid var(--gz-line)',
            }}
          >
            <div>
              <div className="gz-label">WELCOME · 会員</div>
              <div
                style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--gz-display)', letterSpacing: '0.15em', marginTop: 2 }}
                className="gz-glow"
              >
                {profileName || 'GUEST'}
                <span style={{ color: 'var(--gz-text-muted)', fontSize: 12, marginLeft: 12 }}>
                  · {subscriptionStatus.toUpperCase()}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <span className="gz-label">投票モード</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['manual','first_only','sequential','bulk'] as const).map((m) => {
                    const active = betMode === m;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => updateBetMode(m)}
                        title={BET_MODE_LABELS[m].full}
                        style={{
                          padding: '4px 10px',
                          fontFamily: 'var(--gz-mono)',
                          fontSize: 10,
                          letterSpacing: '0.1em',
                          background: active ? 'rgba(0,255,130,0.18)' : 'rgba(0,20,10,0.5)',
                          border: `1px solid ${active ? 'var(--gz-green)' : 'var(--gz-line)'}`,
                          color: active ? 'var(--gz-green)' : 'var(--gz-text-muted)',
                          cursor: 'pointer',
                          textShadow: active ? '0 0 4px var(--gz-green-glow)' : 'none',
                          boxShadow: active ? '0 0 12px var(--gz-green-glow)' : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {BET_MODE_LABELS[m].short}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                onClick={() => { setLastViewedNotifTs(Date.now()); navigate('/notifications'); }}
                className="gz-badge"
                style={{ padding: '8px 12px', cursor: 'pointer' }}
              >
                <span className="gz-dot" />
                {unreadCount > 0 ? `未読 ${unreadCount}` : `通知 ${notifications.length}`}
              </button>
            </div>
          </header>

          {/* HUD */}
          <div style={{ flex: 1, position: 'relative', padding: '20px 30px', overflow: 'hidden' }}>
            <Corners />

            {/* STANDBY mode (no active race in window) */}
            {!focusedRace && (
              <>
                <Vertical
                  style={{ position: 'absolute', left: 30, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--gz-green)', opacity: 0.5 }}
                  className="gz-glow"
                >
                  データが導く勝利
                </Vertical>
                <Vertical
                  style={{ position: 'absolute', right: 30, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--gz-green)', opacity: 0.5 }}
                  className="gz-glow"
                >
                  未来を予測せよ
                </Vertical>

                {/* STANDBY 時も右上に回収率を出す */}
                <div style={{ position: 'absolute', top: 30, right: 30, width: 240, textAlign: 'right' }}>
                  {/* 主表示: 競馬GANTZ 全体の本日回収率 (100円ベース、購入有無に関わらず) */}
                  <div className="gz-label">GANTZ 本日回収率</div>
                  <div
                    style={{
                      fontSize: 56, fontFamily: 'var(--gz-display)', fontWeight: 900,
                      color: gantzRecovery.pct >= 100 ? 'var(--gz-amber)' : gantzRecovery.pct > 0 ? 'var(--gz-green)' : 'var(--gz-text-dim)',
                      lineHeight: 1, marginTop: 4,
                      textShadow: gantzRecovery.pct >= 100
                        ? '0 0 14px rgba(255,184,0,0.7), 0 0 28px rgba(255,184,0,0.35)'
                        : gantzRecovery.pct > 0
                        ? '0 0 12px var(--gz-green-glow)'
                        : 'none',
                    }}
                  >
                    {gantzRecovery.pct.toFixed(1)}<span style={{ fontSize: 28 }}>%</span>
                  </div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', letterSpacing: '0.18em', marginTop: 2 }}>
                    確定 {gantzRecovery.decidedCount}件 · 的中 {gantzRecovery.wins}件 / 全{gantzRecovery.totalCount}件
                  </div>
                  <div style={{ marginTop: 8, fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-dim)', lineHeight: 1.6 }}>
                    全 BET ¥{gantzRecovery.totalIn.toLocaleString()} → 全払戻 ¥{gantzRecovery.totalOut.toLocaleString()}
                  </div>

                  {/* 副表示: あなたの個人収支 */}
                  <div style={{ marginTop: 16, paddingTop: 10, borderTop: '1px dashed var(--gz-line)' }}>
                    <div className="gz-label" style={{ fontSize: 9 }}>あなたの本日収支</div>
                    <div
                      style={{
                        fontFamily: 'var(--gz-display)', fontSize: 22, fontWeight: 900,
                        color: recovery.profit > 0 ? 'var(--gz-green)' : recovery.profit < 0 ? 'var(--gz-red)' : 'var(--gz-text-dim)',
                        marginTop: 2,
                      }}
                    >
                      {recovery.profit > 0 ? '+' : ''}¥{recovery.profit.toLocaleString()}
                    </div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 2 }}>
                      投資 ¥{recovery.totalIn.toLocaleString()} · 払戻 ¥{recovery.totalOut.toLocaleString()} · 確定 {recovery.decidedCount}件
                    </div>
                  </div>
                </div>
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                  <Orb size={520} pulsing>
                    <div style={{ maxWidth: 420, padding: '0 20px' }}>
                      <div
                        className="gz-orb-text-soft"
                        style={{
                          fontFamily: 'var(--gz-mono)', fontSize: 10,
                          letterSpacing: '0.25em', textTransform: 'uppercase',
                          color: 'var(--gz-text-dim)', textShadow: 'none',
                        }}
                      >
                        HORSEBET AI
                      </div>
                      <div
                        className="gz-orb-text"
                        style={{
                          fontFamily: 'var(--gz-jp-serif)',
                          fontWeight: 900,
                          fontSize: 52,
                          lineHeight: 1,
                          marginTop: 6,
                        }}
                      >
                        競馬GANTZ
                      </div>
                      <div
                        className="gz-orb-text-soft"
                        style={{
                          fontFamily: 'var(--gz-mono)',
                          fontSize: 11,
                          color: 'var(--gz-text-dim)',
                          letterSpacing: '0.25em',
                          marginTop: 16,
                          textShadow: 'none',
                        }}
                      >
                        STANDBY MODE
                      </div>
                      <div
                        className="gz-orb-text"
                        style={{
                          fontFamily: 'var(--gz-display)',
                          fontSize: 22,
                          fontWeight: 700,
                          letterSpacing: '0.18em',
                          marginTop: 12,
                          minHeight: '1.6em',
                          transition: 'opacity 0.4s',
                        }}
                      >
                        {STANDBY_CYCLE[standbyIdx]}<span className="gz-blink">_</span>
                      </div>
                      {/* 次のレースまで残り時間 */}
                      {nextStartCountdown !== null ? (
                        <div
                          className="gz-orb-text"
                          style={{
                            marginTop: 18,
                            padding: '6px 14px',
                            display: 'inline-flex',
                            alignItems: 'baseline',
                            gap: 8,
                            border: '1px solid var(--gz-amber)',
                            background: 'rgba(255, 184, 0, 0.06)',
                            fontFamily: 'var(--gz-display)',
                            color: 'var(--gz-amber)',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                          }}
                        >
                          <span style={{ fontSize: 10, color: 'var(--gz-text-muted)', textShadow: 'none' }}>
                            次のレースまで
                          </span>
                          <span style={{ fontSize: 22 }}>{nextStartCountdown}</span>
                          <span style={{ fontSize: 11 }}>分</span>
                        </div>
                      ) : (
                        <div
                          className="gz-orb-text-soft"
                          style={{
                            fontFamily: 'var(--gz-mono)',
                            fontSize: 10,
                            color: 'var(--gz-text-dim)',
                            letterSpacing: '0.15em',
                            marginTop: 18,
                            lineHeight: 1.7,
                            textShadow: 'none',
                          }}
                        >
                          ● シグナルフィード稼働中<br />
                          ● 朝 09:01 JST に当日の配信受信<br />
                          ● 4 エンジン同期完了
                        </div>
                      )}
                    </div>
                  </Orb>
                </div>
              </>
            )}

            {focusedRace && (
              <>
                {/* 左上 */}
                <div style={{ position: 'absolute', top: 30, left: 30, width: 220 }}>
                  <div className="gz-label">VENUE / 会場</div>
                  <div
                    style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 700, color: 'var(--gz-text)', lineHeight: 1, marginTop: 4 }}
                    className="gz-glow"
                  >
                    {focusedRace.jo_name}
                    <span style={{ fontSize: 18, color: 'var(--gz-green)', marginLeft: 6 }}>{focusedRace.race_no}R</span>
                  </div>
                  {focusedRace.race_name && (
                    <div
                      style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, color: 'var(--gz-green)', fontWeight: 700, marginTop: 6 }}
                      className="gz-glow-strong"
                    >
                      {focusedRace.race_name}
                    </div>
                  )}
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 8, letterSpacing: '0.1em' }}>
                    {focusedRace.race_type} · {focusedRace.distance} · {focusedRace.bet_type_name}
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <div className="gz-label">推定上がり3F</div>
                    <div
                      style={{ fontSize: 42, fontFamily: 'var(--gz-display)', fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1 }}
                      className="gz-glow-strong"
                    >
                      {focusedRace.estimated_3f || '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 9, color: 'var(--gz-text-muted)', letterSpacing: '0.2em' }}>
                      TOP SPEED ESTIMATE
                    </div>
                  </div>
                  <div style={{ marginTop: 18 }}>
                    <div className="gz-label" style={{ marginBottom: 6 }}>レースデータ解析</div>
                    <DataBar label="SPEED"   value={focusedRace.speed === 'S' ? 95 : focusedRace.speed === 'A+' ? 90 : 84} />
                    <DataBar label="STAMINA" value={focusedRace.stamina === 'A+' ? 90 : focusedRace.stamina === 'A' ? 84 : 76} />
                    <DataBar label="瞬発力"   value={88} />
                    <DataBar label="持続力"   value={82} />
                    <DataBar label="安定性"   value={focusedRace.consensus === '4/4' ? 92 : 76} />
                  </div>
                </div>

                {/* 右上: 当日の回収率 */}
                <div style={{ position: 'absolute', top: 30, right: 30, width: 240, textAlign: 'right' }}>
                  <div className="gz-label">あなたの本日収支</div>
                  <div
                    style={{
                      fontSize: 56,
                      fontFamily: 'var(--gz-display)',
                      fontWeight: 900,
                      color: recovery.pct >= 100 ? 'var(--gz-amber)' : recovery.pct > 0 ? 'var(--gz-green)' : 'var(--gz-text-dim)',
                      lineHeight: 1,
                      marginTop: 4,
                      textShadow: recovery.pct >= 100
                        ? '0 0 14px rgba(255,184,0,0.7), 0 0 28px rgba(255,184,0,0.35)'
                        : recovery.pct > 0
                        ? '0 0 12px var(--gz-green-glow)'
                        : 'none',
                    }}
                  >
                    {recovery.pct.toFixed(1)}<span style={{ fontSize: 28 }}>%</span>
                  </div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', letterSpacing: '0.18em', marginTop: 2 }}>
                    確定 {recovery.decidedCount}件 · 的中 {recovery.wins}件
                  </div>
                  <div style={{ marginTop: 14, fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-dim)', lineHeight: 1.7 }}>
                    <div>投資 <span style={{ color: 'var(--gz-text)' }}>¥{recovery.totalIn.toLocaleString()}</span></div>
                    <div>払戻 <span style={{ color: 'var(--gz-amber)' }}>¥{recovery.totalOut.toLocaleString()}</span></div>
                    <div>
                      差引{' '}
                      <span style={{
                        color: recovery.profit > 0 ? 'var(--gz-green)' : recovery.profit < 0 ? 'var(--gz-red)' : 'var(--gz-text-dim)',
                        fontWeight: 700,
                      }}>
                        {recovery.profit > 0 ? '+' : ''}¥{recovery.profit.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div className="gz-label" style={{ marginBottom: 6 }}>SCHEDULE</div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-green)', textAlign: 'right', lineHeight: 1.7 }}>
                      <div>発走 <span style={{ color: 'var(--gz-text)' }}>{focusedRace.start_time}</span></div>
                      <div>発射 <span style={{ color: 'var(--gz-amber)' }}>{focusedRace.fire_at}</span></div>
                      <div>状態 <span style={{ color: 'var(--gz-text)' }}>{focusedRace.schedule.toUpperCase()}</span></div>
                    </div>
                  </div>
                </div>

                {/* 中央オーブ */}
                <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
                  <Orb size={540} pulsing>
                    <div style={{ maxWidth: 420, padding: '0 24px' }}>
                      <div
                        className="gz-orb-text-soft"
                        style={{
                          fontFamily: 'var(--gz-mono)', fontSize: 10,
                          letterSpacing: '0.25em', textTransform: 'uppercase',
                          color: 'var(--gz-text-dim)', textShadow: 'none',
                        }}
                      >
                        {focusedRace.bet_type_name} / TARGET
                      </div>
                      <div
                        className="gz-orb-text"
                        style={{
                          fontFamily: 'var(--gz-jp-serif)', fontSize: 42, fontWeight: 900,
                          lineHeight: 1, marginTop: 6,
                        }}
                      >
                        競馬GANTZ
                      </div>
                      <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 10, justifyContent: 'center' }}>
                        <span
                          className="gz-orb-text-num"
                          style={{
                            fontFamily: 'var(--gz-display)', fontSize: 120, fontWeight: 900,
                            lineHeight: 0.9,
                          }}
                        >
                          {focusedRace.kaime_data[0] ?? '—'}
                        </span>
                        <span
                          className="gz-orb-text-soft"
                          style={{
                            fontSize: 22, color: 'var(--gz-green)',
                            fontFamily: 'var(--gz-jp-serif)', fontWeight: 700,
                            textShadow: '0 0 6px rgba(0,255,130,0.4)',
                          }}
                        >
                          番
                        </span>
                      </div>
                      <div
                        className="gz-orb-text"
                        style={{
                          fontFamily: 'var(--gz-jp-serif)', fontSize: 22,
                          fontWeight: 700, marginTop: 8,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {focusedRace.horse_name}
                      </div>
                      <div
                        className="gz-orb-text-soft"
                        style={{
                          fontFamily: 'var(--gz-mono)', fontSize: 11,
                          color: 'var(--gz-text-dim)', marginTop: 8,
                          letterSpacing: '0.15em', textShadow: 'none',
                        }}
                      >
                        {focusedRace.popularity > 0 ? `${focusedRace.popularity}人気` : ''}
                      </div>
                      {/* BET 金額（強調） */}
                      <div
                        className="gz-orb-text"
                        style={{
                          marginTop: 12,
                          padding: '6px 14px',
                          display: 'inline-flex',
                          alignItems: 'baseline',
                          gap: 6,
                          border: '1px solid var(--gz-amber)',
                          background: 'rgba(255, 184, 0, 0.08)',
                          fontFamily: 'var(--gz-display)',
                          color: 'var(--gz-amber)',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          textShadow: '0 0 8px rgba(255, 184, 0, 0.45)',
                        }}
                      >
                        <span style={{ fontSize: 11 }}>BET</span>
                        <span style={{ fontSize: 24 }}>¥{betAmount.toLocaleString()}</span>
                      </div>
                    </div>
                  </Orb>
                </div>

                {/* 左下 */}
                <div style={{ position: 'absolute', bottom: 30, left: 30, width: 240 }}>
                  <Vertical
                    style={{ position: 'absolute', left: -22, top: -110, fontSize: 14, color: 'var(--gz-green)', opacity: 0.6 }}
                    className="gz-glow"
                  >
                    データが導く勝利
                  </Vertical>
                  <div className="gz-label" style={{ marginBottom: 6 }}>TARGET DETAIL</div>
                  <table className="gz-table" style={{ width: '100%' }}>
                    <tbody>
                      <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>馬</td><td style={{ color: 'var(--gz-green)', fontWeight: 700 }}>{focusedRace.horse_name}</td></tr>
                      <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>馬番</td><td>{focusedRace.kaime_data[0] ?? '—'}</td></tr>
                      <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>人気</td><td>{focusedRace.popularity > 0 ? `${focusedRace.popularity}人気` : '—'}</td></tr>
                      <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>距離</td><td>{focusedRace.distance}</td></tr>
                    </tbody>
                  </table>
                </div>

                {/* 右下 */}
                <div style={{ position: 'absolute', bottom: 30, right: 30, width: 240 }}>
                  <Vertical
                    style={{ position: 'absolute', right: -22, top: -110, fontSize: 14, color: 'var(--gz-green)', opacity: 0.6 }}
                    className="gz-glow"
                  >
                    未来を予測せよ
                  </Vertical>
                  <div className="gz-label" style={{ marginBottom: 6, textAlign: 'right' }}>COURSE</div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
                    <HorseSvg size={70} />
                    <CourseTrack size={80} label={focusedRace.course} />
                  </div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', textAlign: 'right' }}>
                    {focusedRace.distance} · コース{focusedRace.course}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* フッター — focusedRace (= 10分前 active) がある時のみ */}
          {focusedRace && activeSignal && (
            <footer
              style={{
                padding: '16px 32px',
                borderTop: '1px solid var(--gz-line)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'linear-gradient(0deg, rgba(0,20,10,0.6), transparent)',
              }}
            >
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)' }}>
                <span className="gz-dot" style={{ marginRight: 8 }} />
                発射予定: <span style={{ color: 'var(--gz-amber)' }}>{focusedRace.fire_at}</span> / 発走 {focusedRace.start_time} / {focusedRace.schedule.toUpperCase()} · BET ¥{betAmount.toLocaleString()}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {(() => {
                  const sched = scheduleMap.get(focusedRace.id);
                  if (sched && (sched.status === 'scheduled' || sched.status === 'queued')) {
                    return (
                      <button
                        className="gz-btn gz-btn-ghost"
                        onClick={() => schedulerRef.current?.cancel(focusedRace.id, 'ユーザー取消')}
                      >
                        取消
                      </button>
                    );
                  }
                  return null;
                })()}
                <button className="gz-btn" onClick={() => navigate(`/races/${focusedRace.id}`)}>レース詳細</button>
                <button
                  className="gz-btn gz-btn-primary"
                  onClick={() => handleBetExecution(activeSignal)}
                  disabled={betting === focusedRace.id}
                >
                  {betting === focusedRace.id ? '投票中...' : `手動で投票 ¥${betAmount.toLocaleString()}`}
                </button>
              </div>
            </footer>
          )}
          {betStatus && (
            <div
              style={{
                padding: '8px 32px',
                fontFamily: 'var(--gz-mono)',
                fontSize: 11,
                color: 'var(--gz-text)',
                borderTop: '1px solid var(--gz-line)',
              }}
            >
              {betStatus}
            </div>
          )}
        </section>

        {/* 右サイドバー */}
        <aside
          style={{
            borderLeft: '1px solid var(--gz-line)',
            padding: '20px 16px',
            overflowY: 'auto',
            background: 'linear-gradient(270deg, rgba(0,20,10,0.6), transparent)',
          }}
          className="gz-noscroll"
        >
          {/* 本日の動き 数値サマリ */}
          <div className="gz-label-strong" style={{ marginBottom: 14 }}>本日の動き</div>
          <div className="gz-panel gz-panel-glow" style={{ padding: 14, marginBottom: 16, position: 'relative' }}>
            <Corners />
            <div className="gz-label">投票完了</div>
            <div
              style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)' }}
              className="gz-glow-strong"
            >
              {todayStats.submitted}<span style={{ fontSize: 18, marginLeft: 4 }}>件</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginTop: 12, fontFamily: 'var(--gz-mono)', fontSize: 11 }}>
              <div>
                <span className="gz-label">配信</span>
                <div style={{ color: 'var(--gz-text)', fontSize: 16 }}>{signals.length}件</div>
              </div>
              <div>
                <span className="gz-label">予約中</span>
                <div style={{ color: 'var(--gz-amber)', fontSize: 16 }}>{todayStats.scheduled}件</div>
              </div>
              <div>
                <span className="gz-label">失敗</span>
                <div style={{ color: todayStats.failed > 0 ? 'var(--gz-red)' : 'var(--gz-text-dim)', fontSize: 16 }}>
                  {todayStats.failed}件
                </div>
              </div>
              <div>
                <span className="gz-label">対象外</span>
                <div style={{ color: 'var(--gz-text-dim)', fontSize: 16 }}>{todayStats.skipped}件</div>
              </div>
            </div>
          </div>

          {/* 次の発射予定 */}
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>次の発射予定</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {upcomingFires.length === 0 ? (
              <div
                style={{
                  padding: '12px 10px',
                  border: '1px dashed var(--gz-line)',
                  fontFamily: 'var(--gz-mono)', fontSize: 10,
                  color: 'var(--gz-text-muted)',
                  textAlign: 'center', letterSpacing: '0.15em',
                }}
              >
                {autoBetEnabled ? '予約レースなし' : '自動投票 OFF'}
              </div>
            ) : (
              upcomingFires.map((item) => {
                const sig = item.signal;
                const t = item.fireAt ? new Date(item.fireAt) : null;
                const fireStr = t ? t.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '—';
                return (
                  <div
                    key={sig.id}
                    onClick={() => setSelectedId(sig.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '8px 10px',
                      border: '1px solid var(--gz-line)',
                      background: 'rgba(0,30,12,0.4)',
                      fontFamily: 'var(--gz-mono)', fontSize: 11,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--gz-amber)', fontSize: 13, fontWeight: 700 }}>{fireStr}</div>
                      <div style={{ color: 'var(--gz-text-dim)', fontSize: 10 }}>
                        {sig.jo_name} {sig.race_no}R · {sig.kaime_data[0]}番
                      </div>
                    </div>
                    <span className="gz-badge gz-badge-amber" style={{ fontSize: 9 }}>予約</span>
                  </div>
                );
              })
            )}
          </div>

          {/* イベントログ */}
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>イベントログ</div>
          <div
            style={{
              fontFamily: 'var(--gz-mono)',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--gz-text-dim)',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {notifications.length === 0 && (
              <div style={{ color: 'var(--gz-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                ログ待機中…
              </div>
            )}
            {notifications.slice(0, 8).map((n) => {
              const borderColor =
                n.severity === 'error' ? 'var(--gz-red)' :
                n.severity === 'win' ? 'var(--gz-amber)' :
                n.severity === 'success' ? 'var(--gz-green)' :
                'var(--gz-line-strong)';
              const textColor =
                n.severity === 'error' ? 'var(--gz-red)' :
                n.severity === 'win' ? 'var(--gz-amber)' :
                'var(--gz-text)';
              const typeLabel = {
                signal: '配信受信', fire: '投票実行', submitted: '投票完了',
                win: '的中', system: 'システム', error: 'エラー',
              }[n.type] ?? n.type;
              return (
                <div key={n.id} style={{ borderLeft: `2px solid ${borderColor}`, paddingLeft: 8 }}>
                  <div style={{ color: 'var(--gz-text-muted)', fontSize: 9, letterSpacing: '0.1em' }}>
                    {n.time} · {typeLabel}
                  </div>
                  <div style={{ color: textColor }}>{n.message}</div>
                </div>
              );
            })}
          </div>

          <div className="gz-divider" />
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>SYSTEM</div>
          <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-dim)', lineHeight: 1.8 }}>
            <div>SIGNAL FEED <span style={{ color: 'var(--gz-green)', float: 'right' }}>● ONLINE</span></div>
            <div>IPAT (JRA) <span style={{ color: credentials.ipat ? 'var(--gz-green)' : 'var(--gz-text-muted)', float: 'right' }}>{credentials.ipat ? '● READY' : '○ 未設定'}</span></div>
            <div>SPAT4 (地方) <span style={{ color: credentials.spat4 ? 'var(--gz-green)' : 'var(--gz-text-muted)', float: 'right' }}>{credentials.spat4 ? '● READY' : '○ 未設定'}</span></div>
            <div>自動投票 <span style={{ color: autoBetEnabled ? 'var(--gz-green)' : 'var(--gz-text-muted)', float: 'right' }}>{autoBetEnabled ? '● ARMED' : '○ OFF'}</span></div>
          </div>
        </aside>
      </div>

      {/* 投票モーダル */}
      {betting && (
        <div
          style={{
            position: 'absolute',
            inset: 36,
            background: 'rgba(0,5,2,0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            backdropFilter: 'blur(4px)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <Orb size={200}>
              <div
                style={{ fontFamily: 'var(--gz-mono)', fontSize: 12, color: 'var(--gz-green)', letterSpacing: '0.2em' }}
                className="gz-glow"
              >
                EXECUTING
              </div>
              <div
                style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)', marginTop: 6 }}
                className="gz-glow-strong"
              >
                SUBMIT
              </div>
            </Orb>
            <div
              style={{
                marginTop: 50,
                fontFamily: 'var(--gz-mono)',
                fontSize: 13,
                color: 'var(--gz-text)',
                letterSpacing: '0.15em',
              }}
            >
              投票サイトへ送信中…<span className="gz-blink">_</span>
            </div>
          </div>
        </div>
      )}
    </GzWindow>
  );
}
