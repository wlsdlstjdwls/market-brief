/**
 * 순위 막대. 유입 채널처럼 「어느 쪽이 얼마나」를 볼 때 쓴다.
 *
 * 막대를 따로 그리지 않고 **글자 뒤에 깔린 띠**로 둔다. 숫자와 막대를 나란히 놓으면
 * 좁은 화면에서 둘 다 잘리는데, 겹쳐 두면 어느 폭에서도 읽힌다.
 */
import type { ChannelKind } from "../../../lib/analytics";

export type BarRow = {
  key: string;
  label: string;
  kind: ChannelKind;
  visitors: number;
  views: number;
  /** 이 줄로 접힌 도메인들. 툴팁으로만 보여 준다 */
  detail?: string[];
};

const KIND_LABEL: Record<ChannelKind, string> = {
  sns: "SNS",
  search: "검색",
  direct: "직접",
  etc: "기타",
};

/** 표 칸 안에 쓰는 작은 막대. 인기 경로처럼 숫자가 주인공인 자리용 */
export function BarCell({
  value,
  max,
  views,
}: {
  value: number;
  max: number;
  views?: number;
}) {
  return (
    <span className="bar-cell" title={views !== undefined ? `조회 ${views}` : undefined}>
      <span className="bar-cell-fill" style={{ width: `${Math.round((value / max) * 100)}%` }} />
      <b>{value.toLocaleString("ko-KR")}</b>
    </span>
  );
}

export default function RankBars({
  rows,
  total,
  empty = "아직 기록이 없다.",
}: {
  rows: BarRow[];
  total: number;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="adm-note">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.visitors), 1);

  return (
    <ol className="ranks">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.visitors / total) * 100) : 0;
        return (
          <li key={r.key} className="rank" title={r.detail?.join(", ")}>
            <span
              className="rank-fill"
              style={{ width: `${Math.round((r.visitors / max) * 100)}%` }}
              aria-hidden="true"
            />
            <span className="rank-label">
              {r.label}
              <i>{KIND_LABEL[r.kind]}</i>
            </span>
            <span className="rank-num">
              {r.visitors.toLocaleString("ko-KR")}
              <small>
                {pct}% | {r.views.toLocaleString("ko-KR")}뷰
              </small>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
