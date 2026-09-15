"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** 상단 네비. 현재 경로만 잉크색 500으로 올린다(밑줄이나 배경 없음). */
export default function TopNav({
  items,
}: {
  items: { href: string; label: string }[];
}) {
  const path = usePathname();

  return (
    <nav className="topnav">
      {items.map((n) => {
        const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={on ? "page" : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
