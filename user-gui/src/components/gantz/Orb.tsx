import { useId, type ReactNode } from 'react';

type Props = {
  size?: number;
  pulsing?: boolean;
  label?: string;
  sublabel?: string;
  children?: ReactNode;
};

export function Orb({ size = 280, pulsing = true, label, sublabel, children }: Props) {
  // H2: useId でインスタンス毎にユニークな ID を生成し SVG linearGradient ID 衝突を防ぐ
  const uid = useId();
  const ringId = `gz-ring-${uid.replace(/:/g, '')}`;
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        style={{
          position: 'absolute',
          inset: 0,
          animation: pulsing ? 'gz-spin 30s linear infinite' : 'none',
        }}
      >
        <defs>
          <linearGradient id={ringId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(0,255,130,0.6)" />
            <stop offset="50%" stopColor="rgba(0,255,130,0.05)" />
            <stop offset="100%" stopColor="rgba(0,255,130,0.6)" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 4}
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="1"
          strokeDasharray="2 6"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={size / 2 - 14}
          fill="none"
          stroke="rgba(0,255,130,0.15)"
          strokeWidth="1"
        />
      </svg>
      <div className="gz-orb" style={{ position: 'absolute', inset: 22 }}>
        <div className="gz-orb-content">{children}</div>
      </div>
      {label && (
        <div
          className="gz-label-strong"
          style={{ position: 'absolute', bottom: -28, left: 0, right: 0, textAlign: 'center' }}
        >
          {label}
        </div>
      )}
      {sublabel && (
        <div
          style={{
            position: 'absolute',
            bottom: -44,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--gz-text-muted)',
            fontFamily: 'var(--gz-mono)',
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}
