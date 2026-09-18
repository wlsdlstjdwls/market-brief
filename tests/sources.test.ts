import test from "node:test";
import assert from "node:assert/strict";
import { cardSources, listSources, mediaName } from "../src/lib/sources";

test("링크 텍스트에서 매체명만 남긴다", () => {
  assert.equal(mediaName("파이낸셜뉴스 · 09-17 18:45 KST"), "파이낸셜뉴스");
  assert.equal(mediaName("CNBC - Fed rate decision September 2026"), "CNBC");
  assert.equal(mediaName("이데일리(유가) · 09-18 KST"), "이데일리");
});

test("출처 줄의 링크를 뽑는다", () => {
  const body = [
    "- 한줄 요약: 국채금리가 급락했다.",
    "- 원문: [파이낸셜뉴스 · 09-17 18:45 KST](https://www.fnnews.com/news/1)",
    "- 국내 보도: [서울경제 · 09-17 KST](https://www.sedaily.com/article/2) / [뉴시스](https://www.newsis.com/view/3)",
  ].join("\n");
  const got = cardSources(body);
  assert.deepEqual(got.map((s) => s.label), ["파이낸셜뉴스", "서울경제", "뉴시스"]);
  assert.ok(got.every((s) => s.url.startsWith("https://")));
});

test("출처 줄이 아닌 곳의 링크는 기사로 보지 않는다", () => {
  const body = "- 한줄 요약: 자세한 건 [여기](https://example.com/삼성전자)를 보라.";
  assert.deepEqual(cardSources(body), []);
});

test("URL 슬러그에 종목명이 박힌 링크는 버린다", () => {
  const body =
    "- 국내 보도: [데일리안](https://www.dailian.co.kr/news/view/1/삼성전자-자사주-매입) / [뉴시스](https://www.newsis.com/view/9)";
  const got = cardSources(body);
  assert.deepEqual(got.map((s) => s.label), ["뉴시스"]);
});

test("매체명에 종목이 섞이면 그 링크만 빠진다", () => {
  const body = "- 출처: [SK하이닉스 뉴스룸](https://news.skhynix.com/1) / [연합뉴스](https://yna.co.kr/2)";
  assert.deepEqual(cardSources(body).map((s) => s.label), ["연합뉴스"]);
});

test("같은 기사는 한 번만 싣는다", () => {
  const body = [
    "- 원문: [연합뉴스](https://yna.co.kr/1)",
    "- 출처: [연합뉴스 · 09-18](https://yna.co.kr/1)",
  ].join("\n");
  assert.equal(cardSources(body).length, 1);
});

test("문서 말미 출처 목록은 라벨 없이도 받는다", () => {
  const body = [
    "- [CNBC - Fed rate decision September 2026](https://www.cnbc.com/1)",
    "- [Yahoo Finance - Stock market today](https://finance.yahoo.com/2)",
  ].join("\n");
  assert.deepEqual(listSources(body).map((s) => s.label), ["CNBC", "Yahoo Finance"]);
});
