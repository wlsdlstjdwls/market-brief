"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 스크롤하면 섹션 머리와 카드가 살짝 떠오르며 나타난다(모션 시안 M6, 2026-11-24).
 * 섹션 워터마크(NEWS …)는 옆에서 미끄러져 들어온다(CSS, .sec--mark .sec-gutter.rv.in).
 *
 * 숨김 표시(.rv)는 **자바스크립트가 붙인다.** 서버 HTML에는 없으므로 스크립트가 못 돌아도 글이 보인다.
 * 첫 화면에 이미 보이는 것은 바로 나타난다. 움직임 줄이기 설정이면 아무것도 하지 않는다.
 * 날짜 페이지는 숨은 회차도 같이 구워져 있는데, 숨은 쪽은 교차하지 않다가 탭을 바꾸면 그때 나타난다.
 */
const TARGETS = ".sec--mark .sec-gutter, .topic, .brief-index, .arc-month";

export default function ScrollReveal() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const els = [...document.querySelectorAll<HTMLElement>(TARGETS)].filter((el) => !el.classList.contains("in"));
    for (const el of els) {
      el.classList.add("rv");
      io.observe(el);
    }
    return () => io.disconnect();
  }, [path]);
  return null;
}
