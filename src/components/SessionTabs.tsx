"use client";

/**
 * 회차 탭. 원본 루틴이 하루 두 번 쓰기 때문에 한 날짜에 글이 둘이다.
 *
 * **어느 회차가 켜져 있는지는 이 컴포넌트가 쥐지 않는다.** `<html data-session>` 한 값이
 * 쥐고 CSS가 본문과 탭을 같이 뒤집는다. 그 값은 페이지의 인라인 스크립트가 **그리기 전에**
 * 정한다(`brief/[date]/page.tsx`).
 *
 * 왜 이렇게 하나 — 서버가 `searchParams`를 읽으면 그 페이지는 매 요청 서버 렌더가 되어
 * `revalidate`가 통째로 무시된다(2026-09-18 실측: 홈은 캐시 HIT 50ms, 날짜 페이지는
 * 매번 MISS 800ms). 그렇다고 `useSearchParams`를 쓰면 이 자리가 Suspense 경계까지
 * 클라이언트 렌더로 떨어져 첫 화면이 빈다. 둘 다 피하는 길이 「서버는 두 회차를 다 굽고,
 * 브라우저가 고른다」다.
 *
 * `href`는 그대로 둔다 — 자바스크립트가 없어도 링크로 동작하고 크롤러도 따라간다.
 */
import { useEffect } from "react";
import { SESSION_LABEL, SESSION_ORDER, type Session } from "../lib/queries";

export default function SessionTabs({
  basePath,
  sessions,
}: {
  /** 탭 링크의 뿌리. 날짜 페이지면 `/brief/{날짜}` */
  basePath: string;
  /** 그날 발행된 회차. 하나뿐이면 탭을 그리지 않는다 */
  sessions: Session[];
}) {
  const shown = SESSION_ORDER.filter((s) => sessions.includes(s));

  /*
   * 뒤로 가기. pushState는 popstate를 안 띄우므로 브라우저가 주소를 되돌릴 때만 온다.
   * 그때 `data-session`을 주소에 다시 맞춘다 — 안 맞추면 주소는 마감판인데 화면은 아침판이다.
   */
  useEffect(() => {
    function sync() {
      const s = new URLSearchParams(location.search).get("s");
      document.documentElement.dataset.session = s === "am" ? "am" : "pm";
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  if (shown.length < 2) return null;

  return (
    <nav className="tabs" aria-label="회차">
      {shown.map((s) => {
        const href = s === "pm" ? basePath : `${basePath}?s=${s}`;
        return (
          <a
            key={s}
            href={href}
            className="tab"
            data-s={s}
            onClick={(e) => {
              // 새 탭으로 열기, 가운데 클릭은 브라우저에 맡긴다
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              history.pushState(null, "", href);
              document.documentElement.dataset.session = s;
            }}
          >
            {SESSION_LABEL[s]}
          </a>
        );
      })}
    </nav>
  );
}
