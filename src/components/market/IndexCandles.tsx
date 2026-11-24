"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, SeriesType, Time } from "lightweight-charts";

/**
 * 지수 차트 (2026-11-24 사용자 지시, 키움, 나무 차트 벤치마킹).
 * 지수 카드(IndexCards) 아래에 붙는다. 카드를 누르면 그 지수로 바뀐다.
 *
 * 그리기는 lightweight-charts(TradingView, Apache-2.0)가 한다.
 *   NOTICE: TradingView Lightweight Charts™ Copyright (c) TradingView, Inc. https://www.tradingview.com/
 * 마우스 휠, 두 손가락 핀치로 확대 축소, 끌어서 과거로 이동, 십자선 축 표시가 라이브러리 기본이다.
 * **라이선스 출처 표기(고지문 + tradingview.com 링크)는 사이트 푸터(Shell.tsx)에 있다.** 그래서 차트 안 로고는
 * 껐다(attributionLogo: false, 2026-11-24 사용자 결정). 푸터 줄을 지우면 로고를 다시 켜야 한다.
 * 휴대폰에서 세로로 끌면 페이지가 스크롤된다(vertTouchDrag: false).
 *
 * 판(위에서 아래로)
 *   캔들 + 이동평균 5, 20, 60, 120  과매수, 과매도 **진입 봉에만** 검은 ▼▲ (시안 I, 사용자 선택)
 *   거래대금(국내, 다음 금융) / 거래량(해외, Yahoo)
 *   투자자 순매수(국내만) 외국인, 기관, 개인 중 하나를 칩으로 고른다
 *   RSI(14) 70 위, 30 아래 면 채움
 *   신용잔고(국내만) 코스피 + 코스닥 **시장 전체** 합계, 금융투자협회 집계라 이틀쯤 늦다
 *
 * 기간 단추는 일곱 칸 고정(자리가 움직이면 불편하다는 지적). 단추는 처음 보이는 구간만 정하고, 그 뒤는 자유롭게
 * 확대, 이동한다. 차트를 두 번 누르면 고른 기간으로 돌아간다.
 * 주봉, 월봉의 거래대금, 순매수는 그 봉에 든 날의 합, 신용잔고는 그 봉 마지막 날 값이다.
 * RSI는 자르기 전 전체 줄에서 계산한다.
 */
type Candle = { d: string; o: number; h: number; l: number; c: number; v: number | null };
type Flow = { d: string; amt: number; ind: number | null; frg: number | null; ins: number | null };
type Credit = { d: string; v: number };
type Interval = "1d" | "1wk" | "1mo";
type Investor = "frg" | "ins" | "ind";
/** 순매수 칩. "all"이면 세 주체를 선 세 개로 같이 그린다(기본값, 사용자 지시) */
type Who = "all" | Investor;
/** 켜고 끄는 보조 판. vol = 거래대금(국내) 또는 거래량(해외) */
// 수급(외국인, 기관, 개인)은 스위치 하나로 같이 켜고 끈다(사용자 지시). 이동평균선도 켜고 끈다(증권사 앱 지표 목록과 같게)
type Show = { ma: boolean; vol: boolean; flow: boolean; rsi: boolean; credit: boolean };
const SHOW_DEFAULT: Show = { ma: true, vol: true, flow: true, rsi: true, credit: true };
// v1(주체별 켜고 끄기)과 모양이 달라 키를 바꿨다
const SHOW_KEY = "thebriefing.indexChart.panes.v2";

const UNITS: Array<{ key: Interval; label: string; ok: number[]; def: number }> = [
  { key: "1d", label: "일봉", ok: [1, 3, 6, 12], def: 3 },
  { key: "1wk", label: "주봉", ok: [6, 12, 36, 60, 120], def: 12 },
  { key: "1mo", label: "월봉", ok: [12, 36, 60, 120], def: 60 },
];
const PERIODS = [
  { m: 1, label: "1개월" },
  { m: 3, label: "3개월" },
  { m: 6, label: "6개월" },
  { m: 12, label: "1년" },
  { m: 36, label: "3년" },
  { m: 60, label: "5년" },
  { m: 120, label: "10년" },
];
/** 세 주체 선 색. 캔들 판의 오르내림 빨강/파랑과 겹치지 않게 골랐다 */
const WHO: Array<{ key: Investor; label: string; color: string }> = [
  { key: "frg", label: "외국인", color: "#e8590c" },
  { key: "ins", label: "기관", color: "#7048e8" },
  { key: "ind", label: "개인", color: "#2b8a3e" },
];
const MAS = [
  { n: 5, color: "#2f9e44" },
  { n: 20, color: "#f08c00" },
  { n: 60, color: "#7b3fe4" },
  { n: 120, color: "#868e96" },
];

const UP = "#c8283a";
const DOWN = "#2263c9";
const INK = "#0a0a0a";
const RSI_N = 14;
const HOT = 70;
const COLD = 30;
const KR = new Set(["KOSPI", "KOSDAQ"]);

const NUM = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const INT = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const ONE = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 억 원 → "14.6조", "3,250억" */
const fmtEok = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  return a >= 1e4 ? `${s}${ONE.format(a / 1e4)}조` : `${s}${INT.format(a)}억`;
};
const fmtSigned = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${v > 0 ? "+" : ""}${fmtEok(v)}`);
/** 주 → "2.19억주" */
const fmtVol = (v: number | null | undefined) => {
  if (v === null || v === undefined) return "-";
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}억주`;
  if (v >= 1e4) return `${INT.format(v / 1e4)}만주`;
  return `${INT.format(v)}주`;
};

function memoFetch<T>(memo: Map<string, Promise<T | null>>, id: string, url: string, pick: (j: unknown) => T | null) {
  if (!memo.has(id)) {
    memo.set(
      id,
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => (j ? pick(j) : null))
        .catch(() => {
          memo.delete(id);
          return null;
        }),
    );
  }
  return memo.get(id)!;
}
type Extra = { flows: Flow[] | null; credit: Credit[] | null; netUnit?: "won" | "shares" };
const candleMemo = new Map<string, Promise<Candle[] | null>>();
const flowMemo = new Map<string, Promise<Extra | null>>();
// kind=stock이면 종목(국내 6자리 코드는 다음 금융, 해외 티커는 Yahoo). src/lib/quotes.ts의 stockCandles, stockFlows
const loadCandles = (key: string, iv: Interval, kind: Kind = "index") =>
  memoFetch(
    candleMemo,
    `${kind}:${key}:${iv}`,
    `/api/quotes?candles=${encodeURIComponent(key)}&interval=${iv}${kind === "stock" ? "&kind=stock" : ""}`,
    (j) => (j as { candles?: Candle[] }).candles ?? null,
  );
const loadFlows = (key: string, kind: Kind = "index") =>
  memoFetch(
    flowMemo,
    `${kind}:${key}`,
    `/api/quotes?flows=${encodeURIComponent(key)}${kind === "stock" ? "&kind=stock" : ""}`,
    (j) => j as Extra,
  );
type Kind = "index" | "stock";
/** 주 → "+12.3만주" (종목 순매수는 수량으로만 온다) */
const fmtShares = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "-";
  const s = v > 0 ? "+" : v < 0 ? "-" : "";
  const a = Math.abs(v);
  return a >= 1e8 ? `${s}${(a / 1e8).toFixed(2)}억주` : a >= 1e4 ? `${s}${ONE.format(a / 1e4)}만주` : `${s}${INT.format(a)}주`;
};

function rsi(closes: number[], n = RSI_N): Array<number | null> {
  const out: Array<number | null> = closes.map(() => null);
  if (closes.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  const val = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  out[n] = val();
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = val();
  }
  return out;
}

function sma(closes: number[], n: number): Array<number | null> {
  let sum = 0;
  return closes.map((c, i) => {
    sum += c;
    if (i >= n) sum -= closes[i - n];
    return i >= n - 1 ? sum / n : null;
  });
}

function monthsBefore(d: string, m: number): string {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() - m);
  return t.toISOString().slice(0, 10);
}

type Row = {
  d: string;
  amt: number | null;
  frg: number | null;
  ins: number | null;
  ind: number | null;
  credit: number | null;
};

/** 봉마다 거래대금, 순매수(합)와 신용잔고(마지막 값)를 붙인다. 봉 구간 = 이 봉 날짜 ~ 다음 봉 날짜 전날 */
function attach(candles: Candle[], flows: Flow[] | null, credit: Credit[] | null): Row[] {
  const rows: Row[] = candles.map((c) => ({ d: c.d, amt: null, frg: null, ins: null, ind: null, credit: null }));
  const bucket = (d: string) => {
    // 이진 탐색: d 이하인 마지막 봉
    let lo = 0;
    let hi = candles.length - 1;
    if (d < candles[0].d) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (candles[mid].d <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const add = (a: number | null, b: number | null) => (b === null ? a : (a ?? 0) + b);
  for (const f of flows ?? []) {
    const i = bucket(f.d);
    if (i < 0) continue;
    const r = rows[i];
    r.amt = add(r.amt, f.amt);
    r.frg = add(r.frg, f.frg);
    r.ins = add(r.ins, f.ins);
    r.ind = add(r.ind, f.ind);
  }
  for (const c of credit ?? []) {
    const i = bucket(c.d);
    if (i >= 0) rows[i].credit = c.v; // 날짜순이라 마지막 값이 남는다
  }
  return rows;
}

/**
 * 지수 차트이자 종목 차트. 종목 상세(`StockDetail`)는 kind="stock"으로 같은 기능을 그대로 쓴다(사용자 지시).
 * 종목에서 다른 점: 순매수는 외국인, 기관만 있고 단위가 주(수량), 신용잔고는 없다(종목별 원천 없음),
 * 국내 종목 가격은 소수점 없이.
 */
export default function IndexCandles({ indexKey, name, kind = "index" }: { indexKey: string; name: string; kind?: Kind }) {
  const [unit, setUnit] = useState<Interval>("1d");
  const [months, setMonths] = useState(3);
  // 보조 판 켜고 끄기 (2026-11-24 사용자 지시). 브라우저(localStorage)에 저장해 다음 접속에도 그대로다.
  // 첫 그리기는 기본값(전부 켬)이고, 저장된 값은 화면이 뜬 뒤 읽는다(서버 렌더와 어긋나지 않게)
  const [show, setShow] = useState<Show>(SHOW_DEFAULT);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHOW_KEY);
      if (raw) setShow({ ...SHOW_DEFAULT, ...(JSON.parse(raw) as Partial<Show>) });
    } catch {
      /* 저장소를 못 쓰는 브라우저(사생활 보호 모드 등)는 기본값으로 */
    }
  }, []);
  const toggle = (key: keyof Show) =>
    setShow((s) => {
      const next = { ...s, [key]: !s[key] };
      try {
        localStorage.setItem(SHOW_KEY, JSON.stringify(next));
      } catch {
        /* 저장 실패해도 이번 화면에서는 켜고 끈다 */
      }
      return next;
    });
  const activeInv = show.flow ? WHO : [];
  // 지표 목록 창(데스크톱은 단추 아래 작은 창, 휴대폰은 아래에서 올라오는 시트)
  const [panel, setPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!panel) return;
    const onDown = (e: PointerEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setPanel(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPanel(false);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [panel]);
  // 판 구성이 바뀌면 차트를 다시 만든다. 다시 만들 때 보던 구간은 지킨다(rangeRef)
  const showKey = `${show.ma}${show.vol}${show.flow}${show.rsi}${show.credit}`;
  const rangeRef = useRef<{ key: string; from: number; to: number } | null>(null);
  const [candles, setCandles] = useState<Candle[] | null | undefined>(undefined);
  const [extra, setExtra] = useState<Extra | null | undefined>(undefined);
  // 순매수 단위: 지수는 억 원, 종목은 주(수량). 응답의 netUnit을 따른다
  const fmtNet = extra?.netUnit === "shares" ? fmtShares : fmtSigned;
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);
  const kr = kind === "stock" ? /^\d{6}$/.test(indexKey) : KR.has(indexKey);
  // 가격 표기: 국내 종목은 원 단위 정수, 지수와 해외 종목은 소수 둘째 자리
  const fmtPx = (p: number) => (kind === "stock" && kr ? INT.format(p) : NUM.format(p));

  // 휴대폰 폭. 차트 글자 크기, 축 서식, 판 높이를 증권사 앱처럼 촘촘하게 바꾼다
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 740px)");
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const netRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const netLinesRef = useRef<Array<ISeriesApi<SeriesType>>>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);

  // 전체화면 (2026-11-24 사용자 지시). 브라우저 전체화면 API를 쓰고, 못 쓰는 곳(아이폰 사파리)은 화면을 덮는 고정 판으로 흉내 낸다
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === sectionRef.current && !!sectionRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // 폭이 바뀌면 라이브러리가 봉 간격을 그대로 두고 봉을 더 보여 준다. 들어가고 나올 때 고른 기간으로 다시 맞춘다
  useEffect(() => {
    const id = setTimeout(() => {
      if (chartRef.current && model) applyRange(chartRef.current, model.candles, monthsRef.current);
    }, 80);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitFull();
    window.addEventListener("keydown", onKey);
    // 흉내 판일 때 뒤 페이지가 스크롤되지 않게
    const prev = document.body.style.overflow;
    if (!document.fullscreenElement) document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full]);
  const enterFull = () => {
    const el = sectionRef.current;
    if (el?.requestFullscreen) el.requestFullscreen().catch(() => setFull(true));
    else setFull(true);
  };
  const exitFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    setFull(false);
  };
  const monthsRef = useRef(months);
  monthsRef.current = months;

  useEffect(() => {
    let alive = true;
    setCandles(undefined);
    setHover(null);
    loadCandles(indexKey, unit, kind).then((c) => alive && setCandles(c));
    return () => {
      alive = false;
    };
  }, [indexKey, unit, kind]);

  useEffect(() => {
    let alive = true;
    if (!kr) {
      setExtra(null);
      return;
    }
    setExtra(undefined);
    loadFlows(indexKey, kind).then((x) => alive && setExtra(x));
    return () => {
      alive = false;
    };
  }, [indexKey, kr, kind]);

  const model = useMemo(() => {
    if (!candles || candles.length < 2) return null;
    const closes = candles.map((c) => c.c);
    const rs = rsi(closes);
    const rows = attach(candles, extra?.flows ?? null, extra?.credit ?? null);
    return {
      candles,
      rs,
      rows,
      mas: MAS.map((m) => sma(closes, m.n)),
      hasAmt: rows.some((r) => r.amt !== null),
      hasNet: rows.some((r) => r.frg !== null),
      // 종목은 개인 순매수가 없다. 자료가 있는 주체만 보인다
      invHas: { frg: rows.some((r) => r.frg !== null), ins: rows.some((r) => r.ins !== null), ind: rows.some((r) => r.ind !== null) } as Record<Investor, boolean>,
      hasCredit: rows.some((r) => r.credit !== null),
    };
  }, [candles, extra]);

  const ready = model && (!kr || extra !== undefined);

  // 오늘(마지막 영업일) 지표 카드용 일봉. 봉 단위가 주봉, 월봉이어도 카드는 늘 일 단위로 계산한다
  const [daily, setDaily] = useState<Candle[] | null>(null);
  useEffect(() => {
    let alive = true;
    loadCandles(indexKey, "1d", kind).then((c) => alive && setDaily(c));
    return () => {
      alive = false;
    };
  }, [indexKey, kind]);

  /** 오늘 값과 직전 영업일 대비. 순매수는 "어제 순매수와의 차이", RSI는 %p 차이, 거래대금, 거래량은 증감과 % */
  const today = useMemo(() => {
    type Stat = { k: string; label: string; value: string; tone: string; diff: string; diffTone: string; pct?: string };
    const out: Stat[] = [];
    const tone = (x: number | null) => (x === null ? "" : x > 0 ? "is-up" : x < 0 ? "is-down" : "");
    const f = extra?.flows;
    if (f && f.length >= 2) {
      const a = f[f.length - 1];
      const b = f[f.length - 2];
      const d = a.amt - b.amt;
      out.push({
        k: "amt",
        label: "거래대금",
        value: fmtEok(a.amt),
        tone: "",
        diff: fmtSigned(d),
        diffTone: tone(d),
        pct: b.amt ? `${d > 0 ? "+" : ""}${((d / b.amt) * 100).toFixed(1)}%` : undefined,
      });
      for (const w of WHO) {
        // 값이 있는 마지막 두 날. 종목 순매수는 하루 늦게 들어와 오늘 칸이 비므로 직전 값과 그 날짜를 쓴다
        const has = f.filter((r) => r[w.key] !== null);
        if (has.length < 2) continue;
        const A = has[has.length - 1];
        const B = has[has.length - 2];
        const x = A[w.key]!;
        const dd = x - B[w.key]!;
        out.push({
          k: w.key,
          label: A.d === a.d ? w.label : `${w.label}(${A.d.slice(5).replace("-", ".")})`,
          value: fmtNet(x),
          tone: tone(x),
          diff: fmtNet(dd),
          diffTone: tone(dd),
        });
      }
    } else if (daily && daily.length >= 2 && daily[daily.length - 1].v && daily[daily.length - 2].v) {
      const a = daily[daily.length - 1].v!;
      const b = daily[daily.length - 2].v!;
      out.push({
        k: "vol",
        label: "거래량",
        value: fmtVol(a),
        tone: "",
        diff: `${a - b > 0 ? "+" : a - b < 0 ? "-" : ""}${fmtVol(Math.abs(a - b))}`,
        diffTone: tone(a - b),
        pct: `${a - b > 0 ? "+" : ""}${(((a - b) / b) * 100).toFixed(1)}%`,
      });
    }
    if (daily && daily.length > RSI_N + 2) {
      const r = rsi(daily.map((c) => c.c));
      const a = r[r.length - 1];
      const b = r[r.length - 2];
      if (a !== null && b !== null) {
        const d = a - b;
        out.push({
          k: "rsi",
          label: "RSI",
          value: a.toFixed(1),
          tone: a >= HOT ? "is-up" : a <= COLD ? "is-down" : "",
          diff: `${d > 0 ? "+" : ""}${d.toFixed(1)}p`,
          diffTone: tone(d),
        });
      }
    }
    return out;
  }, [extra, daily]);

  // 차트 만들기. 지수, 봉 단위, 받은 자료가 바뀌면 통째로 다시 만든다
  useEffect(() => {
    if (!ready || !model || !box.current) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    const el = box.current;

    import("lightweight-charts").then((L) => {
      if (disposed) return;
      const { candles: cs, rs, rows, mas } = model;
      const t = (d: string) => d as Time;
      chart = L.createChart(el, {
        autoSize: true,
        layout: {
          background: { color: "#ffffff" },
          textColor: "#595959",
          fontSize: narrow ? 10 : 11,
          fontFamily: "inherit",
          // 출처 표기는 사이트 푸터(Shell.tsx)로 옮겼다(라이선스는 페이지 안 링크로 충족). 푸터 줄을 지우면 다시 true로
          attributionLogo: false,
          panes: { separatorColor: "#dcdcdc", separatorHoverColor: "#bdbdbd", enableResize: true },
        },
        grid: { vertLines: { visible: false }, horzLines: { color: "#f0f0f0" } },
        rightPriceScale: { borderVisible: false, minimumWidth: narrow ? 0 : 64 },
        timeScale: { borderVisible: false, rightOffset: narrow ? 1 : 3, minBarSpacing: 0.5 },
        localization: { locale: "ko-KR", dateFormat: "yyyy.MM.dd" },
        // 십자선: 가는 실선 + 검은 축 라벨(HTS 모양). 봉 정보는 마우스 옆 정보 상자가 보여 준다
        crosshair: {
          mode: L.CrosshairMode.Normal,
          vertLine: { color: "#8a8a8a", width: 1, style: L.LineStyle.Solid, labelBackgroundColor: INK },
          horzLine: { color: "#8a8a8a", width: 1, style: L.LineStyle.Dashed, labelBackgroundColor: INK },
        },
        handleScroll: { vertTouchDrag: false },
      });
      chartRef.current = chart;

      // 0 캔들 + 이동평균 + 과매수, 과매도 진입 표식
      const candle = chart.addSeries(L.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
        priceLineColor: INK,
        // 휴대폰은 축 폭을 아끼려고 1,000 이상이면 소수점을 뗀다
        priceFormat: { type: "custom", formatter: (p: number) => (narrow && p >= 1000 ? INT.format(p) : fmtPx(p)), minMove: 0.01 },
      });
      candle.setData(cs.map((c) => ({ time: t(c.d), open: c.o, high: c.h, low: c.l, close: c.c })));
      if (show.ma) MAS.forEach((m, k) => {
        const s = chart!.addSeries(L.LineSeries, {
          color: m.color,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        s.setData(cs.map((c, i) => (mas[k][i] === null ? { time: t(c.d) } : { time: t(c.d), value: mas[k][i]! })));
      });
      const zone = (i: number) => (rs[i] === null ? null : rs[i]! >= HOT ? "hot" : rs[i]! <= COLD ? "cold" : null);
      L.createSeriesMarkers(
        candle,
        cs.flatMap((c, i) => {
          const z = zone(i);
          if (!z || (i > 0 && zone(i - 1) === z)) return [];
          return [
            {
              time: t(c.d),
              position: z === "hot" ? ("aboveBar" as const) : ("belowBar" as const),
              shape: z === "hot" ? ("arrowDown" as const) : ("arrowUp" as const),
              color: INK,
              size: 1,
            },
          ];
        }),
      );

      let pane = 1;
      const heights: number[] = [];
      // 휴대폰은 축 라벨에 판 이름을 붙이지 않는다(축이 넓어져 차트가 좁아진다). 값은 정보 상자가 보여 준다
      const fmtTitle = (title: string) => ({ title: narrow ? "" : title, priceLineVisible: false });

      // 1 거래대금 / 거래량
      if (show.vol && model.hasAmt) {
        const s = chart.addSeries(
          L.HistogramSeries,
          { ...fmtTitle("거래대금"), priceFormat: { type: "custom", formatter: fmtEok, minMove: 1 } },
          pane,
        );
        s.setData(
          cs.map((c, i) =>
            rows[i].amt === null
              ? { time: t(c.d) }
              : { time: t(c.d), value: rows[i].amt!, color: c.c >= c.o ? "rgba(200,40,58,.55)" : "rgba(34,99,201,.55)" },
          ),
        );
        heights[pane++] = 74;
      } else if (show.vol && cs.some((c) => c.v)) {
        const s = chart.addSeries(
          L.HistogramSeries,
          { ...fmtTitle("거래량"), priceFormat: { type: "custom", formatter: fmtVol, minMove: 1 } },
          pane,
        );
        s.setData(
          cs.map((c) =>
            c.v ? { time: t(c.d), value: c.v, color: c.c >= c.o ? "rgba(200,40,58,.55)" : "rgba(34,99,201,.55)" } : { time: t(c.d) },
          ),
        );
        heights[pane++] = 74;
      }

      // 2 투자자 순매수. 전체 = 주체별 선 세 개, 한 주체 = 막대(+ 빨강, - 파랑)
      netRef.current = null;
      netLinesRef.current = [];
      if (model.hasNet && activeInv.length) {
        const fmt = { type: "custom" as const, formatter: fmtNet, minMove: 0.1 };
        netRef.current = chart.addSeries(L.HistogramSeries, { ...fmtTitle("순매수"), priceFormat: fmt }, pane);
        netLinesRef.current = WHO.map((w) =>
          chart!.addSeries(
            L.LineSeries,
            { color: w.color, lineWidth: 1, title: narrow ? "" : w.label, priceLineVisible: false, priceFormat: fmt, crosshairMarkerRadius: 3 },
            pane,
          ),
        );
        heights[pane++] = 90;
      }

      // 3 RSI
      if (show.rsi) {
      const rdata = cs.map((c, i) => (rs[i] === null ? { time: t(c.d) } : { time: t(c.d), value: Math.round(rs[i]! * 10) / 10 }));
      const clear = "rgba(0,0,0,0)";
      chart
        .addSeries(
          L.BaselineSeries,
          {
            baseValue: { type: "price", price: HOT },
            topFillColor1: "rgba(200,40,58,.32)",
            topFillColor2: "rgba(200,40,58,.32)",
            topLineColor: clear,
            bottomFillColor1: clear,
            bottomFillColor2: clear,
            bottomLineColor: clear,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          pane,
        )
        .setData(rdata);
      chart
        .addSeries(
          L.BaselineSeries,
          {
            baseValue: { type: "price", price: COLD },
            topFillColor1: clear,
            topFillColor2: clear,
            topLineColor: clear,
            bottomFillColor1: "rgba(34,99,201,.32)",
            bottomFillColor2: "rgba(34,99,201,.32)",
            bottomLineColor: clear,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          pane,
        )
        .setData(rdata);
      const rline = chart.addSeries(
        L.LineSeries,
        { color: INK, lineWidth: 1, ...fmtTitle("RSI"), priceFormat: { type: "custom", formatter: (p: number) => p.toFixed(0), minMove: 0.1 } },
        pane,
      );
      rline.setData(rdata);
      for (const p of [HOT, COLD]) rline.createPriceLine({ price: p, color: "#9e9e9e", lineWidth: 1, lineStyle: 2, axisLabelVisible: true });
      heights[pane++] = 90;
      }

      // 4 신용잔고
      if (show.credit && model.hasCredit) {
        const s = chart.addSeries(
          L.LineSeries,
          { color: "#f08c00", lineWidth: 2, ...fmtTitle("신용잔고"), priceFormat: { type: "custom", formatter: fmtEok, minMove: 1 } },
          pane,
        );
        s.setData(cs.map((c, i) => (rows[i].credit === null ? { time: t(c.d) } : { time: t(c.d), value: rows[i].credit! })));
        heights[pane++] = 74;
      }

      // 판 높이는 비율로 준다. 픽셀(setHeight)은 차트가 크기를 잡기 전에 부르면 먹지 않았다
      const panes = chart.panes();
      panes[0]?.setStretchFactor(narrow ? 240 : 300);
      heights.forEach((h, i) => h && panes[i]?.setStretchFactor(narrow ? Math.round(h * 0.75) : h));

      chart.subscribeCrosshairMove((p) => {
        const i = p.logical === undefined || p.point === undefined ? null : Math.round(p.logical);
        setHover(i !== null && i >= 0 && i < cs.length ? { i, x: p.point!.x, y: p.point!.y } : null);
      });
      // 같은 자료에서 판만 켜고 껐으면 보던 구간을 지킨다. 아니면 고른 기간으로
      const keep = rangeRef.current;
      if (keep && keep.key === `${indexKey}:${unit}:${cs.length}`) chart.timeScale().setVisibleLogicalRange({ from: keep.from, to: keep.to });
      else applyRange(chart, cs, monthsRef.current);
      paintNet();
    });

    const reset = () => chartRef.current && applyRange(chartRef.current, model.candles, monthsRef.current);
    el.addEventListener("dblclick", reset);
    return () => {
      disposed = true;
      el.removeEventListener("dblclick", reset);
      const r = chart?.timeScale().getVisibleLogicalRange();
      rangeRef.current = r ? { key: `${indexKey}:${unit}:${model.candles.length}`, from: r.from, to: r.to } : null;
      chart?.remove();
      chartRef.current = null;
      netRef.current = null;
      netLinesRef.current = [];
    };
    // paintNet은 who를 읽는다. 차트를 다시 만들지 않고 아래 effect가 따로 칠한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, model, narrow, showKey]);

  function paintNet() {
    const s = netRef.current;
    if (!s || !model) return;
    const cs = model.candles;
    // 켠 주체가 둘 이상이면 선, 하나면 막대(+ 빨강, - 파랑)
    if (activeInv.length !== 1) {
      s.setData([]);
      netLinesRef.current.forEach((line, k) => {
        const key = WHO[k].key;
        line.setData(
          show.flow ? cs.map((c, i) => (model.rows[i][key] === null ? { time: c.d as Time } : { time: c.d as Time, value: model.rows[i][key]! })) : [],
        );
      });
      return;
    }
    const one = activeInv[0].key;
    netLinesRef.current.forEach((line) => line.setData([]));
    s.setData(
      cs.map((c, i) => {
        const v = model.rows[i][one];
        return v === null
          ? { time: c.d as Time }
          : { time: c.d as Time, value: v, color: v >= 0 ? "rgba(200,40,58,.7)" : "rgba(34,99,201,.7)" };
      }),
    );
  }
  // 칩을 바꿀 때만 다시 칠한다(십자선이 움직일 때마다 칠하면 수천 점을 매번 다시 넣는다)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => paintNet(), [showKey, model]);

  useEffect(() => {
    if (chartRef.current && model) applyRange(chartRef.current, model.candles, months);
  }, [months, model]);

  const u = UNITS.find((x) => x.key === unit)!;
  const pickUnit = (k: Interval) => {
    const ok = UNITS.find((x) => x.key === k)!.ok;
    setUnit(k);
    if (!ok.includes(months)) {
      setMonths(ok.reduce((best, m) => (Math.abs(m - months) < Math.abs(best - months) ? m : best), ok[0]));
    }
  };

  // 봉 하나의 정보. 요약 줄(마지막 봉)과 마우스 옆 정보 상자(가리킨 봉)가 같이 쓴다
  type Item = { k: string; label: string; value: string; tone?: string; note?: string };
  const infoOf = (i: number): Item[] => {
    // 봉 단위를 바꾸는 순간 이전 차트의 봉 번호가 새 자료 범위를 넘을 수 있다(실제로 렌더가 터졌다)
    if (!model || i < 0 || i >= model.candles.length) return [];
    const c = model.candles[i];
    const r = model.rows[i];
    const v = model.rs[i];
    const prev = i > 0 ? model.candles[i - 1].c : null;
    const tone = (x: number | null | undefined) => (x === null || x === undefined ? "" : x > 0 ? "is-up" : x < 0 ? "is-down" : "");
    const chg = prev ? ((c.c - prev) / prev) * 100 : null;
    const out: Item[] = [
      { k: "o", label: "시가", value: fmtPx(c.o) },
      { k: "h", label: "고가", value: fmtPx(c.h), tone: "is-up" },
      { k: "l", label: "저가", value: fmtPx(c.l), tone: "is-down" },
      {
        k: "c",
        label: "종가",
        value: fmtPx(c.c),
        tone: tone(chg),
        note: chg === null ? undefined : `${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`,
      },
    ];
    if (show.vol && model.hasAmt) out.push({ k: "amt", label: "거래대금", value: fmtEok(r.amt) });
    else if (show.vol && c.v) out.push({ k: "vol", label: "거래량", value: fmtVol(c.v) });
    if (model.hasNet) for (const w of activeInv) if (model.invHas[w.key]) out.push({ k: w.key, label: w.label, value: fmtNet(r[w.key]), tone: tone(r[w.key]) });
    if (show.rsi) out.push({ k: "rsi", label: "RSI", value: v === null ? "-" : v.toFixed(1), tone: v === null ? "" : v >= HOT ? "is-up" : v <= COLD ? "is-down" : "" });
    if (show.credit && model.hasCredit) {
      // 신용잔고는 이틀쯤 늦게 나온다. 그 봉에 값이 없으면 직전 값과 그 날짜를 적는다
      let k = i;
      while (k >= 0 && model.rows[k].credit === null) k--;
      if (k >= 0) out.push({ k: "cr", label: "신용잔고", value: fmtEok(model.rows[k].credit), note: k !== i ? `${model.rows[k].d.slice(5).replace("-", ".")} 기준` : undefined });
    }
    return out;
  };

  // 마지막 봉 고정 요약 줄은 지웠다(사용자 지시, 2026-11-24). 오늘 값은 위 지수 카드에, 봉별 값은 정보 상자에 있다

  // 마우스 옆 정보 상자. 오른쪽 끝에 가까우면 왼쪽으로 뒤집는다
  let tip: React.ReactNode = null;
  if (model && hover && hover.i < model.candles.length) {
    const c = model.candles[hover.i];
    const W = wrapRef.current?.clientWidth ?? 800;
    const H = wrapRef.current?.clientHeight ?? 500;
    const left = hover.x > W - 230 ? hover.x - 16 - 200 : hover.x + 16;
    const top = Math.min(Math.max(hover.y - 40, 4), H - 250);
    tip = (
      <div className="ixk-tip" style={{ left, top }}>
        <p className="ixk-tip-date">
          {c.d.replace(/-/g, ".")}
          {unit === "1wk" ? " 주" : unit === "1mo" ? " 월" : ""}
        </p>
        <dl>
          {infoOf(hover.i).map((x) => (
            <div key={x.k}>
              <dt>{x.label}</dt>
              <dd className={x.tone}>
                {x.value}
                {x.note ? <i>{x.note}</i> : null}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const k = narrow ? 0.75 : 1;
  const height = Math.round(
    (narrow ? 240 : 300) +
      30 +
      k *
        ((show.vol && (model?.hasAmt || model?.candles.some((c) => c.v)) ? 74 : 0) +
          (model?.hasNet && activeInv.length ? 90 : 0) +
          (show.rsi ? 90 : 0) +
          (show.credit && model?.hasCredit ? 74 : 0)),
  );

  return (
    <section ref={sectionRef} className={`ixk${full ? " is-full" : ""}`} aria-label={`${name} 지난 흐름`}>
      <div className="ixk-head">
        <h3>
          {name}
          {/* 요약 줄이 말하는 날짜(마지막 봉). 요약 줄 맨 앞에 있던 것을 제목 옆으로 올렸다(사용자 지시) */}
          {model ? <span className="ixk-head-date">{model.candles[model.candles.length - 1].d.replace(/-/g, ".")}</span> : null}
        </h3>
        <div className="ixk-ctrls">
          {/* 지표 단추 → 지표 목록(스위치). 증권사 앱(키움, 나무, 토스)의 "지표 설정" 방식. 누를 때마다 저장된다 */}
          {model
            ? (() => {
                const items = (
                  [
                    { key: "ma" as const, label: "이동평균선", note: "5, 20, 60, 120", swatch: MAS.map((m) => m.color) },
                    model.hasAmt || model.candles.some((c) => c.v)
                      ? { key: "vol" as const, label: model.hasAmt ? "거래대금" : "거래량" }
                      : null,
                    model.hasNet
                      ? {
                          key: "flow" as const,
                          label: "투자자 수급",
                          note: WHO.filter((w) => model.invHas[w.key]).map((w) => w.label).join(", "),
                          swatch: WHO.filter((w) => model.invHas[w.key]).map((w) => w.color),
                        }
                      : null,
                    { key: "rsi" as const, label: "RSI", note: "14일, 70 과매수, 30 과매도" },
                    model.hasCredit ? { key: "credit" as const, label: "신용잔고", note: "코스피, 코스닥 합계" } : null,
                  ].filter(Boolean) as Array<{ key: keyof Show; label: string; note?: string; swatch?: string[] }>
                );
                const on = items.filter((x) => show[x.key]).length;
                return (
                  <div className="ixk-ind" ref={panelRef}>
                    <button
                      type="button"
                      className={`ixk-ind-btn${panel ? " is-open" : ""}`}
                      aria-haspopup="dialog"
                      aria-expanded={panel}
                      onClick={() => setPanel((v) => !v)}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true">
                        <path d="M2 4h7M12 4h2M2 12h2M7 12h7" />
                        <circle cx="10.5" cy="4" r="1.6" />
                        <circle cx="5.5" cy="12" r="1.6" />
                      </svg>
                      지표 <b>{on}</b>
                    </button>
                    {panel ? (
                      <>
                        <div className="ixk-ind-scrim" aria-hidden="true" onClick={() => setPanel(false)} />
                        <div className="ixk-ind-panel" role="dialog" aria-label="차트 지표">
                          <p className="ixk-ind-head">
                            차트 지표
                            <button type="button" onClick={() => setPanel(false)} aria-label="닫기">
                              닫기
                            </button>
                          </p>
                          <ul>
                            {items.map((x) => (
                              <li key={x.key}>
                                <label>
                                  <span className="ixk-ind-txt">
                                    <b>
                                      {x.label}
                                      {x.swatch ? (
                                        <span className="ixk-ind-sw" aria-hidden="true">
                                          {x.swatch.map((c) => (
                                            <i key={c} style={{ background: c }} />
                                          ))}
                                        </span>
                                      ) : null}
                                    </b>
                                    {x.note ? <small>{x.note}</small> : null}
                                  </span>
                                  <input
                                    type="checkbox"
                                    role="switch"
                                    className="ixk-switch"
                                    checked={show[x.key]}
                                    onChange={() => toggle(x.key)}
                                  />
                                </label>
                              </li>
                            ))}
                          </ul>
                          <p className="ixk-ind-foot">설정은 이 브라우저에 저장됩니다</p>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })()
            : null}
          <div className="ixk-ranges" role="tablist" aria-label="봉 단위">
            {UNITS.map((x) => (
              <button
                key={x.key}
                type="button"
                role="tab"
                aria-selected={unit === x.key}
                className={unit === x.key ? "is-on" : ""}
                onClick={() => pickUnit(x.key)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="ixk-ranges ixk-ranges--sub" role="tablist" aria-label="기간">
            {PERIODS.map((p) => {
              const ok = u.ok.includes(p.m);
              return (
                <button
                  key={p.m}
                  type="button"
                  role="tab"
                  aria-selected={months === p.m}
                  disabled={!ok}
                  title={ok ? undefined : `${u.label}로는 볼 수 없는 기간`}
                  className={months === p.m ? "is-on" : ""}
                  onClick={() => {
                    setMonths(p.m);
                    // 같은 기간을 다시 눌러도 그 구간으로 돌아가게
                    if (p.m === months && chartRef.current && model) applyRange(chartRef.current, model.candles, p.m);
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="ixk-full"
            onClick={full ? exitFull : enterFull}
            aria-label={full ? "전체화면 닫기" : "차트 전체화면"}
            title={full ? "전체화면 닫기 (Esc)" : "전체화면"}
          >
            {full ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
              </svg>
            )}
          </button>
        </div>
      </div>
      {/* 오늘 지표 띠는 지표 켜고 끄기와 무관하게 늘 전부 보인다(사용자 지시) */}
      {today.length ? (
        <ul className="ixk-today" aria-label="오늘 지표와 전일 대비">
          {today.map((s) => (
            // 한 줄 띠(2026-11-24 사용자 지시 "너무 많이 차지함"). "전일 대비"는 글자 대신 ▲▼와 마우스 설명으로
            <li key={s.k} title={`전일 대비 ${s.diff}${s.pct ? ` (${s.pct})` : ""}`}>
              <span className="ixk-today-label">{s.label}</span>
              <b className={s.tone}>{s.value}</b>
              <span className={`ixk-today-diff ${s.diffTone}`}>
                {s.diffTone === "is-up" ? "▲" : s.diffTone === "is-down" ? "▼" : ""}
                {/* ▲▼가 방향을 말하므로 부호는 뗀다 */}
                {(s.pct ?? s.diff).replace(/^[+-]/, "")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {candles === null ? (
        <p className="ixk-none" style={{ height: 300 }}>
          지금은 지수 시세를 받아 오지 못했습니다.
        </p>
      ) : (
        <div className="ixk-chart-wrap" ref={wrapRef}>
          <div className={`ixk-chart${ready ? "" : " shimmer"}`} ref={box} style={{ height }} />
          {tip}
        </div>
      )}
    </section>
  );
}

function applyRange(chart: IChartApi, cs: Candle[], months: number) {
  const last = cs[cs.length - 1].d;
  const from = monthsBefore(last, months);
  const start = Math.max(0, cs.findIndex((c) => c.d > from));
  chart.timeScale().setVisibleLogicalRange({ from: start - 0.5, to: cs.length - 1 + 3 });
}
