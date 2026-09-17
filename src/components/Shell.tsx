import Link from "next/link";
import { NAV } from "../lib/nav";

/**
 * 고시표 셸. 좌측 목차 거터(있을 때만) + 본문 열, 본문 열 끝에 푸터.
 * 목차가 없는 페이지에서는 본문 열이 셸 전체 폭을 쓴다 — 거터 패턴은 섹션이 그대로 유지한다.
 */
export default function Shell({
  rail,
  children,
}: {
  rail?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      {rail ? <div className="shell-rail">{rail}</div> : null}
      <div className="shell-main">
        {children}
        <SiteFooter />
      </div>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      {/* 이름과 링크는 한 줄. 130px 거터에 넣으면 링크가 세로로 쌓인다. */}
      <div className="footer-top">
        <p className="footer-mark">뉴스 브리핑</p>
        <nav className="footer-nav">
          {NAV.slice(1).map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
      <p className="footer-note">
        그날 시장을 움직인 뉴스와 테마를 다룹니다. 개별 종목, 관련주, 목표주가는
        싣지 않습니다.
      </p>
      <p className="footer-note footer-note--faint">
        본 서비스는 개별 종목에 대한 투자자문이나 투자권유를 제공하지 않으며, 시장
        전반의 뉴스와 해설만 제공합니다. 투자 판단과 그 결과는 이용자 본인에게
        귀속됩니다.
      </p>
    </footer>
  );
}
