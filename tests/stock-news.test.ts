import test from "node:test";
import assert from "node:assert/strict";

import { cleanNewsText, namesIn, parseStockNews, trimNews } from "../src/lib/stock-news";

test("아침판: 사실만 남기고 목표가, 최선호주 문장과 호재/악재는 뺀다", () => {
  const md = `# 2026-11-24 종목 뉴스 (아침판)

## 삼성전자
- GDR +11.41%. 골드만 목표가 50만→35만원(-30%), KB 최선호주. 첫 휴머노이드 CES 2027 공개 목표.
- 구분: 호재 / 출처: [한국경제](https://n.news.naver.com/a/1), [동아일보](https://n.news.naver.com/a/2)
`;
  const [e] = parseStockNews(md);
  assert.equal(e.heading, "삼성전자");
  assert.equal(e.title, undefined);
  assert.equal(e.text, "GDR +11.41%. 첫 휴머노이드 CES 2027 공개 목표.");
  assert.deepEqual(e.src.map((s) => s.label), ["한국경제", "동아일보"]);
  assert.ok(!/호재/.test(JSON.stringify(e)));
});

test("마감판: 한줄 요약만 싣고 수혜, 투자 포인트는 버리며 리포트, 갭 예측 절은 건너뛴다", () => {
  const md = `# 종목 뉴스 — 마감판

## 섹션 1. Executive Summary — 종목 이슈

## 삼성전자 -3.06% — 수출 +294%
- 한줄 요약: 삼성전자 177,500원으로 마감했다.
- 왜 중요한가: 시총 46%다.
- 수혜: SK하이닉스
- 원문: [뉴시스 | 11-23 15:44 KST](https://n.news.naver.com/b/1)

## 섹션 6. 종목별 중요 뉴스

## 대우건설
- 내용: 체코 원전 시공 협력 종료.
- 구분: 악재
- 투자 포인트: 시공 손실을 피했다.

## 섹션 7. 수급, 리포트, 실적 분석

## 삼성전자
- 목표가 상향 모음

## 섹션 8. 갭상승/하락 및 관심 종목

## 반도체
- 삼성전자 갭상승 예상
`;
  const out = parseStockNews(md);
  assert.equal(out.length, 2);
  assert.equal(out[0].title, "삼성전자 -3.06% — 수출 +294%");
  assert.equal(out[0].text, "삼성전자 177,500원으로 마감했다.");
  assert.deepEqual(out[0].src, [{ label: "뉴시스", url: "https://n.news.naver.com/b/1" }]);
  assert.equal(out[1].heading, "대우건설");
  assert.equal(out[1].text, "체코 원전 시공 협력 종료.");
});

test("제목 안의 관심종목 이름: 긴 이름 먼저, 우선주는 다른 종목", () => {
  const names = ["삼성전자", "SK하이닉스", "SK", "삼성전기", "엔비디아"];
  assert.deepEqual(namesIn("삼성전자 -3.06%, SK하이닉스 -2.52% — …", names), ["SK하이닉스", "삼성전자"]);
  assert.deepEqual(namesIn("삼성전자우 -2.36%", names), []);
  assert.deepEqual(namesIn("엔비디아(미국)", names), ["엔비디아"]);
  assert.deepEqual(namesIn("휴림로봇 상한가 — 삼성전기 EFEM 본계약", names), ["삼성전기"]);
});

test("추천 표현 문장 걸러내기, 순매수/장내 매수는 사실이라 남긴다", () => {
  assert.equal(cleanNewsText("외국인 순매수 1조. 대신 투자의견 매수 유지."), "외국인 순매수 1조.");
  assert.equal(cleanNewsText("사장 1,500주 장내 매수."), "사장 1,500주 장내 매수.");
  assert.equal(cleanNewsText("건설 최선호주."), "");
});

test("뉴스 정리: 최신순(같은 날은 마감 먼저), 같은 글은 한 번", () => {
  const out = trimNews([
    { d: "2026-11-23", s: "am", text: "a", src: [] },
    { d: "2026-11-24", s: "am", text: "b", src: [] },
    { d: "2026-11-23", s: "pm", text: "c", src: [] },
    { d: "2026-11-22", s: "pm", text: "b", src: [] },
  ]);
  assert.deepEqual(out.map((x) => x.text), ["b", "c", "a"]);
});
