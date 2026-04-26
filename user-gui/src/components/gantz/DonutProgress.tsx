type Props = { size?: number; value?: number; stroke?: number };

export function DonutProgress({ size = 100, value = 78.6, stroke = 6 }: Props) {
  const r = size / 2 - stroke;
  const c = 2 * Math.PI * r;
  const off = c - (value / 100) * c;
  return (
    <svg width={size} height={size} style={{ display: 'block' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,255,130,0.15)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--gz-green)"
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={off}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: 'drop-shadow(0 0 6px var(--gz-green))' }}
      />
      <text
        x={size / 2}
        y={size / 2 + 5}
        textAnchor="middle"
        fill="var(--gz-green)"
        fontSize={size * 0.22}
        fontFamily="var(--gz-display)"
        fontWeight="700"
      >
        {value.toFixed(1)}%
      </text>
    </svg>
  );
}
