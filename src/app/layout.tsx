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
  title: { default: "시황 브리핑", template: "%s — 시황 브리핑" },
  description:
    "그날 시장을 움직인 뉴스와 테마를 정리하는 매일의 브리핑. 개별 종목은 다루지 않습니다.",
};

function Header() {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="wordmark">
          시황 브리핑
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
