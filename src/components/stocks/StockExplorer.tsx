"use client";

/**
 * 종목 브리핑 주간 화면의 위쪽 절반. 검색, 그룹, 시장, 정렬이 아래 전부(요약 숫자, 산점도,
 * 카드, 표)에 같이 걸린다 — 숫자끼리 서로 어긋나지 않게 한 묶음으로 둔다.
 *
 * 표는 연동 문서(stock-analysis `docs/market-brief-재무연동.md` 4.1)의 보기 3종이다:
 * 실적과 밸류 / 주가와 수급 / 현금흐름과 배당. 머리글을 누르면 그 열로 정렬한다.
 *
 * 상태는 이 컴포넌트 안에만 있다. 주소(searchParams)에 올리지 않는 이유는 뉴스 쪽과 같다 —
 * 서버가 그걸 읽으면 ISR 캐시가 죽는다.
 */
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import Sparkline from "./Sparkline";
import Term from "../Term";
import {
  fmtChange,
  fmtDelta,
  fmtEok,
  fmtInt,
  fmtMultiple,
  fmtRatio,
  toneOf,
} from "../../lib/stock-format";
import { PER_DISTORTED, type StockCard } from "../../lib/stocks";

export type ExplorerItem = StockCard;

type NumKey = {
  [K in keyof StockCard]: StockCard[K] extends number | null ? K : never;
}[keyof StockCard];

type SortKey = "order" | NumKey;

const SORTS: Array<[SortKey, string]> = [
  ["order", "그룹순"],
  ["chg3m", "3개월 등락"],
  ["chg1y", "1년 등락"],
  ["opYoy", "영업이익 YoY"],
  ["opm", "영업이익률"],
  ["mcap", "시가총액"],
  ["pos52", "52주 위치"],
  ["frgn20", "외국인 20일"],
];

/** 검색 비교용. 대소문자, 띄어쓰기를 무시한다(`ls electric`으로 LS ELECTRIC을 찾게) */
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/** PER 왜곡(이익이 0 근처) 또는 적자면 PER 정렬에서 맨 뒤로 보낸다 */
const perBad = (s: StockCard) => s.deficit || s.per === null || s.per >= PER_DISTORTED;

/** 정렬 값. 값이 없거나 왜곡이면 null — 방향과 무관하게 늘 뒤로 간다 */
function sortVal(s: StockCard, k: NumKey): number | null {
  if (k === "per" && perBad(s)) return null;
  return s[k] as number | null;
}

function sortCards(list: StockCard[], key: SortKey, dir: 1 | -1): StockCard[] {
  if (key === "order") return list; // 원본 순서 = 그룹순
  return [...list].sort((a, b) => {
    const x = sortVal(a, key);
    const y = sortVal(b, key);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * dir;
  });
}

/** `2026Q3` → `3분기` */
const qLabel = (q: string) => `${q.slice(-1)}분기`;

/** 신호 문장을 카드용 짧은 꼬리표로. 못 줄이면 버린다 — 카드가 문장으로 덮이면 안 된다 */
function tagOf(signal: string): string | null {
  if (signal.includes("흑자전환")) return "흑자전환";
  if (signal.includes("적자전환")) return "적자전환";
  const streak = signal.match(/매출.*?(\d+)개 분기 연속 증가/);
  if (streak) return `매출 ${streak[1]}분기 연속 증가`;
  if (/영업이익률.*연속 개선/.test(signal)) return "이익률 개선 중";
  if (/영업이익률.*연속 (하락|악화)/.test(signal)) return "이익률 하락 중";
  return null;
}

type View = "card" | "fin" | "flow" | "cash";

const VIEWS: Array<[View, string]> = [
  ["card", "카드"],
  ["fin", "실적, 밸류"],
  ["flow", "주가, 수급"],
  ["cash", "현금흐름, 배당"],
];

export default function StockExplorer({
  items,
  sectors,
}: {
  items: StockCard[];
  sectors: string[];
}) {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState<string | null>(null);
  const [market, setMarket] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("order");
  // 큰 값부터가 기본. 머리글을 한 번 더 누르면 뒤집힌다
  const [dir, setDir] = useState<1 | -1>(-1);
  const [view, setView] = useState<View>("card");

  const markets = useMemo(
    () => [...new Set(items.map((i) => i.market).filter((m): m is string => !!m))],
    [items],
  );

  const shown = useMemo(() => {
    const nq = norm(q);
    const hit = items.filter(
      (s) =>
        (!sector || s.sector === sector) &&
        (!market || s.market === market) &&
        (!nq ||
          norm(s.name).includes(nq) ||
          s.code.includes(nq) ||
          norm(s.sector).includes(nq)),
    );
    return sortCards(hit, sort, dir);
  }, [items, q, sector, market, sort, dir]);

  const onSort = (k: NumKey) => {
    if (sort === k) setDir(dir === -1 ? 1 : -1);
    else {
      setSort(k);
      setDir(-1);
    }
  };

  const reset = () => {
    setQ("");
    setSector(null);
    setMarket(null);
  };

  return (
    <div className="stx">
      {/* 필터는 한 줄, 그 아래 전부에 걸린다 */}
      <div className="stx-bar" role="search">
        <input
          className="stx-search"
          type="search"
          placeholder="종목명, 코드, 그룹 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="종목 검색"
        />
        <label className="stx-sort">
          <span>정렬</span>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setDir(-1);
            }}
          >
            {SORTS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
            {/* 머리글로 고른 정렬이 목록에 없으면 그 이름을 그대로 보여 준다 */}
            {SORTS.some(([k]) => k === sort) ? null : <option value={sort}>표 머리글 기준</option>}
          </select>
        </label>
      </div>
      <div className="stx-chips" role="group" aria-label="그룹">
        <button type="button" aria-pressed={sector === null} onClick={() => setSector(null)}>
          전체 <em>{items.length}</em>
        </button>
        {sectors.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={sector === s}
            onClick={() => setSector(sector === s ? null : s)}
          >
            {s} <em>{items.filter((i) => i.sector === s).length}</em>
          </button>
        ))}
      </div>
      {markets.length > 1 ? (
        <div className="stx-chips stx-chips--sub" role="group" aria-label="시장">
          <span>시장</span>
          <button type="button" aria-pressed={market === null} onClick={() => setMarket(null)}>
            전체
          </button>
          {markets.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={market === m}
              onClick={() => setMarket(market === m ? null : m)}
            >
              {m} <em>{items.filter((i) => i.market === m).length}</em>
            </button>
          ))}
        </div>
      ) : null}

      {shown.length ? (
        <>
          <Stats items={shown} />
          <Scatter items={shown} />

          <div className="stx-head">
            <h2>
              종목 <em>{shown.length}</em>
            </h2>
            <div className="stx-view" role="group" aria-label="보기">
              {VIEWS.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {view === "card" ? (
            <Cards items={shown} />
          ) : (
            <Table items={shown} view={view} sort={sort} dir={dir} onSort={onSort} />
          )}
        </>
      ) : (
        <p className="stx-empty">
          조건에 맞는 종목이 없습니다.{" "}
          <button type="button" onClick={reset}>
            검색 지우기
          </button>
        </p>
      )}
    </div>
  );
}

/* ---------- 요약 숫자 ---------- */

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function Split({ up, down, upLabel, downLabel }: { up: number; down: number; upLabel: string; downLabel: string }) {
  const total = up + down || 1;
  return (
    <>
      <div className="stx-split" aria-hidden="true">
        <span className="stx-split-up" style={{ width: `${(up / total) * 100}%` }} />
        <span className="stx-split-down" style={{ width: `${(down / total) * 100}%` }} />
      </div>
      <small>
        <span className="stk-up">{upLabel} {up}</span>
        <span className="stk-down">{downLabel} {down}</span>
      </small>
    </>
  );
}

function Stats({ items }: { items: ExplorerItem[] }) {
  const opUp = items.filter((s) => (s.opYoy ?? 0) > 0).length;
  const opDown = items.filter((s) => (s.opYoy ?? 0) < 0).length;
  const pxUp = items.filter((s) => (s.chg3m ?? 0) > 0).length;
  const pxDown = items.filter((s) => (s.chg3m ?? 0) < 0).length;
  const med3m = median(items.map((s) => s.chg3m).filter((v): v is number => v !== null));
  const medOpm = median(items.map((s) => s.opm).filter((v): v is number => v !== null));

  return (
    <div className="stx-stats">
      <div className="stx-stat">
        <span>영업이익 (전년 동기 대비)</span>
        <b>
          {opUp}
          <i>/{items.length}</i>
        </b>
        <Split up={opUp} down={opDown} upLabel="증가" downLabel="감소" />
      </div>
      <div className="stx-stat">
        <span>주가 3개월</span>
        <b>
          {pxUp}
          <i>/{items.length}</i>
        </b>
        <Split up={pxUp} down={pxDown} upLabel="상승" downLabel="하락" />
      </div>
      <div className="stx-stat">
        <span>3개월 등락 중앙값</span>
        <b className={toneOf(med3m) ? `stk-${toneOf(med3m)}` : undefined}>{fmtChange(med3m)}</b>
        <small>절반이 이보다 높고 절반이 낮다</small>
      </div>
      <div className="stx-stat">
        <span>영업이익률 중앙값</span>
        <b>{fmtRatio(medOpm)}</b>
        <small>최근 분기 기준</small>
      </div>
    </div>
  );
}

/* ---------- 실적과 주가 산점도 ---------- */

/**
 * 가로 = 영업이익 YoY, 세로 = 3개월 주가 등락.
 * 영업이익 YoY는 -80%부터 +2,700%까지 퍼져 있어 선형 축이면 거의 다 왼쪽 끝에 몰린다.
 * 그래서 부호를 지킨 로그(symlog)로 편다. 축 눈금에 실제 값을 적어 둔다.
 */
const symlog = (v: number) => Math.sign(v) * Math.log10(1 + Math.abs(v) / 10);
const X_TICKS = [-50, 0, 50, 200, 1000];

function Scatter({ items }: { items: ExplorerItem[] }) {
  const pts = items.filter((s) => s.opYoy !== null && s.chg3m !== null);
  const [hover, setHover] = useState<ExplorerItem | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  if (pts.length < 2) return null;

  const W = 720;
  const H = 360;
  const M = { l: 44, r: 16, t: 26, b: 34 };

  const xs = pts.map((p) => symlog(p.opYoy!));
  const xLo = Math.min(symlog(-50), ...xs);
  const xHi = Math.max(symlog(1000), ...xs);
  const ys = pts.map((p) => p.chg3m!);
  // 눈금은 10% 단위로 값을 덮게, 판은 그보다 15% 넓게 — 위아래 빈 띠에 사분면 이름이 앉는다
  const yMax = Math.ceil(Math.max(20, ...ys.map(Math.abs)) / 10) * 10;
  const yAbs = yMax * 1.18;
  // 좌표를 소수 한 자리로 자른다. 서버와 브라우저의 log10 끝자리가 달라 hydration 경고가 났다
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const x = (v: number) => r1(M.l + ((symlog(v) - xLo) / (xHi - xLo)) * (W - M.l - M.r));
  const y = (v: number) => r1(M.t + ((yAbs - v) / (yAbs * 2)) * (H - M.t - M.b));
  const yStep = yMax <= 40 ? 10 : yMax <= 100 ? 25 : 50;
  const yTicks: number[] = [];
  for (let t = -Math.floor(yMax / yStep) * yStep; t <= yMax; t += yStep) yTicks.push(t);
  /*
   * 이름표. 종목이 적으면 다 달고, 많으면 바깥쪽(눈에 띄는) 점부터 단다.
   * 놓을 자리(오른쪽 위, 왼쪽 위, 오른쪽 아래, 왼쪽 아래)를 차례로 대 보고 이미 놓인 이름표나
   * 판 밖과 겹치면 그 점은 이름 없이 둔다 — 마우스를 올리면 툴팁으로 나온다.
   */
  const budget = pts.length <= 10 ? pts.length : 8;
  const order = [...pts].sort(
    (a, b) =>
      Math.abs(b.chg3m!) / yMax + Math.abs(symlog(b.opYoy!)) -
      (Math.abs(a.chg3m!) / yMax + Math.abs(symlog(a.opYoy!))),
  );
  // 사분면 이름 자리도 미리 막아 둔다. 이름표가 그 위에 얹히면 둘 다 안 읽힌다
  const quadW = 10 * 11;
  const boxes: Array<[number, number, number, number]> = [
    [W - M.r - 4 - quadW, y(yAbs), W - M.r, y(yAbs) + 18],
    [W - M.r - 4 - quadW, y(-yAbs) - 18, W - M.r, y(-yAbs)],
    [x(0) - 6 - quadW, y(yAbs), x(0), y(yAbs) + 18],
    [x(0) - 6 - quadW, y(-yAbs) - 18, x(0), y(-yAbs)],
  ];
  const labels = new Map<string, { x: number; y: number; anchor: "start" | "end" }>();
  for (const p of order) {
    if (labels.size >= budget) break;
    const cx = x(p.opYoy!);
    const cy = y(p.chg3m!);
    const w = p.name.length * 11 + 4;
    const h = 14;
    const tries: Array<[number, number, "start" | "end"]> = [
      [cx + 8, cy - 6, "start"],
      [cx - 8, cy - 6, "end"],
      [cx + 8, cy + 16, "start"],
      [cx - 8, cy + 16, "end"],
    ];
    for (const [tx, ty, anchor] of tries) {
      const x0 = anchor === "start" ? tx : tx - w;
      const box: [number, number, number, number] = [x0, ty - h + 3, x0 + w, ty + 3];
      const inside = box[0] >= M.l && box[2] <= W - M.r && box[1] >= M.t && box[3] <= H - M.b;
      const clash = boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1]);
      if (inside && !clash) {
        boxes.push(box);
        labels.set(p.code, { x: tx, y: ty, anchor });
        break;
      }
    }
  }

  return (
    <figure className="stx-fig">
      <figcaption>
        <h2>실적과 주가</h2>
        <p>
          오른쪽일수록 영업이익이 1년 전보다 많이 늘었고, 위쪽일수록 최근 3개월 주가가 올랐습니다.
          오른쪽 아래는 실적이 늘었는데 주가는 빠진 종목입니다. 점을 누르면 종목 화면으로 갑니다.
        </p>
      </figcaption>
      <div className="stx-plot" ref={wrap}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="영업이익 YoY와 3개월 주가 등락 산점도">
          {/* 사분면 바탕 글자. 데이터보다 흐리게 */}
          <text className="stx-quad" x={W - M.r - 4} y={y(yAbs) + 14} textAnchor="end">실적 증가, 주가 상승</text>
          <text className="stx-quad" x={W - M.r - 4} y={y(-yAbs) - 6} textAnchor="end">실적 증가, 주가 하락</text>
          <text className="stx-quad" x={x(0) - 6} y={y(yAbs) + 14} textAnchor="end">실적 감소, 주가 상승</text>
          <text className="stx-quad" x={x(0) - 6} y={y(-yAbs) - 6} textAnchor="end">실적 감소, 주가 하락</text>

          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line className={t === 0 ? "stx-axis0" : "stx-grid"} x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} />
              <text className="stx-tick" x={M.l - 6} y={y(t) + 4} textAnchor="end">
                {t > 0 ? `+${t}` : t}%
              </text>
            </g>
          ))}
          {X_TICKS.map((t) => (
            <g key={`x${t}`}>
              <line className={t === 0 ? "stx-axis0" : "stx-grid"} y1={M.t} y2={H - M.b} x1={x(t)} x2={x(t)} />
              <text className="stx-tick" x={x(t)} y={H - M.b + 16} textAnchor="middle">
                {t > 0 ? `+${fmtInt(t)}` : t}%
              </text>
            </g>
          ))}
          <text className="stx-axis-title" x={W - M.r} y={H - 2} textAnchor="end">
            영업이익 YoY
          </text>
          <text className="stx-axis-title" x={4} y={12}>
            3개월 주가
          </text>

          {pts.map((p) => {
            const cx = x(p.opYoy!);
            const cy = y(p.chg3m!);
            const on = hover?.code === p.code;
            return (
              <Link
                key={p.code}
                href={`/stocks/${p.code}`}
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(p)}
                onBlur={() => setHover(null)}
                aria-label={`${p.name}, 영업이익 YoY ${fmtChange(p.opYoy)}, 3개월 ${fmtChange(p.chg3m)}`}
              >
                {/* 맞히기 쉬운 투명 원. 점(8px)만으로는 손가락이 못 맞힌다 */}
                <circle cx={cx} cy={cy} r={13} fill="transparent" />
                <circle
                  className={`stx-dot stx-dot--${p.chg3m! >= 0 ? "up" : "down"}${on ? " is-on" : ""}`}
                  cx={cx}
                  cy={cy}
                  r={on ? 6.5 : 5}
                />
                {labels.has(p.code) ? (
                  <text
                    className="stx-dot-label"
                    x={labels.get(p.code)!.x}
                    y={labels.get(p.code)!.y}
                    textAnchor={labels.get(p.code)!.anchor}
                  >
                    {p.name}
                  </text>
                ) : null}
              </Link>
            );
          })}
        </svg>
        {hover ? (
          <div
            className="stx-tip"
            style={{
              left: `${(x(hover.opYoy!) / W) * 100}%`,
              top: `${(y(hover.chg3m!) / H) * 100}%`,
            }}
          >
            <strong>{hover.name}</strong>
            <span>
              영업이익 YoY <b className={`stk-${toneOf(hover.opYoy)}`}>{fmtChange(hover.opYoy)}</b>
            </span>
            <span>
              3개월 주가 <b className={`stk-${toneOf(hover.chg3m)}`}>{fmtChange(hover.chg3m)}</b>
            </span>
            <span className="stx-tip-faint">{hover.sector}</span>
          </div>
        ) : null}
      </div>
    </figure>
  );
}

/* ---------- 카드 ---------- */

function Cards({ items }: { items: ExplorerItem[] }) {
  return (
    <ul className="stx-cards">
      {items.map((s) => {
        const tags = [...new Set(s.signals.map(tagOf).filter((t): t is string => !!t))].slice(0, 2);
        // 잠정실적이 나왔는데 숫자는 아직 이전 분기다. 카드 숫자를 오해하지 않게 맨 앞에 단다
        const pending = s.pending ? `${qLabel(s.pending.quarter)} 잠정실적 미반영` : null;
        return (
          <li key={s.code}>
            <Link href={`/stocks/${s.code}`} className="stx-card">
              <span className="stx-card-sector">{s.sector}</span>
              <span className="stx-card-name">{s.name}</span>
              <span className="stx-card-price">
                <b>
                  {fmtInt(s.price)}
                  {s.asof ? <i className="stx-asof">{s.asof}</i> : null}
                </b>
                <span className={`stk-${toneOf(s.chg3m)}`}>3개월 {fmtChange(s.chg3m)}</span>
              </span>
              <Sparkline values={s.spark} />
              <span className="stx-card-facts">
                <span>
                  영업이익 YoY
                  <b className={`stk-${toneOf(s.opYoy)}`}>{fmtChange(s.opYoy)}</b>
                </span>
                <span>
                  영업이익률
                  <b>{fmtRatio(s.opm)}</b>
                </span>
                <span>
                  PER
                  <b>{s.deficit ? "적자" : fmtMultiple(s.per)}</b>
                </span>
              </span>
              {tags.length || pending ? (
                <span className="stx-card-tags">
                  {pending ? <span className="is-pending">{pending}</span> : null}
                  {tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------- 표 3종 ---------- */

type Col = {
  /** 머리글. 용어 설명(`Term`)의 열쇠이기도 하다 */
  label: string;
  /** 정렬 열쇠. 없으면 정렬하지 않는 열 */
  key?: NumKey;
  cell: (s: StockCard) => React.ReactNode;
  /** 증감 색을 칠할 값 */
  tone?: (s: StockCard) => number | null;
  /** 숫자가 아닌 열(왼쪽 정렬) */
  text?: boolean;
};

const won = (v: number | null) => (v === null ? "-" : fmtEok(v));

const COLS: Record<Exclude<View, "card">, Col[]> = {
  fin: [
    { label: "시장", cell: (s) => s.market ?? "-", text: true },
    { label: "시총(억)", key: "mcap", cell: (s) => fmtEok(s.mcap) },
    { label: "분기 매출", key: "revQ", cell: (s) => won(s.revQ) },
    { label: "분기 영업이익", key: "opQ", cell: (s) => won(s.opQ), tone: (s) => (s.opQ !== null && s.opQ < 0 ? -1 : null) },
    { label: "영업이익률", key: "opm", cell: (s) => fmtRatio(s.opm) },
    { label: "매출 YoY", key: "revYoy", cell: (s) => fmtChange(s.revYoy), tone: (s) => s.revYoy },
    { label: "영업이익 YoY", key: "opYoy", cell: (s) => fmtChange(s.opYoy), tone: (s) => s.opYoy },
    {
      label: "PER",
      key: "per",
      // 왜곡값은 흐리게, 적자는 글자로
      cell: (s) =>
        s.deficit ? "적자" : s.per !== null && s.per >= PER_DISTORTED ? <span className="faint">{fmtMultiple(s.per)}</span> : fmtMultiple(s.per),
    },
    { label: "PBR", key: "pbr", cell: (s) => fmtMultiple(s.pbr, 2) },
    { label: "ROE", key: "roe", cell: (s) => fmtRatio(s.roe) },
    {
      label: "분기",
      // 잠정실적이 나왔는데 반영 전이면 표시한다(그 행 숫자가 한 분기 늦다)
      cell: (s) =>
        s.pending ? (
          <span className="is-pending" title={`${s.pending.d} 잠정실적 공시, 분기보고서 제출 후 반영`}>
            {s.lastQ} *
          </span>
        ) : (
          (s.lastQ ?? "-")
        ),
      text: true,
    },
  ],
  flow: [
    { label: "주가", key: "price", cell: (s) => fmtInt(s.price) },
    { label: "1개월", key: "chg1m", cell: (s) => fmtChange(s.chg1m), tone: (s) => s.chg1m },
    { label: "3개월", key: "chg3m", cell: (s) => fmtChange(s.chg3m), tone: (s) => s.chg3m },
    { label: "지수 대비 3개월", key: "rel3m", cell: (s) => fmtDelta(s.rel3m, "%p"), tone: (s) => s.rel3m },
    { label: "52주 위치", key: "pos52", cell: (s) => <Pos52 v={s.pos52} /> },
    { label: "고가 대비", key: "fromHi", cell: (s) => fmtChange(s.fromHi), tone: (s) => s.fromHi },
    { label: "외국인 20일", key: "frgn20", cell: (s) => won(s.frgn20), tone: (s) => s.frgn20 },
    { label: "기관 20일", key: "organ20", cell: (s) => won(s.organ20), tone: (s) => s.organ20 },
    { label: "외국인 지분율", key: "holdNow", cell: (s) => fmtRatio(s.holdNow) },
    { label: "지분율 60일 변화", key: "holdChg60", cell: (s) => fmtDelta(s.holdChg60, "%p"), tone: (s) => s.holdChg60 },
  ],
  cash: [
    { label: "영업CF", key: "ocfFy", cell: (s) => won(s.ocfFy), tone: (s) => (s.ocfFy !== null && s.ocfFy < 0 ? -1 : null) },
    { label: "FCF", key: "fcfFy", cell: (s) => won(s.fcfFy), tone: (s) => (s.fcfFy !== null && s.fcfFy < 0 ? -1 : null) },
    { label: "영업CF/순이익", key: "cashConv", cell: (s) => fmtRatio(s.cashConv) },
    { label: "주당배당금", key: "dps", cell: (s) => (s.dps === null ? "-" : `${fmtInt(s.dps)}원`) },
    { label: "배당수익률", key: "divYield", cell: (s) => fmtRatio(s.divYield) },
    // 추정값이라 "예상"을 붙인다(연동 문서 5장)
    { label: "다음 실적 예상", cell: (s) => (s.nextEarn ? `${s.nextEarn.replace(/-/g, ".")} 예상` : "-"), text: true },
  ],
};

/** 52주 저가(0)와 고가(100) 사이 위치. 숫자와 짧은 막대를 같이 */
function Pos52({ v }: { v: number | null }) {
  if (v === null) return <>-</>;
  return (
    <span className="pos52">
      <span className="pos52-track" aria-hidden="true">
        <span className="pos52-dot" style={{ left: `${Math.max(0, Math.min(100, v))}%` }} />
      </span>
      {Math.round(v)}
    </span>
  );
}

function Table({
  items,
  view,
  sort,
  dir,
  onSort,
}: {
  items: StockCard[];
  view: Exclude<View, "card">;
  sort: SortKey;
  dir: 1 | -1;
  onSort: (k: NumKey) => void;
}) {
  const cols = COLS[view];
  return (
    <>
      <div className="stk-table">
        <table>
          <thead>
            <tr>
              <th>종목</th>
              {cols.map((c) => (
                <th
                  key={c.label}
                  className={c.text ? undefined : "num"}
                  aria-sort={c.key && sort === c.key ? (dir === -1 ? "descending" : "ascending") : undefined}
                >
                  <span className="th-in">
                    <Term label={c.label} uid={`t-${view}-${c.label}`} />
                    {c.key ? (
                      <button
                        type="button"
                        className={`th-sort${sort === c.key ? " is-on" : ""}`}
                        onClick={() => onSort(c.key!)}
                        aria-label={`${c.label} 순으로 정렬`}
                      >
                        {sort === c.key ? (dir === -1 ? "▼" : "▲") : "↕"}
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.code}>
                <th scope="row">
                  <Link href={`/stocks/${s.code}`}>{s.name}</Link>
                  <small className="row-sub">{s.sector}</small>
                </th>
                {cols.map((c) => {
                  const t = c.tone ? toneOf(c.tone(s)) : "";
                  return (
                    <td key={c.label} className={`${c.text ? "faint" : "num"} ${t}`}>
                      {c.cell(s)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="stk-note">
        {view === "fin"
          ? `PER ${PER_DISTORTED}배 이상은 이익이 0에 가까워 생긴 왜곡이라 흐리게 표시하고 정렬에서 뒤로 보냅니다. 분기 옆 *는 다음 분기 잠정실적이 공시됐지만 분기보고서 제출 전이라 숫자에 아직 안 들어간 종목입니다.`
          : view === "flow"
            ? "수급 금액은 일별 순매수 수량에 종가를 곱한 근사치입니다(억원). 52주 위치는 저가 0, 고가 100입니다."
            : "현금흐름은 직전 사업연도 기준(억원)입니다. 다음 실적일은 과거 발표 패턴으로 추정한 값이라 확정 일정이 아닙니다."}
      </p>
    </>
  );
}
