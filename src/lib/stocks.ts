/**
 * 종목 브리핑 (주간 재무 추세). **순수 함수만** 둔다 — 적재 스크립트와 화면이 같이 쓴다.
 *
 * 뉴스 브리핑과 별개의 지면이다(2026-11-12 사용자 지시). 뉴스 쪽은 여전히 종목을 한 글자도
 * 싣지 않고, 종목은 이 파일과 `fin_run`, `fin_stock` 표, `/stocks` 화면 안에만 있다.
 * 원천 스키마는 stock-analysis의 `docs/market-brief-재무연동.md` 2장이다.
 * 둘을 섞지 않는다 — 뉴스 적재(`persist.ts`), 텔레그램(`notify.ts`), RSS는 여기를 읽지 않는다.
 *
 * 원본은 stock-analysis의 `요약/재무/YYYY/YYYY-MM-DD/`다. 루틴이 매주 토요일 오전에 쓴다.
 *   data.json          수집 결과 (DART 재무 + 네이버 주봉)
 *   run-HHMM/          같은 날 다시 돈 회차. 있으면 가장 늦은 것을 쓴다
 *   run-HHMM/주간요약.md 루틴이 data.json을 읽고 쓴 요약
 *
 * **매수, 매도 추천은 싣지 않는다.** 수치와 추세만 싣는다. 요약 원고에 추천 표현이 섞이면
 * `cleanSummary`가 그 줄을 버린다.
 */

/** 화면에 실을 분기 한 줄. 단위는 원(KRW)이고 화면에서 억원으로 바꾼다. */
export type StockPeriod = {
  rev: number | null;
  op: number | null;
  ni: number | null;
  opm: number | null;
  rev_yoy: number | null;
  op_yoy: number | null;
  /** 직전 분기 대비. 연간 행에는 없다 */
  rev_qoq: number | null;
  op_qoq: number | null;
  roe: number | null;
  debt_ratio: number | null;
};

export type StockSnap = {
  price: number | null;
  date: string | null;
  /**
   * 주가가 확정 종가가 아니면 그 시점 (`"12:03 장중"`). 평일 20:00(NXT 마감) 전에 돌린 회차에만 붙고
   * 토요일 정기 회차는 null이다. 있으면 화면에서 주가 옆에 같이 적는다(연동 문서 5장).
   * 주가는 NXT 포함 네이버 통합 시세라 KRX 정규장 종가와 몇백 원 다를 수 있다.
   */
  asof: string | null;
  per: number | null;
  pbr: number | null;
  mcap: number | null;
  roe: number | null;
  opm: number | null;
  debt_ratio: number | null;
  rev_yoy: number | null;
  op_yoy: number | null;
  /** 최근 분기의 직전 분기 대비. 원본 snap에는 없어 quarters에서 옮겨 온다 */
  rev_qoq: number | null;
  op_qoq: number | null;
  last_q: string | null;
  /** 최근 분기 매출, 영업이익 (원) */
  rev_q: number | null;
  op_q: number | null;
  chg_1w: number | null;
  chg_1m: number | null;
  chg_3m: number | null;
  chg_1y: number | null;
  deficit: boolean;
  /** 52주 고가, 저가, 그 사이 위치(0 = 저가, 100 = 고가), 고가 대비 % */
  hi52: number | null;
  lo52: number | null;
  pos52: number | null;
  from_hi: number | null;
  /** 소속 시장 지수 대비 초과 등락 (%p) */
  rel_1m: number | null;
  rel_3m: number | null;
  rel_1y: number | null;
  /** 최근 20거래일 외국인, 기관 순매수 금액 근사 (원) */
  frgn_20: number | null;
  organ_20: number | null;
  /** 외국인 지분율 (%), 60거래일 변화 (%p) */
  hold_now: number | null;
  hold_chg_60: number | null;
  /** 직전 사업연도 영업현금흐름, 잉여현금흐름 (원), 영업CF / 순이익 (%) */
  ocf_fy: number | null;
  fcf_fy: number | null;
  cash_conv: number | null;
  /** 주당배당금 (원), 현재가 기준 배당수익률 (%) */
  dps: number | null;
  div_yield: number | null;
  /** 다음 실적 발표 **예상**일. 과거 발표 패턴으로 추정한 값이라 확정 일정이 아니다 */
  next_earn: string | null;
};

/** 공시 한 건. 분류(cat)는 원천이 정한 값 그대로 */
export type Disclosure = { d: string; cat: string; title: string; url: string };

export type Stock = {
  sector: string;
  name: string;
  code: string;
  /** CFS 연결 / OFS 별도 */
  fs: string;
  snap: StockSnap;
  signals: string[];
  quarters: Array<{ key: string } & StockPeriod>;
  annual: Array<{ key: string } & StockPeriod>;
  /** 주봉 종가와 그 주의 PER, PBR. 최근 104주(2년)만 남긴다 */
  weekly: Array<{ d: string; c: number; per: number | null; pbr: number | null }>;
  /** 코스피 / 코스닥 */
  market: string | null;
  /** 1년 성과 비교. 52주 전 = 100, s 종목, i 소속 지수 */
  perf: Array<{ d: string; s: number | null; i: number | null }>;
  /** 최근 60거래일 수급. frgn, organ 은 순매수 금액 근사(원), hold 는 외국인 지분율(%) */
  flows: Array<{ d: string; frgn: number | null; organ: number | null; hold: number | null }>;
  flowSum: Record<string, number | null> | null;
  /** 연간 현금흐름 (원) */
  cfAnnual: Array<{ key: string; ocf: number | null; capex: number | null; fcf: number | null }>;
  cfYtd: { period: string; ocf: number | null; capex: number | null; fcf: number | null } | null;
  /** 최근 3년 배당 (최근 해부터). 무배당이면 null */
  div: {
    year: number;
    dps: Array<number | null>;
    yield: Array<number | null>;
    payout: Array<number | null>;
    yieldNow: number | null;
  } | null;
  /** 최근 1년 주요 공시. 정기보고서는 뺀다(분기마다 같은 제목이라 정보가 없다) */
  disc: Disclosure[];
  /** 실적 발표 패턴. nextExpected 는 추정값이다 */
  sched: {
    basis: string | null;
    typicalLag: number | null;
    recent: string[];
    nextExpected: string | null;
    lastIr: string | null;
  } | null;
  /** 부가 데이터 수집 실패 표시 */
  warn: string[];
};

export type StockWeekData = {
  runAt: string;
  stocks: Stock[];
  /** 수집 실패 [종목명, 사유] */
  fails: Array<[string, string]>;
};

/** 주봉은 2년치만 싣는다. 원본 270주를 다 담으면 회차마다 수백 KB가 쌓인다. */
export const WEEKLY_KEEP = 104;

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const arr = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!obj(x)) : [];

const DART_RE = /^https:\/\/dart\.fss\.or\.kr\//;

function period(key: string, raw: Record<string, unknown>): { key: string } & StockPeriod {
  return {
    key,
    rev: num(raw.rev),
    op: num(raw.op),
    ni: num(raw.ni),
    opm: num(raw.opm),
    rev_yoy: num(raw.rev_yoy),
    op_yoy: num(raw.op_yoy),
    rev_qoq: num(raw.rev_qoq),
    op_qoq: num(raw.op_qoq),
    // 분기는 TTM ROE, 연간은 그해 ROE다. 화면에서는 같은 칸에 놓는다
    roe: num(raw.roe_ttm ?? raw.roe),
    debt_ratio: num(raw.debt_ratio),
  };
}

function periods(raw: unknown): Array<{ key: string } & StockPeriod> {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, Record<string, unknown>>)
    .filter(([, v]) => v && typeof v === "object")
    .map(([k, v]) => period(k, v))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * 원본 data.json → 적재할 모양. 화면이 쓰지 않는 필드(자산, 부채, 주식수 출처 …)는 버린다.
 * 모양이 틀리면 던진다 — 반쯤 깨진 회차를 올리느니 지난주 것을 그대로 두는 편이 낫다.
 */
export function trimData(raw: unknown): StockWeekData {
  if (!raw || typeof raw !== "object") throw new Error("data.json이 객체가 아닙니다.");
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.stocks)) throw new Error("data.json에 stocks 배열이 없습니다.");

  const stocks: Stock[] = [];
  for (const s of r.stocks as Array<Record<string, unknown>>) {
    const name = str(s.name);
    const code = str(s.code);
    const snapRaw = s.snap as Record<string, unknown> | undefined;
    // 수집에 실패한 종목은 snap이 없다. 빈 줄로 올리지 않고 뺀다(_수집로그.md에 남는다).
    if (!name || !code || !/^[0-9A-Z]{6}$/.test(code) || !snapRaw) continue;

    const quarters = periods(s.quarters);
    const lastQ = str(snapRaw.last_q);
    const latest = quarters.find((q) => q.key === lastQ) ?? quarters.at(-1);

    stocks.push({
      sector: str(s.sector) ?? "기타",
      name,
      code,
      fs: str(s.fs) ?? "CFS",
      snap: {
        price: num(snapRaw.price),
        date: str(snapRaw.date),
        asof: str(snapRaw.asof),
        per: num(snapRaw.per),
        pbr: num(snapRaw.pbr),
        mcap: num(snapRaw.mcap),
        roe: num(snapRaw.roe),
        opm: num(snapRaw.opm),
        debt_ratio: num(snapRaw.debt_ratio),
        rev_yoy: num(snapRaw.rev_yoy),
        op_yoy: num(snapRaw.op_yoy),
        rev_qoq: latest?.rev_qoq ?? null,
        op_qoq: latest?.op_qoq ?? null,
        last_q: lastQ,
        rev_q: num(snapRaw.rev_q),
        op_q: num(snapRaw.op_q),
        chg_1w: num(snapRaw.chg_1w),
        chg_1m: num(snapRaw.chg_1m),
        chg_3m: num(snapRaw.chg_3m),
        chg_1y: num(snapRaw.chg_1y),
        deficit: snapRaw.deficit === true,
        hi52: num(snapRaw.hi52),
        lo52: num(snapRaw.lo52),
        pos52: num(snapRaw.pos52),
        from_hi: num(snapRaw.from_hi),
        rel_1m: num(snapRaw.rel_1m),
        rel_3m: num(snapRaw.rel_3m),
        rel_1y: num(snapRaw.rel_1y),
        frgn_20: num(snapRaw.frgn_20),
        organ_20: num(snapRaw.organ_20),
        hold_now: num(snapRaw.hold_now),
        hold_chg_60: num(snapRaw.hold_chg_60),
        ocf_fy: num(snapRaw.ocf_fy),
        fcf_fy: num(snapRaw.fcf_fy),
        cash_conv: num(snapRaw.cash_conv),
        dps: num(snapRaw.dps),
        div_yield: num(snapRaw.div_yield),
        next_earn: str(snapRaw.next_earn),
      },
      signals: Array.isArray(s.signals)
        ? (s.signals as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      quarters,
      annual: periods(s.annual),
      weekly: (Array.isArray(s.weekly) ? (s.weekly as Array<Record<string, unknown>>) : [])
        .map((w) => ({ d: str(w.d) ?? "", c: num(w.c) ?? NaN, per: num(w.per), pbr: num(w.pbr) }))
        .filter((w) => w.d && Number.isFinite(w.c))
        .slice(-WEEKLY_KEEP),
      market: str(s.market),
      perf: arr(s.perf)
        .map((p) => ({ d: str(p.d) ?? "", s: num(p.s), i: num(p.i) }))
        .filter((p) => p.d),
      flows: arr(s.flows)
        .map((f) => ({ d: str(f.d) ?? "", frgn: num(f.frgn), organ: num(f.organ), hold: num(f.hold) }))
        .filter((f) => f.d),
      flowSum: obj(s.flow_sum)
        ? Object.fromEntries(Object.entries(obj(s.flow_sum)!).map(([k, v]) => [k, num(v)]))
        : null,
      cfAnnual: Object.entries(obj(s.cf_annual) ?? {})
        .map(([k, v]) => {
          const o = obj(v) ?? {};
          return { key: k, ocf: num(o.ocf), capex: num(o.capex), fcf: num(o.fcf) };
        })
        .sort((a, b) => a.key.localeCompare(b.key)),
      cfYtd: (() => {
        const o = obj(s.cf_ytd);
        return o
          ? { period: str(o.period) ?? "", ocf: num(o.ocf), capex: num(o.capex), fcf: num(o.fcf) }
          : null;
      })(),
      div: (() => {
        const o = obj(s.div);
        if (!o) return null;
        const nums = (v: unknown) => (Array.isArray(v) ? v.map(num) : []);
        return {
          year: num(o.year) ?? 0,
          dps: nums(o.dps),
          yield: nums(o.yield),
          payout: nums(o.payout),
          yieldNow: num(o.yield_now),
        };
      })(),
      disc: arr(s.disc)
        .map((x) => ({
          d: str(x.d) ?? "",
          cat: str(x.cat) ?? "",
          title: str(x.title) ?? "",
          url: str(x.url) ?? "",
        }))
        // 정기보고서는 분기마다 같은 제목이라 뺀다(연동 문서 4.2). 링크는 DART 주소만 받는다
        .filter((x) => x.d && x.title && x.cat !== "정기보고서" && DART_RE.test(x.url)),
      sched: (() => {
        const o = obj(s.sched);
        return o
          ? {
              basis: str(o.basis),
              typicalLag: num(o.typical_lag),
              recent: Array.isArray(o.recent)
                ? o.recent.filter((x): x is string => typeof x === "string")
                : [],
              nextExpected: str(o.next_expected),
              lastIr: str(o.last_ir),
            }
          : null;
      })(),
      warn: Array.isArray(s.warn)
        ? (s.warn as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
    });
  }

  if (!stocks.length) throw new Error("data.json에 실을 종목이 하나도 없습니다.");
  const fails = (Array.isArray(r.fails) ? r.fails : [])
    .filter((f): f is unknown[] => Array.isArray(f))
    .map((f) => [String(f[0] ?? ""), String(f[1] ?? "")] as [string, string]);
  return { runAt: str(r.run_at) ?? "", stocks, fails };
}

/**
 * 매수, 매도 추천으로 읽힐 줄. 요약 원고는 루틴(LLM)이 쓰므로 언제든 섞일 수 있다.
 * `순매수`, `순매도`는 수급 용어라 거르지 않는다.
 */
const ADVICE_RE =
  /(?<!순)(매수|매도)|목표\s*주가|목표가|추천|비중\s*(확대|축소)|손절|익절|사야|팔아야/;

/** 내부 작업 메모. 독자에게 의미가 없다 — 원본 파일 이름, 폴더, 데이터 파일 얘기다. */
const NOTE_RE = /`[^`]*\.(md|json)`|data\.json|폴더|\]\([^)]*\.md\)/;

/**
 * 주간 요약 원고를 화면용으로 다듬는다.
 * - 추천 표현이 든 줄은 통째로 버린다
 * - 원본 파일, 폴더 얘기는 버린다
 * - 줄을 버린 뒤 내용이 빈 제목은 같이 버린다
 */
export function cleanSummary(md: string): string {
  const kept = md
    .replace(/\r\n/g, "\n")
    .split("\n")
    // 문서 제목(`# 관심종목 재무 추세 주간 요약 (…)`)은 화면 마스트헤드가 대신한다
    .filter((line) => !/^#\s/.test(line))
    .filter((line) => !ADVICE_RE.test(line) && !NOTE_RE.test(line));

  // 제목 다음에 다음 제목이나 끝까지 내용이 없으면 그 제목을 뺀다
  const out: string[] = [];
  for (let i = 0; i < kept.length; i++) {
    const line = kept[i];
    if (/^#{2,}\s/.test(line)) {
      let j = i + 1;
      while (j < kept.length && !kept[j].trim()) j++;
      if (j >= kept.length || /^#{2,}\s/.test(kept[j])) continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 같은 날짜 폴더 안에서 쓸 회차를 고른다.
 * `run-HHMM/`이 있으면 가장 늦은 것, 없으면 날짜 폴더 루트. data.json이 있는 곳만 후보다.
 * 반환값은 날짜 폴더 기준 상대 경로(`""` 또는 `run-1206`).
 */
export function pickRun(entries: string[], hasData: (rel: string) => boolean): string | null {
  const runs = entries
    .filter((e) => /^run-\d{4}$/.test(e))
    .sort()
    .reverse();
  for (const r of runs) if (hasData(r)) return r;
  return hasData("") ? "" : null;
}

/** 원 → 억원. 화면 표기용 */
export const toEok = (won: number | null): number | null =>
  won === null ? null : Math.round(won / 1e8);

/** 섹터 순서는 원본 순서를 지킨다. 루틴이 관심 순서대로 적는다 */
export function bySector(stocks: Stock[]): Array<[string, Stock[]]> {
  const map = new Map<string, Stock[]>();
  for (const s of stocks) {
    const list = map.get(s.sector) ?? [];
    list.push(s);
    map.set(s.sector, list);
  }
  return [...map.entries()];
}

/**
 * 과거와 비교 (종목 화면). 한 지표를 지금, 직전 분기, 1년 전(전년 동기) 셋으로 나란히 놓는다.
 *
 * - 재무 지표는 분기 행에서 읽는다. 직전 분기 = 한 칸 앞, 전년 동기 = 네 칸 앞.
 *   분기가 빠진 회사가 있어 칸 수로 세지 않고 분기 이름(2026Q2 → 2026Q1, 2025Q2)으로 찾는다.
 * - 주가, PER, PBR은 주봉에서 읽는다. 직전 분기 = 13주 전, 1년 전 = 52주 전.
 * - 비율 지표(영업이익률, ROE, 부채비율)의 변화는 %p, 금액과 주가는 %로 센다.
 */
export type CompareRow = {
  label: string;
  /** 표기 종류. 화면이 포맷을 고른다 */
  kind: "eok" | "ratio" | "won" | "multiple";
  now: number | null;
  prev: number | null;
  yearAgo: number | null;
  /** 변화. kind가 ratio면 %p, 아니면 % */
  dPrev: number | null;
  dYear: number | null;
};

function shiftQuarter(key: string, back: number): string | null {
  const m = key.match(/^(\d{4})Q([1-4])$/);
  if (!m) return null;
  const idx = Number(m[1]) * 4 + (Number(m[2]) - 1) - back;
  return `${Math.floor(idx / 4)}Q${(idx % 4) + 1}`;
}

/** 증감률(%). 기준이 0 이하면 의미가 없어 비운다(적자에서 흑자로 돈 경우 등) */
// `== null`로 undefined도 같이 거른다. 필드가 없던 옛 회차 jsonb를 읽으면 undefined가 온다
function pct(now: number | null | undefined, base: number | null | undefined): number | null {
  if (now == null || base == null || base <= 0) return null;
  return ((now - base) / base) * 100;
}

const diff = (now: number | null | undefined, base: number | null | undefined): number | null =>
  now == null || base == null ? null : now - base;

export function compareRows(s: Stock): { lastQ: string | null; rows: CompareRow[] } {
  const latest = s.quarters.find((q) => q.key === s.snap.last_q) ?? s.quarters.at(-1);
  const at = (back: number) => {
    const k = latest ? shiftQuarter(latest.key, back) : null;
    return s.quarters.find((q) => q.key === k) ?? null;
  };
  const q0 = latest ?? null;
  const q1 = at(1);
  const q4 = at(4);

  const fin = (
    label: string,
    kind: "eok" | "ratio",
    pick: (p: StockPeriod) => number | null,
  ): CompareRow => {
    const now = q0 ? pick(q0) : null;
    const prev = q1 ? pick(q1) : null;
    const yearAgo = q4 ? pick(q4) : null;
    const d = kind === "ratio" ? diff : pct;
    return { label, kind, now, prev, yearAgo, dPrev: d(now, prev), dYear: d(now, yearAgo) };
  };

  const w = s.weekly;
  const last = w.at(-1) ?? null;
  const back = (n: number) => (w.length > n ? w[w.length - 1 - n] : null);
  const w13 = back(13);
  const w52 = back(52);
  const mkt = (
    label: string,
    kind: "won" | "multiple",
    pick: (x: (typeof w)[number]) => number | null,
  ): CompareRow => {
    const now = (last ? pick(last) : null) ?? null;
    const prev = (w13 ? pick(w13) : null) ?? null;
    const yearAgo = (w52 ? pick(w52) : null) ?? null;
    return { label, kind, now, prev, yearAgo, dPrev: pct(now, prev), dYear: pct(now, yearAgo) };
  };

  return {
    lastQ: q0?.key ?? null,
    rows: [
      fin("매출", "eok", (p) => p.rev),
      fin("영업이익", "eok", (p) => p.op),
      fin("순이익", "eok", (p) => p.ni),
      fin("영업이익률", "ratio", (p) => p.opm),
      fin("ROE (TTM)", "ratio", (p) => p.roe),
      fin("부채비율", "ratio", (p) => p.debt_ratio),
      mkt("주가", "won", (x) => x.c),
      mkt("PER", "multiple", (x) => x.per),
      mkt("PBR", "multiple", (x) => x.pbr),
    ],
  };
}

/**
 * 목록 화면 한 칸. `fin_stock.snap`에 이 모양으로 담는다 — 목록은 종목당 1MB 가까운 `detail`을
 * 읽지 않고 이것만 읽는다. 카드, 표 3종, 산점도, 요약 숫자가 전부 여기서 나온다.
 */
export type StockCard = {
  code: string;
  name: string;
  sector: string;
  market: string | null;
  price: number | null;
  /** 장중 수집이면 그 시점 (`StockSnap.asof`) */
  asof: string | null;
  mcap: number | null;
  per: number | null;
  pbr: number | null;
  roe: number | null;
  opm: number | null;
  revQ: number | null;
  opQ: number | null;
  revYoy: number | null;
  revQoq: number | null;
  opYoy: number | null;
  opQoq: number | null;
  chg1m: number | null;
  chg3m: number | null;
  chg1y: number | null;
  rel3m: number | null;
  pos52: number | null;
  fromHi: number | null;
  frgn20: number | null;
  organ20: number | null;
  holdNow: number | null;
  holdChg60: number | null;
  ocfFy: number | null;
  fcfFy: number | null;
  cashConv: number | null;
  dps: number | null;
  divYield: number | null;
  nextEarn: string | null;
  lastQ: string | null;
  /** 잠정실적은 나왔는데 분기 숫자에 아직 안 들어간 분기 (`pendingResults`) */
  pending: { d: string; quarter: string } | null;
  deficit: boolean;
  signals: string[];
  /** 최근 52주 종가 */
  spark: number[];
};

export function toCard(s: Stock): StockCard {
  const n = s.snap;
  return {
    code: s.code,
    name: s.name,
    sector: s.sector,
    market: s.market,
    price: n.price,
    asof: n.asof ?? null,
    mcap: n.mcap,
    per: n.per,
    pbr: n.pbr,
    roe: n.roe,
    opm: n.opm,
    revQ: n.rev_q,
    opQ: n.op_q,
    revYoy: n.rev_yoy,
    revQoq: n.rev_qoq,
    opYoy: n.op_yoy,
    opQoq: n.op_qoq,
    chg1m: n.chg_1m,
    chg3m: n.chg_3m,
    chg1y: n.chg_1y,
    rel3m: n.rel_3m,
    pos52: n.pos52,
    fromHi: n.from_hi,
    frgn20: n.frgn_20,
    organ20: n.organ_20,
    holdNow: n.hold_now,
    holdChg60: n.hold_chg_60,
    ocfFy: n.ocf_fy,
    fcfFy: n.fcf_fy,
    cashConv: n.cash_conv,
    dps: n.dps,
    divYield: n.div_yield,
    nextEarn: n.next_earn,
    lastQ: n.last_q,
    pending: (() => {
      const p = pendingResults(n.last_q, s.disc);
      return p ? { d: p.d, quarter: p.quarter } : null;
    })(),
    deficit: n.deficit,
    signals: s.signals,
    spark: s.weekly.slice(-52).map((w) => w.c),
  };
}

/**
 * PER 왜곡 판정. 이익이 0에 가까우면 수백 배로 튀어 정렬 맨 위를 차지한다(연동 문서 5장).
 * 이 값 이상이면 화면에 흐리게 표시하고 정렬에서는 맨 뒤로 보낸다.
 */
export const PER_DISTORTED = 100;

/**
 * 반영 안 된 새 실적이 있나.
 *
 * 분기 숫자는 DART 「주요계정」에서 오는데, 그건 **정기보고서(분기, 반기, 사업보고서)에 실린 숫자만** 준다.
 * 잠정실적 공정공시는 보고서보다 몇 주 먼저 나오지만 거기 안 들어간다. 그래서 "어제 실적 냈는데 왜
 * 2분기 숫자냐"가 생긴다(2026-11-12 에스피지, 사용자 발견).
 *
 * 판정: 실적 공시가 **마지막 반영 분기의 다음 분기 말 이후**에 있으면 그 분기 실적이 나왔는데
 * 보고서가 아직이라는 뜻이다. 예) 반영 2026Q2, 실적 공시 2026-11-12 > 2026-09-30 → 3분기 잠정 미반영.
 */
export function pendingResults(
  lastQ: string | null,
  disc: Array<{ d: string; cat: string; title: string; url: string }> | undefined,
): { d: string; url: string; quarter: string } | null {
  const m = lastQ?.match(/^(\d{4})Q([1-4])$/);
  if (!m || !disc?.length) return null;
  // 연도 * 4 + 분기. 4분기 다음은 이듬해 1분기로 넘어간다
  const idx = Number(m[1]) * 4 + Number(m[2]);
  const ny = Math.floor(idx / 4);
  const nq = (idx % 4) + 1;
  const nextQ = `${ny}Q${nq}`;
  const end = ["03-31", "06-30", "09-30", "12-31"][nq - 1];
  const nextEnd = `${ny}-${end}`;
  const hit = disc
    .filter((x) => x.cat === "실적" && x.d > nextEnd)
    .sort((a, b) => b.d.localeCompare(a.d))[0];
  return hit ? { d: hit.d, url: hit.url, quarter: nextQ } : null;
}
