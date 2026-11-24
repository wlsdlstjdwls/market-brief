"use client";

import { useEffect, useRef } from "react";

/**
 * 숫자가 자리마다 슬롯처럼 굴러 맞춰진다(모션 시안 N4, 2026-11-24). 종목 상세 현재가가 쓴다.
 * from(주간 수집 주가)에서 to(현재가)로 굴러간다. 자리 수가 다르면 그냥 to를 보인다.
 *
 * 숫자 칸마다 0~9 세로 줄을 두고 translateY로 굴린다. 낭독기는 aria-label의 최종값만 읽는다.
 * 움직임 줄이기 설정이면 처음부터 최종값이다(CSS가 전환을 끈다).
 */
export default function Odometer({ to, from, className }: { to: string; from?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const same = !!from && from.length === to.length && from.replace(/\d/g, "0") === to.replace(/\d/g, "0");

  useEffect(() => {
    const el = ref.current;
    if (!el || !same) return;
    // 첫 그림은 from 자리에 둔다(아래 렌더가 from으로 그린다). 다음 프레임에 to로 굴린다
    const cols = el.querySelectorAll<HTMLSpanElement>(".odo-col");
    const digits = [...to].filter((c) => /\d/.test(c));
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        cols.forEach((c, i) => {
          c.style.transitionDuration = `${0.8 + i * 0.1}s`;
          c.style.transform = `translateY(-${Number(digits[i]) * 10}%)`;
        });
      }),
    );
    return () => cancelAnimationFrame(raf);
  }, [to, same]);

  if (!same) return <span className={className}>{to}</span>;

  const start = [...from!];
  return (
    <span ref={ref} className={`odo ${className ?? ""}`} aria-label={to}>
      {[...to].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="odo-d" aria-hidden="true">
            <span className="odo-col" style={{ transform: `translateY(-${Number(start[i]) * 10}%)` }}>
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}
