import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Shell from "../../../components/Shell";
import StockDetail from "../../../components/stocks/StockDetail";
import { getStockDetail, latestCodes } from "../../../lib/stock-queries";

/**
 * 종목 하나를 페이지로. 주소를 직접 열거나 새로 고쳤을 때 여기로 온다.
 * 목록에서 누르면 `@modal/(.)[code]`가 가로채 같은 내용을 팝업으로 띄운다(2026-11-19 사용자 지시).
 * 본문은 둘이 같이 쓰는 `StockDetail`에 있다.
 */
export const revalidate = 600;

type Params = { params: Promise<{ code: string }> };

/** 국내 6자리 종목코드 또는 해외 티커(2026-11-23) */
const CODE_RE = /^([0-9A-Z]{6}|[A-Z]{1,5})$/;

async function find(code: string) {
  return CODE_RE.test(code) ? getStockDetail(code) : null;
}

export async function generateStaticParams() {
  try {
    return (await latestCodes()).map((code) => ({ code }));
  } catch {
    // 빌드 때 DB가 막혀도 빌드는 깨지지 않게. 첫 요청이 그린다
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const hit = await find(code);
  if (!hit) return { title: "종목 브리핑", robots: { index: false, follow: false } };
  const title = `${hit.stock.name} 재무 추세`;
  const description = `${hit.stock.name}의 실적, 주가, 수급, 현금흐름 추이. 공개 공시와 시세로 계산한 참고 자료이며 투자 권유가 아닙니다.`;
  return {
    title,
    description,
    alternates: { canonical: `/stocks/${code}` },
    // 색인하지 않는다(연동 문서 3.3)
    robots: { index: false, follow: false },
    openGraph: { type: "article", title, description, url: `/stocks/${code}` },
  };
}

export default async function StockPage({ params }: Params) {
  const { code } = await params;
  const hit = await find(code);
  if (!hit) notFound();
  return (
    <Shell width="wide">
      <StockDetail hit={hit} />
    </Shell>
  );
}
