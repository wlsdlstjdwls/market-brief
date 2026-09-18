import Link from "next/link";
import Shell from "../components/Shell";

/**
 * 없는 주소. 날짜가 형식에 안 맞거나(`/brief/2026-9-9`), 그날 브리핑이 없을 때 온다.
 * 원고가 없는 날(공휴일, 루틴 미실행)이 실제로 있으므로 드문 화면이 아니다.
 */
export default function NotFound() {
  return (
    <Shell>
      <div className="stub">
        <p className="stub-code">404</p>
        <h1 className="stub-title">찾는 브리핑이 없습니다</h1>
        <p className="stub-note">
          주소가 잘못됐거나, 그날은 브리핑이 나오지 않았습니다. 휴장일과 발행이 없었던
          날은 브리핑이 비어 있습니다.
        </p>
        <p className="stub-actions">
          <Link href="/" className="sec-link">
            오늘 브리핑
          </Link>
          <Link href="/archive" className="sec-link">
            지난 브리핑
          </Link>
        </p>
      </div>
    </Shell>
  );
}
