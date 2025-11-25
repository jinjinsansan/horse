import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { upsertOiageState, fetchActiveOiage } from '@/lib/api/oiage';
import { RefreshCw, Download, CheckCircle } from 'lucide-react';

interface CredentialForm {
  ipatId: string;
  ipatUserCode: string;
  ipatPassword: string;
  ipatPin: string;
  spatMemberNumber: string;
  spatMemberId: string;
  spatPassword: string; // SPAT4暗証番号
  oiageBaseAmount: number;
  oiageTargetProfit: number;
  oiageMaxSteps: number;
}

const normalizeCredentialValue = (value: unknown) => {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (value === null || value === undefined) return '';
  return String(value).trim();
};

export default function Settings() {
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const [cred, setCred] = useState<CredentialForm>({
    ipatId: '',
    ipatUserCode: '',
    ipatPassword: '',
    ipatPin: '',
    spatMemberNumber: '',
    spatMemberId: '',
    spatPassword: '',
    oiageBaseAmount: 1000,
    oiageTargetProfit: 10000,
    oiageMaxSteps: 5,
  });
  const [oiageEnabled, setOiageEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const [currentVersion, setCurrentVersion] = useState('');
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestVersion, setLatestVersion] = useState('');
  const [updateDownloading, setUpdateDownloading] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [playwrightReady, setPlaywrightReady] = useState(true);

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
        const spatRaw = data.spat4_credentials ?? {};
        const spatMemberNumber = normalizeCredentialValue(spatRaw.member_number ?? spatRaw.memberNumber ?? spatRaw.user_id ?? '');
        const spatMemberId = normalizeCredentialValue(spatRaw.member_id ?? spatRaw.memberId ?? spatRaw.password ?? '');
        const spatPassword = normalizeCredentialValue(spatRaw.spat_password ?? spatRaw.ansho ?? '');
        setAutoBetEnabled(data.auto_bet_enabled ?? false);
        setCred({
          ipatId: data.ipat_credentials?.inet_id ?? '',
          ipatUserCode: data.ipat_credentials?.user_cd ?? '',
          ipatPassword: data.ipat_credentials?.password ?? '',
          ipatPin: data.ipat_credentials?.pin ?? '',
          spatMemberNumber,
          spatMemberId,
          spatPassword,
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

      if (window.horsebet) {
        const version = await window.horsebet.getVersion();
        setCurrentVersion(version);

        if (window.horsebet.isPlaywrightReady) {
          const ready = await window.horsebet.isPlaywrightReady();
          setPlaywrightReady(ready);
        } else {
          setPlaywrightReady(true);
        }

        window.horsebet.onUpdateAvailable((newVersion) => {
          setUpdateAvailable(true);
          setLatestVersion(newVersion);
          setUpdateMessage(`新しいバージョン ${newVersion} が利用可能です`);
        });

        window.horsebet.onUpdateDownloaded(() => {
          setUpdateDownloading(false);
          setUpdateReady(true);
          setUpdateMessage('更新のダウンロードが完了しました');
        });

        window.horsebet.onUpdateError((error) => {
          setUpdateDownloading(false);
          setUpdateMessage(`エラー: ${error}`);
        });
      }
    };
    load();
  }, []);

  const handleCheckUpdate = async () => {
    if (!window.horsebet) return;
    setUpdateChecking(true);
    setUpdateMessage('更新を確認中...');
    const result = await window.horsebet.checkUpdates();
    setUpdateChecking(false);
    if (result.available && result.version) {
      setUpdateAvailable(true);
      setLatestVersion(result.version);
      setUpdateMessage(`新しいバージョン ${result.version} が利用可能です`);
    } else {
      setUpdateMessage('最新版です');
      setTimeout(() => setUpdateMessage(''), 3000);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!window.horsebet) return;
    setUpdateDownloading(true);
    setUpdateMessage('ダウンロード中...');
    await window.horsebet.downloadUpdate();
  };

  const handleInstallUpdate = async () => {
    if (!window.horsebet) return;
    await window.horsebet.installUpdate();
  };

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
          member_number: normalizeCredentialValue(cred.spatMemberNumber),
          member_id: normalizeCredentialValue(cred.spatMemberId),
          spat_password: normalizeCredentialValue(cred.spatPassword),
          user_id: normalizeCredentialValue(cred.spatMemberNumber),
          password: normalizeCredentialValue(cred.spatMemberId),
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
            <p className="label">SYSTEM SETTINGS</p>
            <h1>⚙️ システム設定</h1>
            <p className="muted" style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>自動投票 / 認証情報 / 追い上げ設定</p>
          </div>
          <button className="secondary" onClick={() => navigate(-1)}>
            ← 戻る
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
              加入者番号
              <input
                value={cred.spatMemberNumber}
                onChange={(event) => setCred((prev) => ({ ...prev, spatMemberNumber: event.target.value }))}
                placeholder="10桁"
              />
            </label>
            <label>
              利用者ID（パスワード）
              <input
                type="password"
                value={cred.spatMemberId}
                onChange={(event) => setCred((prev) => ({ ...prev, spatMemberId: event.target.value }))}
              />
            </label>
            <label>
              暗証番号
              <input
                type="password"
                value={cred.spatPassword}
                onChange={(event) => setCred((prev) => ({ ...prev, spatPassword: event.target.value }))}
                placeholder="4桁"
              />
            </label>
          </div>
        </section>

        {!playwrightReady ? (
          <section>
            <h2>投票ブラウザセットアップ</h2>
            <div style={{ padding: '1rem', backgroundColor: '#fef3c7', borderRadius: '0.5rem', marginBottom: '1rem' }}>
              <p style={{ fontWeight: '600', marginBottom: '0.5rem' }}>⚠️ 初回セットアップが必要です</p>
              <p style={{ fontSize: '0.875rem', marginBottom: '0.75rem' }}>
                自動投票機能を使用するには、Playwrightブラウザのインストールが必要です。
              </p>
              <p style={{ fontSize: '0.875rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                インストール手順：
              </p>
              <ol style={{ fontSize: '0.875rem', marginLeft: '1.5rem', lineHeight: '1.75' }}>
                <li>Windowsキーを押して「cmd」と入力し、コマンドプロンプトを開く</li>
                <li>以下のコマンドをコピー＆ペーストして Enter を押す：</li>
              </ol>
              <div style={{ 
                backgroundColor: '#1f2937', 
                color: '#f3f4f6', 
                padding: '0.75rem', 
                borderRadius: '0.375rem', 
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                marginTop: '0.5rem',
                marginBottom: '0.5rem',
                userSelect: 'all'
              }}>
                npx playwright install chromium
              </div>
              <p style={{ fontSize: '0.875rem' }}>
                ※ インストールは初回のみ必要で、約1-2分かかります。
              </p>
            </div>
          </section>
        ) : (
          <section>
            <h2>投票ブラウザ</h2>
            <div style={{
              padding: '1rem',
              backgroundColor: '#ecfccb',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              color: '#365314',
              fontSize: '0.9rem',
            }}>
              Playwrightブラウザはアプリに同梱済みのため、追加セットアップは不要です。
            </div>
          </section>
        )}

        <section>
          <h2>アプリ更新</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="muted">現在のバージョン</p>
                <p style={{ fontSize: '1.25rem', fontWeight: '600', marginTop: '0.25rem' }}>
                  {currentVersion ? `v${currentVersion}` : '読み込み中...'}
                </p>
              </div>
              <button
                className="secondary"
                onClick={handleCheckUpdate}
                disabled={updateChecking || updateDownloading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <RefreshCw size={16} className={updateChecking ? 'spin' : ''} />
                {updateChecking ? '確認中...' : '更新をチェック'}
              </button>
            </div>

            {updateMessage && (
              <div
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: '0.5rem',
                  backgroundColor: updateAvailable ? '#dbeafe' : updateReady ? '#dcfce7' : '#f3f4f6',
                  color: updateAvailable ? '#1e40af' : updateReady ? '#166534' : '#374151',
                }}
              >
                {updateMessage}
              </div>
            )}

            {updateAvailable && !updateReady && (
              <button
                className="primary"
                onClick={handleDownloadUpdate}
                disabled={updateDownloading}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}
              >
                <Download size={16} />
                {updateDownloading ? 'ダウンロード中...' : `v${latestVersion} をダウンロード`}
              </button>
            )}

            {updateReady && (
              <button
                className="primary"
                onClick={handleInstallUpdate}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  justifyContent: 'center',
                  backgroundColor: '#16a34a',
                }}
              >
                <CheckCircle size={16} />
                再起動してインストール
              </button>
            )}
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
