"use client";

import { useId } from "react";

/**
 * 지수 선 그래프 (SVG, 의존성 없음). 기준값보다 위면 빨강, 아래면 파랑(국내 관례, --up, --down).
 * width를 주지 않으면 부모 폭을 꽉 채운다(viewBox + preserveAspectRatio none, 선 굵기는 고정).
 *
 * 모션 (2026-11-24, 모션 시안 M2):
 *   draw  선과 면이 왼쪽에서 오른쪽으로 걷히며 나타난다(clip-path). 대시 길이로 그리는 방식은
 *         vector-effect와 같이 쓰면 브라우저마다 길이가 어긋나서 쓰지 않는다
 *   live  끝점에 현재가 점이 맥박처럼 뛴다(장중일 때만 켠다). SVG를 늘려 그리므로 원이 찌그러지지 않게
 *         점은 HTML로 얹고 위치만 %로 준다
 * 움직임 줄이기 설정이면 CSS가 둘 다 끈다(globals.css "모션" 절).
 */
export default function LineChart({
  c,
  base,
  width,
  height,
  area = true,
  baseline = true,
  stroke = 1.6,
  label,
  draw = false,
  live = false,
}: {
  c: number[];
  base: number;
  width?: number;
  height: number;
  area?: boolean;
  baseline?: boolean;
  stroke?: number;
  label?: string;
  draw?: boolean;
  live?: boolean;
}) {
  const id = `lc${useId().replace(/:/g, "")}`;
  if (c.length < 2) return null;
  const W = width ?? 600;
  const H = height;
  const lo = Math.min(...c, base);
  const hi = Math.max(...c, base);
  const pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (c.length - 1);
  const y = (v: number) => pad + ((hi - v) * (H - 2 * pad)) / (hi - lo || 1);
  const up = c[c.length - 1] >= base;
  const col = up ? "var(--up)" : "var(--down)";
  const d = c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ex = x(c.length - 1);
  const ey = y(c[c.length - 1]);

  return (
    <span className={draw ? "lc lc--draw" : "lc"} style={{ width: width ?? "100%", height: H }}>
      <svg
        width={width ?? "100%"}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        {area ? (
          <>
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={col} stopOpacity="0.22" />
                <stop offset="1" stopColor={col} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="lc-area" d={`${d}L${ex.toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`} fill={`url(#${id})`} />
          </>
        ) : null}
        {baseline ? (
          <line
            x1="0"
            x2={W}
            y1={y(base)}
            y2={y(base)}
            stroke="var(--faintest)"
            strokeDasharray="3 3"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        <path
          className="lc-line"
          d={d}
          fill="none"
          stroke={col}
          strokeWidth={stroke}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {live ? (
        <span className="lc-dot" style={{ left: `${(ex / W) * 100}%`, top: `${(ey / H) * 100}%`, background: col }} />
      ) : null}
    </span>
  );
}
