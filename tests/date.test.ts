/**
 * 요일 표기 회귀.
 *
 * `getDay()`는 런타임 시간대를 따른다. Vercel 서버는 UTC로 돌아서
 * `new Date("2026-09-21T00:00:00+09:00").getDay()`가 일요일(0)을 준다 —
 * 월요일인 2026-09-21이 화면에 "일요일"로 찍혔다(2026-09-21 사용자 발견).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { weekdayKo } from "../src/lib/date";

test("KST 날짜의 요일을 시간대와 무관하게 센다", () => {
  assert.equal(weekdayKo("2026-09-21"), "월");
  assert.equal(weekdayKo("2026-09-20"), "일");
  assert.equal(weekdayKo("2026-09-18"), "금");
  assert.equal(weekdayKo("2026-01-01"), "목");
});

test("서버 시간대를 UTC로 두어도 같은 값이다", () => {
  const before = process.env.TZ;
  for (const tz of ["UTC", "America/New_York", "Asia/Seoul"]) {
    process.env.TZ = tz;
    assert.equal(weekdayKo("2026-09-21"), "월", tz);
  }
  process.env.TZ = before;
});

test("날짜 꼴이 아니면 null", () => {
  assert.equal(weekdayKo(""), null);
  assert.equal(weekdayKo("2026-9-1"), null);
});
