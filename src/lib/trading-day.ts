/**
 * KRX 거래일 판정.
 *
 * 휴장일에는 브리핑을 올리지 않는다. 마감판은 그날 종가가 아예 없고, 아침판도
 * 원고가 "오늘 장 전망"을 싣기 때문에 장이 안 서는 날에는 틀린 글이 된다.
 *
 * 판정 근거는 `data/krx-holidays.json` 하나다. 그 파일은 `scripts/gen_holidays.py`가
 * exchange_calendars 의 XKRX 캘린더에서 구워 낸다(음력 연휴·대체공휴일 포함).
 * 런타임이 셋이라(Vercel 함수 / tsx CLI / 워크플로 bash) 파이썬을 세 군데서 부를 수 없어
 * 결과만 파일로 남기고 다 같은 파일을 읽는다.
 *
 * **범위 밖 날짜는 거래일로 본다.** 캘린더가 1년 남짓 앞까지만 들고 있어서 언젠가
 * 범위를 벗어나는데, 그때 전부 휴장으로 보면 사이트가 조용히 멈춘다. 모르면 올리고
 * 경고를 띄우는 쪽이 낫다 — `holidayRangeWarning()`이 그 경고다.
 */
import table from "../../data/krx-holidays.json";

/** 범위 끝이 이만큼 남으면 경고한다. 재생성하고 커밋할 시간을 벌어 준다. */
const WARN_DAYS = 90;

const HOLIDAYS: ReadonlySet<string> = new Set(table.holidays);
const [RANGE_START, RANGE_END] = table.range as [string, string];

/** 왜 거래일이 아닌가. 화면·로그에 그대로 쓴다. */
export type NonTradingReason = "weekend" | "holiday";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 주말인가. `YYYY-MM-DD`를 UTC 자정으로 읽는다.
 *
 * 그냥 `new Date("2026-09-26")`도 UTC로 읽히지만, 서버 시간대가 무엇이든 같은 요일이
 * 나와야 한다는 점이 이 함수의 전부라 명시적으로 쓴다. Vercel 서버는 UTC로 돈다.
 */
function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

/**
 * 그날이 거래일이 아니면 사유를, 거래일이면 null을 돌려준다.
 * 범위 밖이면 null이다(= 거래일로 본다). 위 머리말 참고.
 */
export function nonTradingReason(date: string): NonTradingReason | null {
  if (!DATE_RE.test(date)) throw new Error(`날짜 형식이 아닙니다: ${date}`);
  if (isWeekend(date)) return "weekend";
  if (date < RANGE_START || date > RANGE_END) return null;
  return HOLIDAYS.has(date) ? "holiday" : null;
}

export function isTradingDay(date: string): boolean {
  return nonTradingReason(date) === null;
}

export const REASON_KO: Record<NonTradingReason, string> = {
  weekend: "주말",
  holiday: "휴장일",
};

/** 로그 한 줄용. `2026-09-24는 휴장일이다` */
export function nonTradingLabel(date: string, reason: NonTradingReason): string {
  return `${date}는 ${REASON_KO[reason]}이다`;
}

/**
 * 구워 둔 목록이 곧 바닥나면 경고 문구를, 아직 여유가 있으면 null을 돌려준다.
 * 워크플로와 관리자 대시보드가 이걸 띄운다. 뜨면 `npm run holidays`를 다시 돌린다.
 */
export function holidayRangeWarning(today: string): string | null {
  const left = Math.floor(
    (Date.parse(`${RANGE_END}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
  if (left > WARN_DAYS) return null;
  return left < 0
    ? `휴장일 목록이 ${RANGE_END}에서 끝났다. 그 뒤 날짜는 전부 거래일로 본다 — scripts/gen_holidays.py를 다시 돌려 커밋할 것.`
    : `휴장일 목록이 ${RANGE_END}까지다(${left}일 남음). scripts/gen_holidays.py를 다시 돌려 커밋할 것.`;
}

/** 목록 자체를 보고 싶을 때. 관리자 화면과 테스트가 쓴다. */
export const holidayTable = {
  range: [RANGE_START, RANGE_END] as const,
  generatedAt: table.generated_at as string,
  source: table.source as string,
  /** 오늘 이후 휴장일 몇 개. */
  upcoming(today: string, limit = 5): string[] {
    return table.holidays.filter((d) => d >= today).slice(0, limit);
  },
};
