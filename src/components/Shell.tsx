import Link from "next/link";
import { NAV } from "../lib/nav";
import { CONTACT_EMAIL, TELEGRAM_URL } from "../lib/site";

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
        <TelegramCta />
        <SiteFooter />
      </div>
    </div>
  );
}

/**
 * 텔레그램 채널 안내. 푸터 바로 위에 한 줄로 앉는다.
 *
 * 신청 폼을 두지 않는 이유는 `site.ts`의 TELEGRAM_URL 주석에 있다 — 받는 개인정보가
 * 0이어야 지금의 "수집하지 않음" 상태가 유지된다. 박스를 치지 않고 헤어라인만 쓰는 건
 * design/design-spec.md(카드, 둥근 모서리, 배경 채움 없음)를 따른 것이다.
 */
function TelegramCta() {
  return (
    <aside className="tg-cta">
      <p className="tg-cta-text">
        매일 아침과 오후, 새 브리핑을 텔레그램으로 받아 보세요.
      </p>
      <a className="tg-cta-link" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
        텔레그램으로 받기
      </a>
    </aside>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      {/* 이름과 링크는 한 줄. 130px 거터에 넣으면 링크가 세로로 쌓인다. */}
      <div className="footer-top">
        <p className="footer-mark">더 브리핑</p>
        <nav className="footer-nav">
          {NAV.slice(1).map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            텔레그램
          </a>
          <a href="/rss.xml">RSS</a>
          {/* 주소를 설정하지 않으면 아무것도 그리지 않는다 (site.ts 주석 참고). */}
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>문의</a> : null}
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
