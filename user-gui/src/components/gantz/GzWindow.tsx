import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  live?: boolean;
};

export function GzWindow({
  children,
  title = '競馬GANTZ',
  subtitle = 'AI Predictive System',
  live = true,
}: Props) {
  return (
    <div className="gz-window gz" style={{ width: '100%', height: '100%' }}>
      <div className="gz-titlebar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="lights">
            <span className={live ? 'live' : ''} />
            <span />
            <span />
          </div>
          <span
            className="title gz-glow"
            style={{ fontFamily: 'var(--gz-display)', letterSpacing: '0.2em' }}
          >
            {title}
          </span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{subtitle}</span>
        </div>
        <div className="meta">
          <span><span className="gz-dot" style={{ marginRight: 6 }} />SIGNAL</span>
          <span>FEED: ONLINE</span>
          <span style={{ color: 'var(--gz-green)' }}>{import.meta.env.VITE_APP_VERSION ?? 'v2.6.0'}</span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 'calc(100% - 36px)', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}
