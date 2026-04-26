import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { upsertOiageState, fetchActiveOiage } from '@/lib/api/oiage';
import { GzWindow, MatrixBg, Corners } from '@/components/gantz';

type BetMode = 'manual' | 'bulk' | 'first_only' | 'sequential';

interface CredentialForm {
  ipatId: string;
  ipatUserCode: string;
  ipatPassword: string;
  ipatPin: string;
  spatMemberNumber: string;
  spatMemberId: string;
  spatPassword: string;
  betAmount: number;
  betMode: BetMode;
  oiageBaseAmount: number;
  oiageTargetProfit: number;
  oiageMaxSteps: number;
}

const BET_AMOUNT_MIN = 100;
const BET_AMOUNT_MAX = 50000;
const BET_AMOUNT_STEP = 100;

const norm = (v: unknown) => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (v === null || v === undefined) return '';
  return String(v).trim();
};

export default function Settings() {
  const [oiageEnabled, setOiageEnabled] = useState(false);
  const [cred, setCred] = useState<CredentialForm>({
    ipatId: '', ipatUserCode: '', ipatPassword: '', ipatPin: '',
    spatMemberNumber: '', spatMemberId: '', spatPassword: '',
    betAmount: 100,
    betMode: 'manual',
    oiageBaseAmount: 1000, oiageTargetProfit: 10000, oiageMaxSteps: 5,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [subscriptionStatus, setSubscriptionStatus] = useState<'trial' | 'active' | 'expired' | 'suspended'>('trial');
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase
        .from('user_profiles')
        .select('auto_bet_enabled, ipat_credentials, spat4_credentials, settings, subscription_status')
        .eq('id', user.user.id)
        .single();
      if (data) {
        const sp = data.spat4_credentials ?? {};
        setSubscriptionStatus((data.subscription_status as typeof subscriptionStatus | null) ?? 'trial');
        // bet_mode は settings.bet_mode を優先。互換: auto_bet_enabled だけが true の旧データは sequential 扱い
        const savedMode = (data.settings?.bet_mode as BetMode | undefined)
          ?? (data.auto_bet_enabled ? 'sequential' : 'manual');
        setCred({
          ipatId: data.ipat_credentials?.inet_id ?? '',
          ipatUserCode: data.ipat_credentials?.user_cd ?? '',
          ipatPassword: data.ipat_credentials?.password ?? '',
          ipatPin: data.ipat_credentials?.pin ?? '',
          spatMemberNumber: norm(sp.member_number ?? sp.memberNumber ?? sp.user_id ?? ''),
          spatMemberId: norm(sp.member_id ?? sp.memberId ?? sp.password ?? ''),
          spatPassword: norm(sp.spat_password ?? sp.ansho ?? ''),
          betAmount: data.settings?.bet_amount ?? 100,
          betMode: savedMode,
          oiageBaseAmount: data.settings?.oiage?.baseAmount ?? 1000,
          oiageTargetProfit: data.settings?.oiage?.targetProfit ?? 10000,
          oiageMaxSteps: data.settings?.oiage?.maxSteps ?? 5,
        });
        setOiageEnabled(data.settings?.oiage?.enabled ?? false);
      }
      const { data: oiage } = await fetchActiveOiage(user.user.id, 8);
      if (oiage) {
        setOiageEnabled(oiage.is_active);
        setCred((p) => ({ ...p, oiageTargetProfit: oiage.target_profit }));
      }
      if (window.horsebet) {
        const v = await window.horsebet.getVersion();
        setAppVersion(v);
      }
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) { setSaving(false); return; }

    const { data: profile } = await supabase
      .from('user_profiles').select('settings').eq('id', user.user.id).single();
    const merged = {
      ...(profile?.settings ?? {}),
      bet_amount: cred.betAmount,
      bet_mode: cred.betMode,
      oiage: {
        enabled: oiageEnabled,
        baseAmount: cred.oiageBaseAmount,
        targetProfit: cred.oiageTargetProfit,
        maxSteps: cred.oiageMaxSteps,
      },
      role: profile?.settings?.role ?? 'user',
    };

    const { error } = await supabase.from('user_profiles').update({
      auto_bet_enabled: cred.betMode !== 'manual',
      ipat_credentials: {
        inet_id: cred.ipatId,
        user_cd: cred.ipatUserCode,
        password: cred.ipatPassword,
        pin: cred.ipatPin,
      },
      spat4_credentials: {
        member_number: norm(cred.spatMemberNumber),
        member_id: norm(cred.spatMemberId),
        spat_password: norm(cred.spatPassword),
        user_id: norm(cred.spatMemberNumber),
        password: norm(cred.spatMemberId),
      },
      settings: merged,
    }).eq('id', user.user.id);

    if (error) {
      setMessage(`エラー: ${error.message}`);
    } else {
      await upsertOiageState({
        userId: user.user.id, betType: 8, betTypeName: '3連単',
        targetProfit: cred.oiageTargetProfit, baseAmount: cred.oiageBaseAmount,
        maxSteps: cred.oiageMaxSteps, isActive: oiageEnabled,
      });
      setMessage('設定を保存しました');
    }
    setSaving(false);
  };

  return (
    <GzWindow title="競馬GANTZ" subtitle="SYSTEM SETTINGS">
      <MatrixBg density={10} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', overflowY: 'auto' }} className="gz-noscroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="gz-label">SYSTEM SETTINGS</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">
              ⚙ システム設定
            </div>
          </div>
          <button onClick={() => navigate('/')} className="gz-btn gz-btn-ghost">← 戻る</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1100 }}>
          {/* 01 投票モード */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative', gridColumn: '1 / -1' }}>
            <Corners />
            <div className="gz-label-strong">01 / BET MODE</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">投票モード</div>
            <p style={{ fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 6 }}>
              競馬GANTZ から配信を受信したときの動作を選びます
            </p>
            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {([
                { mode: 'manual',     title: '手動',           desc: 'GUI は購入しません。各レース 10 分前にメイン画面が切り替わるので、手動の購入ボタンで投票します。' },
                { mode: 'bulk',       title: '一気購入',       desc: '配信を受信した瞬間に当日全レースを即座に購入します。残高に余裕がある人向け。' },
                { mode: 'first_only', title: '早いレース1本', desc: '当日の最も早いレース 1 件だけを即座に購入します。試運用に最適。' },
                { mode: 'sequential', title: '順次購入',       desc: '各レースの発走 5 分前にレース毎に購入します。残高をレースごとに使う標準モード。' },
              ] as Array<{ mode: BetMode; title: string; desc: string }>).map((opt) => {
                const active = cred.betMode === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => setCred(p => ({ ...p, betMode: opt.mode }))}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      background: active ? 'rgba(0, 255, 130, 0.12)' : 'rgba(0, 20, 10, 0.4)',
                      border: `1px solid ${active ? 'var(--gz-green)' : 'var(--gz-line)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: active ? '0 0 18px var(--gz-green-glow)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span
                        style={{
                          fontFamily: 'var(--gz-display)',
                          fontWeight: 700,
                          letterSpacing: '0.1em',
                          fontSize: 16,
                          color: active ? 'var(--gz-green)' : 'var(--gz-text)',
                        }}
                        className={active ? 'gz-glow' : ''}
                      >
                        {opt.title}
                      </span>
                      {active && <span className="gz-badge"><span className="gz-dot" />ACTIVE</span>}
                    </div>
                    <p style={{
                      margin: 0, fontSize: 11, lineHeight: 1.6,
                      color: active ? 'var(--gz-text)' : 'var(--gz-text-muted)',
                    }}>
                      {opt.desc}
                    </p>
                  </button>
                );
              })}
            </div>
            <p style={{ marginTop: 14, fontSize: 11, color: 'var(--gz-text-muted)', lineHeight: 1.7 }}>
              ※ 自動モード(一気/早いレース1本/順次)は本アプリが起動中のみ動作します。PC を起動したままにしてください。
            </p>
          </section>

          {/* 01.5 BET AMOUNT */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">02 / BET AMOUNT</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">BET 金額</div>
            <p style={{ fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 6 }}>
              1 レース 1 馬券あたりの単勝 BET 金額（{BET_AMOUNT_MIN.toLocaleString()}〜{BET_AMOUNT_MAX.toLocaleString()}円）
            </p>
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--gz-display)', fontSize: 42, fontWeight: 900,
                color: 'var(--gz-green)', lineHeight: 1,
              }} className="gz-glow-strong">
                ¥{cred.betAmount.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', letterSpacing: '0.15em' }}>
                / RACE
              </span>
            </div>
            <input
              type="range"
              min={BET_AMOUNT_MIN}
              max={BET_AMOUNT_MAX}
              step={BET_AMOUNT_STEP}
              value={cred.betAmount}
              onChange={(e) => setCred(p => ({ ...p, betAmount: Number(e.target.value) }))}
              style={{
                width: '100%', marginTop: 14,
                accentColor: 'var(--gz-green)', cursor: 'pointer',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--gz-mono)', fontSize: 9, color: 'var(--gz-text-muted)', marginTop: 4 }}>
              <span>¥100</span>
              <span>¥1,000</span>
              <span>¥10,000</span>
              <span>¥50,000</span>
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[100, 500, 1000, 3000, 5000, 10000, 30000, 50000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setCred(p => ({ ...p, betAmount: preset }))}
                  className={`gz-btn ${cred.betAmount === preset ? '' : 'gz-btn-ghost'}`}
                  style={{ padding: '4px 10px', fontSize: 10 }}
                >
                  ¥{preset.toLocaleString()}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 12, lineHeight: 1.6 }}>
              ※ 自動 BET 時にこの金額で投票します(設計中)。手動投票時は配信の推奨額が優先されます。
            </p>
          </section>

          {/* 03 SPAT4 (地方競馬 = メイン) */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative', borderColor: 'var(--gz-line-strong)', boxShadow: '0 0 18px var(--gz-green-glow)' }}>
            <Corners />
            <div className="gz-label-strong">03 / SPAT4</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">SPAT4 認証情報 <span className="gz-badge" style={{ marginLeft: 8, fontSize: 9 }}>必須</span></div>
            <p style={{ fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              競馬GANTZ は <strong style={{ color: 'var(--gz-green)' }}>地方競馬専用</strong> サービスです。SPAT4 (NAR) の認証情報を必ず登録してください。
            </p>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>加入者番号</div>
                <input className="gz-input" value={cred.spatMemberNumber} onChange={(e) => setCred(p => ({ ...p, spatMemberNumber: e.target.value }))} placeholder="10桁" />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>利用者ID</div>
                <input type="password" className="gz-input" value={cred.spatMemberId} onChange={(e) => setCred(p => ({ ...p, spatMemberId: e.target.value }))} />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>暗証番号</div>
                <input type="password" className="gz-input" value={cred.spatPassword} onChange={(e) => setCred(p => ({ ...p, spatPassword: e.target.value }))} placeholder="4桁" />
              </label>
            </div>
          </section>

          {/* 04 IPAT (JRA = 補助) */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative', opacity: 0.85 }}>
            <Corners />
            <div className="gz-label-strong">04 / IPAT</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">IPAT 認証情報 <span className="gz-badge gz-badge-dim" style={{ marginLeft: 8, fontSize: 9 }}>任意</span></div>
            <p style={{ fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 6, lineHeight: 1.6 }}>
              中央競馬 (JRA) の配信が稀に来た時のみ使用。地方競馬専用運用なら登録不要。
            </p>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>加入者番号</div>
                <input className="gz-input" value={cred.ipatId} onChange={(e) => setCred(p => ({ ...p, ipatId: e.target.value }))} placeholder="P12345678" />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>ユーザーコード</div>
                <input className="gz-input" value={cred.ipatUserCode} onChange={(e) => setCred(p => ({ ...p, ipatUserCode: e.target.value }))} placeholder="4桁" />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>パスワード</div>
                <input type="password" className="gz-input" value={cred.ipatPassword} onChange={(e) => setCred(p => ({ ...p, ipatPassword: e.target.value }))} />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>暗証番号 PIN</div>
                <input type="password" className="gz-input" value={cred.ipatPin} onChange={(e) => setCred(p => ({ ...p, ipatPin: e.target.value }))} placeholder="4桁" />
              </label>
            </div>
          </section>

          {/* 04 SUBSCRIPTION + VERSION */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">04 / SUBSCRIPTION</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">サブスクリプション</div>
            <div style={{ marginTop: 14 }}>
              <span className={`gz-badge ${subscriptionStatus === 'expired' || subscriptionStatus === 'suspended' ? 'gz-badge-red' : ''}`}>
                ● {subscriptionStatus.toUpperCase()}
              </span>
            </div>
            <div className="gz-divider" />
            <div className="gz-label-strong">05 / VERSION</div>
            <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-dim)', marginTop: 8, lineHeight: 1.7 }}>
              <div>App: <span style={{ color: 'var(--gz-green)' }}>v{appVersion || '—'}</span></div>
              <div>GANTZ Engine: <span style={{ color: 'var(--gz-green)' }}>● ONLINE</span></div>
              <div>投票ブラウザ: <span style={{ color: 'var(--gz-green)' }}>● READY</span></div>
            </div>
          </section>

          {/* 06 OIAGE (追い上げ) */}
          <section className="gz-panel" style={{ padding: 22, position: 'relative', gridColumn: '1 / -1' }}>
            <Corners />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="gz-label-strong">06 / OIAGE</div>
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">追い上げ設定 (3連単)</div>
                <p style={{ fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 4 }}>
                  GANTZ 単勝運用では使用しません
                </p>
              </div>
              <div
                className={`gz-switch ${oiageEnabled ? 'on' : ''}`}
                onClick={() => setOiageEnabled(!oiageEnabled)}
                role="button"
                style={{ width: 64, height: 28 }}
              />
            </div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>ベース金額</div>
                <input type="number" min={100} step={100} className="gz-input" value={cred.oiageBaseAmount} onChange={(e) => setCred(p => ({ ...p, oiageBaseAmount: Number(e.target.value) }))} />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>目標利益額</div>
                <input type="number" min={1000} step={500} className="gz-input" value={cred.oiageTargetProfit} onChange={(e) => setCred(p => ({ ...p, oiageTargetProfit: Number(e.target.value) }))} />
              </label>
              <label>
                <div className="gz-label" style={{ marginBottom: 4 }}>最大ステップ数</div>
                <input type="number" min={1} max={10} className="gz-input" value={cred.oiageMaxSteps} onChange={(e) => setCred(p => ({ ...p, oiageMaxSteps: Number(e.target.value) }))} />
              </label>
            </div>
          </section>
        </div>

        {message && (
          <div
            style={{
              marginTop: 20, padding: '10px 14px',
              border: `1px solid ${message.startsWith('エラー') ? 'var(--gz-red)' : 'var(--gz-green)'}`,
              color: message.startsWith('エラー') ? 'var(--gz-red)' : 'var(--gz-green)',
              fontFamily: 'var(--gz-mono)', fontSize: 12,
              maxWidth: 1100,
              background: message.startsWith('エラー') ? 'rgba(255,60,60,0.08)' : 'rgba(0,255,130,0.05)',
            }}
          >
            {message}
          </div>
        )}

        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={handleSave} disabled={saving} className="gz-btn gz-btn-primary">
            {saving ? '保存中…' : '設定を保存'}
          </button>
          <button onClick={() => navigate('/')} className="gz-btn gz-btn-ghost">キャンセル</button>
        </div>
      </div>
    </GzWindow>
  );
}
