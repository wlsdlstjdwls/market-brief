import Link from "next/link";
import BriefView from "../components/BriefView";
import SubscribeForm from "../components/SubscribeForm";
import { getBrief, listBriefs } from "../lib/queries";

export const revalidate = 300;

export default async function Home() {
  const data = await getBrief();
  const recent = (await listBriefs(6)).filter(
    (b) => b.tradeDate !== data?.brief.tradeDate,
  );

  if (!data) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        아직 발행된 브리핑이 없습니다.
      </p>
    );
  }

  return (
    <>
      <BriefView
        brief={data.brief}
        indices={data.indices}
        macros={data.macros}
        flows={data.flows}
        sectors={data.sectors}
      />

      {recent.length ? (
        <section className="mt-14 border-t pt-6" style={{ borderColor: "var(--line)" }}>
          <h2
            className="mb-3 text-sm font-semibold"
            style={{ color: "var(--muted)" }}
          >
            지난 브리핑
          </h2>
          <ul className="space-y-2">
            {recent.map((b) => (
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
      ) : null}

      <SubscribeForm />
    </>
  );
}
