"use client";

/**
 * 종목 화면 차트. 원본 `대시보드.html`(Chart.js)의 구성을 따르되 라이브러리 없이 SVG로 그린다 —
 * 차트 다섯 장에 수백 KB짜리 의존성을 실을 이유가 없다.
 *
 * 규칙 (dataviz 스킬)
 * - 축은 하나. 단위가 다른 둘(억원과 %)은 다른 차트로 나눈다.
 * - 계열 색은 --s1(파랑), --s2(주황) 고정 순서. 검증기 통과 조합이다.
 *   빨강, 파랑은 오르내림 전용이라 계열 색으로 쓰지 않는다.
 * - 선 2px, 막대 끝 4px 라운드는 쓰지 않는다(사이트가 각진 모서리다).
 * - 마우스를 올리면 세로선이 가장 가까운 기간에 붙고, 그 기간의 모든 계열 값을 한 상자에 보여 준다.
 *   값은 아래 표에도 다 있다 — 툴팁은 보조다.
 */
import { useEffect, useId, useRef, useState } from "react";

export type Series = {
  name: string;
  /** CSS 변수 이름 (`--s1`) */
  color: string;
  values: Array<number | null>;
};

type Fmt = (v: number) => string;

/**
 * 그리는 폭 = 화면에 실제로 놓인 폭. viewBox를 고정하면 좁은 화면에서 축 글자까지 같이 줄어
 * 휴대폰에서 6px대로 떨어진다. 폭을 재서 그 폭으로 그리면 글자는 늘 11px이다.
 */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const M0 = { r: 12, t: 12, b: 26 };

/** 왼쪽 여백 = 가장 긴 눈금 글자 폭. 고정이면 `2,000,000`이 잘린다 */
const leftFor = (labels: string[]) => Math.max(34, Math.max(...labels.map((l) => l.length)) * 6.6 + 10);

/** 0을 포함하고 보기 좋은 눈금 4~5개 */
function niceTicks(lo: number, hi: number, includeZero: boolean): number[] {
  let a = includeZero ? Math.min(0, lo) : lo;
  let b = includeZero ? Math.max(0, hi) : hi;
  if (a === b) {
    a -= 1;
    b += 1;
  }
  const raw = (b - a) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  // 위아래 모두 값을 덮는 눈금까지 간다. 안 그러면 최고점이 판 밖으로 나간다
  const end = Math.ceil(b / step - 1e-9) * step;
  for (let v = Math.floor(a / step + 1e-9) * step; v <= end + step * 0.001; v += step) {
    out.push(Number(v.toFixed(10)));
  }
  return out;
}

/** 가로축 글자. 너무 많으면 고르게 솎는다(처음과 끝은 남긴다) */
function xLabelIdx(n: number, max: number): number[] {
  if (n <= max) return [...Array(n).keys()];
  const step = (n - 1) / (max - 1);
  return [...new Set([...Array(max).keys()].map((i) => Math.round(i * step)))];
}

function useHover(W: number) {
  const [idx, setIdx] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent, n: number, x0: number, x1: number) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - x0) / (x1 - x0)) * (n - 1));
    setIdx(Math.max(0, Math.min(n - 1, i)));
  };
  return { idx, setIdx, ref, onMove };
}

function Tip({
  label,
  rows,
  leftPct,
  fmt,
}: {
  label: string;
  rows: Array<{ name: string; color: string; v: number | null }>;
  leftPct: number;
  fmt: Fmt;
}) {
  // 오른쪽 끝에서는 상자를 왼쪽으로 뒤집는다
  const flip = leftPct > 62;
  return (
    <div
      className="ch-tip"
      style={{
        left: `${leftPct}%`,
        transform: flip ? "translateX(calc(-100% - 10px))" : "translateX(10px)",
      }}
    >
      <span className="ch-tip-label">{label}</span>
      {rows.map((r) => (
        <span key={r.name} className="ch-tip-row">
          <i style={{ background: `var(${r.color})` }} />
          <b>{r.v === null ? "-" : fmt(r.v)}</b>
          {rows.length > 1 ? <em>{r.name}</em> : null}
        </span>
      ))}
    </div>
  );
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="ch-legend">
      {series.map((s) => (
        <span key={s.name}>
          <i style={{ background: `var(${s.color})` }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/* ---------- 선 ---------- */

export function LineChart({
  labels,
  series,
  fmt,
  height = 220,
  zero = false,
  maxXLabels = 6,
}: {
  labels: string[];
  series: Series[];
  fmt: Fmt;
  height?: number;
  /** 0을 축에 넣을지. 비율은 넣고 주가는 안 넣는다 */
  zero?: boolean;
  maxXLabels?: number;
}) {
  const [box, W] = useWidth();
  const { idx, setIdx, ref, onMove } = useHover(W);
  const clip = useId();
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const n = labels.length;
  if (all.length < 2 || n < 2) return <p className="ch-empty">표시할 값이 없습니다.</p>;
  // 폭이 좁으면 가로축 글자를 줄인다(한 글자 묶음이 약 70px)
  maxXLabels = Math.min(maxXLabels, Math.max(2, Math.floor(W / 90)));

  const H = height;
  const ticks = niceTicks(Math.min(...all), Math.max(...all), zero);
  const M = { ...M0, l: leftFor(ticks.map(fmt)) };
  const lo = ticks[0];
  const hi = ticks.at(-1)!;
  const x = (i: number) => M.l + (i / (n - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo || 1)) * (H - M.t - M.b);

  /** null에서 선을 끊는다(적자 구간 PER 등) */
  const path = (vals: Array<number | null>) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  return (
    <div className="ch">
      <Legend series={series} />
      <div className="ch-plot" ref={box}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
          onPointerMove={(e) => onMove(e, n, x(0), x(n - 1))}
          onPointerLeave={() => setIdx(null)}
        >
          <clipPath id={clip}>
            <rect x={M.l} y={0} width={W - M.l - M.r} height={H} />
          </clipPath>
          {ticks.map((t) => (
            <g key={t}>
              <line
                className={t === 0 && zero ? "ch-zero" : "ch-grid"}
                x1={M.l}
                x2={W - M.r}
                y1={y(t)}
                y2={y(t)}
              />
              <text className="ch-tick" x={M.l - 6} y={y(t) + 4} textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {xLabelIdx(n, maxXLabels).map((i) => (
            <text
              key={i}
              className="ch-tick"
              x={x(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {labels[i]}
            </text>
          ))}
          <g clipPath={`url(#${clip})`}>
            {series.map((s) => (
              <path key={s.name} className="ch-line" d={path(s.values)} style={{ stroke: `var(${s.color})` }} />
            ))}
          </g>
          {idx !== null ? (
            <>
              <line className="ch-cross" x1={x(idx)} x2={x(idx)} y1={M.t} y2={H - M.b} />
              {series.map((s) =>
                s.values[idx] === null ? null : (
                  <circle
                    key={s.name}
                    className="ch-pt"
                    cx={x(idx)}
                    cy={y(s.values[idx]!)}
                    r={4.5}
                    style={{ fill: `var(${s.color})` }}
                  />
                ),
              )}
            </>
          ) : null}
        </svg>
        {idx !== null ? (
          <Tip
            label={labels[idx]}
            rows={series.map((s) => ({ name: s.name, color: s.color, v: s.values[idx] }))}
            leftPct={(x(idx) / W) * 100}
            fmt={fmt}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ---------- 막대 ---------- */

export function BarChart({
  labels,
  series,
  fmt,
  height = 220,
}: {
  labels: string[];
  series: Series[];
  fmt: Fmt;
  height?: number;
}) {
  const [box, W] = useWidth();
  const { idx, setIdx, ref, onMove } = useHover(W);
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const n = labels.length;
  if (!all.length || !n) return <p className="ch-empty">표시할 값이 없습니다.</p>;

  const H = height;
  const ticks = niceTicks(Math.min(...all), Math.max(...all), true);
  const M = { ...M0, l: leftFor(ticks.map(fmt)) };
  const lo = ticks[0];
  const hi = ticks.at(-1)!;
  const band = (W - M.l - M.r) / n;
  const cx = (i: number) => M.l + band * (i + 0.5);
  const y = (v: number) => M.t + ((hi - v) / (hi - lo || 1)) * (H - M.t - M.b);
  // 막대 사이 2px 틈. 묶음 폭은 칸의 70%
  const group = Math.min(band * 0.7, 44);
  const bw = Math.max(2, (group - 2 * (series.length - 1)) / series.length);

  return (
    <div className="ch">
      <Legend series={series} />
      <div className="ch-plot" ref={box}>
        <svg
          ref={ref}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={series.map((s) => s.name).join(", ")}
          onPointerMove={(e) => onMove(e, n, cx(0), cx(n - 1))}
          onPointerLeave={() => setIdx(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? "ch-zero" : "ch-grid"} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
              <text className="ch-tick" x={M.l - 6} y={y(t) + 4} textAnchor="end">
                {fmt(t)}
              </text>
            </g>
          ))}
          {idx !== null ? (
            <rect className="ch-band" x={cx(idx) - band / 2} y={M.t} width={band} height={H - M.t - M.b} />
          ) : null}
          {labels.map((l, i) => (
            <g key={l}>
              {series.map((s, k) => {
                const v = s.values[i];
                if (v === null) return null;
                const x0 = cx(i) - group / 2 + k * (bw + 2);
                const top = Math.min(y(v), y(0));
                return (
                  <rect
                    key={s.name}
                    x={x0}
                    y={top}
                    width={bw}
                    height={Math.max(1, Math.abs(y(v) - y(0)))}
                    style={{ fill: `var(${s.color})` }}
                  />
                );
              })}
            </g>
          ))}
          {xLabelIdx(n, Math.min(6, Math.max(2, Math.floor(W / 60)))).map((i) => (
            <text
              key={i}
              className="ch-tick"
              x={cx(i)}
              y={H - 6}
              // 양 끝 글자는 안쪽으로 붙인다. 가운데 정렬이면 마지막 날짜가 판 밖으로 잘린다
              textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"}
            >
              {labels[i]}
            </text>
          ))}
        </svg>
        {idx !== null ? (
          <Tip
            label={labels[idx]}
            rows={series.map((s) => ({ name: s.name, color: s.color, v: s.values[idx] }))}
            leftPct={(cx(idx) / W) * 100}
            fmt={fmt}
          />
        ) : null}
      </div>
    </div>
  );
}
