// ログイン、設定、履歴、通知、レース一覧の補助画面群
function LoginScreen() {
  return (
    <GzWindow title="競馬GANTZ" subtitle="AUTH / SIGN IN" w={1440} h={920} live={false}>
      <MatrixBg density={30} />
      <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'absolute', left: 60, top: '50%', transform: 'translateY(-50%)' }}>
          <Vertical style={{ fontSize: 16, color: 'var(--gz-green)', opacity: 0.5 }} className="gz-glow">データが導く勝利</Vertical>
        </div>
        <div style={{ position: 'absolute', right: 60, top: '50%', transform: 'translateY(-50%)' }}>
          <Vertical style={{ fontSize: 16, color: 'var(--gz-green)', opacity: 0.5 }} className="gz-glow">未来を予測せよ</Vertical>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 80 }}>
          <Orb size={420} pulsing>
            <div className="gz-label" style={{ color: 'var(--gz-green)', opacity: 0.7 }}>HORSEBET AI</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 64, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">競馬GANTZ</div>
            <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 8, letterSpacing: '0.2em' }}>AI PREDICTIVE BETTING SYSTEM</div>
          </Orb>

          <div style={{ width: 380 }}>
            <div className="gz-label-strong">SECURE TERMINAL ACCESS</div>
            <div style={{ fontFamily: 'var(--gz-display)', fontSize: 32, fontWeight: 900, color: 'var(--gz-text)', marginTop: 4, letterSpacing: '0.1em' }} className="gz-glow">SIGN IN</div>
            <div className="gz-divider" />
            <div style={{ marginBottom: 14 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>USER ID</div>
              <input className="gz-input" defaultValue="jin.sansan" />
            </div>
            <div style={{ marginBottom: 22 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>PASSWORD</div>
              <input className="gz-input" type="password" defaultValue="●●●●●●●●●●" />
            </div>
            <a href="dashboard.html" className="gz-btn gz-btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', textDecoration: 'none' }}>
              AUTHENTICATE →
            </a>
            <div style={{ marginTop: 18, fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', lineHeight: 1.7 }}>
              <div>● SUPABASE AUTH READY</div>
              <div>● SSL/TLS VERIFIED</div>
              <div>● SESSION TIMEOUT: 24H</div>
            </div>
          </div>
        </div>
      </div>
    </GzWindow>
  );
}

function RaceListScreen() {
  const races = window.MOCK_RACES;
  return (
    <GzWindow title="競馬GANTZ" subtitle="RACE LIST / 本日の配信" w={1440} h={920}>
      <MatrixBg density={14} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
          <div>
            <div className="gz-label">RACE LIST · 2026.04.26</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">本日の配信レース</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="gz-badge"><span className="gz-dot" />LIVE</span>
            <span className="gz-badge">JRA 1</span>
            <span className="gz-badge">NAR 5</span>
            <span className="gz-badge gz-badge-amber">予約 4</span>
            <a href="dashboard.html" className="gz-btn gz-btn-ghost">← ダッシュボード</a>
          </div>
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, overflowY: 'auto' }} className="gz-noscroll">
          {races.map(r => (
            <a key={r.id} href="race-detail.html" className="gz-panel gz-card-hover" style={{ padding: 18, position: 'relative', textDecoration: 'none', color: 'inherit' }}>
              <Corners />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div className="gz-label">{r.race_type} · {r.start_time}</div>
                  <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 26, fontWeight: 700, color: 'var(--gz-text)', marginTop: 4 }} className="gz-glow">
                    {r.jo_name}<span style={{ color: 'var(--gz-green)', marginLeft: 6 }}>{r.race_no}R</span>
                  </div>
                  <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 14, color: 'var(--gz-green)', fontWeight: 700, marginTop: 4 }}>{r.race_name || '—'}</div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 4 }}>{r.distance} · {r.total_horses}頭</div>
                </div>
                <span className={`gz-badge ${r.schedule === 'submitted' ? '' : r.schedule === 'scheduled' ? 'gz-badge-amber' : 'gz-badge-dim'}`}>
                  {r.schedule}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
                <Orb size={90}>
                  <div style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">{r.kaime_data[0]}</div>
                </Orb>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 18, fontWeight: 700, color: 'var(--gz-green)' }} className="gz-glow">{r.horse_name}</div>
                  <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)' }}>{r.jockey} · {r.popularity}人気</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 6 }}>
                    <span style={{ fontFamily: 'var(--gz-display)', fontSize: 32, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">{r.ai_prob.toFixed(1)}</span>
                    <span style={{ color: 'var(--gz-green)' }}>%</span>
                    <span className="gz-label" style={{ marginLeft: 6 }}>AI</span>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--gz-line)', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--gz-mono)', fontSize: 10 }}>
                <span style={{ color: 'var(--gz-text-muted)' }}>一致 {r.consensus} {r.engines}</span>
                <span style={{ color: 'var(--gz-amber)' }}>発射 {r.fire_at}</span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </GzWindow>
  );
}

function RaceDetailScreen() {
  const r = window.MOCK_RACES[0]; // 東京11R 天皇賞
  return (
    <GzWindow title="競馬GANTZ" subtitle="RACE DETAIL" w={1440} h={920}>
      <MatrixBg density={14} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', overflowY: 'auto' }} className="gz-noscroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 18 }}>
          <a href="race-list.html" className="gz-btn gz-btn-ghost">← レース一覧</a>
          <span className="gz-badge"><span className="gz-dot" />SCHEDULED · 15:35 発射</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>
          <div>
            <div className="gz-label">{r.race_type} · {r.distance} · {r.total_horses}頭 · {r.start_time}</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 56, fontWeight: 900, color: 'var(--gz-text)', lineHeight: 1 }} className="gz-glow">
              {r.jo_name} <span style={{ color: 'var(--gz-green)' }}>{r.race_no}R</span>
            </div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 32, color: 'var(--gz-green)', fontWeight: 700, marginTop: 8 }} className="gz-glow-strong">{r.race_name}</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginTop: 28 }}>
              {[
                ['AI 予測確率', `${r.ai_prob.toFixed(1)}%`, 'var(--gz-green)'],
                ['一致エンジン', r.consensus, 'var(--gz-green)'],
                ['人気', `${r.popularity}人気`, 'var(--gz-text)'],
                ['推定上がり3F', `${r.estimated_3f}秒`, 'var(--gz-amber)'],
              ].map(([k, v, c]) => (
                <div key={k} className="gz-panel gz-panel-glow" style={{ padding: 14, position: 'relative' }}>
                  <Corners />
                  <div className="gz-label">{k}</div>
                  <div style={{ fontFamily: 'var(--gz-display)', fontSize: 28, fontWeight: 900, color: c, marginTop: 6 }} className="gz-glow">{v}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="gz-label-strong" style={{ marginBottom: 12 }}>レースデータ解析 (D-Logic Engine)</div>
              <div className="gz-panel" style={{ padding: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
                  <div>
                    <DataBar label="SPEED" value={95} />
                    <DataBar label="STAMINA" value={90} />
                    <DataBar label="瞬発力" value={88} />
                    <DataBar label="持続力" value={84} />
                    <DataBar label="安定性" value={92} />
                  </div>
                  <div>
                    <DataBar label="馬場" value={85} color="var(--gz-amber)" />
                    <DataBar label="距離適性" value={91} color="var(--gz-amber)" />
                    <DataBar label="斤量" value={78} color="var(--gz-amber)" />
                    <DataBar label="ローテ" value={82} color="var(--gz-amber)" />
                    <DataBar label="調子" value={89} color="var(--gz-amber)" />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 28 }}>
              <div className="gz-label-strong" style={{ marginBottom: 12 }}>出走表 / オッズ</div>
              <table className="gz-table">
                <thead><tr><th>馬</th><th>馬名</th><th>騎手</th><th>人気</th><th>オッズ</th><th>AI%</th><th>選択</th></tr></thead>
                <tbody>
                  {[1,2,3,4,5,6,7,8].map(n => {
                    const sel = n === parseInt(r.kaime_data[0]);
                    return (
                      <tr key={n} style={{ background: sel ? 'rgba(0,255,130,0.1)' : 'transparent' }}>
                        <td style={{ color: sel ? 'var(--gz-green)' : 'var(--gz-text)', fontWeight: 700, fontSize: 14 }}>{n}</td>
                        <td style={{ fontFamily: 'var(--gz-jp)' }}>{sel ? r.horse_name : ['キタサンミラージュ','ゴールデンシップ','テスタロッサ','ミスターハヤブサ','ヴィクトワール','エクリプス','タイタンXII'][n - 1] || `馬${n}`}</td>
                        <td>{sel ? r.jockey : ['川田', '武豊', 'M.デムーロ', '横山典', '横山武', '戸崎', '岩田望'][n - 1]}</td>
                        <td>{n === 1 ? 1 : n === 7 ? 3 : n + 2}</td>
                        <td>{(2.1 + n * 1.4).toFixed(1)}</td>
                        <td style={{ color: sel ? 'var(--gz-green)' : 'var(--gz-text-dim)' }}>{sel ? r.ai_prob.toFixed(1) : (Math.random() * 50 + 20).toFixed(1)}</td>
                        <td>{sel ? <span className="gz-badge">★ TARGET</span> : <span style={{ color: 'var(--gz-text-muted)' }}>—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <aside>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <Orb size={280} pulsing>
                <div className="gz-label" style={{ color: 'var(--gz-green)' }}>{r.bet_type_name} TARGET</div>
                <div style={{ fontFamily: 'var(--gz-display)', fontSize: 100, fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1, marginTop: 6 }} className="gz-glow-strong">{r.kaime_data[0]}</div>
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 18, color: 'var(--gz-text)', fontWeight: 700, marginTop: 6 }} className="gz-glow">{r.horse_name}</div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 4 }}>¥{r.suggested_amount} · {r.popularity}人気</div>
              </Orb>
            </div>
            <div className="gz-panel" style={{ padding: 14, marginBottom: 14 }}>
              <div className="gz-label" style={{ marginBottom: 6 }}>GANTZ NOTE</div>
              <pre style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-dim)', whiteSpace: 'pre-wrap', margin: 0 }}>{r.note}</pre>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="gz-btn gz-btn-primary" style={{ justifyContent: 'center', padding: '14px' }}>手動で投票 ¥{r.suggested_amount}</button>
              <button className="gz-btn gz-btn-ghost" style={{ justifyContent: 'center' }}>自動投票を取消</button>
            </div>
          </aside>
        </div>
      </div>
    </GzWindow>
  );
}

function SettingsScreen() {
  const [autoBet, setAutoBet] = React.useState(true);
  return (
    <GzWindow title="競馬GANTZ" subtitle="SYSTEM SETTINGS" w={1440} h={920}>
      <MatrixBg density={10} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', overflowY: 'auto' }} className="gz-noscroll">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div className="gz-label">SYSTEM SETTINGS</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">⚙ システム設定</div>
          </div>
          <a href="dashboard.html" className="gz-btn gz-btn-ghost">← 戻る</a>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 1100 }}>
          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">01 / AUTO BET</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">自動投票</div>
            <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className={`gz-switch ${autoBet ? 'on' : ''}`} onClick={() => setAutoBet(!autoBet)} style={{ width: 64, height: 28 }} role="button" />
              <div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 14, color: autoBet ? 'var(--gz-green)' : 'var(--gz-text-muted)', fontWeight: 700 }}>{autoBet ? 'ARMED · ON' : 'OFF'}</div>
                <div style={{ fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 2 }}>GANTZ 配信を発走5分前に自動投票します</div>
              </div>
            </div>
            <p style={{ marginTop: 18, fontSize: 11, color: 'var(--gz-text-muted)', lineHeight: 1.7 }}>
              ※ 本アプリが起動中のみ動作します。PC を起動したままにしてください。
            </p>
          </section>

          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">02 / IPAT (JRA)</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">IPAT 認証情報</div>
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>加入者番号</div><input className="gz-input" defaultValue="P12345678" /></label>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>ユーザーコード</div><input className="gz-input" defaultValue="●●●●" /></label>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>パスワード</div><input className="gz-input" type="password" defaultValue="●●●●●●●●" /></label>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>暗証番号 PIN</div><input className="gz-input" type="password" defaultValue="●●●●" /></label>
            </div>
          </section>

          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">03 / SPAT4 (NAR)</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">SPAT4 認証情報</div>
            <p style={{ fontSize: 10, color: 'var(--gz-text-muted)', marginTop: 6 }}>GANTZ 配信は地方競馬中心のため必須</p>
            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>加入者番号</div><input className="gz-input" defaultValue="0001234567" /></label>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>利用者ID</div><input className="gz-input" type="password" defaultValue="●●●●●●" /></label>
              <label><div className="gz-label" style={{ marginBottom: 4 }}>暗証番号</div><input className="gz-input" type="password" defaultValue="●●●●" /></label>
            </div>
          </section>

          <section className="gz-panel" style={{ padding: 22, position: 'relative' }}>
            <Corners />
            <div className="gz-label-strong">04 / SUBSCRIPTION</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, fontWeight: 700, marginTop: 4 }} className="gz-glow">サブスクリプション</div>
            <div style={{ marginTop: 14 }}>
              <span className="gz-badge">● ACTIVE</span>
              <div style={{ fontFamily: 'var(--gz-display)', fontSize: 24, fontWeight: 900, color: 'var(--gz-green)', marginTop: 8 }} className="gz-glow">¥9,800<span style={{ fontSize: 12 }}>/月</span></div>
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 4 }}>次回更新: 2026.05.15</div>
            </div>
            <div className="gz-divider" />
            <div className="gz-label-strong">05 / VERSION</div>
            <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-dim)', marginTop: 8, lineHeight: 1.7 }}>
              <div>App: <span style={{ color: 'var(--gz-green)' }}>v2.6.0</span></div>
              <div>D-Logic Engine: <span style={{ color: 'var(--gz-green)' }}>v2.6.0</span></div>
              <div>Playwright: <span style={{ color: 'var(--gz-green)' }}>● READY</span></div>
            </div>
          </section>
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button className="gz-btn gz-btn-primary">設定を保存</button>
          <button className="gz-btn gz-btn-ghost">キャンセル</button>
        </div>
      </div>
    </GzWindow>
  );
}

function HistoryScreen() {
  const h = window.MOCK_HISTORY;
  const totalIn = h.reduce((s, x) => s + x.amount, 0);
  const totalOut = h.reduce((s, x) => s + x.payout, 0);
  const wins = h.filter(x => x.result === 'win').length;
  return (
    <GzWindow title="競馬GANTZ" subtitle="BET HISTORY / 履歴・収支" w={1440} h={920}>
      <MatrixBg density={12} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="gz-label">BET HISTORY · 直近30日</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">履歴 / 収支</div>
          </div>
          <a href="dashboard.html" className="gz-btn gz-btn-ghost">← ダッシュボード</a>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            ['総投票数', `${h.length}件`, 'var(--gz-text)'],
            ['的中', `${wins}件`, 'var(--gz-green)'],
            ['的中率', `${((wins / h.length) * 100).toFixed(1)}%`, 'var(--gz-green)'],
            ['回収率', `${((totalOut / totalIn) * 100).toFixed(1)}%`, 'var(--gz-amber)'],
          ].map(([k, v, c]) => (
            <div key={k} className="gz-panel gz-panel-glow" style={{ padding: 18, position: 'relative' }}>
              <Corners />
              <div className="gz-label">{k}</div>
              <div style={{ fontFamily: 'var(--gz-display)', fontSize: 38, fontWeight: 900, color: c, marginTop: 6 }} className="gz-glow-strong">{v}</div>
            </div>
          ))}
        </div>

        <div className="gz-panel" style={{ padding: 18, marginBottom: 20 }}>
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>収支推移 (10日)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 100 }}>
            {[-200, +180, +320, -100, +460, +290, -150, +380, +220, +540].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{
                  width: '100%',
                  height: `${Math.abs(v) / 6}px`,
                  background: v > 0 ? 'var(--gz-green)' : 'var(--gz-red)',
                  boxShadow: v > 0 ? '0 0 10px var(--gz-green)' : '0 0 10px var(--gz-red)',
                  alignSelf: v > 0 ? 'flex-end' : 'flex-start',
                }} />
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 9, color: 'var(--gz-text-muted)', marginTop: 4 }}>D-{9 - i}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="gz-panel" style={{ flex: 1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowY: 'auto' }} className="gz-noscroll">
            <table className="gz-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'rgba(2,12,7,0.95)' }}>
                <tr><th>日付</th><th>会場</th><th>R</th><th>馬</th><th>オッズ</th><th>投票額</th><th>結果</th><th>払戻</th><th>差引</th></tr>
              </thead>
              <tbody>
                {h.map((x, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--gz-text-muted)' }}>{x.date}</td>
                    <td>{x.venue}</td>
                    <td style={{ color: 'var(--gz-green)' }}>{x.race}R</td>
                    <td style={{ fontFamily: 'var(--gz-jp)' }}>{x.horse}</td>
                    <td>{x.odds.toFixed(1)}</td>
                    <td>¥{x.amount}</td>
                    <td><span className={`gz-badge ${x.result === 'win' ? '' : 'gz-badge-red'}`}>{x.result === 'win' ? '的中' : '不的中'}</span></td>
                    <td style={{ color: x.payout > 0 ? 'var(--gz-amber)' : 'var(--gz-text-muted)', fontWeight: 700 }}>¥{x.payout}</td>
                    <td style={{ color: x.payout - x.amount > 0 ? 'var(--gz-green)' : 'var(--gz-red)', fontWeight: 700 }}>{x.payout - x.amount > 0 ? '+' : ''}¥{x.payout - x.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </GzWindow>
  );
}

function NotificationsScreen() {
  const ns = [...window.MOCK_NOTIFICATIONS, ...window.MOCK_NOTIFICATIONS.map((n, i) => ({ ...n, id: 100 + i, time: '昨日' }))];
  return (
    <GzWindow title="競馬GANTZ" subtitle="NOTIFICATIONS / 通知" w={1440} h={920}>
      <MatrixBg density={12} />
      <div style={{ position: 'relative', padding: '24px 32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div className="gz-label">NOTIFICATIONS · 全{ns.length}件</div>
            <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 900 }} className="gz-glow">通知 / イベントログ</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="gz-badge"><span className="gz-dot" />LIVE FEED</span>
            <a href="dashboard.html" className="gz-btn gz-btn-ghost">← 戻る</a>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 24, flex: 1, overflow: 'hidden' }}>
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div className="gz-label-strong" style={{ marginBottom: 6 }}>FILTER</div>
            {['すべて', '投票実行', '配信受信', '的中', 'システム', 'エラー'].map((t, i) => (
              <button key={i} className={`gz-btn ${i === 0 ? '' : 'gz-btn-ghost'}`} style={{ justifyContent: 'flex-start', width: '100%' }}>
                {t}
              </button>
            ))}
          </aside>

          <div className="gz-panel" style={{ padding: 0, overflowY: 'auto' }}>
            <div className="gz-noscroll">
              {ns.map((n, i) => (
                <div key={i} style={{ padding: '14px 18px', borderBottom: '1px solid var(--gz-line)', display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    border: `1px solid ${n.severity === 'win' ? 'var(--gz-amber)' : 'var(--gz-green)'}`,
                    background: 'rgba(0,15,8,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--gz-mono)', fontSize: 10,
                    color: n.severity === 'win' ? 'var(--gz-amber)' : 'var(--gz-green)',
                    boxShadow: n.severity === 'win' ? '0 0 10px var(--gz-amber)' : '0 0 8px var(--gz-green-glow)',
                  }}>
                    {n.type === 'win' ? '★' : n.type === 'fire' ? '⚡' : n.type === 'submitted' ? '✓' : n.type === 'signal' ? '◈' : '◉'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="gz-label-strong">{n.type.toUpperCase()}</span>
                      <span style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)' }}>{n.time}</span>
                    </div>
                    <div style={{ fontSize: 14, color: n.severity === 'win' ? 'var(--gz-amber)' : 'var(--gz-text)', marginTop: 4 }} className={n.severity === 'win' ? 'gz-glow' : ''}>{n.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GzWindow>
  );
}

Object.assign(window, { LoginScreen, RaceListScreen, RaceDetailScreen, SettingsScreen, HistoryScreen, NotificationsScreen });
