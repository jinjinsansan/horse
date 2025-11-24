import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { upsertOiageState, fetchActiveOiage } from '@/lib/api/oiage';

interface CredentialForm {
  ipatId: string;
  ipatUserCode: string;
  ipatPassword: string;
  ipatPin: string;
  spatId: string;
  spatPassword: string;
  oiageBaseAmount: number;
  oiageTargetProfit: number;
  oiageMaxSteps: number;
}

export default function Settings() {
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [cred, setCred] = useState<CredentialForm>({
    ipatId: '',
    ipatUserCode: '',
    ipatPassword: '',
    ipatPin: '',
    spatId: '',
    spatPassword: '',
    oiageBaseAmount: 1000,
    oiageTargetProfit: 10000,
    oiageMaxSteps: 5,
  });
  const [oiageEnabled, setOiageEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from('user_profiles')
        .select('auto_bet_enabled, ipat_credentials, spat4_credentials, settings')
        .eq('id', user.user.id)
        .single();
      if (data) {
        setAutoBetEnabled(data.auto_bet_enabled ?? false);
        setCred({
          ipatId: data.ipat_credentials?.inet_id ?? '',
          ipatUserCode: data.ipat_credentials?.user_cd ?? '',
          ipatPassword: data.ipat_credentials?.password ?? '',
          ipatPin: data.ipat_credentials?.pin ?? '',
          spatId: data.spat4_credentials?.user_id ?? '',
          spatPassword: data.spat4_credentials?.password ?? '',
          oiageBaseAmount: data.settings?.oiage?.baseAmount ?? 1000,
          oiageTargetProfit: data.settings?.oiage?.targetProfit ?? 10000,
          oiageMaxSteps: data.settings?.oiage?.maxSteps ?? 5,
        });
        setOiageEnabled(data.settings?.oiage?.enabled ?? false);
      }

      const { data: oiage } = await fetchActiveOiage(user.user.id, 8);
      if (oiage) {
        setOiageEnabled(oiage.is_active);
        setCred((prev) => ({
          ...prev,
          oiageTargetProfit: oiage.target_profit,
        }));
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('settings')
      .eq('id', user.user.id)
      .single();
    const mergedSettings = {
      ...(profile?.settings ?? {}),
      oiage: {
        enabled: oiageEnabled,
        baseAmount: cred.oiageBaseAmount,
        targetProfit: cred.oiageTargetProfit,
        maxSteps: cred.oiageMaxSteps,
      },
      role: profile?.settings?.role ?? 'user',
    };

    const { error } = await supabase
      .from('user_profiles')
      .update({
        auto_bet_enabled: autoBetEnabled,
        ipat_credentials: {
          inet_id: cred.ipatId,
          user_cd: cred.ipatUserCode,
          password: cred.ipatPassword,
          pin: cred.ipatPin,
        },
        spat4_credentials: {
          user_id: cred.spatId,
          password: cred.spatPassword,
        },
        settings: mergedSettings,
      })
      .eq('id', user.user.id);

    if (error) {
      setMessage(error.message);
    } else {
      await upsertOiageState({
        userId: user.user.id,
        betType: 8,
        betTypeName: '3連単',
        targetProfit: cred.oiageTargetProfit,
        baseAmount: cred.oiageBaseAmount,
        maxSteps: cred.oiageMaxSteps,
        isActive: oiageEnabled,
      });
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
            <label>
              暗証番号（ユーザーコード）

        <section>
          <div className="section-head" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2>追い上げ設定（3連単）</h2>
              <p className="muted">ベース金額と目標利益を指定してください</p>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={oiageEnabled}
                onChange={(event) => setOiageEnabled(event.target.checked)}
              />
              <span>追い上げを有効化</span>
            </label>
          </div>
          <div className="grid">
            <label>
              ベース金額（1回目）
              <input
                type="number"
                min={100}
                step={100}
                value={cred.oiageBaseAmount}
                onChange={(event) => setCred((prev) => ({ ...prev, oiageBaseAmount: Number(event.target.value) }))}
              />
            </label>
            <label>
              目標利益額
              <input
                type="number"
                min={1000}
                step={500}
                value={cred.oiageTargetProfit}
                onChange={(event) => setCred((prev) => ({ ...prev, oiageTargetProfit: Number(event.target.value) }))}
              />
            </label>
            <label>
              最大ステップ数
              <input
                type="number"
                min={1}
                max={10}
                value={cred.oiageMaxSteps}
                onChange={(event) => setCred((prev) => ({ ...prev, oiageMaxSteps: Number(event.target.value) }))}
              />
            </label>
          </div>
        </section>
              <input
                value={cred.ipatUserCode}
                onChange={(event) => setCred((prev) => ({ ...prev, ipatUserCode: event.target.value }))}
                placeholder="4桁"
              />
            </label>
          </div>
        </section>

        <section>
          <h2>IPAT 認証情報</h2>
          <div className="grid">
            <label>
              加入者番号
            <label>
              暗証番号（PIN）
              <input
                type="password"
                value={cred.ipatPin}
                onChange={(event) => setCred((prev) => ({ ...prev, ipatPin: event.target.value }))}
                placeholder="4桁"
              />
            </label>
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
