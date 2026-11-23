import { test } from "node:test";
import assert from "node:assert/strict";

import {
  scan,
  assertNoEquityMention,
  assertObjectClean,
  EquityMentionError,
} from "../src/lib/guard";
import {
  assertAllowedSource,
  DeniedSourceError,
  buildPayload,
  assertRegistryOnly,
  type BriefPayload,
} from "../src/lib/extract";
import { cleanHeadline } from "../src/lib/headline";
import { renderMarkdown, renderText } from "../src/lib/render";
import { INDICES, MACROS, SECTORS } from "../src/lib/registry";

/* 1. 종목 탐지 */

test("종목명을 block으로 잡는다", () => {
  const r = scan("오늘 삼성전자가 강세였다.");
  assert.equal(r.ok, false);
  assert.ok(r.blocking.some((v) => v.match === "삼성전자"));
});

test("6자리 종목코드를 잡는다", () => {
  const r = scan("005930 기준으로 보면");
  assert.ok(r.blocking.some((v) => v.rule === "code"));
});

test("연도나 7자리 숫자는 종목코드로 보지 않는다", () => {
  assert.equal(scan("2026년 매출 12345678원").blocking.length, 0);
});

test("관련주·목표주가 같은 지목 표현을 잡는다", () => {
  for (const s of ["반도체 관련주 강세", "목표주가 상향"]) {
    assert.ok(scan(s).blocking.length > 0, s);
  }
});

test("지수·상품명에 겹치는 표기는 block이 아니라 review로 내린다", () => {
  for (const s of ["러셀2000 지수는", "GPT-6 아스트라 출시"]) {
    const r = scan(s);
    assert.equal(r.blocking.length, 0, s);
    assert.ok(r.review.length > 0, s);
  }
});

test("종목이 없는 매크로 문장은 통과한다", () => {
  const s =
    "코스피는 장중 고점을 찍고 반락 마감했다. 미 10년물 금리는 4.78% 부근이다.";
  assert.equal(scan(s).violations.length, 0);
});

/* 2. fail-closed */

test("assertNoEquityMention은 한 건이라도 있으면 던진다", () => {
  assert.throws(
    () => assertNoEquityMention("SK하이닉스 상승", "test"),
    EquityMentionError,
  );
});

test("assertObjectClean은 중첩된 문자열까지 본다", () => {
  assert.throws(
    () => assertObjectClean({ a: { b: ["에코프로 강세"] } }, "test"),
    EquityMentionError,
  );
});

/* 3. 소스 차단 */

test("종목뉴스.md는 파이프라인 투입을 거부한다", () => {
  assert.throws(() => assertAllowedSource("종목뉴스.md"), DeniedSourceError);
});

test("허용 목록에 없는 파일도 거부한다", () => {
  assert.throws(() => assertAllowedSource("아무거나.md"), DeniedSourceError);
});

test("허용된 원본은 통과한다", () => {
  for (const f of ["시황.md", "일일리포트.md", "섹터분석.md"]) {
    assert.doesNotThrow(() => assertAllowedSource(f));
  }
});

/* 4. 섹션·문단 필터 */

test("종목이 든 섹션과 문단은 페이로드에서 빠진다", () => {
  const md = [
    "# 리포트",
    "## 섹션 3. 한국 증시 결론",
    "",
    "코스피는 장중 고점 대비 반락하며 약세로 마감했다.",
    "",
    "삼성전자와 SK하이닉스가 상승을 이끌었다.",
    "",
    "## 섹션 8. 관심 종목",
    "",
    "에코프로 목표주가 상향.",
    "",
  ].join("\n");

  const p = buildPayload({ "시황.md": md }, "2026-09-08", "run-1535");

  assert.ok(p.marketSummary.includes("코스피"));
  assert.ok(!p.marketSummary.includes("삼성전자"));
  assert.ok(!p.marketSummary.includes("에코프로"));
  assert.equal(scan(p.marketSummary).violations.length, 0);
  assert.ok(p.dropped.some((d) => d.reason === "section-denied"));
  assert.ok(p.dropped.some((d) => d.reason === "equity-mention"));
});

/* 5. 구조화 필드는 레지스트리 소속만 허용 */

test("레지스트리에 없는 라벨은 거부한다", () => {
  const bad = {
    tradeDate: "2026-09-08",
    session: "pm" as const,
    runId: "run-1",
    writtenAt: null,
    sources: [],
    headline: "",
    summary: "",
    macroCommentary: "",
    marketSummary: "",
    indices: [
      { indexCode: "KOSPI", indexName: "삼성전자", close: 1, changePct: 1, sortOrder: 1 },
    ],
    macros: [],
    flows: [],
    sectors: [],
    dropped: [],
    topics: [],
  } as BriefPayload;
  assert.throws(() => assertRegistryOnly(bad), /레지스트리/);
});

test("레지스트리 표준 명칭 자체에는 종목코드가 없다", () => {
  for (const d of [...INDICES, ...MACROS, ...SECTORS]) {
    assert.equal(
      scan(d.name).blocking.filter((v) => v.rule === "code").length,
      0,
      d.name,
    );
  }
});

/* 6. 렌더 단계 최종 방어 */

test("DB가 오염돼도 렌더에서 차단된다", () => {
  const html = renderMarkdown("**삼성전자** 강세");
  assert.ok(html.includes("표시하지 않습니다"));
  assert.ok(!html.includes("삼성전자"));
});

test("짧은 텍스트도 렌더에서 대체된다", () => {
  assert.equal(renderText("SK하이닉스 신고가"), "표시할 수 없는 내용");
});

test("깨끗한 마크다운은 정상 렌더된다", () => {
  const html = renderMarkdown("- 코스피 약세\n- 금리 상승");
  assert.ok(html.includes("<li>"));
  assert.ok(html.includes("코스피"));
});

test("원문에 든 HTML은 이스케이프한다", () => {
  const html = renderMarkdown("코스피 <img src=x onerror=alert(1)> 마감");
  assert.ok(!html.includes("<img"));
});

/* 9. 제목 전체를 감싼 대괄호는 벗긴다 (2026-09-15 회차 표기) */

test("제목을 감싼 대괄호를 벗긴다", () => {
  assert.equal(
    cleanHeadline("[美 10년물 국채금리 5% 근접, FOMC(9/15~16) 앞두고 금리인상 가능성 부각]"),
    "美 10년물 국채금리 5% 근접, FOMC(9/15~16) 앞두고 금리인상 가능성 부각",
  );
  // 안쪽에 대괄호가 또 있으면 손대지 않는다
  assert.equal(cleanHeadline("[속보] 어쩌고"), "[속보] 어쩌고");
});

/*
 * 2026-11-23 마감판: 원고 루틴이 일일리포트.md의 섹션을 시황.md에 그대로 복사해 두어
 * 카드와 국내 시장 문단이 전부 두 번씩 실렸다. 파일을 넘나들어 중복을 걷는다.
 */
test("파일 두 개에 같은 섹션이 있어도 카드와 문단은 한 번만 싣는다", () => {
  const md = [
    "# 일일 증시 리포트 — 2026년 11월 23일(월) 16:20 KST 마감판",
    "## 섹션 1-1. 비종목 뉴스 Executive Summary (거시, 정책, 산업)",
    "## 정부, 증안펀드 가동 준비",
    "- 한 줄 요약: 정부가 증권시장안정펀드를 즉시 가동할 수 있게 준비한다.",
    "- 영향도: 큼",
    "## 섹션 3. 오늘 한국 증시 영향",
    "**결론: 약세 속 기술적 반등 시도.** 외국인 매도가 이어졌다.",
  ].join("\n");
  const p = buildPayload(
    { "일일리포트.md": md, "시황.md": md },
    "2026-11-23",
    "run-1620",
  );
  const news = p.topics.filter((t) => t.kind === "news");
  assert.equal(news.length, 1);
  assert.equal(news[0].rank, 1);
  assert.equal(p.marketSummary.match(/기술적 반등/g)?.length, 1);
});

test("머리 고지 인용문은 산문에서 걷는다", () => {
  const md = [
    "# 일일 증시 리포트 — 2026년 11월 23일(월) 07:40 KST 아침판",
    "## 섹션 3. 오늘 한국 증시 영향",
    "> 본 리포트는 공개 기사와 시세를 정리한 참고 자료다. 투자 판단과 책임은 투자자 본인에게 있다.",
  ].join("\n");
  const p = buildPayload({ "일일리포트.md": md }, "2026-11-23", "run-0740", undefined, "am");
  assert.equal(p.marketSummary, "");
});
