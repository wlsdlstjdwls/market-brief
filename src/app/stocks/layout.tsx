import StockPageChrome from "../../components/stocks/StockPageChrome";

/**
 * 종목 브리핑 지면의 틀. `modal` 슬롯이 종목 상세 팝업 자리다.
 *
 * 목록에서 종목을 누르면(클라이언트 이동) `@modal/(.)[code]`가 `/stocks/{코드}`를 가로채
 * 목록 위에 팝업으로 띄운다. 주소는 `/stocks/{코드}`로 바뀌므로 그대로 공유할 수 있고,
 * 그 주소를 새로 열면 가로채지 않고 `[code]/page.tsx`의 전체 페이지가 뜬다.
 *
 * `.stk-page`는 이 지면에만 거는 가독성 토큰이다(globals.css 맨 끝 "종목 브리핑 가독성").
 */
export default function StocksLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <div className="stk-page">
      {children}
      {modal}
      <StockPageChrome />
    </div>
  );
}
