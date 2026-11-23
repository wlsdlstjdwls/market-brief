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

  const months = useMemo(() => {
    const hit = query
      ? items.filter((b) => b.headline.toLowerCase().includes(query) || b.tradeDate.includes(query))
      : items;
    const out = new Map<string, ArchiveItem[]>();
    for (const b of hit) {
      const key = b.tradeDate.slice(0, 7);
      out.set(key, [...(out.get(key) ?? []), b]);
    }
    return [...out.entries()];
  }, [items, query]);

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
        <span className="arc-count" aria-live="polite">
          {query ? `${total}일 찾음` : `${items.length}일`}
        </span>
      </div>

      {months.length ? (
        months.map(([month, list]) => (
          <section key={month} className="sec arc-month">
            <div className="sec-gutter">
              <h2 className="sec-label">
                {month.slice(0, 4)}년 {Number(month.slice(5))}월
              </h2>
              <p className="sec-note">{list.length}일</p>
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
