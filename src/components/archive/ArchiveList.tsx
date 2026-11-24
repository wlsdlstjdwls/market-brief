"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { weekdayKo } from "../../lib/date";

/*
 * 지난 브리핑 목록 (2026-11-23 개편).
 *
 * 서비스 관점에서 지난 호를 찾는 사람은 날짜보다 "그 일이 있던 날"을 기억한다
 * ("사이드카 났던 날", "FOMC 동결"). 그래서 머리에 헤드라인 검색을 둔다.
 * 목록이 수백 줄이 안 되므로 서버에 묻지 않고 브라우저에서 거른다 — 주소에 검색어를
 * 올리지 않으니 페이지가 정적으로 남는다(ISR).
 *
 * 날짜마다 붙이던 "아침/마감" 단추는 지웠다(2026-11-23 사용자 지시). 날짜를 누르면 그날 페이지에서 탭으로 고른다.
 * 이 파일은 클라이언트 번들에 실리므로 `queries.ts`(DB 드라이버)를 들여오지 않는다.
 */
export interface ArchiveItem {
  tradeDate: string;
  headline: string;
  sessions: Array<"am" | "pm">;
}

export default function ArchiveList({ items }: { items: ArchiveItem[] }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());

  /*
   * 연도, 달로 골라 본다(2026-11-24 사용자 지시, "모두 나오는 게 아니라 년도별로").
   * 처음에는 최신 연도의 최신 달만 보인다. 검색어가 있으면 연도, 달 선택을 무시하고 전체에서 찾는다.
   * 선택은 주소에 올리지 않는다(ISR 유지, 검색과 같은 이유).
   */
  const years = useMemo(() => [...new Set(items.map((b) => b.tradeDate.slice(0, 4)))], [items]);
  const [year, setYear] = useState<string | null>(null);
  const curYear = year ?? years[0] ?? "";
  const monthsOfYear = useMemo(
    () => [...new Set(items.filter((b) => b.tradeDate.startsWith(curYear)).map((b) => b.tradeDate.slice(0, 7)))],
    [items, curYear],
  );
  // null = 그 해의 최신 달, "all" = 그 해 전체
  const [month, setMonth] = useState<string | null>(null);
  const curMonth = month ?? monthsOfYear[0] ?? "";

  const months = useMemo(() => {
    const hit = query
      ? items.filter((b) => b.headline.toLowerCase().includes(query) || b.tradeDate.includes(query))
      : items.filter((b) =>
          curMonth === "all" ? b.tradeDate.startsWith(curYear) : b.tradeDate.startsWith(curMonth),
        );
    const out = new Map<string, ArchiveItem[]>();
    for (const b of hit) {
      const key = b.tradeDate.slice(0, 7);
      out.set(key, [...(out.get(key) ?? []), b]);
    }
    return [...out.entries()];
  }, [items, query, curYear, curMonth]);

  const total = months.reduce((n, [, l]) => n + l.length, 0);

  return (
    <>
      <div className="arc-search">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="헤드라인 검색 (예: 사이드카, FOMC, 환율)"
          aria-label="지난 브리핑 헤드라인 검색"
        />
        {query ? (
          <span className="arc-count" aria-live="polite">
            {total}건 찾음
          </span>
        ) : null}
      </div>

      {query ? null : (
        <nav className="arc-filter" aria-label="연도와 달 고르기">
          <div className="arc-years" role="tablist">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="tab"
                aria-selected={y === curYear}
                onClick={() => {
                  setYear(y);
                  setMonth(null);
                }}
              >
                {y}년
              </button>
            ))}
          </div>
          <div className="arc-months">
            {monthsOfYear.map((m) => (
              <button key={m} type="button" aria-pressed={m === curMonth} onClick={() => setMonth(m)}>
                {Number(m.slice(5))}월
              </button>
            ))}
            <button type="button" aria-pressed={curMonth === "all"} onClick={() => setMonth("all")}>
              {curYear}년 전체
            </button>
          </div>
        </nav>
      )}

      {months.length ? (
        months.map(([m, list]) => (
          <section key={m} className="sec arc-month">
            <div className="sec-gutter">
              <h2 className="sec-label">
                {m.slice(0, 4)}년 {Number(m.slice(5))}월
              </h2>
            </div>
            <ol className="arc-list">
              {list.map((b) => {
                const d = weekdayKo(b.tradeDate);
                return (
                  <li key={b.tradeDate} className="arc-row">
                    <Link href={`/brief/${b.tradeDate}`} className="arc-main">
                      <span className="arc-date">
                        <b>{Number(b.tradeDate.slice(8))}</b>
                        {d ? <i>{d}</i> : null}
                      </span>
                      <span className="arc-title">{b.headline}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))
      ) : (
        <p className="sec-empty arc-empty">
          {query ? `"${q.trim()}"이(가) 들어간 헤드라인이 없습니다.` : "아직 발행된 브리핑이 없습니다."}
        </p>
      )}
    </>
  );
}
