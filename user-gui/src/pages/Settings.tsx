import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface CredentialForm {
  ipatId: string;
  ipatPassword: string;
  spatId: string;
  spatPassword: string;
}

export default function Settings() {
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [cred, setCred] = useState<CredentialForm>({
    ipatId: '',
    ipatPassword: '',
    spatId: '',
    spatPassword: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from('user_profiles')
        .select('auto_bet_enabled, ipat_credentials, spat4_credentials')
        .eq('id', user.user.id)
        .single();
      if (data) {
        setAutoBetEnabled(data.auto_bet_enabled ?? false);
        setCred({
          ipatId: data.ipat_credentials?.inet_id ?? '',
          ipatPassword: data.ipat_credentials?.password ?? '',
          spatId: data.spat4_credentials?.user_id ?? '',
          spatPassword: data.spat4_credentials?.password ?? '',
        });
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error } = await supabase
      .from('user_profiles')
      .update({
        auto_bet_enabled: autoBetEnabled,
        ipat_credentials: {
          inet_id: cred.ipatId,
          password: cred.ipatPassword,
        },
        spat4_credentials: {
          user_id: cred.spatId,
          password: cred.spatPassword,
        },
      })
      .eq('id', user.user.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage('設定を保存しました');
    }
    setSaving(false);
  };

  return (
    <div className="settings-page">
      <div className="settings-card">
        <header>
          <div>
            <p className="label">設定</p>
            <h1>自動投票 / 認証情報</h1>
          </div>
          <button className="secondary" onClick={() => navigate(-1)}>
            戻る
          </button>
        </header>

        <section>
          <div className="section-head">
            <h2>自動投票</h2>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoBetEnabled}
                onChange={(event) => setAutoBetEnabled(event.target.checked)}
              />
              <span>配信された買い目を自動で投票する</span>
            </label>
          </div>
        </section>

        <section>
          <h2>IPAT 認証情報</h2>
          <div className="grid">
            <label>
              加入者番号
              <input
                value={cred.ipatId}
                onChange={(event) => setCred((prev) => ({ ...prev, ipatId: event.target.value }))}
                placeholder="P12345678"
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                value={cred.ipatPassword}
                onChange={(event) => setCred((prev) => ({ ...prev, ipatPassword: event.target.value }))}
              />
            </label>
          </div>
        </section>

        <section>
          <h2>SPAT4 認証情報</h2>
          <div className="grid">
            <label>
              ユーザーID
              <input
                value={cred.spatId}
                onChange={(event) => setCred((prev) => ({ ...prev, spatId: event.target.value }))}
              />
            </label>
            <label>
              パスワード
              <input
                type="password"
                value={cred.spatPassword}
                onChange={(event) => setCred((prev) => ({ ...prev, spatPassword: event.target.value }))}
              />
            </label>
          </div>
        </section>

        {message && <p className="info">{message}</p>}

        <div className="actions">
          <button className="primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      </div>
    </div>
  );
}
