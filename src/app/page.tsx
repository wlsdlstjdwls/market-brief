import BriefView from "../components/BriefView";
import Shell from "../components/Shell";
import { getBrief, listBriefs } from "../lib/queries";

export const revalidate = 300;

export default async function Home() {
  const data = await getBrief();
  const recent = (await listBriefs(7))
    .filter((b) => b.tradeDate !== data?.brief.tradeDate)
    .slice(0, 6);

  if (!data) {
    return (
      <Shell>
        <p className="sec-empty" style={{ padding: "clamp(40px,6vw,72px) 0" }}>
          아직 발행된 브리핑이 없습니다.
        </p>
      </Shell>
    );
  }

  return (
    <BriefView
      brief={data.brief}
      topics={data.topics}
      recent={recent}
    />
  );
}
