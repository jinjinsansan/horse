type Props = { size?: number; label?: string; distance?: string };

export function CourseTrack({ size = 80, label = 'A' }: Props) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 100 70">
      <ellipse cx="50" cy="35" rx="44" ry="28" fill="none" stroke="rgba(0,255,130,0.5)" strokeWidth="1" />
      <ellipse cx="50" cy="35" rx="36" ry="22" fill="none" stroke="rgba(0,255,130,0.3)" strokeWidth="1" />
      <text
        x="50"
        y="40"
        textAnchor="middle"
        fill="var(--gz-green)"
        fontSize="14"
        fontFamily="var(--gz-mono)"
        fontWeight="700"
      >
        {label}
      </text>
    </svg>
  );
}
