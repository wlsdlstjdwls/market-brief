"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef } from "react";
import {
  DESKTOP_MQ,
  ENTER_EASING,
  ENTER_MS,
  OFFSCREEN,
  SHELL_FLAG,
} from "../../../../components/stocks/StockModal";

/**
 * 팝업 본문을 받는 동안의 **빈 시트**. 누르자마자 시트가 올라오고 그 안에서 고리가 돈다
 * (2026-11-23 사용자 지시, "팝업이 열리고 로딩바 돌면 되지 않나").
 *
 * 예전에는 어두운 막만 깔았다. 여기서 시트를 올리면 본문이 오면서 진짜 시트가 한 번 더 올라와 두 번
 * 열리는 것처럼 보였기 때문이다. 지금은 이 틀이 `SHELL_FLAG`에 시각을 남기고, `StockModal`이 그걸 보고
 * 열기 애니메이션을 건너뛴다. 클래스와 크기가 같아 바뀌는 순간이 안 보인다.
 *
 * 스크롤 잠금은 하지 않는다. `StockModal`이 잠그며 이전 값을 저장하는데, 여기서 먼저 잠가 두면 그
 * "이전 값"이 잠긴 상태가 되어 닫은 뒤에도 페이지가 안 움직인다. 대신 막 위의 휠과 터치만 삼킨다.
 */
export default function Loading() {
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    (window as unknown as Record<string, number>)[SHELL_FLAG] = Date.now();
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (!sheet || !overlay || typeof sheet.animate !== "function") return;
    const timing: KeyframeAnimationOptions = { duration: ENTER_MS, easing: ENTER_EASING, fill: "backwards" };
    const desk = window.matchMedia(DESKTOP_MQ).matches;
    const a = desk
      ? sheet.animate([{ transform: "translateY(12px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], timing)
      : sheet.animate([{ transform: OFFSCREEN }, { transform: "translateY(0)" }], timing);
    const b = overlay.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    return () => {
      a.cancel();
      b.cancel();
    };
  }, []);

  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("wheel", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchmove", stop);
    };
  }, []);

  return (
    <div ref={overlayRef} className="bs-overlay" onClick={(e) => e.target === e.currentTarget && router.back()}>
      <div ref={sheetRef} className="bs" role="dialog" aria-modal="true" aria-busy="true" aria-label="종목 상세 불러오는 중">
        <div className="bs-handle-row">
          <div className="bs-handle" aria-hidden="true" />
        </div>
        <div className="bs-header">
          <span className="bs-title bs-title--loading" aria-hidden="true" />
          <button type="button" className="bs-close" onClick={() => router.back()} aria-label="닫기">
            ✕
          </button>
        </div>
        <div className="bs-content bs-content--loading" role="status">
          <span className="bs-spinner" aria-hidden="true" />
          <span className="sr-only">불러오는 중</span>
        </div>
      </div>
    </div>
  );
}
