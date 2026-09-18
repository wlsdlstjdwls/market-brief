/**
 * 원본 리포트의 기사 링크를 뽑는다.
 *
 * 원고는 두 가지 모양으로 출처를 적는다.
 *
 *   카드 안     `- 원문: [파이낸셜뉴스 · 09-17 18:45 KST](https://...)`
 *               `- 국내 보도: [서울경제](https://...) / [데일리안](https://...)`
 *   문서 말미   `## 출처(주요)` 아래의 `- [CNBC - Fed rate decision](https://...)` 목록
 *
 * 둘 다 받는다. 2026-09-18 회차부터 카드별 링크가 붙기 시작했고, 그 전 회차는
 * 문서 말미 목록만 있다. 링크가 아예 없는 회차도 있으므로 빈 배열이 정상이다.
 *
 * 표시 텍스트는 **매체명만** 남긴다. 원문 링크 텍스트에는 기사 제목이 통째로 들어 있고
 * 기사 제목에는 종목명이 흔하다("...SK하이닉스 자사주 매입"). 매체명만 쓰면 그 위험이 없다.
 * URL도 그냥 두지 않는다 — 슬러그에 한글 제목이 박힌 매체가 있어
 * (`dailian.co.kr/news/view/1691667/원전-주도권-싸움에-...`) URL 문자열까지 guard에 넣는다.
 */

import { scan } from "./guard";

export interface SourceLink {
  /** 화면에 찍는 매체명 */
  label: string;
  url: string;
}

/** 출처 줄임을 알리는 라벨. 이 줄에 있는 링크만 기사로 본다. */
const SOURCE_LABEL =
  /^\s*[-*•]?\s*\**\s*(원문|국내\s*보도|해외\s*보도|출처|참고\s*기사|관련\s*기사|보도|기사|링크)\s*\**\s*[:：]/;

/** 문서 말미의 출처 목록 헤딩 */
export const SOURCE_HEADING = /^출처|출처\s*[(（]/;

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * 링크 텍스트에서 매체명만 남긴다.
 *   `파이낸셜뉴스 · 09-17 18:45 KST` → `파이낸셜뉴스`
 *   `CNBC - Fed rate decision September 2026` → `CNBC`
 *   `이데일리(유가) · 09-18 KST` → `이데일리`
 */
export function mediaName(text: string): string {
  const head = text.split(/\s*[·ㆍ|]\s*|\s+[-–—]\s+/)[0] ?? "";
  return head
    .replace(/[(（].*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

/**
 * URL에서 한글 구간만 남긴다.
 *
 * URL 전체를 guard에 넣으면 안 된다. KRX에 `TP`라는 종목이 있어서 **`https`의 `tp`가**
 * 걸리고, `NEW`·`SK`·`E1`·`E8`도 같은 식으로 도메인 문자열에 박힌다. 그래서 링크가
 * 하나도 안 남는다. 실제 위험은 ASCII가 아니라 슬러그에 박힌 한글 제목이므로
 * (`dailian.co.kr/news/view/1691667/원전-주도권-싸움에-...`) 한글만 떼어 검사한다.
 */
function hangulOf(url: string): string {
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* 퍼센트 인코딩이 깨진 URL. 원문 그대로 본다. */
  }
  return decoded.split(/[^가-힣]+/).filter(Boolean).join(" ");
}

/** 한 줄에서 기사 링크를 뽑는다. 라벨 줄이 아니면 아무것도 돌려주지 않는다. */
function linksOf(line: string, anyLine: boolean): SourceLink[] {
  if (!anyLine && !SOURCE_LABEL.test(line)) return [];
  const out: SourceLink[] = [];
  for (const m of line.matchAll(LINK_RE)) {
    const label = mediaName(m[1]);
    const url = m[2].replace(/[.,]+$/, "");
    if (!label) continue;
    /*
     * 종목이 묻어 있으면 그 링크만 버린다. 카드는 남긴다.
     *
     * 매체명은 `blocking`만 본다. 영문 매체명이 두 글자 ASCII 종목명과 자주 겹쳐서
     * (`Yahoo Finance`의 `nc` = 엔씨소프트, `https`의 `tp` = TP) review까지 막으면
     * 링크가 한 장도 안 남는다. `SK하이닉스 뉴스룸` 같은 진짜 종목명은 경계가
     * 깨끗해 block으로 잡히므로 이 완화로 새지 않는다.
     *
     * URL은 한글 구간만 보되 review까지 전부 막는다. 여기 한글이 섞였다는 건
     * 슬러그에 기사 제목이 박혔다는 뜻이고, 그 제목에는 종목명이 흔하다.
     */
    if (scan(label).blocking.length) continue;
    if (scan(hangulOf(url)).violations.length) continue;
    out.push({ label, url });
  }
  return out;
}

/** 같은 URL은 한 번만. 순서는 원고 순서를 지킨다. */
function dedupe(links: SourceLink[], limit: number): SourceLink[] {
  const seen = new Set<string>();
  const out: SourceLink[] = [];
  for (const l of links) {
    if (seen.has(l.url)) continue;
    seen.add(l.url);
    out.push(l);
    if (out.length >= limit) break;
  }
  return out;
}

/** 카드 본문에서 출처 줄의 링크만 뽑는다. */
export function cardSources(body: string, limit = 6): SourceLink[] {
  return dedupe(
    body.split(/\r?\n/).flatMap((l) => linksOf(l, false)),
    limit,
  );
}

/** 문서 말미 `## 출처(주요)` 목록. 라벨 없이 링크만 있는 줄이라 전부 받는다. */
export function listSources(body: string, limit = 20): SourceLink[] {
  return dedupe(
    body.split(/\r?\n/).flatMap((l) => linksOf(l, /^\s*[-*•]\s*\[/.test(l))),
    limit,
  );
}
