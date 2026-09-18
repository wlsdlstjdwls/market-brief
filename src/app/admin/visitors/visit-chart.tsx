"use client";

/**
 * 일별 방문자 막대. 라이브러리를 쓰지 않는다 — 막대 몇 개에 차트 패키지를 얹으면
 * 번들만 커지고, 이 사이트의 디자인 기준(카드·박스·둥근 모서리 없음)과도 어긋난다.
 *
 * 세로 높이는 최댓값에 맞춰 비율로만 잡는다. 눈금선은 그리지 않고 최댓값만 위에 적는다.
 */
import type { DayPoint } from "../../../lib/analytics";

/** `2026-09-18` → `09.18`. 1년 치를 그릴 때는 라벨을 띄엄띄엄 찍는다 */
function label(day: string): string {
  return day.slice(5).replace("-", ".");
}

export default function VisitChart({ days }: { days: DayPoint[] }) {
  const max = Math.max(...days.map((d) => d.visitors), 1);
  // 라벨이 겹치지 않을 만큼만 찍는다. 30일이면 5일마다, 1년이면 30일마다
  const every = Math.max(1, Math.ceil(days.length / 14));

  return (
    <div className="vz">
      <div className="vz-max">최대 {max.toLocaleString("ko-KR")}명</div>
      <ol className="vz-bars">
        {days.map((d, i) => (
          <li key={d.day} className="vz-bar" title={`${d.day} 방문 ${d.visitors} / 조회 ${d.views}`}>
            <span
              className={d.visitors > 0 ? "vz-fill" : "vz-fill vz-fill--zero"}
              style={{ height: `${Math.round((d.visitors / max) * 100)}%` }}
            />
            <em>{i % every === 0 || i === days.length - 1 ? label(d.day) : ""}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}
