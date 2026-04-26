import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { GzWindow, MatrixBg, Orb, Vertical } from '@/components/gantz';

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
    <GzWindow title="競馬GANTZ" subtitle="AUTH / SIGN IN" live={false}>
      <MatrixBg density={30} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', left: 60, top: '50%', transform: 'translateY(-50%)' }}>
          <Vertical style={{ fontSize: 16, color: 'var(--gz-green)', opacity: 0.5 }} className="gz-glow">
            データが導く勝利
          </Vertical>
        </div>
        <div style={{ position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)' }}>
          <Vertical style={{ fontSize: 16, color: 'var(--gz-green)', opacity: 0.5 }} className="gz-glow">
            未来を予測せよ
          </Vertical>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 80 }}>
          <Orb size={420} pulsing>
            <div className="gz-label" style={{ color: 'var(--gz-green)', opacity: 0.7 }}>HORSEBET AI</div>
            <div
              style={{
                fontFamily: 'var(--gz-jp-serif)',
                fontSize: 64,
                fontWeight: 900,
                color: 'var(--gz-green)',
              }}
              className="gz-glow-strong"
            >
              競馬GANTZ
            </div>
            <div
              style={{
                fontFamily: 'var(--gz-mono)',
                fontSize: 11,
                color: 'var(--gz-text-muted)',
                marginTop: 8,
                letterSpacing: '0.2em',
              }}
            >
              地方競馬 AI 自動投票システム
            </div>
          </Orb>

          <form onSubmit={handleSubmit} style={{ width: 380 }}>
            <div className="gz-label-strong">SECURE TERMINAL ACCESS</div>
            <div
              style={{
                fontFamily: 'var(--gz-display)',
                fontSize: 32,
                fontWeight: 900,
                color: 'var(--gz-text)',
                marginTop: 4,
                letterSpacing: '0.1em',
              }}
              className="gz-glow"
            >
              SIGN IN
            </div>
            <div className="gz-divider" />

            <div style={{ marginBottom: 14 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>USER ID</div>
              <input
                className="gz-input"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="goldbenchan@gmail.com"
                required
              />
            </div>
            <div style={{ marginBottom: 22 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>PASSWORD</div>
              <input
                className="gz-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div
                style={{
                  marginBottom: 14,
                  padding: '8px 12px',
                  border: '1px solid var(--gz-red)',
                  background: 'rgba(255,60,60,0.08)',
                  color: 'var(--gz-red)',
                  fontFamily: 'var(--gz-mono)',
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="gz-btn gz-btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '14px' }}
            >
              {loading ? 'AUTHENTICATING…' : 'AUTHENTICATE →'}
            </button>

            <div
              style={{
                marginTop: 18,
                fontFamily: 'var(--gz-mono)',
                fontSize: 10,
                color: 'var(--gz-text-muted)',
                lineHeight: 1.7,
              }}
            >
              <div>● 競馬GANTZ AUTH READY</div>
              <div>● SSL/TLS VERIFIED</div>
              <div>● SESSION TIMEOUT: 24H</div>
            </div>
          </form>
        </div>
      </div>
    </GzWindow>
  );
}
