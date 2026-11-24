import Link from "next/link";
import { NAV } from "../lib/nav";
import { CONTACT_EMAIL, TELEGRAM_URL } from "../lib/site";

/**
 * 지면 셸. 본문 한 단 + 끝에 텔레그램 안내와 푸터.
 *
 * 2026-11-23 개편에서 왼쪽 목차 열을 걷었다. 회차마다 "이 회차 한눈에" 색인이 그 일을
 * 하고, 목차 열이 본문을 오른쪽으로 밀어 읽는 폭이 좁았다.
 *   read — 글 지면(브리핑, 지난 호, 안내 문서). 한 줄 길이를 읽기 좋은 폭으로 묶는다
 *   wide — 표와 차트 지면(종목 브리핑)
 */
export default function Shell({
  width = "read",
  children,
}: {
  width?: "read" | "wide";
  children: React.ReactNode;
}) {
  return (
    <div className={`shell shell--${width}`}>
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
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            텔레그램
          </a>
          <a href="/rss.xml">RSS</a>
          {/* 방문 집계를 켜면서 다시 필수가 됐다(개인정보 보호법 제30조). 첫 화면에서 한 번에 닿아야 한다 */}
          <Link href="/privacy">개인정보 처리방침</Link>
          {/* 주소를 설정하지 않으면 아무것도 그리지 않는다 (site.ts 주석 참고). */}
          {CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>문의</a> : null}
        </nav>
      </div>
      <p className="footer-note">
        뉴스 브리핑은 그날 시장을 움직인 뉴스와 테마를 다룹니다. 종목 브리핑은 공시
        재무와 주가를 정리한 자료입니다. 어느 쪽도 매수, 매도 추천이나 목표주가를 싣지
        않습니다.
      </p>
      <p className="footer-note footer-note--faint">
        본 서비스는 투자자문이나 투자권유를 제공하지 않습니다. 투자 판단과 그 결과는
        이용자 본인에게 귀속됩니다.
      </p>
      {/* 차트 라이브러리 출처 표기(라이선스 조건: 고지문 + tradingview.com 링크). 차트 안 로고(attributionLogo)를
          끈 대신 여기서 표기한다(2026-11-24 사용자 결정). 이 줄을 지우면 차트 로고를 다시 켜야 한다 */}
      <p className="footer-note footer-note--faint">
        차트:{" "}
        <a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">
          TradingView Lightweight Charts™
        </a>{" "}
        Copyright (c) TradingView, Inc.
      </p>
    </footer>
  );
}
