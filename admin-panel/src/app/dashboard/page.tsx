'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import type { BetSignal } from '@shared/types/database.types';
import { fetchTodaySignals, subscribeToSignalInsert } from '@/lib/api/signals';

export default function DashboardPage() {
  const [signals, setSignals] = useState<BetSignal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      const { data } = await fetchTodaySignals();
      if (data) {
        setSignals(data);
      }
      setLoading(false);
    };

    initialize();

    const unsubscribe = subscribeToSignalInsert((signal) => {
      setSignals((prev) => [signal, ...prev]);
      if (typeof window !== 'undefined' && Notification.permission === 'granted') {
        new Notification('新しい買い目が配信されました', {
          body: `${signal.jo_name} ${signal.race_no}R ${signal.bet_type_name}`,
        });
      }
    });

    if (typeof window !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">HorseBet 管理パネル</h1>
            <p className="text-sm text-gray-500">本日の配信状況を確認できます</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/create-signal"
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
            >
              新規配信
            </Link>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              本日の買い目 ({signals.length}件)
            </h2>
            <p className="text-sm text-gray-500">
              リアルタイムで新しい買い目が表示されます
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg bg-white shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  配信日時
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  レース
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  馬券
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  買い目数
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  ステータス
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    読み込み中...
                  </td>
                </tr>
              ) : signals.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                    本日の買い目はまだ登録されていません
                  </td>
                </tr>
              ) : (
                signals.map((signal) => (
                  <tr key={signal.id}>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {new Date(signal.created_at).toLocaleString('ja-JP')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {signal.race_type} / {signal.jo_name} {signal.race_no}R
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {signal.bet_type_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {signal.kaime_data.length}点
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={signal.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green-100 text-green-800'
      : status === 'completed'
        ? 'bg-gray-100 text-gray-800'
        : 'bg-red-100 text-red-800';
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${color}`}>
      {status}
    </span>
  );
}
