/**
 * 텔레그램 알림 회귀.
 *
 * 여기 것들은 전부 "고쳤다가 다시 깨지기 쉬운" 자리다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compose, violations, type NotifyTopic } from "../src/lib/notify";

const base = {
  tradeDate: "2026-09-18",
  session: "am" as const,
  headline: "8월 반도체 수출 역대 최대, 전체 수출 견인",
  summary: "산업통상자원부 집계 결과 8월 전체 수출은 983억달러로 15개월 연속 증가했다.",
};

const card = (title: string, text = "무슨 일인지 설명하는 줄"): NotifyTopic => ({
  kind: "news",
  title,
  impact: "시장 영향 큼",
  lines: [{ label: "무슨 일인가", text }],
});

const whole = (chunks: string[]) => chunks.join("\n");

test("링크는 검사 대상에서 빠진다 (https의 tp가 KRX 종목 TP에 걸린다)", () => {
  const { chunks, prose, url } = compose(base);
  assert.ok(whole(chunks).includes(url), "본문에는 링크가 들어간다");
  assert.ok(!prose.includes("http"), "검사 대상에는 링크가 없다");
  assert.deepEqual(violations(prose), []);
});

test("헤드라인에 종목이 있으면 발송을 막는다", () => {
  const { prose } = compose({ ...base, headline: "삼성전자 자사주 매입 결정" });
  assert.ok(violations(prose).length > 0);
});

test("카드 본문도 검사 대상에 들어간다", () => {
  const { prose } = compose(base, [card("반도체 업황 반등", "SK하이닉스가 증설을 발표했다")]);
  assert.ok(violations(prose).length > 0);
});

test("산문도 검사 대상에 들어간다", () => {
  const { prose } = compose({ ...base, marketSummary: "**삼성전자**가 상승했다." });
  assert.ok(violations(prose).length > 0);
});

test("카드 본문을 통째로 싣는다", () => {
  const { chunks } = compose(base, [card("반도체 업황 반등")]);
  const text = whole(chunks);
  assert.ok(text.includes("반도체 업황 반등"));
  assert.ok(text.includes("무슨 일인지 설명하는 줄"), "카드 본문이 실린다");
  assert.ok(text.includes("뉴스 분석"), "카드 묶음 제목이 붙는다");
});

test("HTML 특수문자는 이스케이프한다 (S&P500이 흔하다)", () => {
  const { chunks } = compose({ ...base, headline: "S&P500 +1.14% <최고치>" });
  const text = whole(chunks);
  assert.ok(text.includes("S&amp;P500"));
  assert.ok(text.includes("&lt;최고치&gt;"));
});

test("마크다운 기호와 기사 URL은 걷어낸다", () => {
  const { chunks } = compose({
    ...base,
    marketSummary: "## 제목\n\n**굵게** 쓴 문장과 [기사](https://news.example.com/1) 링크.",
  });
  const text = whole(chunks);
  assert.ok(!text.includes("**"));
  assert.ok(!text.includes("## "));
  assert.ok(!text.includes("news.example.com"), "기사 URL은 싣지 않는다");
  assert.ok(text.includes("기사"), "표시 문자열은 남는다");
});

test("카드 제목의 대괄호는 벗긴다", () => {
  const { chunks } = compose(base, [card("[금리 급락]")]);
  assert.ok(whole(chunks).includes("금리 급락"));
  assert.ok(!whole(chunks).includes("[금리 급락]"));
});

test("긴 글은 여러 통으로 쪼개고 한 통도 4096자를 넘지 않는다", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    card(`카드 ${i}`, "설명이 길게 이어지는 문장입니다. ".repeat(12)),
  );
  const { chunks } = compose(base, many);
  assert.ok(chunks.length > 1, "여러 통으로 나뉜다");
  for (const c of chunks) assert.ok(c.length <= 4096, `한 통 ${c.length}자`);
});

test("태그가 통 경계에서 쪼개지지 않는다", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    card(`카드 ${i}`, "설명이 길게 이어지는 문장입니다. ".repeat(12)),
  );
  for (const c of compose(base, many).chunks) {
    const open = (c.match(/<b>/g) ?? []).length;
    const close = (c.match(/<\/b>/g) ?? []).length;
    assert.equal(open, close, "굵게 태그가 한 통 안에서 닫힌다");
  }
});

/*
 * 2026-09-21 사용자 지적 — 제목 뒤에 `큼`이 그대로 붙어 제목의 끝말처럼 읽혔고,
 * 항목 이름이 맨 글자라 본문과 구분되지 않았다.
 */
test("영향도는 제목과 다른 줄에, 무엇이 큰지를 밝혀 적는다", () => {
  const { chunks } = compose(base, [
    { kind: "news", title: "FOMC 앞두고 관망", impact: "큼", lines: [{ label: "무슨 일인가", text: "관망세가 짙어졌다" }] },
  ]);
  const body = whole(chunks);
  assert.ok(body.includes("<b>FOMC 앞두고 관망</b>\n<i>시장 영향 큼</i>"), body);
  assert.ok(!body.includes("관망</b> <i>"), "제목 줄에 이어 붙이지 않는다");
});

test("이미 '시장 영향'으로 시작하면 두 번 붙이지 않는다", () => {
  const { chunks } = compose(base, [card("반도체 수출 증가")]);
  assert.ok(whole(chunks).includes("<i>시장 영향 큼</i>"));
  assert.ok(!whole(chunks).includes("시장 영향 시장 영향"));
});

test("항목 이름은 굵게 박아 본문과 가른다", () => {
  const { chunks } = compose(base, [card("반도체 수출 증가", "수출이 늘었다")]);
  assert.ok(whole(chunks).includes("<b>무슨 일인가</b>  수출이 늘었다"));
});
