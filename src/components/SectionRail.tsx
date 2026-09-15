"use client";

import { useEffect, useState } from "react";

/**
 * 좌측 목차. 셸의 첫 flex 항목이라 740px 미만에서는 본문 위로 접힌다(미디어쿼리 없음).
 * 활성 판정은 IntersectionObserver — 뷰포트 상단 80px 아래, 하단 65% 위 구간에 들어온 섹션.
 */
export default function SectionRail({
  items,
  meta,
}: {
  items: { id: string; label: string }[];
  meta?: string;
}) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const nodes = items
      .map((i) => document.getElementById(i.id))
      .filter((n): n is HTMLElement => n !== null);
    if (!nodes.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px", threshold: 0 },
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav aria-label="목차">
      <p className="rail-title">목차</p>
      {items.map((it, idx) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className="rail-link"
          aria-current={active === it.id ? "true" : undefined}
        >
          <span className="rail-ord">{String(idx + 1).padStart(2, "0")}</span>
          {it.label}
        </a>
      ))}
      {meta ? <p className="rail-meta">{meta}</p> : null}
    </nav>
  );
}
