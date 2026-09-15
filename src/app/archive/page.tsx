import Link from "next/link";
import type { Metadata } from "next";
import { listBriefs } from "../../lib/queries";

export const revalidate = 300;
export const metadata: Metadata = { title: "지난 브리핑" };

export default async function Archive() {
  const briefs = await listBriefs(120);

  const byMonth = new Map<string, typeof briefs>();
  for (const b of briefs) {
    const key = b.tradeDate.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(b);
    byMonth.set(key, list);
  }

  if (!briefs.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        아직 발행된 브리핑이 없습니다.
      </p>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">지난 브리핑</h1>
      {[...byMonth.entries()].map(([month, list]) => (
        <section key={month} className="mt-8">
          <h2
            className="mb-2 text-sm font-semibold"
            style={{ color: "var(--muted)" }}
          >
            {month}
          </h2>
          <ul className="space-y-2">
            {list.map((b) => (
              <li key={b.tradeDate} className="text-sm">
                <Link
                  href={`/brief/${b.tradeDate}`}
                  className="underline underline-offset-4"
                >
                  {b.tradeDate}
                </Link>
                <span className="ml-2" style={{ color: "var(--muted)" }}>
                  {b.headline}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
