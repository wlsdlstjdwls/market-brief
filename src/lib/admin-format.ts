/**
 * 콘솔 화면이 쓰는 **순수 함수**만 모은다. DB도 `next/headers`도 건드리지 않는다.
 *
 * `admin.ts`에 두면 안 된다 — 그쪽은 `db/index`를 들여오므로, 클라이언트 컴포넌트가
 * 라벨 하나 쓰겠다고 import 하는 순간 Neon 드라이버가 브라우저 번들에 딸려 온다.
 * 회차 목록이 무한 스크롤이 되면서 실제로 그 상황이 생겼다.
 */
export type Session = "am" | "pm";

/** 회차 라벨. 화면 문구는 `queries.ts`의 `SESSION_LABEL`과 같은 말을 쓴다 */
export const SESSION_LABEL: Record<string, string> = { am: "아침 브리핑", pm: "마감 브리핑" };

/**
 * `2026-09-18T07:34` → `07:34`. 날짜가 거래일과 다르면 날짜를 앞에 붙인다.
 * 과거 회차를 일괄 적재한 날의 게시 시각이 그렇다 — 시각만 찍으면 오해한다.
 */
export function stamp(iso: string | null, tradeDate?: string): string {
  if (!iso) return "—";
  const [d, t] = iso.split("T");
  if (!t) return d;
  return tradeDate && d !== tradeDate ? `${d.slice(5).replace("-", ".")} ${t}` : t;
}

/** 지난 시간을 사람 말로. 「방금」 「23분 전」 「3일 전」 */
export function ago(iso: string | null): string {
  if (!iso) return "—";
  // to_char가 KST 벽시계를 주므로 KST 오프셋을 붙여 되읽는다
  const then = Date.parse(`${iso}:00+09:00`);
  if (!then) return "—";
  const min = Math.floor((Date.now() - then) / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`;
  return `${Math.floor(min / (60 * 24))}일 전`;
}
