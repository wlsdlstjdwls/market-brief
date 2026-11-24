import Link from "next/link";
import Shell from "../components/Shell";
import { TELEGRAM_URL } from "../lib/site";

/**
 * 없는 주소. 날짜가 형식에 안 맞거나(`/brief/2026-9-9`), 그날 브리핑이 없을 때 온다.
 * 원고가 없는 날(공휴일, 루틴 미실행)이 실제로 있으므로 드문 화면이 아니다.
 * 2026-11-24 오류 화면(error.tsx)과 같은 모양으로 맞췄다. 가장 흔한 이유(휴장일)를 먼저 말하고 바로 갈 곳을 준다.
 */
export default function NotFound() {
  return (
    <Shell>
      <section className="oops" aria-labelledby="oops-title">
          {/* 오류 표시 E1(시안 5차, 사용자 선택): 원 안 느낌표. 뜰 때 한 번만 톡 커지고 살짝 흔들린다 */}
          <svg className="oops-icon" viewBox="0 0 56 56" aria-hidden="true">
            <g className="oops-icon-shake">
              <circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" strokeWidth="3.5" />
              <rect x="25.5" y="14" width="5" height="18" rx="1" fill="currentColor" />
              <circle cx="28" cy="39.5" r="3" fill="currentColor" />
            </g>
          </svg>
          <h1 id="oops-title" className="oops-title">
          찾는 브리핑이 없습니다
        </h1>
        <p className="oops-lead">
          휴장일이었거나 그날 브리핑이 나오지 않았습니다. 주소가 바뀌었을 수도 있습니다.
        </p>

        <div className="oops-primary">
          <Link href="/" className="oops-btn">
            오늘 브리핑 보기
          </Link>
          <Link href="/archive" className="oops-btn oops-btn--ghost">
            지난 브리핑 보기
          </Link>
        </div>

        <div className="oops-alt">
          <p className="oops-alt-head">이런 곳도 있습니다</p>
          <ul>
            <li>
              <Link href="/stocks">
                <b>종목 브리핑</b>
                <span>관심종목의 공시 재무와 주가 흐름</span>
              </Link>
            </li>
            <li>
              <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                <b>텔레그램 채널</b>
                <span>새 브리핑이 나오면 바로 받아 봅니다</span>
              </a>
            </li>
          </ul>
        </div>
      </section>
    </Shell>
  );
}
