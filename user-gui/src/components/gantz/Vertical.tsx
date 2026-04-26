import type { CSSProperties, ReactNode } from 'react';

type Props = { children: ReactNode; style?: CSSProperties; className?: string };

export function Vertical({ children, style = {}, className }: Props) {
  return (
    <div
      className={className}
      style={{
        writingMode: 'vertical-rl',
        textOrientation: 'mixed',
        fontFamily: 'var(--gz-jp-serif)',
        letterSpacing: '0.4em',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
