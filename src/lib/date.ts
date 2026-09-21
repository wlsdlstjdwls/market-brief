/**
 * 날짜 표기. **순수 함수만** 둔다 — 클라이언트 컴포넌트도 이걸 쓴다.
 *
 * 요일을 `getDay()`로 세면 안 된다. 그건 **런타임 시간대**를 따르는데 Vercel 서버는
 * UTC로 돈다. `new Date("2026-09-21T00:00:00+09:00")`은 UTC로 09-20 15:00이라
 * `getDay()`가 일요일(0)을 준다 — 월요일인 날이 화면에 "일요일"로 찍혔다(2026-09-21 발견).
 *
 * 거래일 문자열은 이미 KST 날짜다. 그래서 그 날짜를 **UTC 자정으로 읽고 `getUTCDay()`** 로
 * 센다. `trading-day.ts`의 `isWeekend`가 주말을 세는 방식과 같다.
 */
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"] as const;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-09-21` → `월`. 날짜 꼴이 아니면 null. */
export function weekdayKo(date: string): string | null {
  if (!DATE_RE.test(date)) return null;
  const d = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : WEEKDAY[d.getUTCDay()];
}
