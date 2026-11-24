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
  { key: "DJI", name: "다우", get: () => yahoo("^DJI", "다우", null) },
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
