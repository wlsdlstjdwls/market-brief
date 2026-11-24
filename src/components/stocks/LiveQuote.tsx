"use client";

import { useEffect, useState } from "react";
import { fmtPrice } from "../../lib/stock-format";
import Odometer from "../market/Odometer";

/**
 * 종목 상세를 열 때 받는 최신 시세 (2026-11-24 사용자 지시). `/api/quotes?code=`가 준다(CDN 60초 캐시).
 * 아래 큰 주가는 주간 수집 시점 값이라 그대로 두고, 이 줄을 그 위에 얹는다. 둘의 기준이 다르다는 걸
 * 꼬리말(장중 / 기준 시각)로 밝힌다. 원천이 막히면 아무것도 그리지 않는다.
 * 시세만 보여 준다. 매수, 매도 판단 문구는 붙이지 않는다.
 */
type Q = { price: number; change: number; pct: number; open: boolean; at: string | null };

const HM = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** `11.24 13:16` (KST) */
function stamp(iso: string): string {
  const p = Object.fromEntries(HM.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}.${p.day} ${p.hour}:${p.minute}`;
}

export default function LiveQuote({
  code,
  cur,
  from,
}: {
  code: string;
  cur?: "KRW" | "USD" | null;
  /** 주간 수집 주가. 현재가가 이 값에서 굴러간다(모션 N4) */
  from?: number | null;
}) {
  const [q, setQ] = useState<Q | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    fetch(`/api/quotes?code=${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : { quote: null }))
      .then((j: { quote: Q | null }) => alive && setQ(j.quote))
      .catch(() => alive && setQ(null));
    return () => {
      alive = false;
    };
  }, [code]);

  if (q === null) return null;
  const tone = q ? (q.pct > 0 ? "stk-up" : q.pct < 0 ? "stk-down" : "") : "";
  return (
    <p className="sd-live" aria-live="polite">
      <span className="sd-live-label">현재가</span>
      {q ? (
        <>
          <b>
            <Odometer to={fmtPrice(q.price, cur)} from={from != null ? fmtPrice(from, cur) : undefined} />
          </b>
          <em className={tone}>
            {q.change > 0 ? "+" : ""}
            {fmtPrice(q.change, cur)} ({q.pct > 0 ? "+" : ""}
            {q.pct.toFixed(2)}%)
          </em>
          {q.at ? (
            <span className="sd-live-at">
              {stamp(q.at)} {q.open ? "장중" : "기준"}
            </span>
          ) : null}
        </>
      ) : (
        <>
          {/* 받는 동안 뼈대에 빛이 지나간다(모션 N7) */}
          <span className="shimmer sd-live-sk" aria-hidden="true" />
          <span className="sr-only">현재가 불러오는 중</span>
        </>
      )}
    </p>
  );
}
