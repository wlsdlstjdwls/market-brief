import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import Link from "next/link";
import TopNav from "../components/TopNav";
import { NAV } from "../lib/nav";
import "./globals.css";

const sans = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  // 사이트 이름은 "뉴스 브리핑"이다. 증시 용어(시황)를 쓰지 않는다.
  title: { default: "데일리 뉴스 브리핑", template: "%s — 뉴스 브리핑" },
  description:
    "그날 시장을 움직인 뉴스와 테마를 정리하는 매일의 브리핑. 개별 종목은 다루지 않습니다.",
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
      </body>
    </html>
  );
}
