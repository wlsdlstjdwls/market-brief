import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "시황 브리핑", template: "%s · 시황 브리핑" },
  description:
    "지수·금리·환율·유가·투자주체별 수급·업종 강약만 다루는 매일의 시장 브리핑. 개별 종목은 다루지 않습니다.",
};

function Footer() {
  return (
    <footer
      className="mt-16 border-t text-sm"
      style={{ borderColor: "var(--line)", color: "var(--muted)" }}
    >
      <div className="mx-auto max-w-3xl space-y-3 px-5 py-8">
        <p>
          본 서비스는 개별 종목에 대한 투자자문·투자권유를 제공하지 않으며, 시장
          전반의 통계와 해설만 제공합니다. 투자 판단과 그 결과는 이용자 본인에게
          귀속됩니다.
        </p>
        <p className="flex gap-4">
          <Link href="/disclaimer" className="underline underline-offset-4">
            면책 고지
          </Link>
          <Link href="/privacy" className="underline underline-offset-4">
            개인정보 처리방침
          </Link>
          <Link href="/archive" className="underline underline-offset-4">
            지난 브리핑
          </Link>
        </p>
      </div>
    </footer>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <header className="border-b" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto flex max-w-3xl items-baseline justify-between px-5 py-4">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              시황 브리핑
            </Link>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              종목 추천 없음
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-5 py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
