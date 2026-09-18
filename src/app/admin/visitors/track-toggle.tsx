"use client";

/**
 * 이 브라우저를 방문 집계에 넣을지 뺄지.
 *
 * 콘솔에 처음 들어온 브라우저는 자동으로 빠진다(`admin-nav.tsx`). 그러면 운영자는
 * 제 브라우저로 집계가 도는지 확인할 방법이 없어진다 — 확인할 때만 잠깐 켜는 자리다.
 * 표식은 localStorage에 있으므로 **브라우저마다 따로**다.
 */
import { useEffect, useState } from "react";
import { VISIT_OPT_OUT_KEY } from "../../../lib/constants";

export default function TrackToggle() {
  // 서버에는 localStorage가 없다. 처음 렌더는 「모름」으로 두고 마운트 뒤에 읽는다
  const [out, setOut] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setOut(localStorage.getItem(VISIT_OPT_OUT_KEY) === "1");
    } catch {
      setOut(false);
    }
  }, []);

  if (out === null) return <p className="adm-note">확인 중</p>;

  function toggle() {
    const next = !out;
    try {
      // 끌 때 키를 지우지 않고 "0"을 넣는다 — 지우면 콘솔을 다시 열 때 자동으로 되살아난다
      localStorage.setItem(VISIT_OPT_OUT_KEY, next ? "1" : "0");
    } catch {
      return;
    }
    setOut(next);
  }

  return (
    <p className="adm-toggle">
      <b>{out ? "이 브라우저는 집계에서 빠져 있다" : "이 브라우저도 집계에 들어간다"}</b>
      <button type="button" onClick={toggle}>
        {out ? "집계에 넣기" : "집계에서 빼기"}
      </button>
    </p>
  );
}
