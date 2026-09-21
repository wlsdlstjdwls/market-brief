"use client";

/**
 * 회차 탭. 원본 루틴이 하루 두 번 쓰기 때문에 한 날짜에 글이 둘이다.
 *
 * **어느 회차가 켜져 있는지는 이 컴포넌트가 쥐지 않는다.** `<html data-session>` 한 값이
 * 쥐고 CSS가 본문과 탭을 같이 뒤집는다. 그 값은 날짜 페이지의 인라인 스크립트가
 * **그리기 전에** 정한다(`brief/[date]/page.tsx`).
 *
 * 왜 이렇게 하나 — 서버가 `searchParams`를 읽으면 그 페이지는 매 요청 서버 렌더가 되어
 * `revalidate`가 통째로 무시된다(2026-09-18 실측: 홈은 캐시 HIT 50ms, 날짜 페이지는
 * 매번 MISS 800ms). 그렇다고 `useSearchParams`를 쓰면 이 자리가 Suspense 경계까지
 * 클라이언트 렌더로 떨어져 첫 화면이 빈다. 둘 다 피하는 길이 「서버는 두 회차를 다 굽고,
 * 브라우저가 고른다」다.
 *
 * ## 탭이 안 먹던 두 자리 (2026-09-21)
 *
 * 1. **홈에는 마감판 한 벌만 구워져 있다.** 그런데 탭은 홈에도 떴고, 누르면
 *    `preventDefault` 뒤 `data-session`만 바꿨다. 감출 `.ses--pm`도 보여 줄 `.ses--am`도
 *    없으니 **탭 밑줄만 옮겨 가고 글은 그대로**였다. 그래서 두 회차가 한 문서에 실제로
 *    구워진 자리에서만 가로챈다(`inline`). 아니면 평범한 링크로 날짜 페이지에 보낸다.
 * 2. **인라인 `<script>`는 클라이언트 전환에서 다시 돌지 않는다.** 아침판을 보다가
 *    「지난 브리핑」으로 다른 날짜에 들어가면 `data-session`이 `am`인 채로 남아 그 날
 *    아침판이 떴다. 그래서 경로가 바뀔 때마다 주소를 보고 다시 맞춘다.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { SESSION_LABEL, SESSION_ORDER, type Session } from "../lib/queries";

/** 주소의 `?s=`를 `<html data-session>`에 옮긴다. 기본값은 마감 브리핑이다. */
function sync() {
  const s = new URLSearchParams(location.search).get("s");
  document.documentElement.dataset.session = s === "am" ? "am" : "pm";
}

export default function SessionTabs({
  basePath,
  sessions,
  inline = false,
}: {
  /** 탭 링크의 뿌리. 언제나 날짜 페이지(`/brief/{날짜}`)를 가리킨다 */
  basePath: string;
  /** 그날 발행된 회차. 하나뿐이면 탭을 그리지 않는다 */
  sessions: Session[];
  /**
   * 이 문서에 두 회차가 **둘 다** 구워져 있는가. 날짜 페이지만 참이다.
   * 거짓이면 탭은 평범한 링크라 그 페이지로 이동한다 — 홈이 그렇다.
   */
  inline?: boolean;
}) {
  const shown = SESSION_ORDER.filter((s) => sessions.includes(s));
  const pathname = usePathname();

  /*
   * 경로가 바뀔 때마다 주소에 맞춘다. 인라인 스크립트는 전체 로드에서만 돌기 때문에
   * 클라이언트 전환으로 들어온 페이지는 앞 페이지의 값을 그대로 물려받는다.
   *
   * 뒤로 가기도 같이 본다. pushState는 popstate를 안 띄우므로 브라우저가 주소를
   * 되돌릴 때만 온다 — 안 맞추면 주소는 마감판인데 화면은 아침판이다.
   */
  useEffect(() => {
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);

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
              // 두 회차가 한 문서에 없으면 가로채지 않는다. 그 페이지로 그냥 간다
              if (!inline) return;
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
