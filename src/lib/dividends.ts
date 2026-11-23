/**
 * 배당 지급 건별 내역 (2026-11-23 사용자 지시, "분기별 배당이랑 특별배당도 따로 보여 줘").
 *
 * 원천은 Yahoo 시세의 배당 이벤트다(`scripts/fetch-div.ts`). 배당락일과 주당 금액이 한 건씩 온다.
 * DART 사업보고서 배당(`Stock.div`)은 사업연도 합계 하나라 분기 몫과 특별배당이 안 갈린다.
 *
 * **특별배당은 추정이다.** 원천이 "특별"이라고 표시해 주지 않는다. 그 회사의 다른 지급액 중앙값의
 * 1.8배 이상인 건을 특별로 본다. 한국 회사의 기말(결산)배당은 분기 몫보다 커도 보통 1.5배 안쪽이라
 * 여기 걸리지 않는다. 화면에도 "추정"을 붙인다. 이 파일은 순수 함수만 둔다(클라이언트도 쓴다).
 */
export type DivEvent = { d: string; amt: number };

export type DivRow = DivEvent & { special: boolean };

export type DivYear = {
  year: number;
  /** 정기 배당 합계와 횟수 */
  regular: number;
  count: number;
  /** 특별배당(추정) 합계. 없으면 0 */
  special: number;
};

/** 이 배수 이상이면 특별배당으로 본다 */
export const SPECIAL_RATIO = 1.8;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** 지급 건을 날짜순으로 두고 특별배당 여부를 붙인다. 비교 대상이 셋 미만이면 아무것도 특별로 보지 않는다 */
export function classifyDividends(events: DivEvent[]): DivRow[] {
  const xs = events
    .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.d) && Number.isFinite(e.amt) && e.amt > 0)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  return xs.map((e, i) => {
    const others = xs.filter((_, j) => j !== i).map((o) => o.amt);
    const special = others.length >= 3 && e.amt >= median(others) * SPECIAL_RATIO;
    return { ...e, special };
  });
}

/** 배당락일 기준 연도별 합계. 최근 해부터 */
export function dividendYears(rows: DivRow[]): DivYear[] {
  const by = new Map<number, DivYear>();
  for (const r of rows) {
    const year = Number(r.d.slice(0, 4));
    const y = by.get(year) ?? { year, regular: 0, count: 0, special: 0 };
    if (r.special) y.special += r.amt;
    else {
      y.regular += r.amt;
      y.count += 1;
    }
    by.set(year, y);
  }
  return [...by.values()].sort((a, b) => b.year - a.year);
}

/** 한 해 정기 배당 횟수로 지급 주기 이름. 최근 완결된 해 기준 */
export function payCycle(years: DivYear[], thisYear: number): string | null {
  const done = years.find((y) => y.year < thisYear && y.count > 0);
  if (!done) return null;
  if (done.count >= 4) return "분기배당";
  if (done.count >= 2) return done.count === 2 ? "반기배당" : `연 ${done.count}회`;
  return "연 1회";
}
