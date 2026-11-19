"use client";

/**
 * 종목 상세 팝업 (2026-11-19 사용자 지시, "상세는 팝업이 편하다").
 *
 * 휴대폰(768px 미만)은 바텀시트, 넓은 화면은 가운데 팝업이다. 바텀시트 동작은 fitin-app의
 * `common_bottom_sheet.tsx`를 그대로 옮겼다(사용자 지시, "이벤트도 그대로"). 그쪽은 motion 라이브러리로
 * 끌기를 받지만 여기는 의존성을 늘리지 않으려고 포인터 이벤트로 같은 동작을 직접 짰다. 수치는 전부 같다.
 *
 * - 열기 360ms `cubic-bezier(0.32, 0.72, 0, 1)`, 닫기 220ms `cubic-bezier(0.4, 0, 1, 1)`. Web Animations라
 *   컴포지터에서 돈다(열리는 동안 리렌더가 겹쳐도 프레임이 밀리지 않는다).
 * - 손잡이 줄, 헤더, 바깥 막에서 끌 수 있다. 위로는 안 올라가고(탄성 없음), 내린 만큼 막이 옅어진다
 *   (화면 높이 60%에서 0).
 * - 놓았을 때 아래로 초속 500px 이상이거나, 100px 넘게 내렸고 위로 튕기지 않았으면 닫는다.
 *   아니면 0.25초에 제자리로 돌아온다(스프링은 위로 튕길 때 넘쳐서 tween).
 * - 열린 직후 400ms 동안은 바깥 클릭을 무시한다(ghost click). 500ms 뒤부터 끌기를 받는다.
 * - 열린 동안 배경 스크롤을 잠근다(body fixed + 원래 위치 복원). 시트 안에서는 스크롤할 곳이 남아 있을 때만
 *   브라우저에 맡겨, 끝에서 더 밀면 iOS가 문서 전체를 고무줄처럼 늘리는 것을 막는다.
 * - Esc로 닫는다.
 *
 * 닫기는 애니메이션이 끝난 뒤 `router.back()`이다. 주소가 `/stocks/{코드}`로 쌓여 있으므로 휴대폰의
 * 뒤로 가기로 닫아도 어긋나지 않는다(그때는 주소가 먼저 바뀌어 애니메이션 없이 사라진다).
 * 다른 화면으로 옮겨 가면 슬롯이 이전 상태를 붙들고 있으므로 주소를 보고 스스로 숨는다.
 */
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const ENTER_MS = 360;
const EXIT_MS = 220;
const SNAP_BACK_MS = 250;
const ENTER_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
const SNAP_BACK_EASING = "cubic-bezier(0.25, 0.46, 0.45, 0.94)";
const OFFSCREEN = "translateY(100%)";
const GHOST_CLICK_BLOCK_MS = 400;
const INTERACTABLE_DELAY_MS = 500;
const DRAG_CLOSE_OFFSET_PX = 100;
const DRAG_CLOSE_VELOCITY = 500; // px/s
const OVERLAY_FADE_RATIO = 0.6;
const DESKTOP_MQ = "(min-width: 768px)";

/** el부터 시트까지 세로 스크롤 상자를 모은다. 터치 시작에 한 번만 부른다(touchmove마다 부르면 iOS가 버벅인다) */
function verticalScrollers(el: HTMLElement | null, root: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let n = el; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if (oy === "auto" || oy === "scroll") out.push(n);
    if (n === root) break;
  }
  return out;
}

/** dy 방향(+ = 손가락이 아래로)으로 더 스크롤할 곳이 남았나 */
function canScrollAny(list: HTMLElement[], dy: number): boolean {
  return list.some((n) => {
    if (n.scrollHeight <= n.clientHeight + 1) return false;
    return dy > 0 ? n.scrollTop > 0 : n.scrollTop + n.clientHeight < n.scrollHeight - 1;
  });
}

function useIsDesktop(): boolean {
  // 팝업은 클라이언트 이동으로만 뜬다(서버 HTML에 안 실린다). 첫 렌더부터 실제 값으로 시작해야
  // 열기 애니메이션이 시트용으로 한 번 돌았다가 팝업용으로 다시 도는 일이 없다
  const [desk, setDesk] = useState(
    () => typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches,
  );
  useLayoutEffect(() => {
    const mq = window.matchMedia(DESKTOP_MQ);
    const on = () => setDesk(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return desk;
}

export default function StockModal({
  title,
  code,
  children,
}: {
  title: string;
  code: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const open = pathname === `/stocks/${code}`;
  const isDesktop = useIsDesktop();

  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const anims = useRef<Animation[]>([]);
  const openedAt = useRef(0);
  const closing = useRef(false);
  const [interactable, setInteractable] = useState(false);

  /** 끌기 중 상태. 시트의 translateY(px)와 속도 계산용 최근 표본 */
  const drag = useRef<{ id: number; startY: number; y: number; samples: Array<[number, number]> } | null>(null);

  const setY = useCallback((y: number) => {
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (sheet) sheet.style.transform = y ? `translateY(${y}px)` : "";
    if (overlay) {
      const fade = window.innerHeight * OVERLAY_FADE_RATIO;
      overlay.style.opacity = String(Math.max(0, 1 - y / fade));
    }
  }, []);

  const cancelAnims = useCallback(() => {
    const list = anims.current;
    anims.current = [];
    for (const a of list) {
      a.onfinish = null;
      a.cancel();
    }
  }, []);

  /** 지금 보이는 자리(드래그로 내려간 자리 포함)에서 화면 밖으로 내린 뒤 뒤로 간다 */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    const done = () => router.back();
    if (!sheet || !overlay || typeof sheet.animate !== "function") return done();
    const fromT = getComputedStyle(sheet).transform;
    const fromO = getComputedStyle(overlay).opacity;
    cancelAnims();
    const timing: KeyframeAnimationOptions = { duration: EXIT_MS, easing: EXIT_EASING, fill: "forwards" };
    // 넓은 화면은 아래로 조금 내려가며 흐려진다. 시트처럼 화면 밖까지 내리면 가운데 팝업에는 어색하다
    const toT = isDesktop ? "translateY(12px)" : OFFSCREEN;
    const s = sheet.animate(
      [
        { transform: fromT === "none" ? "translateY(0)" : fromT, opacity: 1 },
        { transform: toT, opacity: isDesktop ? 0 : 1 },
      ],
      timing,
    );
    const o = overlay.animate([{ opacity: fromO }, { opacity: 0 }], timing);
    anims.current = [s, o];
    s.onfinish = done;
  }, [cancelAnims, isDesktop, router]);

  // 열기. 첫 페인트 전에 화면 밖 키프레임을 걸어 깜빡임을 막는다
  useLayoutEffect(() => {
    if (!open) return;
    closing.current = false;
    openedAt.current = Date.now();
    setY(0);
    bodyRef.current?.scrollTo(0, 0);
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (!sheet || !overlay || typeof sheet.animate !== "function") return;
    const timing: KeyframeAnimationOptions = { duration: ENTER_MS, easing: ENTER_EASING, fill: "backwards" };
    const s = isDesktop
      ? sheet.animate([{ transform: "translateY(12px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], timing)
      : sheet.animate([{ transform: OFFSCREEN }, { transform: "translateY(0)" }], timing);
    const o = overlay.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    anims.current = [s, o];
    s.onfinish = () => {
      anims.current = [];
    };
    return () => {
      if (anims.current.includes(s)) cancelAnims();
    };
  }, [open, isDesktop, setY, cancelAnims]);

  // 열린 직후에는 끌기를 받지 않는다
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setInteractable(true), INTERACTABLE_DELAY_MS);
    return () => {
      clearTimeout(t);
      setInteractable(false);
    };
  }, [open]);

  // 배경 스크롤 잠금 + 시트 끝에서의 고무줄 막기
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const body = document.body;
    const prev = {
      html: html.style.overflow,
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };
    const scrollY = window.scrollY;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    if (scrollY > 0) {
      body.style.position = "fixed";
      body.style.top = `-${scrollY}px`;
      body.style.width = "100%";
    }

    let lastX = 0;
    let lastY = 0;
    let scrollers: HTMLElement[] = [];
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      lastX = t.clientX;
      lastY = t.clientY;
      const target = e.target as HTMLElement | null;
      const sheet = target?.closest<HTMLElement>(".bs");
      scrollers = sheet && !target?.closest(".bs-handle-row, .bs-header") ? verticalScrollers(target, sheet) : [];
    };
    const onMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest(".bs")) {
        e.preventDefault();
        return;
      }
      const t = e.touches[0];
      if (!t || e.touches.length > 1) return; // 핀치 확대는 막지 않는다
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      lastX = t.clientX;
      lastY = t.clientY;
      if (Math.abs(dx) > Math.abs(dy) || dy === 0) return; // 가로 스크롤 표는 그대로
      if (target.closest(".bs-handle-row, .bs-header")) return; // 끌기가 맡는다
      if (e.cancelable && !canScrollAny(scrollers, dy)) e.preventDefault();
    };
    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: false });

    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.overflow;
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      if (scrollY > 0) window.scrollTo(0, scrollY);
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
    };
  }, [open]);

  // Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus({ preventScroll: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  /* ---------- 끌기 ---------- */

  const onDragStart = (e: React.PointerEvent<HTMLElement>) => {
    if (isDesktop || !interactable || closing.current) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // 버튼, 링크를 누른 것은 끌기가 아니다
    if ((e.target as HTMLElement).closest("button, a")) return;
    cancelAnims();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, y: 0, samples: [[performance.now(), e.clientY]] };
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (sheet) sheet.style.willChange = "transform";
    if (overlay) overlay.style.willChange = "opacity";
  };

  const onDragMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.y = Math.max(0, e.clientY - d.startY); // 위로는 안 올라간다
    d.samples.push([performance.now(), e.clientY]);
    if (d.samples.length > 6) d.samples.shift();
    setY(d.y);
  };

  const onDragEnd = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const [t0, y0] = d.samples[0];
    const [t1, y1] = d.samples[d.samples.length - 1];
    const v = t1 > t0 ? ((y1 - y0) / (t1 - t0)) * 1000 : 0;
    const sheet = sheetRef.current;
    const overlay = overlayRef.current;
    if (v > DRAG_CLOSE_VELOCITY || (d.y > DRAG_CLOSE_OFFSET_PX && v >= 0)) {
      close();
      return;
    }
    if (!sheet || !overlay || d.y === 0) {
      setY(0);
      return;
    }
    // 제자리로. 손가락을 따라가던 자리에서 그대로 이어서 움직인다
    const from = d.y;
    const fromO = overlay.style.opacity || "1";
    setY(0);
    const timing: KeyframeAnimationOptions = { duration: SNAP_BACK_MS, easing: SNAP_BACK_EASING };
    const s = sheet.animate([{ transform: `translateY(${from}px)` }, { transform: "translateY(0)" }], timing);
    const o = overlay.animate([{ opacity: fromO }, { opacity: 1 }], timing);
    anims.current = [s, o];
    s.onfinish = () => {
      anims.current = [];
      sheet.style.willChange = "";
      overlay.style.willChange = "";
    };
  };

  const dragProps = {
    onPointerDown: onDragStart,
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  };

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="bs-overlay"
      // 바깥 막에서 시작한 끌기만 받는다. 시트 안에서 올라온 이벤트는 target이 다르다
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onDragStart(e);
      }}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        if (Date.now() - openedAt.current < GHOST_CLICK_BLOCK_MS) return;
        close();
      }}
    >
      <div
        ref={sheetRef}
        className="bs"
        role="dialog"
        aria-modal="true"
        aria-label={`${title} 상세`}
        tabIndex={-1}
      >
        <div className="bs-handle-row" {...dragProps}>
          <div className="bs-handle" aria-hidden="true" />
        </div>
        <div className="bs-header" {...dragProps}>
          <h2 className="bs-title">{title}</h2>
          <button type="button" className="bs-close" onClick={close} aria-label="닫기">
            ✕
          </button>
        </div>
        <div ref={bodyRef} className="bs-content">
          {children}
        </div>
      </div>
    </div>
  );
}
