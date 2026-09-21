import { test } from "node:test";
import assert from "node:assert/strict";
import {
  holidayRangeWarning,
  holidayTable,
  isTradingDay,
  nonTradingReason,
} from "../src/lib/trading-day";

test("평일 거래일은 통과한다", () => {
  assert.equal(isTradingDay("2026-09-21"), true); // 월
  assert.equal(isTradingDay("2026-09-23"), true); // 수
  assert.equal(nonTradingReason("2026-09-18"), null); // 금
});

test("주말은 요일로 막는다 (목록에 없어도)", () => {
  assert.equal(nonTradingReason("2026-09-19"), "weekend"); // 토
  assert.equal(nonTradingReason("2026-09-20"), "weekend"); // 일
  // 주말은 목록에 담지 않는다. 담으면 판정이 두 군데가 되고 목록도 못 읽게 커진다.
  assert.equal(holidayTable.upcoming("2026-09-19", 1)[0], "2026-09-24");
});

test("추석 연휴를 막는다", () => {
  assert.equal(nonTradingReason("2026-09-24"), "holiday");
  assert.equal(nonTradingReason("2026-09-25"), "holiday");
});

test("음력 연휴와 대체공휴일이 들어 있다", () => {
  assert.equal(nonTradingReason("2026-02-17"), "holiday"); // 설
  assert.equal(nonTradingReason("2026-10-05"), "holiday"); // 개천절 대체공휴일
  assert.equal(nonTradingReason("2026-12-31"), "holiday"); // 연말 휴장 (공휴일이 아니다)
});

test("범위 밖은 거래일로 본다 — 모르는 날에 사이트를 멈추지 않는다", () => {
  const [, end] = holidayTable.range;
  const far = `${Number(end.slice(0, 4)) + 5}-06-16`; // 한참 뒤의 평일
  assert.equal(nonTradingReason(far), null);
});

test("목록이 바닥나기 전에 경고한다", () => {
  const [, end] = holidayTable.range;
  const day = (iso: string, delta: number) =>
    new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86_400_000)
      .toISOString()
      .slice(0, 10);

  assert.equal(holidayRangeWarning(day(end, -200)), null);
  assert.match(holidayRangeWarning(day(end, -10)) ?? "", /gen_holidays/);
  assert.match(holidayRangeWarning(day(end, 10)) ?? "", /끝났다/);
});

test("날짜 형식이 아니면 던진다 — 조용히 통과시키면 게이트가 무력해진다", () => {
  assert.throws(() => nonTradingReason("2026/09/24"));
  assert.throws(() => nonTradingReason(""));
});
