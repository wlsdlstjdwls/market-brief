import test from "node:test";
import assert from "node:assert/strict";

import { splitSections } from "../src/lib/markdown";
import { extractTopics, impactLevel, type DroppedTopic } from "../src/lib/topics";
import { scan } from "../src/lib/guard";

const REPORT = `# 2026-09-08 일일리포트

## 섹션 1. Executive Summary

## 캐나다 대미 보복관세, 오늘 예정대로 발효
- 한줄 요약: 캐나다 정부가 미국산 약 700개 품목에 15~50% 차등 관세를 발효한다.
- 왜 중요한가: 글로벌 무역분쟁 리스크 프리미엄이 재부각될 수 있다.
- 영향도: 🟡 보통
- 수혜: 확인 안됨
- 피해: 대미 수출 비중 높은 업종

## 유가 7주 최고치 — 정유·에너지 테마 재부각
- 한줄 요약: 중동 정정 불안으로 브렌트유가 전일 대비 1.5% 올랐다.
- 왜 중요한가: 정제마진 기대가 삼성전자 같은 대형주에도 영향을 준다.
- 영향도: 🔴 매우 큼

## 반도체 장비株 폭등 — SK하이닉스 +13.82%
- 한줄 요약: SK하이닉스가 급등하며 밸류체인 전반이 반응했다.
- 왜 중요한가: 재평가 국면일 가능성을 시사한다.
- 영향도: 🟠 큼

## 섹션 2. 미국 증시 마감 분석
- 다우존스는 소폭 하락했다.

## 섹션 5. 오늘의 핵심 테마 TOP10

## 무역분쟁 리스크 프리미엄 재확대
- 발생 원인: 캐나다 보복관세 발효
- 시장 관심도: 높음
- 지속 가능성: 단기~중기
- 대장주/후발주/관련주: 삼성전자 / 에코프로
- 상승 논리/리스크: 방어주 선호 vs 수출주 부담

## 섹션 6. 종목별 중요 뉴스

## SK하이닉스
- 한줄 요약: 목표주가가 상향됐다.
`;

const topics = (() => {
  const dropped: DroppedTopic[] = [];
  return { list: extractTopics(splitSections(REPORT), dropped), dropped };
})();

/* 1. 카드 본문에 종목이 한 글자도 없다 */

test("뽑아낸 카드에는 종목 언급이 없다", () => {
  for (const t of topics.list) {
    const text = [t.title, ...t.lines.map((l) => l.text)].join("\n");
    assert.equal(scan(text).violations.length, 0, `${t.title}에 종목이 남았다`);
  }
});

/* 2. 수혜·피해·대장주 줄은 읽지도 않는다 */

test("수혜·피해·대장주 줄은 카드에 실리지 않는다", () => {
  const labels = topics.list.flatMap((t) => t.lines.map((l) => l.label));
  for (const banned of ["수혜", "피해", "대장주", "후발주", "관련주"])
    assert.ok(!labels.some((l) => l.includes(banned)), `${banned} 줄이 실렸다`);
});

/* 3. 제목이 더러우면 카드를 통째로 버린다 */

test("제목에 종목이 있으면 카드 자체가 빠진다", () => {
  assert.ok(!topics.list.some((t) => t.title.includes("SK하이닉스")));
  assert.ok(topics.dropped.some((d) => d.matches.includes("SK하이닉스")));
});

/* 4. 본문 한 줄만 더러우면 그 줄만 비운다 */

test("왜 중요한가만 더러우면 그 줄만 빠지고 카드는 남는다", () => {
  const oil = topics.list.find((t) => t.title.includes("유가"));
  assert.ok(oil, "유가 카드가 통째로 사라졌다");
  assert.ok(oil.lines.some((l) => l.label === "무슨 일인가"));
  assert.ok(!oil.lines.some((l) => l.label === "왜 중요한가"));
});

/* 5. 블록 경계 — 섹션 2·6은 카드로 들어오지 않는다 */

test("Executive Summary·핵심 테마 밖은 카드로 들어오지 않는다", () => {
  assert.ok(!topics.list.some((t) => t.title.startsWith("섹션")));
  assert.ok(!topics.list.some((t) => t.title === "SK하이닉스"));
  assert.deepEqual(
    topics.list.map((t) => t.kind),
    ["news", "news", "theme"],
  );
});

/* 6. 테마 카드도 항목이 채워진다 */

test("테마 카드는 발생 원인·관심도·지속성·리스크를 담는다", () => {
  const theme = topics.list.find((t) => t.kind === "theme");
  assert.ok(theme);
  assert.deepEqual(theme.lines.map((l) => l.label), [
    "발생 원인",
    "시장 관심도",
    "지속 가능성",
    "논리와 리스크",
  ]);
  assert.equal(theme.impact, "");
});

/* 7. 영향도는 이모지를 걷어내고 등급만 남긴다 */

test("영향도에서 이모지·괄호를 걷어낸다", () => {
  assert.equal(impactLevel("🔴 매우 큼"), "매우 큼");
  assert.equal(impactLevel("🟡 보통(추정)"), "보통");
  assert.equal(impactLevel(""), "");
  const canada = topics.list.find((t) => t.title.includes("캐나다"));
  assert.equal(canada?.impact, "보통");
});

/* 8. 한글 표기 종목도 막는다 — 사전이 영문만 갖고 있던 구멍 */

test("사전에 영문만 있는 종목의 한글 표기도 잡는다", () => {
  for (const name of ["네이버", "에스케이", "엘지", "케이티"])
    assert.ok(
      scan(`${name}에 1.48조원 전략적 투자`).violations.length > 0,
      `${name}이(가) 통과했다`,
    );
});

