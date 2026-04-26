type Props = { label: string; value: number; max?: number; color?: string };

export function DataBar({ label, value, max = 100, color = 'var(--gz-green)' }: Props) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, fontFamily: 'var(--gz-mono)' }}>
      <span
        style={{
          width: 60,
          color: 'var(--gz-text-muted)',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 4,
          background: 'rgba(0,40,20,0.6)',
          position: 'relative',
          border: '1px solid var(--gz-line)',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
      <span style={{ width: 30, textAlign: 'right', color }}>
        {typeof value === 'number' ? value.toFixed(0) : value}
      </span>
    </div>
  );
}
