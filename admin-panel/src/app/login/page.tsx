'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('admin@horsebet.test');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('settings')
      .eq('id', data.user?.id)
      .single();

    if (profileError) {
      setError('プロフィール取得に失敗しました');
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    const role = profile?.settings?.role ?? 'user';
    router.replace(role === 'admin' ? '/dashboard' : '/client');
  };

  return (
    <div className="flex min-h-screen items-center justify-center gradient-primary p-4">
      <div className="w-full max-w-md rounded-2xl card-dark p-8 shadow-xl">
        <h1 className="mb-2 text-center text-3xl font-bold text-white">
          🏇 HorseBet AI
        </h1>
        <p className="mb-6 text-center text-sm text-gray-300">管理者パネル</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg px-4 py-2"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg px-4 py-2"
              required
            />
          </div>
          {error && (
            <p className="rounded-lg bg-red-900/30 border border-red-500/50 px-3 py-2 text-sm text-red-300">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full rounded-lg py-3 font-semibold disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
