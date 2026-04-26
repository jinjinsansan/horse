// 共通コンポーネント — マトリックスコードレイン、オーブ、ターゲットHUDなど
const { useState, useEffect, useRef, useMemo } = React;

// ───── マトリックスコードレイン ─────
function CodeRain({ density = 18, className = '' }) {
  const chars = useMemo(() => {
    const pool = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ0123456789競馬G';
    const cols = [];
    for (let i = 0; i < density; i++) {
      const len = 8 + Math.floor(Math.random() * 18);
      let s = '';
      for (let j = 0; j < len; j++) s += pool[Math.floor(Math.random() * pool.length)] + '\n';
      cols.push({
        text: s,
        left: Math.random() * 100,
        duration: 6 + Math.random() * 10,
        delay: -Math.random() * 12,
        opacity: 0.3 + Math.random() * 0.7,
        size: 10 + Math.random() * 6,
      });
    }
    return cols;
  }, [density]);
  return (
    <div className={`gz-coderain ${className}`}>
      {chars.map((c, i) => (
        <div key={i} className="col" style={{
          left: `${c.left}%`,
          animationDuration: `${c.duration}s`,
          animationDelay: `${c.delay}s`,
          opacity: c.opacity,
          fontSize: `${c.size}px`,
        }}>{c.text}</div>
      ))}
    </div>
  );
}

// ───── 完全な背景 ─────
function MatrixBg({ rain = true, density = 22 }) {
  return (
    <>
      <div className="gz-bg" />
      <div className="gz-grid-bg" />
      {rain && <CodeRain density={density} />}
      <div className="gz-scanlines" />
    </>
  );
}

// ───── ウィンドウ枠 ─────
function GzWindow({ children, title = '競馬GANTZ', subtitle = 'AI Predictive System v2.6.0', live = true, w = 1440, h = 920 }) {
  return (
    <div className="gz-window gz" style={{ width: w, height: h }}>
      <div className="gz-titlebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="lights">
            <span className={live ? 'live' : ''} />
            <span />
            <span />
          </div>
          <span className="title gz-glow" style={{ fontFamily: 'var(--gz-display)', letterSpacing: '0.2em' }}>{title}</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{subtitle}</span>
        </div>
        <div className="meta">
          <span><span className="gz-dot" style={{ marginRight: 6 }} />SIGNAL</span>
          <span>SUPABASE: ONLINE</span>
          <span>VPS: 220.158.24.157</span>
          <span style={{ color: 'var(--gz-green)' }}>v2.6.0</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 'calc(100% - 36px)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ───── オーブ ─────
function Orb({ size = 280, children, pulsing = true, label, sublabel }) {
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* 外側リング */}
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, animation: pulsing ? 'gz-spin 30s linear infinite' : 'none' }}>
        <defs>
          <linearGradient id={`ring-${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0,255,130,0.6)" />
            <stop offset="50%" stopColor="rgba(0,255,130,0.05)" />
            <stop offset="100%" stopColor="rgba(0,255,130,0.6)" />
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={size/2 - 4} fill="none" stroke={`url(#ring-${size})`} strokeWidth="1" strokeDasharray="2 6" />
        <circle cx={size/2} cy={size/2} r={size/2 - 14} fill="none" stroke="rgba(0,255,130,0.15)" strokeWidth="1" />
      </svg>
      <div className="gz-orb" style={{ position: 'absolute', inset: 22 }}>
        <div className="gz-orb-content">
          {children}
        </div>
      </div>
      {label && <div style={{ position: 'absolute', bottom: -28, left: 0, right: 0, textAlign: 'center' }} className="gz-label-strong">{label}</div>}
      {sublabel && <div style={{ position: 'absolute', bottom: -44, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'var(--gz-text-muted)', fontFamily: 'var(--gz-mono)' }}>{sublabel}</div>}
    </div>
  );
}

// ───── 角飾り ─────
function Corners() {
  return (
    <>
      <span className="gz-corner tl" />
      <span className="gz-corner tr" />
      <span className="gz-corner bl" />
      <span className="gz-corner br" />
    </>
  );
}

// ───── 馬の SVG シルエット ─────
function HorseSvg({ size = 60, color = 'var(--gz-green)', opacity = 0.7 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 100 70" style={{ opacity }}>
      <path
        d="M14,55 L18,42 L22,38 Q24,30 30,28 Q34,18 44,18 Q54,16 60,22 Q66,18 74,22 L80,18 L84,22 L82,28 Q86,32 84,38 L88,40 L86,46 L80,46 L78,55 L74,55 L72,46 L60,46 L58,55 L54,55 L52,46 Q44,46 38,42 Q32,46 28,48 L26,55 Z M70,24 L74,26 L72,30 Z"
        fill={color}
        stroke={color}
        strokeWidth="1"
      />
    </svg>
  );
}

// ───── コーストラック (楕円) ─────
function CourseTrack({ size = 80, label = 'A', distance = '芝2000m' }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 100 70">
      <ellipse cx="50" cy="35" rx="44" ry="28" fill="none" stroke="rgba(0,255,130,0.5)" strokeWidth="1" />
      <ellipse cx="50" cy="35" rx="36" ry="22" fill="none" stroke="rgba(0,255,130,0.3)" strokeWidth="1" />
      <text x="50" y="40" textAnchor="middle" fill="var(--gz-green)" fontSize="14" fontFamily="var(--gz-mono)" fontWeight="700">{label}</text>
    </svg>
  );
}

// ───── データバー ─────
function DataBar({ label, value, max = 100, color = 'var(--gz-green)' }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: 'var(--gz-mono)' }}>
      <span style={{ width: 60, color: 'var(--gz-text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: 'rgba(0,40,20,0.6)', position: 'relative', border: '1px solid var(--gz-line)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, boxShadow: `0 0 8px ${color}` }} />
      </div>
      <span style={{ width: 30, textAlign: 'right', color }}>{typeof value === 'number' ? value.toFixed(0) : value}</span>
    </div>
  );
}

// 角度SVG用の小ヘルパー: ドーナツ進捗
function DonutProgress({ size = 100, value = 78.6, stroke = 6, label = 'AI予測確率' }) {
  const r = size/2 - stroke;
  const c = 2 * Math.PI * r;
  const off = c - (value/100) * c;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,255,130,0.15)" strokeWidth={stroke} />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke="var(--gz-green)" strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ filter: 'drop-shadow(0 0 6px var(--gz-green))' }}
      />
      <text x={size/2} y={size/2 + 5} textAnchor="middle" fill="var(--gz-green)" fontSize={size * 0.22} fontFamily="var(--gz-display)" fontWeight="700">{value.toFixed(1)}%</text>
    </svg>
  );
}

// 縦書き
function Vertical({ children, style = {} }) {
  return (
    <div style={{
      writingMode: 'vertical-rl',
      textOrientation: 'mixed',
      fontFamily: 'var(--gz-jp-serif)',
      letterSpacing: '0.4em',
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, {
  CodeRain, MatrixBg, GzWindow, Orb, Corners, HorseSvg, CourseTrack, DataBar, DonutProgress, Vertical,
});

// 追加 keyframes
if (!document.getElementById('gz-extra-anim')) {
  const s = document.createElement('style');
  s.id = 'gz-extra-anim';
  s.textContent = `
    @keyframes gz-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
    @keyframes gz-flicker { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
  `;
  document.head.appendChild(s);
}
