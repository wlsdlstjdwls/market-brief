/**
 * 최신 시세 (2026-11-24 사용자 지시: 상단 지수 띠, 종목 상세의 현재 시세). **서버에서만 부른다.**
 *
 * 원천은 비공식 API 둘이다. 키가 없다. 막히면 값이 빈 채로 돌아오고 화면은 그 칸을 그리지 않는다.
 *   국내 지수, 종목  네이버 증권 m.stock.naver.com/api/{index|stock}/{코드}/basic
 *   해외 지수, 종목  Yahoo chart query1.finance.yahoo.com/v8/finance/chart/{티커}
 *
 * 라우트(`/api/quotes`)가 응답에 CDN 캐시 60초를 단다. 방문자가 늘어도 원천에는 분당 한 번 남짓만 간다.
 * 리포트 산문에서 숫자를 읽지 않는다는 원칙(CLAUDE.md 절대 규칙 4)과 같은 선이다 — 시세는 시세 원천에서만.
 *
 * **유료 전환 시 다시 볼 것:** 실시간 시세를 공개 페이지에 재배포하는 것은 거래소 시세 이용 약관 대상일 수 있다.
 */

export interface Quote {
  /** 표시 이름 */
  name: string;
  price: number;
  change: number;
  /** 등락률 % */
  pct: number;
  /** 장중 여부. 끝났으면 종가다 */
  open: boolean;
  /** 원천이 준 체결 시각(ISO). 없으면 null */
  at: string | null;
  cur: "KRW" | "USD" | null;
}

const UA = "Mozilla/5.0 (compatible; thebriefing.kr)";
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** 네이버: kind = "index" | "stock" */
async function naver(kind: "index" | "stock", code: string, name?: string): Promise<Quote | null> {
  const j = (await getJson(`https://m.stock.naver.com/api/${kind}/${encodeURIComponent(code)}/basic`)) as Record<string, unknown>;
  const price = num(j.closePrice);
  if (!Number.isFinite(price)) return null;
  const dir = (j.compareToPreviousPrice as { name?: string } | undefined)?.name ?? "";
  const sign = /FALL|LOWER_LIMIT/.test(dir) ? -1 : 1;
  const change = Math.abs(num(j.compareToPreviousClosePrice)) * sign;
  const pct = Math.abs(num(j.fluctuationsRatio)) * sign;
  return {
    name: name ?? String(j.stockName ?? code),
    price,
    change: Number.isFinite(change) ? change : 0,
    pct: Number.isFinite(pct) ? pct : 0,
    open: j.marketStatus === "OPEN",
    at: typeof j.localTradedAt === "string" ? j.localTradedAt : null,
    cur: kind === "stock" ? "KRW" : null,
  };
}

/** Yahoo: 지수(^IXIC 등)와 미국 종목 티커 */
async function yahoo(symbol: string, name?: string, cur: Quote["cur"] = "USD"): Promise<Quote | null> {
  const j = (await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
  )) as { chart?: { result?: Array<{ meta?: Record<string, unknown> }> } };
  const m = j.chart?.result?.[0]?.meta;
  if (!m) return null;
  const price = num(m.regularMarketPrice);
  const prev = num(m.chartPreviousClose ?? m.previousClose);
  if (!Number.isFinite(price) || !Number.isFinite(prev) || prev === 0) return null;
  const t = num(m.regularMarketTime);
  const period = (m.currentTradingPeriod as { regular?: { start?: number; end?: number } } | undefined)?.regular;
  const now = Date.now() / 1000;
  return {
    name: name ?? String(m.shortName ?? symbol),
    price,
    change: price - prev,
    pct: ((price - prev) / prev) * 100,
    open: !!period?.start && !!period?.end && now >= period.start && now < period.end,
    at: Number.isFinite(t) ? new Date(t * 1000).toISOString() : null,
    cur,
  };
}

/** 상단 띠의 지수. 순서가 화면 순서다 */
export const INDEX_SET: Array<{ key: string; name: string; get: () => Promise<Quote | null> }> = [
  { key: "KOSPI", name: "코스피", get: () => naver("index", "KOSPI", "코스피") },
  { key: "KOSDAQ", name: "코스닥", get: () => naver("index", "KOSDAQ", "코스닥") },
  { key: "IXIC", name: "나스닥", get: () => yahoo("^IXIC", "나스닥", null) },
  { key: "GSPC", name: "S&P500", get: () => yahoo("^GSPC", "S&P500", null) },
  { key: "DJI", name: "다우존스", get: () => yahoo("^DJI", "다우존스", null) },
];

/** 실패한 것은 빼고 돌려준다. 하나가 막혀도 나머지는 그린다 */
export async function indexQuotes(): Promise<Array<Quote & { key: string }>> {
  const got = await Promise.allSettled(INDEX_SET.map((i) => i.get()));
  return got.flatMap((r, i) =>
    r.status === "fulfilled" && r.value ? [{ ...r.value, key: INDEX_SET[i].key }] : [],
  );
}

/** 국내 6자리 코드는 네이버, 그 밖(티커)은 Yahoo */
export const STOCK_CODE_RE = /^(\d{6}|[A-Z][A-Z0-9.\-]{0,9})$/;

export async function stockQuote(code: string): Promise<Quote | null> {
  if (!STOCK_CODE_RE.test(code)) return null;
  try {
    return /^\d{6}$/.test(code) ? await naver("stock", code) : await yahoo(code);
  } catch {
    return null;
  }
}

/* ---------- 지수 그래프 (2026-11-24, 상단 띠 미니 그래프와 펼침 그래프, 브리핑 머리 카드) ---------- */

/** 그래프 원천은 Yahoo 하나로 통일한다(국내 지수도 ^KS11, ^KQ11). 값 표시는 위 indexQuotes가 따로 준다 */
export const INDEX_SYMBOL: Record<string, string> = {
  KOSPI: "^KS11",
  KOSDAQ: "^KQ11",
  IXIC: "^IXIC",
  GSPC: "^GSPC",
  DJI: "^DJI",
};

/* ---------- 지수 캔들 (2026-11-24 사용자 지시 "과거 지수도 캔들차트로") ---------- */

/** 봉 단위. 일봉, 주봉, 월봉 */
export type CandleInterval = "1d" | "1wk" | "1mo";
/**
 * 단위마다 받아 오는 기간. 화면이 고르는 가장 긴 기간보다 넉넉히 길다 —
 * RSI(14)가 화면 첫 봉부터 값을 가지려면 앞쪽 봉이 더 있어야 해서다. 자르기는 브라우저가 한다
 */
const CANDLE_FETCH: Record<CandleInterval, string> = { "1d": "2y", "1wk": "10y", "1mo": "max" };
export const CANDLE_INTERVALS = Object.keys(CANDLE_FETCH) as CandleInterval[];

export interface Candle {
  /** 거래소 현지 날짜 YYYY-MM-DD (봉이 시작한 날) */
  d: string;
  o: number;
  h: number;
  l: number;
  c: number;
  /** 거래량(주). 없으면 null. 원천이 거래대금은 주지 않는다 */
  v: number | null;
}

/** Yahoo가 국내 지수 거래량을 천 주 단위로 준다(네이버 "176,060천주"와 같은 값). 미국 지수는 주 단위 */
const VOLUME_SCALE: Record<string, number> = { KOSPI: 1000, KOSDAQ: 1000 };

export async function indexCandles(key: string, interval: CandleInterval): Promise<Candle[] | null> {
  const sym = INDEX_SYMBOL[key];
  if (!sym || !CANDLE_FETCH[interval]) return null;
  return yahooCandles(sym, interval, VOLUME_SCALE[key] ?? 1);
}

/** Yahoo 캔들(지수, 해외 종목). scale = 거래량 단위 보정(국내 지수는 천 주 단위로 온다) */
async function yahooCandles(sym: string, interval: CandleInterval, scale: number): Promise<Candle[] | null> {
  try {
    const j = (await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${CANDLE_FETCH[interval]}&interval=${interval}`,
    )) as {
      chart?: {
        result?: Array<{
          meta?: Record<string, unknown>;
          timestamp?: number[];
          indicators?: { quote?: Array<Record<"open" | "high" | "low" | "close" | "volume", Array<number | null> | undefined>> };
        }>;
      };
    };
    const r = j.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    const ts = r?.timestamp ?? [];
    if (!q) return null;
    // 날짜는 거래소 현지 기준. UTC로 자르면 미국장 일봉이 하루 밀린다
    const off = num(r?.meta?.gmtoffset);
    const shift = Number.isFinite(off) ? off : 0;
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const out: Candle[] = [];
    ts.forEach((t, i) => {
      const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
      if ([o, h, l, c].some((v) => typeof v !== "number" || !Number.isFinite(v))) return;
      const vol = q.volume?.[i];
      out.push({
        d: new Date((t + shift) * 1000).toISOString().slice(0, 10),
        o: r2(o!), h: r2(h!), l: r2(l!), c: r2(c!),
        v: typeof vol === "number" && vol > 0 ? vol * scale : null,
      });
    });
    return out.length >= 2 ? out : null;
  } catch {
    return null;
  }
}

/* ---------- 종목 차트 (2026-11-24 사용자 지시 "종목 상세에도 지수 차트 기능 그대로") ---------- */

const DAUM_HEAD = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

async function daumPages<T>(url: (p: number) => string, referer: string, pages: number): Promise<T[]> {
  const one = async (p: number) => {
    const res = await fetch(url(p), {
      headers: { ...DAUM_HEAD, Referer: referer },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return ((await res.json()) as { data?: T[] }).data ?? [];
  };
  const got = await Promise.allSettled(Array.from({ length: pages }, (_, i) => one(i + 1)));
  return got.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

type DaumDay = {
  date?: string;
  openingPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  tradePrice?: number;
  accTradeVolume?: number;
  accTradePrice?: number;
};

/** 국내 종목 일별 시세. 다음 금융 `quote/A{코드}/days`, 500일씩 다섯 장 = 약 10년. 날짜 오름차순 */
async function krStockDays(code: string) {
  const rows = await daumPages<DaumDay>(
    (p) => `https://finance.daum.net/api/quote/A${code}/days?symbolCode=A${code}&page=${p}&perPage=500&pagination=true`,
    `https://finance.daum.net/quotes/A${code}`,
    5,
  );
  const seen = new Set<string>();
  return rows
    .flatMap((r) => {
      const d = r.date?.slice(0, 10);
      const ok = [r.openingPrice, r.highPrice, r.lowPrice, r.tradePrice].every((v) => typeof v === "number" && v > 0);
      if (!d || !ok || seen.has(d)) return [];
      seen.add(d);
      return [{ d, o: r.openingPrice!, h: r.highPrice!, l: r.lowPrice!, c: r.tradePrice!, v: r.accTradeVolume ?? null, amt: r.accTradePrice ?? null }];
    })
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

/** 일봉을 주봉(월요일 시작), 월봉으로 묶는다. 봉 날짜는 그 구간 첫 거래일 */
function rollUp<T extends Candle>(days: T[], interval: CandleInterval): Candle[] {
  if (interval === "1d") return days.map(({ d, o, h, l, c, v }) => ({ d, o, h, l, c, v }));
  const keyOf = (d: string) => {
    if (interval === "1mo") return d.slice(0, 7);
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); // 그 주 월요일
    return t.toISOString().slice(0, 10);
  };
  const out: Candle[] = [];
  let k = "";
  for (const x of days) {
    const kk = keyOf(x.d);
    const last = out[out.length - 1];
    if (kk !== k || !last) {
      out.push({ d: x.d, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v });
      k = kk;
    } else {
      last.h = Math.max(last.h, x.h);
      last.l = Math.min(last.l, x.l);
      last.c = x.c;
      last.v = x.v === null ? last.v : (last.v ?? 0) + x.v;
    }
  }
  return out;
}

const KR_CODE = /^\d{6}$/;
const US_TICKER = /^[A-Z][A-Z0-9.\-]{0,9}$/;

/**
 * 종목 캔들. 국내 6자리 코드는 다음 금융 일별 시세를 묶어서, 해외 티커는 Yahoo에서.
 * **국내 종목에 Yahoo를 쓰지 않는다** — 코스닥 종목에 `.KS`를 붙여도 엉뚱한 종목 값이 돌아왔다(247540.KS).
 */
export async function stockCandles(code: string, interval: CandleInterval): Promise<Candle[] | null> {
  try {
    if (KR_CODE.test(code)) {
      const days = await krStockDays(code);
      const out = rollUp(days, interval);
      return out.length >= 2 ? out : null;
    }
    if (!US_TICKER.test(code)) return null;
    return await yahooCandles(code, interval, 1);
  } catch {
    return null;
  }
}

/**
 * 국내 종목 거래대금(억 원)과 외국인, 기관 순매수(**주**). 다음 금융 `investor/days`는 순매수를 수량으로만 주고
 * 개인은 주지 않는다. 지수(억 원)와 단위가 달라 응답에 `netUnit: "shares"`를 붙인다. 추정으로 개인을 채우지 않는다.
 */
export async function stockFlows(code: string): Promise<Flow[] | null> {
  if (!KR_CODE.test(code)) return null;
  try {
    const [days, inv] = await Promise.all([
      krStockDays(code),
      daumPages<{ date?: string; foreignStraightPurchaseVolume?: number; institutionStraightPurchaseVolume?: number }>(
        (p) => `https://finance.daum.net/api/investor/days?symbolCode=A${code}&page=${p}&perPage=500&pagination=true`,
        `https://finance.daum.net/quotes/A${code}`,
        3,
      ),
    ]);
    const net = new Map(inv.flatMap((r) => (r.date ? [[r.date.slice(0, 10), r] as const] : [])));
    const out = days.map((x) => {
      const n = net.get(x.d);
      const num0 = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      return {
        d: x.d,
        amt: x.amt === null ? 0 : Math.round(x.amt / 1e7) / 10,
        frg: n ? num0(n.foreignStraightPurchaseVolume) : null,
        ins: n ? num0(n.institutionStraightPurchaseVolume) : null,
        ind: null,
      };
    });
    return out.length ? out : null;
  } catch {
    return null;
  }
}

/* ---------- 국내 지수 거래대금, 투자자 순매수, 신용잔고 (2026-11-24 사용자 지시) ---------- */

export interface Flow {
  /** YYYY-MM-DD */
  d: string;
  /** 거래대금(원) */
  amt: number;
}

/**
 * 코스피, 코스닥 일별 거래대금. 다음 금융 `market_index/days`(키 없음, Referer가 있어야 답한다).
 * accTradePrice가 백만 원 단위다(네이버 "14,558,877백만"과 같은 값). 억 원으로 바꿔 보낸다. 500일씩 다섯 장 = 약 10년.
 * 해외 지수는 거래대금 원천이 없다 — 화면은 거래량을 쓴다.
 */
const DAUM_MARKET: Record<string, string> = { KOSPI: "KOSPI", KOSDAQ: "KOSDAQ" };

/** 원 → 억 원(소수 한 자리) */
const fin = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v / 1e7) / 10 : null);

export async function indexFlows(key: string): Promise<Flow[] | null> {
  const market = DAUM_MARKET[key];
  if (!market) return null;
  const page = async (p: number) => {
    const res = await fetch(
      `https://finance.daum.net/api/market_index/days?page=${p}&perPage=500&market=${market}&pagination=true`,
      {
        headers: { "User-Agent": "Mozilla/5.0", Referer: "https://finance.daum.net/domestic", Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as {
      data?: Array<{
        date?: string;
        accTradePrice?: number;
        individualStraightPurchasePrice?: number;
        foreignStraightPurchasePrice?: number;
        institutionStraightPurchasePrice?: number;
      }>;
    };
    return j.data ?? [];
  };
  try {
    const pages = await Promise.all([1, 2, 3, 4, 5].map(page));
    const out = pages
      .flat()
      .flatMap((r) =>
        typeof r.date === "string" && typeof r.accTradePrice === "number" && r.accTradePrice > 0
          ? [
              {
                d: r.date.slice(0, 10),
                amt: Math.round(r.accTradePrice / 100),
                // 순매수는 원 단위로 온다
                ind: fin(r.individualStraightPurchasePrice),
                frg: fin(r.foreignStraightPurchasePrice),
                ins: fin(r.institutionStraightPurchasePrice),
              },
            ]
          : [],
      )
      .sort((a, b) => (a.d < b.d ? -1 : 1));
    return out.length ? out : null;
  } catch {
    return null;
  }
}

export interface Credit {
  d: string;
  /** 신용잔고(억 원). 코스피 + 코스닥 시장 전체 합계 */
  v: number;
}

/**
 * 신용잔고. 네이버 증시자금동향(`stock.naver.com/api/domestic/market/trendDeposit`, 금융투자협회 집계).
 * creditLoan이 억 원 단위다. **시장 전체 합계**이고 이틀쯤 늦게 나온다. 200일씩 열세 장 = 약 10년.
 * startIdx는 줄 번호가 아니라 **쪽 번호**다(0, 1, 2 …).
 */
export async function creditBalance(): Promise<Credit[] | null> {
  const page = async (p: number) => {
    const res = await fetch(`https://stock.naver.com/api/domestic/market/trendDeposit?startIdx=${p}&pageSize=200`, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = (await res.json()) as { content?: Array<{ bizdate?: string; creditLoan?: string }> };
    return j.content ?? [];
  };
  try {
    const got = await Promise.allSettled(Array.from({ length: 13 }, (_, i) => page(i)));
    const out = got
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .flatMap((r) => {
        const v = num(r.creditLoan);
        const d = r.bizdate ?? "";
        return /^\d{8}$/.test(d) && Number.isFinite(v) && v > 0
          ? [{ d: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, v }]
          : [];
      })
      .sort((a, b) => (a.d < b.d ? -1 : 1));
    // 쪽이 겹쳐 같은 날이 두 번 올 수 있다
    return out.length ? out.filter((r, i) => i === 0 || r.d !== out[i - 1].d) : null;
  } catch {
    return null;
  }
}

export type SeriesRange = "1d" | "1mo" | "1y";
const INTERVAL: Record<SeriesRange, string> = { "1d": "5m", "1mo": "1d", "1y": "1wk" };

export interface Series {
  /** 종가 줄. 빈 값은 뺐다 */
  c: number[];
  /** 기준값. 오늘은 전일 종가, 1개월, 1년은 첫 값. 등락과 점선 기준선이 이걸 쓴다 */
  base: number;
}

export async function indexSeries(key: string, range: SeriesRange): Promise<Series | null> {
  const sym = INDEX_SYMBOL[key];
  if (!sym) return null;
  try {
    const j = (await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=${INTERVAL[range]}`,
    )) as {
      chart?: { result?: Array<{ meta?: Record<string, unknown>; indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
    };
    const r = j.chart?.result?.[0];
    const c = (r?.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (c.length < 2) return null;
    const prev = num(r?.meta?.chartPreviousClose);
    const base = range === "1d" && Number.isFinite(prev) ? prev : c[0];
    // 그래프용이라 소수 둘째 자리면 충분하다(응답 크기)
    return { c: c.map((v) => Math.round(v * 100) / 100), base };
  } catch {
    return null;
  }
}
