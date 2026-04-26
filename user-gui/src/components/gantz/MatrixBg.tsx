import { CodeRain } from './CodeRain';

type Props = { rain?: boolean; density?: number };

export function MatrixBg({ rain = true, density = 22 }: Props) {
  return (
    <>
      <div className="gz-bg" />
      <div className="gz-grid-bg" />
      {rain && <CodeRain density={density} />}
      <div className="gz-scanlines" />
    </>
  );
}
