// 案A: 球体センターステージ型ダッシュボード — 添付画像の世界観を全画面で踏襲
const { useState: useStateA } = React;

function DashboardA({ initialRaceId = 1 }) {
  const [selectedId, setSelectedId] = useStateA(initialRaceId);
  const [autoBet, setAutoBet] = useStateA(true);
  const [betting, setBetting] = useStateA(null);
  const races = window.MOCK_RACES;
  const selected = races.find(r => r.id === selectedId) || races[0];

  const handleBet = (id) => {
    setBetting(id);
    setTimeout(() => setBetting(null), 2200);
  };

  return (
    <GzWindow title="競馬GANTZ" subtitle="DASHBOARD / ORB MODE" w={1440} h={920}>
      <MatrixBg density={26} />
      <div style={{ position: 'relative', height: '100%', display: 'grid', gridTemplateColumns: '280px 1fr 280px', gap: 0 }}>
        {/* 左サイドバー: レース一覧 */}
        <aside style={{ borderRight: '1px solid var(--gz-line)', padding: '20px 16px', overflowY: 'auto', position: 'relative', background: 'linear-gradient(90deg, rgba(0,20,10,0.6), transparent)' }} className="gz-noscroll">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span className="gz-label-strong">SIGNALS / 配信</span>
            <span className="gz-badge"><span className="gz-dot" />{races.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {races.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`gz-panel gz-card-hover ${r.id === selectedId ? 'active' : ''}`}
                style={{ padding: 12, textAlign: 'left', cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', letterSpacing: '0.1em' }}>
                      {r.race_type} · {r.start_time}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gz-text)', marginTop: 2 }}>
                      {r.jo_name} {r.race_no}R
                    </div>
                  </div>
                  <span className={`gz-badge ${r.schedule === 'submitted' ? '' : r.schedule === 'scheduled' ? 'gz-badge-amber' : 'gz-badge-dim'}`} style={{ fontSize: 9 }}>
                    {r.schedule === 'submitted' ? '済' : r.schedule === 'scheduled' ? '予約' : '待機'}
                  </span>
                </div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-green)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.bet_type_name} {r.kaime_data[0]}番</span>
                  <span style={{ color: 'var(--gz-text-muted)' }}>P{r.popularity} · {r.ai_prob.toFixed(1)}%</span>
                </div>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <div className="gz-divider" />
            <div className="gz-label" style={{ marginBottom: 8 }}>NAV</div>
            <a href="race-list.html" className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>レース一覧</a>
            <a href="history.html" className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>履歴 / 収支</a>
            <a href="settings.html" className="gz-btn gz-btn-ghost" style={{ width: '100%', justifyContent: 'center' }}>設定</a>
          </div>
        </aside>

        {/* 中央: メインオーブ */}
        <section style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          {/* 上部ヘッダー */}
          <header style={{ padding: '20px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--gz-line)' }}>
            <div>
              <div className="gz-label">WELCOME · 会員</div>
              <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--gz-display)', letterSpacing: '0.15em', marginTop: 2 }} className="gz-glow">
                JIN.SAN <span style={{ color: 'var(--gz-text-muted)', fontSize: 12 }}>· ACTIVE</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: '1px solid var(--gz-line)', background: 'rgba(0,20,10,0.6)' }}>
                <span className="gz-label">AUTO BET</span>
                <div className={`gz-switch ${autoBet ? 'on' : ''}`} onClick={() => setAutoBet(!autoBet)} role="button" />
                <span style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: autoBet ? 'var(--gz-green)' : 'var(--gz-text-muted)' }}>{autoBet ? 'ARMED' : 'OFF'}</span>
              </div>
              <a href="notifications.html" className="gz-badge" style={{ padding: '8px 12px', textDecoration: 'none' }}>
                <span className="gz-dot" />通知 6
              </a>
            </div>
          </header>

          {/* HUD レイアウト */}
          <div style={{ flex: 1, position: 'relative', padding: '20px 30px' }}>
            <Corners />
            {/* 左上: レース基本 */}
            <div style={{ position: 'absolute', top: 30, left: 30, width: 200 }}>
              <div className="gz-label">VENUE / 会場</div>
              <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 36, fontWeight: 700, color: 'var(--gz-text)', lineHeight: 1, marginTop: 4 }} className="gz-glow">
                {selected.jo_name}<span style={{ fontSize: 18, color: 'var(--gz-green)', marginLeft: 6 }}>{selected.race_no}R</span>
              </div>
              {selected.race_name && (
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, color: 'var(--gz-green)', fontWeight: 700, marginTop: 6 }} className="gz-glow-strong">
                  {selected.race_name}
                </div>
              )}
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 8, letterSpacing: '0.1em' }}>
                {selected.race_type} · {selected.distance} · 出走{selected.total_horses}頭
              </div>
              <div style={{ marginTop: 18 }}>
                <div className="gz-label">推定上がり3F</div>
                <div style={{ fontSize: 42, fontFamily: 'var(--gz-display)', fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1 }} className="gz-glow-strong">
                  {selected.estimated_3f}
                </div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 9, color: 'var(--gz-text-muted)', letterSpacing: '0.2em' }}>TOP SPEED ESTIMATE</div>
              </div>
              <div style={{ marginTop: 18 }}>
                <div className="gz-label" style={{ marginBottom: 6 }}>レースデータ解析</div>
                <DataBar label="SPEED" value={selected.speed === 'S' ? 95 : selected.speed === 'A+' ? 90 : 84} />
                <DataBar label="STAMINA" value={selected.stamina === 'A+' ? 90 : selected.stamina === 'A' ? 84 : 76} />
                <DataBar label="瞬発力" value={88} />
                <DataBar label="持続力" value={82} />
                <DataBar label="安定性" value={selected.consensus === '4/4' ? 92 : 76} />
              </div>
            </div>

            {/* 右上: AI予測 + オッズ */}
            <div style={{ position: 'absolute', top: 30, right: 30, width: 220, textAlign: 'right' }}>
              <div className="gz-label">AI 予測確率</div>
              <div style={{ fontSize: 56, fontFamily: 'var(--gz-display)', fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1, marginTop: 4 }} className="gz-glow-strong">
                {selected.ai_prob.toFixed(1)}<span style={{ fontSize: 28 }}>%</span>
              </div>
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-muted)', letterSpacing: '0.2em', marginTop: 2 }}>
                CONSENSUS {selected.consensus} · {selected.engines}
              </div>
              <div style={{ marginTop: 22 }}>
                <div className="gz-label" style={{ marginBottom: 6 }}>オッズ (単勝)</div>
                <table style={{ marginLeft: 'auto', fontFamily: 'var(--gz-mono)', fontSize: 13, color: 'var(--gz-text)' }}>
                  <tbody>
                    {selected.odds.win.map((o, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--gz-text-muted)', paddingRight: 16 }}>{i + 1}</td>
                        <td style={{ color: i + 1 === selected.popularity ? 'var(--gz-green)' : 'var(--gz-text)', fontWeight: i + 1 === selected.popularity ? 700 : 400 }}>{o.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 22 }}>
                <div className="gz-label" style={{ marginBottom: 6 }}>的中確率</div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 12, color: 'var(--gz-green)', textAlign: 'right', lineHeight: 1.7 }}>
                  <div>過去同条件 <span style={{ color: 'var(--gz-text)' }}>{selected.ai_prob.toFixed(1)}%</span></div>
                  <div>直近30日 <span style={{ color: 'var(--gz-text)' }}>{(selected.ai_prob - 15).toFixed(1)}%</span></div>
                  <div>同距離 <span style={{ color: 'var(--gz-text)' }}>{(selected.ai_prob - 8).toFixed(1)}%</span></div>
                  <div style={{ color: 'var(--gz-amber)' }}>+{(selected.ai_prob - 40).toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* 中央オーブ */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}>
              <Orb size={420} pulsing>
                <div className="gz-label" style={{ color: 'var(--gz-green)', opacity: 0.6 }}>{selected.bet_type_name} / TARGET</div>
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 64, fontWeight: 900, color: 'var(--gz-green)', lineHeight: 1, marginTop: 6 }} className="gz-glow-strong">
                  競馬GANTZ
                </div>
                <div style={{ marginTop: 22, display: 'flex', alignItems: 'baseline', gap: 12, justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--gz-display)', fontSize: 92, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 0 30px var(--gz-green), 0 0 8px var(--gz-green)' }}>
                    {selected.kaime_data[0]}
                  </span>
                  <span style={{ fontSize: 18, color: 'var(--gz-green)' }}>番</span>
                </div>
                <div style={{ fontFamily: 'var(--gz-jp-serif)', fontSize: 22, color: 'var(--gz-text)', fontWeight: 700, marginTop: 8 }} className="gz-glow">
                  {selected.horse_name}
                </div>
                <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', marginTop: 6, letterSpacing: '0.1em' }}>
                  {selected.popularity}人気 · ¥{selected.suggested_amount}
                </div>
              </Orb>
            </div>

            {/* 左下: 騎手・調教師 */}
            <div style={{ position: 'absolute', bottom: 30, left: 30, width: 240 }}>
              <Vertical style={{ position: 'absolute', left: -22, top: -110, fontSize: 14, color: 'var(--gz-green)', opacity: 0.6 }} className="gz-glow">
                データが導く勝利
              </Vertical>
              <div className="gz-label" style={{ marginBottom: 6 }}>騎手 / 調教師</div>
              <table className="gz-table" style={{ width: '100%' }}>
                <tbody>
                  <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>騎手</td><td style={{ color: 'var(--gz-green)', fontWeight: 700 }}>{selected.jockey}</td></tr>
                  <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>調教師</td><td>{selected.trainer}</td></tr>
                  <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>距離</td><td>{selected.distance}</td></tr>
                  <tr><td style={{ color: 'var(--gz-text-muted)', paddingLeft: 0 }}>コース</td><td>{selected.course}</td></tr>
                </tbody>
              </table>
            </div>

            {/* 右下: コース図 + 過去10走 */}
            <div style={{ position: 'absolute', bottom: 30, right: 30, width: 240 }}>
              <Vertical style={{ position: 'absolute', right: -22, top: -110, fontSize: 14, color: 'var(--gz-green)', opacity: 0.6 }} className="gz-glow">
                未来を予測せよ
              </Vertical>
              <div className="gz-label" style={{ marginBottom: 6, textAlign: 'right' }}>過去10走 / 1着分布</div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10, justifyContent: 'flex-end' }}>
                {[1,2,3,4,5,6,7,8,9,10].map(i => {
                  const win = [1, 3, 5, 6, 9].includes(i);
                  return (
                    <div key={i} style={{
                      width: 18, height: 24,
                      background: win ? 'var(--gz-green)' : 'rgba(0,255,130,0.1)',
                      border: '1px solid var(--gz-green-dim)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontFamily: 'var(--gz-mono)',
                      color: win ? '#000' : 'var(--gz-text-muted)',
                      fontWeight: 700,
                      boxShadow: win ? '0 0 6px var(--gz-green)' : 'none',
                    }}>{win ? '1' : '—'}</div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 }}>
                <HorseSvg size={70} />
                <CourseTrack size={80} label={selected.course} />
              </div>
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)', textAlign: 'right' }}>
                {selected.distance} · コース{selected.course}
              </div>
            </div>
          </div>

          {/* 下部アクションバー */}
          <footer style={{ padding: '16px 32px', borderTop: '1px solid var(--gz-line)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(0deg, rgba(0,20,10,0.6), transparent)' }}>
            <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, color: 'var(--gz-text-muted)' }}>
              <span className="gz-dot" style={{ marginRight: 8 }} />
              発射予定: <span style={{ color: 'var(--gz-amber)' }}>{selected.fire_at}</span> / 発走 {selected.start_time} / {selected.schedule.toUpperCase()}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="gz-btn gz-btn-ghost">取消</button>
              <button className="gz-btn">レース詳細</button>
              <button
                className="gz-btn gz-btn-primary"
                onClick={() => handleBet(selected.id)}
                disabled={betting === selected.id}
              >
                {betting === selected.id ? '投票中...' : `手動で投票 ¥${selected.suggested_amount}`}
              </button>
            </div>
          </footer>
        </section>

        {/* 右サイドバー: 通知 + 収支 */}
        <aside style={{ borderLeft: '1px solid var(--gz-line)', padding: '20px 16px', overflowY: 'auto', background: 'linear-gradient(270deg, rgba(0,20,10,0.6), transparent)' }} className="gz-noscroll">
          <div className="gz-label-strong" style={{ marginBottom: 14 }}>本日の成績</div>
          <div className="gz-panel gz-panel-glow" style={{ padding: 14, marginBottom: 16, position: 'relative' }}>
            <Corners />
            <div className="gz-label">的中率</div>
            <div style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)' }} className="gz-glow-strong">
              60.0<span style={{ fontSize: 18 }}>%</span>
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 12, fontFamily: 'var(--gz-mono)', fontSize: 11 }}>
              <div><span className="gz-label">投票</span><div style={{ color: 'var(--gz-text)', fontSize: 16 }}>5件</div></div>
              <div><span className="gz-label">的中</span><div style={{ color: 'var(--gz-green)', fontSize: 16 }}>3件</div></div>
              <div><span className="gz-label">回収率</span><div style={{ color: 'var(--gz-amber)', fontSize: 16 }}>+38.7%</div></div>
            </div>
          </div>

          <div className="gz-label-strong" style={{ marginBottom: 10 }}>EVENT LOG</div>
          <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 11, lineHeight: 1.6, color: 'var(--gz-text-dim)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {window.MOCK_NOTIFICATIONS.slice(0, 6).map(n => (
              <div key={n.id} style={{ borderLeft: `2px solid ${n.severity === 'success' || n.severity === 'win' ? 'var(--gz-green)' : 'var(--gz-line-strong)'}`, paddingLeft: 8 }}>
                <div style={{ color: 'var(--gz-text-muted)', fontSize: 9, letterSpacing: '0.1em' }}>{n.time} · {n.type.toUpperCase()}</div>
                <div style={{ color: n.severity === 'win' ? 'var(--gz-amber)' : 'var(--gz-text)' }}>{n.message}</div>
              </div>
            ))}
          </div>

          <div className="gz-divider" />
          <div className="gz-label-strong" style={{ marginBottom: 10 }}>SYSTEM</div>
          <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 10, color: 'var(--gz-text-dim)', lineHeight: 1.8 }}>
            <div>VPS <span style={{ color: 'var(--gz-green)', float: 'right' }}>● ONLINE</span></div>
            <div>SUPABASE <span style={{ color: 'var(--gz-green)', float: 'right' }}>● ONLINE</span></div>
            <div>IPAT <span style={{ color: 'var(--gz-green)', float: 'right' }}>● READY</span></div>
            <div>SPAT4 <span style={{ color: 'var(--gz-green)', float: 'right' }}>● READY</span></div>
            <div>NEXT FIRE <span style={{ color: 'var(--gz-amber)', float: 'right' }}>15:35</span></div>
          </div>
        </aside>
      </div>

      {/* 投票モーダル */}
      {betting && (
        <div style={{ position: 'absolute', inset: 36, background: 'rgba(0,5,2,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, backdropFilter: 'blur(4px)' }}>
          <div style={{ textAlign: 'center' }}>
            <Orb size={200}>
              <div style={{ fontFamily: 'var(--gz-mono)', fontSize: 12, color: 'var(--gz-green)', letterSpacing: '0.2em' }} className="gz-glow">EXECUTING</div>
              <div style={{ fontFamily: 'var(--gz-display)', fontSize: 36, fontWeight: 900, color: 'var(--gz-green)', marginTop: 6 }} className="gz-glow-strong">SUBMIT</div>
            </Orb>
            <div style={{ marginTop: 50, fontFamily: 'var(--gz-mono)', fontSize: 13, color: 'var(--gz-text)', letterSpacing: '0.15em' }}>
              IPAT/SPAT4 へ送信中...<span className="gz-blink">_</span>
            </div>
          </div>
        </div>
      )}
    </GzWindow>
  );
}

window.DashboardA = DashboardA;
