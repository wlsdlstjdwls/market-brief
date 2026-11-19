import Link from "next/link";
import { marked } from "marked";
import Shell from "./Shell";
import StockExplorer from "./stocks/StockExplorer";
import type { FinWeek } from "../lib/stock-queries";
import { weekdayKo } from "../lib/date";

/**
 * 종목 브리핑 한 회차. `/stocks`(최신)와 `/stocks/w/{날짜}`(지난 회차)가 같이 쓴다.
 *
 * 뉴스 쪽 `renderMarkdown`을 쓰지 않는다 — 그건 종목명이 하나라도 있으면 블록을 통째로
 * 막는 방어선이라 여기서는 전부 막힌다. 대신 원문 HTML만 이스케이프한다.
 * 추천 표현은 적재 단계(`cleanSummary`)에서 이미 걸렀다.
 */
export function summaryHtml(md: string): string {
  // `130.0%~467.8%` 같은 범위 표기의 물결을 GFM이 취소선으로 읽는다. 물결은 전부 글자로 둔다
  const escaped = md
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/~/g, "\~");
  const html = marked.parse(escaped, { gfm: true, breaks: false }) as string;
  // CommonMark가 못 닫는 `**…**`(닫는 별표 앞이 구두점) 되살리기. render.ts와 같은 처리다
  return html.replace(/\*\*(?!\s)([^*\n]+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * 요약 원고를 `##` 절 단위로 가른다. 절마다 제목을 왼쪽에, 내용을 오른쪽 넓은 칸에 둔다.
 *
 * 예전에는 원고 전체를 66ch(약 530px) 한 칸에 흘려 1,040px 본문 폭의 절반만 썼다
 * (2026-11-19 사용자 지적, "너비가 너무 적다").
 *
 * - `<p>반도체: …` 처럼 이름표로 시작하는 문단은 이름표를 떼어 한 줄짜리 행으로 만든다.
 * - `<p>흑자전환</p><ul>` 처럼 목록 바로 위의 짧은 문단은 소제목으로 낮춘다.
 * - 표는 감싸서 제 안에서만 가로로 스크롤한다.
 */
export function summaryParts(md: string): Array<{ no: string | null; title: string | null; html: string }> {
  const html = summaryHtml(md)
    // 원고는 `**반도체**: …`로 쓴다. 굵게 없이 `반도체: …`인 회차도 받는다
    .replace(/<p>(?:<(?:strong|b)>)?([^<:\n]{1,24}?)(?:<\/(?:strong|b)>)?:\s*/g, '<p class="stk-kv"><b>$1</b>')
    .replace(/<p>(?:<(?:strong|b)>)?([^<\n]{1,40})(?:<\/(?:strong|b)>)?<\/p>\s*<ul>/g, '<p class="stk-sub">$1</p>\n<ul>')
    // 원고가 공시 주소를 맨 URL로 적는다. 휴대폰에서 주소가 세 줄씩 늘어지므로 짧은 이름으로 바꾼다
    .replace(
      /<a href="(https?:\/\/[^"]+)">\1<\/a>/g,
      (_m, href: string) =>
        `<a href="${href}" target="_blank" rel="noopener noreferrer">${/dart\.fss\.or\.kr/.test(href) ? "DART 원문" : "원문 링크"}</a>`,
    )
    .replace(/<table>/g, '<div class="stk-prose-table"><table>')
    .replace(/<\/table>/g, "</table></div>");

  const parts: Array<{ no: string | null; title: string | null; html: string }> = [];
  const pieces = html.split(/(?=<h[12][^>]*>)/);
  for (const piece of pieces) {
    const m = piece.match(/^<h[12][^>]*>([\s\S]*?)<\/h[12]>/);
    if (!m) {
      if (piece.trim()) parts.push({ no: null, title: null, html: piece });
      continue;
    }
    const raw = m[1].trim();
    const num = raw.match(/^(\d+)\.\s*/);
    parts.push({
      no: num ? num[1].padStart(2, "0") : null,
      title: num ? raw.slice(num[0].length) : raw,
      html: piece.slice(m[0].length),
    });
  }
  return parts;
}

export function StockDisclaimer() {
  return (
    <p className="stk-disclaimer">공개 공시와 시세로 계산한 참고 자료이며 투자 권유가 아닙니다.</p>
  );
}

/**
 * 순서가 요점이다(사용자 지시, "글은 밑에, 그림과 표가 위에").
 * 검색과 필터 → 요약 숫자 → 실적과 주가 산점도 → 종목 카드(또는 표) → 주간 요약 글 → 지난 회차.
 * 머리 아래 바로가기 줄이 이 순서를 그대로 보여 준다. 넓은 화면에서는 위에 붙어 따라온다.
 */
export default function StockWeekView({
  week,
  weeks,
}: {
  week: FinWeek;
  /** 지난 회차 목록 (최신순). 지금 보는 회차도 들어 있다 */
  weeks: string[];
}) {
  // 그룹 순서는 원본 순서를 지킨다. 루틴이 관심 순서대로 적는다
  const sectors = [...new Set(week.cards.map((c) => c.sector))];
  const d = weekdayKo(week.runDate);
  const parts = week.summary ? summaryParts(week.summary) : [];
  const isLatest = weeks[0] === week.runDate;
  const patchedCount = week.cards.filter((c) => c.patched).length;

  const toc: Array<[string, string]> = [
    ["stx-overview", "한눈에"],
    ["stx-scatter", "실적과 주가"],
    ["stx-list", "종목"],
  ];
  if (parts.length) toc.push(["stx-summary", "이번 주 요약"]);
  if (weeks.length > 1) toc.push(["stx-weeks", "지난 회차"]);

  return (
    <Shell>
      <header className="masthead stx-masthead">
        <div className="masthead-row">
          <h1 className="page-title">종목 브리핑</h1>
          <span className="masthead-meta">
            {week.runDate.replace(/-/g, ".")}
            {d ? ` ${d}` : ""}
            {isLatest ? null : " 지난 회차"}
          </span>
        </div>
        {/* 갱신 주기, 종목 수, 수집 시각을 적던 줄은 지웠다(2026-11-19 사용자 지시).
            장중가 표시(asof)는 카드의 주가 옆에 남아 있다 */}
        {patchedCount ? (
          <p className="stx-patched-note">
            회차 이후 새 공시가 나온 {patchedCount}종목은 평일 21시에 다시 수집해 반영했습니다(카드의
            &quot;공시 반영&quot; 표시). 아래 &quot;이번 주 요약&quot; 글은 토요일 기준입니다.
          </p>
        ) : null}
        <StockDisclaimer />
      </header>

      <nav className="stx-toc" aria-label="이 페이지 바로가기">
        {toc.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
        {isLatest ? null : (
          <Link href="/stocks" className="stx-toc-latest">
            최신 회차
          </Link>
        )}
      </nav>

      <StockExplorer items={week.cards} sectors={sectors} />

      {week.fails.length ? (
        <p className="stk-note">
          이번 회차 수집 실패: {week.fails.map(([n, why]) => `${n}(${why})`).join(", ")}
        </p>
      ) : null}

      {parts.length ? (
        <section className="stx-sum" id="stx-summary">
          <div className="stx-head">
            <h2>이번 주 요약</h2>
            <span className="stx-head-note">공시 수치 해설</span>
          </div>
          {parts.map((p, i) => (
            <article className="stx-sum-part" key={i}>
              {p.title ? (
                <h3 className="stx-sum-title">
                  {p.no ? <span className="stx-sum-no">{p.no}</span> : null}
                  <span dangerouslySetInnerHTML={{ __html: p.title }} />
                </h3>
              ) : (
                <span />
              )}
              <div className="prose stk-prose" dangerouslySetInnerHTML={{ __html: p.html }} />
            </article>
          ))}
        </section>
      ) : null}

      {weeks.length > 1 ? (
        <section className="stx-weeks-sec" id="stx-weeks">
          <div className="stx-head">
            <h2>
              지난 회차 <em>{weeks.length}</em>
            </h2>
          </div>
          <nav className="stx-weeks" aria-label="지난 회차">
            {weeks.map((w, i) => (
              <Link
                key={w}
                href={i === 0 ? "/stocks" : `/stocks/w/${w}`}
                aria-current={w === week.runDate ? "page" : undefined}
              >
                <b>{w.replace(/-/g, ".")}</b>
                <span>{i === 0 ? "최신 회차" : `${weekdayKo(w) ?? ""}요일 수집`}</span>
              </Link>
            ))}
          </nav>
        </section>
      ) : null}
    </Shell>
  );
}
