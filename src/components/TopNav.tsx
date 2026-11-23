"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, navActive } from "../lib/nav";

/** 상단 네비(데스크톱). 켜진 칸은 굵게, 아래에 검은 막대. 휴대폰에서는 숨기고 탭 바가 대신한다. */
export default function TopNav() {
  const path = usePathname();
  return (
    <nav className="topnav" aria-label="주 메뉴">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} aria-current={navActive(n.href, path) ? "page" : undefined}>
          {n.label}
        </Link>
      ))}
    </nav>
  );
}
