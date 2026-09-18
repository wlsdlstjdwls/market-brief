/** 콘솔은 매 요청 DB를 읽는다. 빈 화면 대신 한 줄이라도 먼저 띄운다. */
export default function Loading() {
  return <p className="adm-note adm-page">불러오는 중</p>;
}
