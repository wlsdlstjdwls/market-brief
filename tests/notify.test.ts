/**
 * 텔레그램 알림 회귀.
 *
 * 여기 세 건은 전부 "고쳤다가 다시 깨지기 쉬운" 자리다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { clip, compose, violations } from "../src/lib/notify";

const base = {
  tradeDate: "2026-09-18",
  session: "am" as const,
  headline: "8월 반도체 수출 역대 최대, 전체 수출 견인",
  summary: "산업통상자원부 집계 결과 8월 전체 수출은 983억달러로 15개월 연속 증가했다.",
};

test("링크는 검사 대상에서 빠진다 (https의 tp가 KRX 종목 TP에 걸린다)", () => {
  const { text, prose, url } = compose(base);
  assert.ok(text.includes(url), "본문에는 링크가 들어간다");
  assert.ok(!prose.includes("http"), "검사 대상에는 링크가 없다");
  assert.deepEqual(violations(prose), []);
});

test("헤드라인에 종목이 있으면 발송을 막는다", () => {
  const { prose } = compose({ ...base, headline: "삼성전자 자사주 매입 결정" });
  assert.ok(violations(prose).length > 0);
});

test("본문을 싣지 않는다 — 헤드라인, 요약, 링크 세 덩이뿐", () => {
  const { text } = compose(base);
  // 머리표 + 빈 줄 + 헤드라인 + 빈 줄 + 요약 + 빈 줄 + 링크 = 7줄
  assert.equal(text.split("\n").length, 7);
});

test("긴 요약은 문장 경계에서 잘린다", () => {
  const long =
    "첫 문장은 여기서 끝난다. " + "두 번째 문장이 아주 길게 이어지면서 계속 늘어난다. ".repeat(6);
  const out = clip(long);
  assert.ok(out.length <= 152, `잘린 길이 ${out.length}`);
  assert.ok(out.endsWith("다.") || out.endsWith("…"));
});

test("요약이 헤드라인과 같으면 한 번만 싣는다", () => {
  const { text } = compose({ ...base, summary: base.headline });
  assert.equal(text.split("\n").length, 5);
});
