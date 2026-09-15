import { renderMarkdown, renderText } from "../lib/render";

type Num = string | null;

interface Props {
  brief: {
    tradeDate: string;
    headline: string;
    summary: string;
    macroCommentary: string;
    marketSummary: string;
  };
  indices: Array<{ indexName: string; close: Num; changePct: Num }>;
  macros: Array<{
    name: string;
    value: Num;
    unit: string | null;
    changePct: Num;
  }>;
  flows: Array<{ market: string; investor: string; netAmount: Num }>;
  sectors: Array<{ sectorName: string; changePct: Num }>;
}

const INVESTOR_KO: Record<string, string> = {
  foreign: "외국인",
  institution: "기관",
  retail: "개인",
};

function pct(v: Num) {
  if (v === null) return null;
  const n = Number(v);
  const color =
    n > 0 ? "var(--up)" : n < 0 ? "var(--down)" : "var(--muted)";
  return { n, text: `${n > 0 ? "+" : ""}${n.toFixed(2)}%`, color };
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2
        className="mb-3 text-sm font-semibold tracking-wide"
        style={{ color: "var(--muted)" }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-sm" style={{ color: "var(--muted)" }}>
      {what} 수치는 아직 수집되지 않았습니다.
    </p>
  );
}

export default function BriefView({
  brief,
  indices,
  macros,
  flows,
  sectors,
}: Props) {
  return (
    <article>
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        {brief.tradeDate}
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        {renderText(brief.headline)}
      </h1>
      {brief.summary ? (
        <p className="mt-4 text-[15px]" style={{ color: "var(--muted)" }}>
          {renderText(brief.summary).slice(0, 220)}
        </p>
      ) : null}

      <Section title="지수">
        {indices.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {indices.map((i) => {
              const p = pct(i.changePct);
              return (
                <div
                  key={i.indexName}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: "var(--line)",
                    background: "var(--card)",
                  }}
                >
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {i.indexName}
                  </div>
                  <div className="mt-1 text-lg font-semibold tabular-nums">
                    {i.close === null ? "-" : Number(i.close).toLocaleString()}
                  </div>
                  <div
                    className="text-sm tabular-nums"
                    style={{ color: p ? p.color : "var(--muted)" }}
                  >
                    {p ? p.text : "-"}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty what="지수" />
        )}
      </Section>

      <Section title="금리 · 환율 · 원자재">
        {macros.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {macros.map((m) => {
                  const p = pct(m.changePct);
                  return (
                    <tr
                      key={m.name}
                      className="border-b"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <td className="py-2 pr-4">{m.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {m.value === null
                          ? "-"
                          : Number(m.value).toLocaleString()}{" "}
                        {m.unit ?? ""}
                      </td>
                      <td
                        className="py-2 text-right tabular-nums"
                        style={{ color: p ? p.color : "var(--muted)" }}
                      >
                        {p ? p.text : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty what="금리·환율" />
        )}
      </Section>

      <Section title="투자주체별 순매수">
        {flows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {flows.map((f) => (
                  <tr
                    key={`${f.market}-${f.investor}`}
                    className="border-b"
                    style={{ borderColor: "var(--line)" }}
                  >
                    <td className="py-2 pr-4">{f.market}</td>
                    <td className="py-2 pr-4">
                      {INVESTOR_KO[f.investor] ?? f.investor}
                    </td>
                    <td
                      className="py-2 text-right tabular-nums"
                      style={{
                        color:
                          Number(f.netAmount) > 0
                            ? "var(--up)"
                            : "var(--down)",
                      }}
                    >
                      {f.netAmount === null
                        ? "-"
                        : `${Number(f.netAmount).toLocaleString()}억원`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty what="수급" />
        )}
      </Section>

      <Section title="업종 강약">
        {sectors.length ? (
          <ul className="space-y-1.5">
            {sectors.map((s) => {
              const p = pct(s.changePct);
              const w = p ? Math.min(100, Math.abs(p.n) * 20) : 0;
              return (
                <li
                  key={s.sectorName}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-28 shrink-0">{s.sectorName}</span>
                  <span
                    className="h-2 flex-1 rounded"
                    style={{ background: "var(--line)" }}
                  >
                    <span
                      className="block h-2 rounded"
                      style={{
                        width: `${w}%`,
                        background: p ? p.color : "var(--muted)",
                      }}
                    />
                  </span>
                  <span
                    className="w-16 text-right tabular-nums"
                    style={{ color: p ? p.color : "var(--muted)" }}
                  >
                    {p ? p.text : "-"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty what="업종" />
        )}
      </Section>

      {brief.marketSummary ? (
        <Section title="국내 시장">
          <div
            className="prose"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(brief.marketSummary),
            }}
          />
        </Section>
      ) : null}

      {brief.macroCommentary ? (
        <Section title="해외 · 매크로">
          <div
            className="prose"
            dangerouslySetInnerHTML={{
              __html: renderMarkdown(brief.macroCommentary),
            }}
          />
        </Section>
      ) : null}
    </article>
  );
}
