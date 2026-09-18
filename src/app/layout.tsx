import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import TopNav from "../components/TopNav";
import { NAV } from "../lib/nav";
import {
  GOOGLE_VERIFICATION,
  NAVER_VERIFICATION,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "../lib/site";
import "./globals.css";

const sans = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  /*
   * metadataBase가 있어야 OG 이미지와 canonical이 절대 URL로 나간다.
   * 없으면 카카오톡·슬랙이 상대 경로를 못 읽어 미리보기가 통째로 비어 보인다.
   */
  metadataBase: new URL(SITE_URL),
  // 사이트 이름은 "더 브리핑"이다. 증시 용어(시황)를 쓰지 않는다.
  title: { default: SITE_TITLE, template: `%s — ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": `${SITE_URL}/rss.xml` },
  },
  openGraph: {
    type: "website",
    locale: "ko_KR",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  /* 값이 없으면 태그를 그리지 않는다 (site.ts 주석 참고). 네이버는 메타태그만 받는다. */
  verification: {
    ...(GOOGLE_VERIFICATION ? { google: GOOGLE_VERIFICATION } : {}),
    ...(NAVER_VERIFICATION
      ? { other: { "naver-site-verification": NAVER_VERIFICATION } }
      : {}),
  },
};

/*
 * 모바일 크롬 주소창 색. 안 넣으면 흰색으로 떨어져 크림 배경과 경계가 생긴다.
 *
 * `metadata`의 `themeColor`는 Next 14에서 폐기됐다. 여기 `viewport`가 지금 자리다.
 * 값은 `globals.css`의 `--bg`와 같아야 하고, 다크 모드가 없으므로(`color-scheme: light`)
 * 한 값이면 된다.
 */
export const viewport: Viewport = {
  themeColor: "#fbfaf7",
  colorScheme: "light",
};

/**
 * 워드마크 앞의 마크. 브리핑 한 편을 세 줄로 줄인 모양이고 머리줄만 브랜드색이다.
 * 파비콘·앱 아이콘과 같은 도형이다 (`scripts/make-icons.mjs`).
 *
 * 인라인 `svg`로 둔다. `.topbar-inner`가 `align-items: baseline`이라 워드마크를
 * flex 컨테이너로 바꾸면 기준선이 도형 아래쪽으로 잡혀 옆의 네비와 어긋난다.
 * 글자가 기준선을 그대로 쥐고 있게 두고 도형만 `vertical-align`으로 앉힌다.
 */
function Mark() {
  return (
    <svg className="wordmark-mark" viewBox="0 0 18 16" width="15" height="14" aria-hidden="true">
      <rect className="mark-accent" y="1.5" width="18" height="3.2" />
      <rect className="mark-ink" y="6.4" width="18" height="3.2" />
      <rect className="mark-ink" y="11.3" width="11" height="3.2" />
    </svg>
  );
}

function Header() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark">
          <Mark />
          더 브리핑
        </Link>
        <TopNav items={[...NAV]} />
      </div>
    </header>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className={sans.variable}>
      <body>
        <Header />
        <main>{children}</main>
        {/*
          방문 통계와 속도 계측. 쿠키를 쓰지 않고 개인을 식별하지 않으므로
          지금의 "수집하는 개인정보 없음" 상태를 바꾸지 않는다.
          프로덕션 배포에서만 실제로 전송된다.
        */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
