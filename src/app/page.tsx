import BriefView from "../components/BriefView";
import Shell from "../components/Shell";
import { getBrief, listBriefs } from "../lib/queries";

export const revalidate = 300;

/**
 * 홈은 가장 최근 날짜의 마감 종합판을 보여준다.
 *
 * 여기서 ?s=am을 받지 않는 이유는 캐시다. searchParams를 읽는 순간 이 페이지는
 * 매 요청 서버 렌더로 바뀌어 revalidate가 무시된다. 회차 탭은 /brief/{날짜}로 보내고,
 * 트래픽이 몰리는 홈은 5분 캐시를 지킨다.
 */
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
      sessions={data.sessions}
      topics={data.topics}
      recent={recent}
    />
  );
}
