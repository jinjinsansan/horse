import { useMemo } from 'react';

type Props = { density?: number; className?: string };

export function CodeRain({ density = 18, className = '' }: Props) {
  const cols = useMemo(() => {
    const pool = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛ0123456789競馬G';
    return Array.from({ length: density }, () => {
      const len = 8 + Math.floor(Math.random() * 18);
      let text = '';
      for (let i = 0; i < len; i++) {
        text += pool[Math.floor(Math.random() * pool.length)] + '\n';
      }
      return {
        text,
        left: Math.random() * 100,
        duration: 6 + Math.random() * 10,
        delay: -Math.random() * 12,
        opacity: 0.3 + Math.random() * 0.7,
        size: 10 + Math.random() * 6,
      };
    });
  }, [density]);

  return (
    <div className={`gz-coderain ${className}`}>
      {cols.map((c, i) => (
        <div
          key={i}
          className="col"
          style={{
            left: `${c.left}%`,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            opacity: c.opacity,
            fontSize: `${c.size}px`,
          }}
        >
          {c.text}
        </div>
      ))}
    </div>
  );
}
