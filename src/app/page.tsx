import BriefDay from "../components/BriefDay";
import Shell from "../components/Shell";
import { getBriefDay, listBriefs } from "../lib/queries";

export const revalidate = 300;

/**
 * 홈은 가장 최근 날짜의 회차를 전부 굽는다(BriefDay 주석). 기본은 마감판이고 아침 탭은
 * 페이지 이동 없이 그 자리에서 바뀐다.
 *
 * 여기서도 searchParams를 읽지 않는다. 읽는 순간 매 요청 서버 렌더로 바뀌어 revalidate가
 * 무시된다. `/?s=am`은 브라우저의 인라인 스크립트가 읽는다.
 */
export default async function Home() {
  const items = await getBriefDay();
  const recent = (await listBriefs(7))
    .filter((b) => b.tradeDate !== items[0]?.brief.tradeDate)
    .slice(0, 6);

  if (!items.length) {
    return (
      <Shell>
        <p className="sec-empty" style={{ padding: "clamp(40px,6vw,72px) 0" }}>
          아직 발행된 브리핑이 없습니다.
        </p>
      </Shell>
    );
  }

  return <BriefDay items={items} basePath="/" recent={recent} />;
}
