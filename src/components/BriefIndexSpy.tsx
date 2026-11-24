"use client";

import { useEffect } from "react";

/** 상단 바 아래 이 높이 안에 머리가 올라온 카드를 "지금 읽는 카드"로 본다 */
const READ_LINE = 140;

/**
 * 오른쪽 색인에서 지금 읽는 카드를 표시한다(`aria-current="true"`). 화면에는 아무것도 그리지 않는다.
 *
 * 판정은 "머리가 읽는 선(READ_LINE) 위로 올라온 카드 중 마지막 것"이다. IntersectionObserver로
 * "화면에 걸친 첫 카드"를 고르면 앞 카드의 꼬리가 남아 있을 때 한 칸 앞이 켜졌다.
 * 날짜 페이지는 두 회차를 한 문서에 굽고 한쪽을 숨긴다. 숨은 쪽은 offsetParent가 없어 빠진다.
 * 색인 표시는 1100px 이상에서만 CSS가 그린다.
 */
export default function BriefIndexSpy({ navId }: { navId: string }) {
  useEffect(() => {
    const nav = document.getElementById(navId);
    if (!nav) return;
    const links = [...nav.querySelectorAll<HTMLAnchorElement>("a[href^='#']")];
    const pairs = links
      .map((a) => [a, document.getElementById(a.getAttribute("href")!.slice(1))] as const)
      .filter((p): p is readonly [HTMLAnchorElement, HTMLElement] => !!p[1]);
    if (!pairs.length) return;

    let raf = 0;
    let last: HTMLAnchorElement | null = null;
    const update = () => {
      raf = 0;
      if (!nav.offsetParent) return;
      let cur: HTMLAnchorElement | null = null;
      for (const [a, el] of pairs) {
        if (el.getBoundingClientRect().top <= READ_LINE) cur = a;
        else break;
      }
      if (cur === last) return;
      last = cur;
      for (const [a] of pairs) a.setAttribute("aria-current", a === cur ? "true" : "false");
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // 색인이 화면보다 길면 고정하지 않는다. 고정된 채 넘치면 아래쪽이 영영 안 보인다.
    // 제 안에 스크롤을 두는 방식은 불편하다는 지적(2026-11-24)으로 뺐다.
    const fit = () => {
      const top = parseFloat(getComputedStyle(nav).top) || 0;
      nav.dataset.static = String(nav.offsetHeight + top + 16 > window.innerHeight);
      onScroll();
    };
    fit();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", fit);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [navId]);
  return null;
}
