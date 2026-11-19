/**
 * 팝업 본문을 받는 동안. 미리 받아 둔 경우에는 거의 안 보인다.
 * 어두운 막만 깐다 — 여기서 시트 틀까지 그리면 본문이 오면서 시트가 아래에서 한 번 더 올라와
 * 두 번 열리는 것처럼 보인다. 시트는 `StockModal`이 한 번만 올린다.
 */
export default function Loading() {
  return (
    <div className="bs-loading" role="status">
      <span className="sr-only">불러오는 중</span>
    </div>
  );
}
