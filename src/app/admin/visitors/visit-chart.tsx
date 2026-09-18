"use client";

/**
 * 일별 방문자 막대. 라이브러리를 쓰지 않는다 — 막대 몇 개에 차트 패키지를 얹으면
 * 번들만 커지고, 이 사이트의 디자인 기준(카드·박스·둥근 모서리 없음)과도 어긋난다.
 *
 * 세로 높이는 최댓값에 맞춰 비율로만 잡는다. 눈금선은 그리지 않고 최댓값만 위에 적는다.
 *
 * **가로는 무조건 컨테이너 안에 가둔다.** 막대에 최소 너비를 주거나 라벨 수를 고정하면
 * 1년(365개)에서 통째로 화면을 벗어난다 — 실제로 그랬다. 막대 간격은 개수에 따라 줄이고,
 * 라벨 수는 실제 잰 폭에서 뽑는다.
 */
import { useEffect, useRef, useState } from "react";
import type { DayPoint } from "../../../lib/analytics";

/** `2026-09-18` → `09.18`. 1년 치를 그릴 때는 라벨을 띄엄띄엄 찍는다 */
function label(day: string): string {
  return day.slice(5).replace("-", ".");
}

/** 라벨 한 장이 겹치지 않고 앉으려면 필요한 가로폭. `09.18` + 여백 */
const LABEL_PX = 46;

/** 막대 사이 간격. 개수가 많아지면 간격부터 버린다 — 간격 2px * 365 = 730px다 */
function gapOf(n: number): number {
  if (n > 180) return 0;
  if (n > 90) return 1;
  return 2;
}

/**
 * 라벨을 찍을 자리. 첫날과 마지막 날은 반드시 찍는다 — 그래프가 어느 구간인지
 * 알려주는 건 그 둘이다. 마지막 라벨이 직전 라벨과 붙으면 직전 쪽을 뺀다.
 */
function ticks(count: number, slots: number): Set<number> {
  const last = count - 1;
  if (last <= 0) return new Set([0]);
  const every = Math.max(1, Math.ceil(count / Math.max(1, slots)));
  const set = new Set<number>();
  for (let i = 0; i < count; i += every) set.add(i);
  const prev = Math.max(...set);
  if (last - prev < every) set.delete(prev);
  set.add(last);
  return set;
}

export default function VisitChart({ days }: { days: DayPoint[] }) {
  const max = Math.max(...days.map((d) => d.visitors), 1);

  // 라벨 수는 화면 폭에서 나온다. 폭을 재기 전(서버 렌더·첫 그림)에는 양 끝 둘만 찍어
  // 넓은 쪽으로 어림잡았다가 좁은 화면에서 겹치는 일을 막는다.
  const bars = useRef<HTMLOListElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = bars.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const shown = ticks(days.length, width ? Math.floor(width / LABEL_PX) : 2);

  return (
    <div className="vz">
      <div className="vz-max">최대 {max.toLocaleString("ko-KR")}명</div>
      <ol className="vz-bars" ref={bars} style={{ gap: `${gapOf(days.length)}px` }}>
        {days.map((d, i) => (
          <li key={d.day} className="vz-bar" title={`${d.day} 방문 ${d.visitors} / 조회 ${d.views}`}>
            <span
              className={d.visitors > 0 ? "vz-fill" : "vz-fill vz-fill--zero"}
              style={{ height: `${Math.round((d.visitors / max) * 100)}%` }}
            />
            {shown.has(i) && <em>{label(d.day)}</em>}
          </li>
        ))}
      </ol>
    </div>
  );
}
