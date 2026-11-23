"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV, navActive } from "../lib/nav";
import { TELEGRAM_URL } from "../lib/site";

/*
 * 휴대폰 하단 탭 바 (2026-11-23 개편).
 *
 * 예전에는 상단 바에 워드마크, 메뉴 셋, 텔레그램 버튼이 다 들어가 390px에서 두 줄로 접혔고
 * 엄지가 닿지 않는 맨 위에만 메뉴가 있었다. 휴대폰에서는 메뉴를 아래로 내리고 상단 바는
 * 워드마크 한 줄만 남긴다. 740px 이상에서는 CSS가 숨긴다.
 *
 * 관리자 콘솔에는 그리지 않는다. 독자용 메뉴라 거기서는 길만 헷갈린다.
 */
const ICON: Record<string, React.ReactNode> = {
  "/": (
    <path d="M4 5h16M4 10h16M4 15h10M4 20h7" />
  ),
  "/stocks": (
    <path d="M4 19V9M10 19V5M16 19v-7M21 19H3" />
  ),
  "/archive": (
    <>
      <rect x="4" y="5" width="16" height="15" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </>
  ),
};

export default function TabBar() {
  const path = usePathname();
  /*
   * 누른 칸. 페이지가 도착하기 전에 그 칸을 먼저 켠다(2026-11-23 "반응이 너무 느리다").
   * 개발 서버는 이동마다 서버가 그려 1초 가까이 걸리고, 그동안 탭 바가 그대로라 안 눌린 것처럼 보였다.
   * 주소가 바뀌면 지운다 — 그때부터는 aria-current가 켠다.
   */
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => setPending(null), [path]);
  if (path.startsWith("/admin")) return null;

  return (
    <nav className="tabbar" aria-label="주 메뉴">
      {NAV.map((n) => {
        const on = navActive(n.href, path);
        return (
          <Link
            key={n.href}
            href={n.href}
            className="tabbar-item"
            aria-current={on && !pending ? "page" : undefined}
            data-pending={pending === n.href ? "true" : undefined}
            onClick={() => !on && setPending(n.href)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{ICON[n.href]}</svg>
            <span>{n.short}</span>
          </Link>
        );
      })}
      <a className="tabbar-item tabbar-item--cta" href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11.5 21 4l-3 16-6-5-3 4v-6l9-8" />
        </svg>
        <span>구독</span>
      </a>
    </nav>
  );
}
