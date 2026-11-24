"use client";

import { useEffect, useRef, useState } from "react";
import IndexCandles from "./IndexCandles";
import LineChart from "./LineChart";
import { getIndices, type IndexQuote } from "./indices-client";

/**
 * 지수 카드 다섯 칸 (지수 그래프 시안 G3, 2026-11-24). 값, 등락, 오늘 흐름 그래프.
 * 자리는 **종목 브리핑 머리**(최신 회차, `always`)다. 처음엔 뉴스 브리핑 날짜 아래에 두었다가 같은 날 옮겼다
 * (뉴스 지면은 2026-09-15부터 수치 블록을 싣지 않는다). tradeDate를 주면 그날(KST)에만 그린다.
 * 날짜 판정은 브라우저에서 한다(페이지가 ISR이라 서버가 "오늘"을 알 수 없다).
 *
 * 모션(시안 M3 + M4 + M2): 카드가 왼쪽부터 90ms 간격으로 떠오르고, 값이 0.8초 동안 굴러가며 맞춰지고,
 * 그래프가 왼쪽에서 걷히며 나타난다. 움직임 줄이기 설정이면 값은 바로 최종값이다.
 */
const NUM = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TODAY = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/** 값이 0.8초 동안 4% 아래에서 굴러 올라와 맞춰진다(M3) */
function CountUp({ to, delay }: { to: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = NUM.format(to);
      return;
    }
    const from = to * 0.96;
    const t0 = performance.now() + delay;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 800));
      el.textContent = NUM.format(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return (
    <span ref={ref} className="ixc-price">
      {NUM.format(to)}
    </span>
  );
}

export default function IndexCards({ tradeDate, always = false }: { tradeDate?: string; always?: boolean }) {
  const [items, setItems] = useState<IndexQuote[] | null>(null);
  const [today, setToday] = useState(false);
  const [pick, setPick] = useState<string | null>(null);

  useEffect(() => {
    if (!always && TODAY() !== tradeDate) return;
    setToday(true);
    let alive = true;
    getIndices().then((l) => alive && setItems(l));
    return () => {
      alive = false;
    };
  }, [tradeDate, always]);

  if (!today || (items && !items.length)) return null;
  // 카드를 누르면 아래에 그 지수 차트가 열린다(2026-11-24 사용자 지시)
  // 처음에는 아무 지수도 고르지 않아 차트를 그리지 않는다(2026-11-24 사용자 지시). 고른 카드를 다시 누르면 닫힌다
  const sel = items?.find((q) => q.key === pick) ?? null;
  return (
    <>
      <div className="ixc" aria-label="오늘 지수">
        {(items ?? Array.from({ length: 5 }, () => null)).map((q, i) =>
          q ? (
            <button
              key={q.key}
              type="button"
              className={`ixc-card ixc-card--in${sel?.key === q.key ? " is-sel" : ""}`}
              style={{ animationDelay: `${i * 90}ms` }}
              aria-pressed={sel?.key === q.key}
              onClick={() => setPick((p) => (p === q.key ? null : q.key))}
            >
              <span className="ixc-name">{q.name}</span>
              <CountUp to={q.price} delay={i * 90} />
              <span className={`ixc-pct ${q.pct > 0 ? "is-up" : q.pct < 0 ? "is-down" : ""}`}>
                {q.pct > 0 ? "+" : ""}
                {q.pct.toFixed(2)}%
              </span>
              {q.spark ? <LineChart c={q.spark.c} base={q.spark.base} height={42} draw live={q.open} /> : null}
            </button>
          ) : (
            <div key={i} className="ixc-card ixc-card--empty shimmer" />
          ),
        )}
      </div>
      {sel ? <IndexCandles indexKey={sel.key} name={sel.name} /> : null}
    </>
  );
}
