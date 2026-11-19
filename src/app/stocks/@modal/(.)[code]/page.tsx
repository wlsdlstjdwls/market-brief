import { notFound } from "next/navigation";
import StockDetail from "../../../../components/stocks/StockDetail";
import StockModal from "../../../../components/stocks/StockModal";
import { getStockDetail, latestCodes } from "../../../../lib/stock-queries";

/**
 * 목록에서 누른 종목을 팝업으로. 본문은 전체 페이지(`[code]/page.tsx`)와 같은 `StockDetail`이다.
 * `searchParams`를 읽지 않는다 — ISR이 죽는다(CLAUDE.md "회차 탭이 느렸던 이유").
 *
 * **`generateStaticParams`를 반드시 둔다.** 없으면 이 경로만 요청마다 서버가 그려(ƒ Dynamic)
 * 팝업을 누를 때마다 DB를 쳤다 — "팝업이 너무 느리다"(2026-11-19). 구워 두면 카드가 화면에
 * 들어올 때 `Link`가 미리 받아 두므로 누르는 즉시 뜬다.
 */
export const revalidate = 600;

export async function generateStaticParams() {
  try {
    return (await latestCodes()).map((code) => ({ code }));
  } catch {
    return [];
  }
}

const CODE_RE = /^[0-9A-Z]{6}$/;

export default async function StockModalPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const hit = CODE_RE.test(code) ? await getStockDetail(code) : null;
  if (!hit) notFound();
  return (
    <StockModal title={hit.stock.name} code={code}>
      <StockDetail hit={hit} inModal />
    </StockModal>
  );
}
