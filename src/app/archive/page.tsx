import type { Metadata } from "next";
import Shell from "../../components/Shell";
import ArchiveList from "../../components/archive/ArchiveList";
import { listBriefs } from "../../lib/queries";

export const revalidate = 300;
export const metadata: Metadata = { title: "지난 브리핑" };

export default async function Archive() {
  const briefs = await listBriefs(500);

  return (
    <Shell>
      <header className="masthead">
        <h1 className="page-title">지난 브리핑</h1>
      </header>
      <ArchiveList
        items={briefs.map((b) => ({ tradeDate: b.tradeDate, headline: b.headline, sessions: b.sessions }))}
      />
    </Shell>
  );
}
