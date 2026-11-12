import type { Metadata } from "next";
import Shell from "../../components/Shell";
import StockWeekView, { StockDisclaimer } from "../../components/StockWeekView";
import { getLatestWeek, listWeeks } from "../../lib/stock-queries";

/**
 * 종목 브리핑 최신 회차. 원본이 주 1회(토요일 오전)라 캐시를 길게 잡아도 되지만,
 * 적재 직후 너무 늦게 뜨면 안 되므로 10분으로 둔다.
 */
export const revalidate = 600;

const DESCRIPTION = "관심 섹터 종목의 공시 재무와 주가 추세를 매주 정리합니다. 매수, 매도 추천이 아닙니다.";

export const metadata: Metadata = {
  title: "종목 브리핑",
  description: DESCRIPTION,
  alternates: { canonical: "/stocks" },
  // 색인하지 않는다(연동 문서 3.3). 공개 범위를 넓힐지는 운영자가 나중에 정한다
  robots: { index: false, follow: false },
  openGraph: { title: "종목 브리핑", description: DESCRIPTION, url: "/stocks" },
};

export default async function StocksPage() {
  const [week, weeks] = await Promise.all([getLatestWeek(), listWeeks()]);

  if (!week) {
    return (
      <Shell>
        <header className="masthead">
          <h1 className="page-title">종목 브리핑</h1>
          <StockDisclaimer />
        </header>
        <section className="sec sec--first">
          <div className="sec-gutter" />
          <div className="sec-body">
            <p className="sec-empty">아직 올라온 회차가 없습니다. 매주 토요일 오전에 갱신됩니다.</p>
          </div>
        </section>
      </Shell>
    );
  }

  return <StockWeekView week={week} weeks={weeks} />;
}
