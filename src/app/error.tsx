"use client";

import { useEffect } from "react";

/**
 * 렌더 중 터진 예외. 대부분 DB(Neon)를 못 읽은 경우다.
 *
 * 클라이언트 컴포넌트라 `Shell`을 쓰지 않는다 — 푸터가 서버에서 읽는 값을 참조하므로
 * 여기서는 화면을 최소로 둔다. 다시 시도 버튼이 서버 렌더를 한 번 더 태운다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("페이지 렌더 실패:", error);
  }, [error]);

  return (
    <div className="shell">
      <div className="shell-main">
        <div className="stub">
          <p className="stub-code">오류</p>
          <h1 className="stub-title">브리핑을 불러오지 못했습니다</h1>
          <p className="stub-note">
            잠시 뒤 다시 시도해 주세요. 계속 같은 화면이면 잠깐 서버 쪽 문제일 수 있습니다.
          </p>
          <p className="stub-actions">
            <button type="button" className="sec-link" onClick={reset}>
              다시 시도
            </button>
            <a href="/" className="sec-link">
              오늘 브리핑
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
