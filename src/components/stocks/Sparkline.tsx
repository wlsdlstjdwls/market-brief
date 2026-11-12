/**
 * 카드 안의 작은 주가 선. 축도 눈금도 없다 — 모양(오르는 중인가, 꺾였나)만 보여 준다.
 * 선 색은 기간 첫 값 대비 마지막 값의 방향을 따른다(오르면 빨강, 내리면 파랑).
 * 순수 SVG라 서버, 클라이언트 어디서나 그려진다.
 */
export default function Sparkline({
  values,
  width = 160,
  height = 40,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 2;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (1 - (v - lo) / span) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const tone = values.at(-1)! >= values[0] ? "up" : "down";
  return (
    <svg
      className={`spark spark--${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={pts} fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
