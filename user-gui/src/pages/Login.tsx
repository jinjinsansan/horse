import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function Login() {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    const email = userId.includes('@') ? userId : `${userId}@horsebet.local`;
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !data.user) {
      setError(signInError?.message ?? 'ログインに失敗しました');
      setLoading(false);
      return;
    }

    navigate('/', { replace: true });
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h1 className="title">HorseBet</h1>
        <p className="subtitle">会員IDとパスワードを入力してください</p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            ユーザーID
            <input
              type="text"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="admin001"
              required
            />
          </label>
          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? '接続中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
}
