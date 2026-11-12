import Link from "next/link";
import { marked } from "marked";
import Shell from "./Shell";
import StockExplorer from "./stocks/StockExplorer";
import type { FinWeek } from "../lib/stock-queries";
import { runStamp } from "../lib/stock-format";
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
    .replace(/~/g, "\\~");
  const html = marked.parse(escaped, { gfm: true, breaks: false }) as string;
  // CommonMark가 못 닫는 `**…**`(닫는 별표 앞이 구두점) 되살리기. render.ts와 같은 처리다
  return html.replace(/\*\*(?!\s)([^*\n]+?)\*\*/g, "<strong>$1</strong>");
}

export function StockDisclaimer() {
  return (
    <p className="stk-disclaimer">
      공개 공시와 시세로 계산한 참고 자료이며 투자 권유가 아닙니다. 목록에 오른 것이 매수,
      매도를 뜻하지 않습니다. 재무는 분기 공시 기준(최대 45~90일 지연), 주가와 수급은 직전
      거래일 기준입니다. PER, ROE는 비지배지분 포함 연결 순이익 기준 근사치입니다.
    </p>
  );
}

/**
 * 순서가 요점이다(사용자 지시, "글은 밑에, 그림과 표가 위에").
 * 검색과 필터 → 요약 숫자 → 실적과 주가 산점도 → 종목 카드(또는 표) → 주간 요약 글 → 지난 회차.
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

  return (
    <Shell>
      <header className="masthead stx-masthead">
        <div className="masthead-row">
          <h1 className="page-title">종목 브리핑</h1>
          <span className="masthead-meta">
            {week.runDate.replace(/-/g, ".")}
            {d ? ` ${d}` : ""}
          </span>
        </div>
        <p className="edition">
          <span>매주 토요일</span>
          <span>
            {week.cards.length}종목, {sectors.length}그룹
          </span>
          {week.runAt ? <span>{runStamp(week.runAt)} 수집</span> : null}
          {/* 회차 하나는 한 번에 수집하므로 장중 여부는 종목마다 같다. 첫 종목 값으로 적는다 */}
          {week.cards[0]?.asof ? <span>주가 {week.cards[0].asof} 기준</span> : null}
        </p>
        <StockDisclaimer />
      </header>

      <StockExplorer items={week.cards} sectors={sectors} />

      {week.fails.length ? (
        <p className="stk-note">
          이번 회차 수집 실패: {week.fails.map(([n, why]) => `${n}(${why})`).join(", ")}
        </p>
      ) : null}

      {week.summary ? (
        <section className="sec sec--first stx-summary">
          <div className="sec-gutter">
            <p className="sec-label">이번 주 요약</p>
            <p className="sec-note">수치 해설</p>
          </div>
          <div
            className="sec-body prose stk-prose"
            dangerouslySetInnerHTML={{ __html: summaryHtml(week.summary) }}
          />
        </section>
      ) : null}

      {weeks.length > 1 ? (
        <section className="sec">
          <div className="sec-gutter">
            <p className="sec-label">지난 회차</p>
            <p className="sec-note">{weeks.length}회</p>
          </div>
          <div className="sec-body">
            {weeks.map((w, i) => (
              <Link
                key={w}
                href={i === 0 ? "/stocks" : `/stocks/w/${w}`}
                className="list-row"
                aria-current={w === week.runDate ? "page" : undefined}
              >
                <span className="list-date">{w.replace(/-/g, ".")}</span>
                <span className="list-title">
                  {i === 0 ? "최신 회차" : `${weekdayKo(w) ?? ""}요일 수집`}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </Shell>
  );
}
