import Link from "next/link";
import type { Metadata } from "next";
import Shell from "../../components/Shell";
import { listBriefs } from "../../lib/queries";

export const revalidate = 300;
export const metadata: Metadata = { title: "지난 브리핑" };

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

function weekday(date: string) {
  const d = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : WEEKDAY[d.getDay()];
}

export default async function Archive() {
  const briefs = await listBriefs(120);

  const byMonth = new Map<string, typeof briefs>();
  for (const b of briefs) {
    const key = b.tradeDate.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(b);
    byMonth.set(key, list);
  }

  return (
    <Shell>
      <header className="masthead">
        <div className="masthead-row">
          <h1 className="page-title">지난 브리핑</h1>
          <span className="masthead-meta">{briefs.length}개 회차</span>
        </div>
      </header>

      {briefs.length ? (
        [...byMonth.entries()].map(([month, list], i) => (
          <section key={month} className={i === 0 ? "sec sec--first" : "sec"}>
            <div className="sec-gutter">
              <p className="sec-label">{month.replace("-", ".")}</p>
              <p className="sec-note">{list.length}회차</p>
            </div>
            <div className="sec-body">
              {list.map((b) => {
                const d = weekday(b.tradeDate);
                return (
                  <Link
                    key={b.tradeDate}
                    href={`/brief/${b.tradeDate}`}
                    className="list-row"
                  >
                    <span className="list-date">
                      {b.tradeDate.slice(5).replace("-", ".")}
                      {d ? ` ${d}` : ""}
                    </span>
                    <span className="list-title">{b.headline}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <section className="sec sec--first">
          <div className="sec-gutter" />
          <div className="sec-body">
            <p className="sec-empty">아직 발행된 브리핑이 없습니다.</p>
          </div>
        </section>
      )}
    </Shell>
  );
}
