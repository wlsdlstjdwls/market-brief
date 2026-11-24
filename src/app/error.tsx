"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CONTACT_EMAIL, TELEGRAM_URL } from "../lib/site";

/**
 * 렌더 중 터진 예외. 대부분 DB(Neon)를 잠깐 못 읽은 경우다.
 *
 * 2026-11-24 리디자인(사용자 지시, 서비스 기획 관점). 이 화면에 오는 사람은 대개 텔레그램 알림이나 검색에서
 * 바로 들어온 독자다. 목표는 "사과"가 아니라 **읽으러 온 것을 어떻게든 읽게 하는 것**이다.
 *   1. 무엇이 안 됐는지 지면 이름으로 말한다(뉴스 브리핑 / 종목 브리핑 / 콘솔). 독자 탓으로 읽히는 말은 쓰지 않는다
 *   2. 첫 단추는 다시 시도. 누르면 도는 중 표시를 띄워 두 번 누르지 않게 한다
 *   3. 다른 길: 텔레그램 채널(같은 브리핑 본문이 통째로 간다, 사이트가 막혀도 읽힌다), 지난 브리핑, 다른 지면
 *   4. 그래도 안 되면 알릴 곳과 오류 번호(digest). 문의 주소가 없는 배포에서는 그 줄을 그리지 않는다
 *
 * 클라이언트 컴포넌트라 `Shell`을 쓰지 않는다 — 푸터가 서버에서 읽는 값을 참조한다. 상단 바는 레이아웃이 그린다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const path = usePathname() ?? "/";
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    console.error("페이지 렌더 실패:", error);
  }, [error]);

  const stocks = path.startsWith("/stocks");
  const admin = path.startsWith("/admin");
  const what = admin ? "관리자 화면을" : stocks ? "종목 브리핑을" : "브리핑을";

  const retry = () => {
    setRetrying(true);
    reset();
    // reset이 같은 오류로 다시 떨어지면 이 화면이 그대로 남는다. 단추를 되살려 다시 누를 수 있게 한다
    setTimeout(() => setRetrying(false), 2500);
  };

  return (
    <div className="shell">
      <div className="shell-main">
        <section className="oops" aria-labelledby="oops-title">
          {/* 오류 표시 E1(시안 5차, 사용자 선택): 원 안 느낌표. 뜰 때 한 번만 톡 커지고 살짝 흔들린다 */}
          <svg className="oops-icon" viewBox="0 0 56 56" aria-hidden="true">
            <g className="oops-icon-shake">
              <circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" strokeWidth="3.5" />
              <rect x="25.5" y="14" width="5" height="18" rx="1" fill="currentColor" />
              <circle cx="28" cy="39.5" r="3" fill="currentColor" />
            </g>
          </svg>
          <h1 id="oops-title" className="oops-title">
            지금 {what} 열 수 없습니다
          </h1>
          <p className="oops-lead">
            일시적인 연결 문제입니다. 대개 잠시 뒤 다시 시도하면 열립니다.
          </p>

          <div className="oops-primary">
            <button type="button" className="oops-btn" onClick={retry} disabled={retrying} aria-busy={retrying}>
              {retrying ? "다시 불러오는 중" : "다시 시도"}
            </button>
            {stocks ? (
              <Link href="/" className="oops-btn oops-btn--ghost">
                뉴스 브리핑 보기
              </Link>
            ) : (
              <Link href="/archive" className="oops-btn oops-btn--ghost">
                지난 브리핑 보기
              </Link>
            )}
          </div>

          {!admin ? (
            <div className="oops-alt">
              <p className="oops-alt-head">기다리는 동안</p>
              <ul>
                <li>
                  <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
                    <b>텔레그램 채널에서 읽기</b>
                    <span>오늘 브리핑 본문이 채널에 그대로 올라가 있습니다</span>
                  </a>
                </li>
                <li>
                  <Link href={stocks ? "/archive" : "/stocks"}>
                    <b>{stocks ? "지난 브리핑" : "종목 브리핑"}</b>
                    <span>{stocks ? "날짜별로 지난 회차를 봅니다" : "관심종목의 공시 재무와 주가 흐름"}</span>
                  </Link>
                </li>
              </ul>
            </div>
          ) : null}

          <p className="oops-foot">
            계속 이 화면이면
            {CONTACT_EMAIL ? (
              <>
                {" "}
                <a href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`[더 브리핑] 오류 ${error.digest ?? ""}`)}`}>
                  알려 주세요
                </a>
              </>
            ) : (
              " 잠시 뒤 다시 들러 주세요"
            )}
            .{error.digest ? <code>오류 번호 {error.digest}</code> : null}
          </p>
        </section>
      </div>
    </div>
  );
}
