type Props = { size?: number; color?: string; opacity?: number };

export function HorseSvg({ size = 60, color = 'var(--gz-green)', opacity = 0.7 }: Props) {
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
