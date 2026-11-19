"use client";

/**
 * 종목 브리핑 지면의 떠 있는 부품 둘 (2026-11-19 사용자 지시).
 *
 * 1. 상단 바 높이 재기. 바로가기 줄(`.stx-toc`)을 상단 바 바로 아래에 붙이려면 그 높이를 알아야 한다.
 *    넓은 화면은 48px로 고정이지만 휴대폰은 "텔레그램으로 받기" 단추가 줄을 넘겨 높이가 달라져서,
 *    예전에는 900px 이상에서만 붙였다("모바일에서는 소메뉴가 상단 고정이 안 된다"). 실제 높이를 재
 *    `--topbar-h`에 넣고 CSS가 그 값을 쓴다.
 * 2. 맨 위로 단추. 오른쪽 아래. 한 화면 넘게 내려가야 나타난다.
 */
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** 회차 화면(`/stocks`, `/stocks/w/{날짜}`)인가. 종목 주소(`/stocks/{코드}`)는 팝업이다 */
const isWeek = (p: string) => p === "/stocks" || p.startsWith("/stocks/w/");

export default function StockPageChrome() {
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  /*
   * 3. 회차를 바꾸면 창 맨 위로. Next는 창 꼭대기가 아니라 바뀐 구간(레이아웃 아래 페이지)의 시작으로
   *    스크롤해서 상단 바와 바로가기 줄 높이만큼 덜 올라갔다(2026-11-19 사용자 지적). 회차에서 회차로
   *    옮길 때만 한다 — 팝업을 열고 닫을 때(종목 주소를 오갈 때)는 목록 자리를 지켜야 한다.
   *    Next의 스크롤이 끝난 다음 프레임에 덮어쓴다.
   */
  useEffect(() => {
    const prev = prevPath.current;
    prevPath.current = pathname;
    if (prev === pathname || !isWeek(prev) || !isWeek(pathname)) return;
    const raf = requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
    return () => cancelAnimationFrame(raf);
  }, [pathname]);

  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    const root = document.documentElement;
    if (!bar) return;
    const set = () => root.style.setProperty("--topbar-h", `${Math.round(bar.getBoundingClientRect().height)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--topbar-h");
    };
  }, []);

  useEffect(() => {
    let raf = 0;
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setShow(window.scrollY > window.innerHeight));
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, []);

  const toTop = () => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <button
      type="button"
      className={`stk-top${show ? " is-on" : ""}`}
      onClick={toTop}
      aria-label="맨 위로"
      tabIndex={show ? 0 : -1}
      aria-hidden={!show}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5 11.5 10 6.5l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      </svg>
      <span>맨 위로</span>
    </button>
  );
}
