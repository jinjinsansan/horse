'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { BetSignal } from '@horsebet/shared/types/database.types';
import { supabase } from '@/lib/supabase/client';

type BetJob = {
  id: string;
  signal_id: number | null;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  trigger_source: string | null;
  created_at: string;
  completed_at: string | null;
  error_message?: string | null;
};

export default function ClientPage() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [jobs, setJobs] = useState<BetJob[]>([]);
  const [loadingSignals, setLoadingSignals] = useState(true);
  const [jobStatus, setJobStatus] = useState<Record<number, string>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState('');

  const refreshSignals = useCallback(async () => {
    setLoadingSignals(true);
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('bet_signals')
      .select('*')
      .eq('signal_date', today)
      .order('race_no', { ascending: true });
    if (data) {
      setSignals(data);
    }
    setLoadingSignals(false);
  }, []);

  const fetchJobsFor = useCallback(async (targetUserId: string) => {
    const { data } = await supabase
      .from('bet_jobs')
      .select('id, signal_id, status, trigger_source, created_at, completed_at, error_message')
      .eq('user_id', targetUserId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setJobs(data as BetJob[]);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    if (!userId) return;
    await fetchJobsFor(userId);
  }, [userId, fetchJobsFor]);

  const handleServerBet = useCallback(async (signal: BetSignal) => {
    setInfoMessage('');
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setInfoMessage('再度ログインしてください');
      return;
    }

    setJobStatus((prev) => ({ ...prev, [signal.id]: '送信中...' }));
    const response = await fetch('/api/server-bet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${data.session.access_token}`,
      },
      body: JSON.stringify({ signalId: signal.id, auto: true }),
    });

    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      setJobStatus((prev) => ({ ...prev, [signal.id]: `ジョブ登録: ${result.jobId ?? '成功'}` }));
      await refreshJobs();
    } else {
      setJobStatus((prev) => ({ ...prev, [signal.id]: `失敗: ${result.error ?? 'unknown error'}` }));
    }
  }, [refreshJobs]);

  useEffect(() => {
    const initialize = async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = '/login';
        return;
      }
      setUserId(data.user.id);
      await Promise.all([refreshSignals(), fetchJobsFor(data.user.id)]);
    };

    initialize();
  }, [fetchJobsFor, refreshSignals]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`bet_jobs_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_jobs', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (!payload.new) return;
          const record = payload.new as BetJob;
          setJobs((prev) => {
            const filtered = prev.filter((job) => job.id !== record.id);
            return [record, ...filtered].slice(0, 20);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const signalRows = useMemo(() => {
    if (loadingSignals) {
      return (
        <tr>
          <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500">
            読み込み中...
          </td>
        </tr>
      );
    }

    if (signals.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="px-6 py-6 text-center text-sm text-gray-500">
            本日の買い目はまだ登録されていません
          </td>
        </tr>
      );
    }

    return signals.map((signal) => (
      <tr key={signal.id}>
        <td className="px-6 py-4 text-sm text-gray-900">
          {new Date(signal.created_at).toLocaleTimeString('ja-JP')}
        </td>
        <td className="px-6 py-4 text-sm text-gray-900">
          {signal.jo_name} {signal.race_no}R
        </td>
        <td className="px-6 py-4 text-sm text-gray-900">{signal.bet_type_name}</td>
        <td className="px-6 py-4 text-sm text-gray-900">{signal.kaime_data.length}点</td>
        <td className="px-6 py-4">
          <StatusBadge status={signal.status} />
        </td>
        <td className="px-6 py-4 text-right">
          <button
            onClick={() => handleServerBet(signal)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            サーバー自動投票
          </button>
          {jobStatus[signal.id] && (
            <p className="mt-2 text-xs text-gray-500">{jobStatus[signal.id]}</p>
          )}
        </td>
      </tr>
    ));
  }, [signals, loadingSignals, jobStatus, handleServerBet]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HorseBet 利用者ダッシュボード</h1>
            <p className="text-sm text-gray-500">ブラウザからサーバー自動投票を実行できます</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              管理者ページ
            </Link>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {infoMessage && (
          <div className="mb-4 rounded-md bg-yellow-50 px-4 py-3 text-sm text-yellow-800">{infoMessage}</div>
        )}

        <section className="mb-8 rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">本日の買い目</h2>
            <p className="text-sm text-gray-500">任意の買い目でサーバー自動投票が実行できます</p>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  配信時間
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  レース
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  馬券
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  買い目
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  ステータス
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">{signalRows}</tbody>
          </table>
        </section>

        <section className="rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">サーバー実行ジョブ履歴</h2>
                <p className="text-sm text-gray-500">最新20件まで表示されます</p>
              </div>
              <button onClick={refreshJobs} className="text-sm font-medium text-blue-600 hover:underline">
                更新
              </button>
            </div>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  ジョブID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  シグナルID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  開始
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  状態
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  メッセージ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-6 text-center text-sm text-gray-500">
                    まだジョブ履歴がありません
                  </td>
                </tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{job.id.slice(0, 8)}...</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{job.signal_id ?? '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(job.created_at).toLocaleTimeString('ja-JP')}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {job.error_message ?? (job.status === 'succeeded' ? '完了' : '-')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    succeeded: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    pending: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    completed: 'bg-gray-200 text-gray-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  const color = colorMap[status] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}
