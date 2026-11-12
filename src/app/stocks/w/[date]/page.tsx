import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import StockWeekView from "../../../../components/StockWeekView";
import { getWeek, listWeeks } from "../../../../lib/stock-queries";

/** 지난 회차는 다시 안 바뀐다. 재적재했을 때만 갱신되면 된다 */
export const revalidate = 3600;

type Params = { params: Promise<{ date: string }> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 빈 목록이라도 있어야 ISR로 돈다. 없으면 매 요청 서버 렌더가 된다.
 * 지난 회차는 첫 요청이 그리고 그 결과를 캐시한다.
 */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  return {
    title: `${date} 종목 브리핑`,
    alternates: { canonical: `/stocks/w/${date}` },
    robots: { index: false, follow: false },
  };
}

export default async function StockWeekPage({ params }: Params) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  const [week, weeks] = await Promise.all([getWeek(date), listWeeks()]);
  if (!week) notFound();
  // 최신 회차는 주소를 하나로 모은다
  if (weeks[0] === date) redirect("/stocks");

  return <StockWeekView week={week} weeks={weeks} />;
}
