import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import TopNav from "../components/TopNav";
import { NAV } from "../lib/nav";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL } from "../lib/site";
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
  // 사이트 이름은 "뉴스 브리핑"이다. 증시 용어(시황)를 쓰지 않는다.
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
};

function Header() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark">
          뉴스 브리핑
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
