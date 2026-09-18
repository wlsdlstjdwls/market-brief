import { sql } from "drizzle-orm";
import { db } from "../../db/index";

/**
 * 탭에 붙일 배지 숫자. 레이아웃이 매 요청 부르므로 **가장 싼 질의 하나**로 둔다.
 *
 * DB가 없거나 흔들려도 콘솔은 열려야 한다 — 배지가 0으로 떨어질 뿐이다.
 * 대시보드의 `dashboardData()`와 값이 같지만, 그 큰 질의를 레이아웃에서 또 돌리지 않는다.
 */
export async function auditFailCount(): Promise<number> {
  try {
    const res = await db.execute<{ n: number }>(
      sql.raw(
        `SELECT count(*)::int AS n FROM publish_audit
          WHERE result = 'fail' AND checked_at > now() - interval '30 days'`,
      ),
    );
    const list = (Array.isArray(res) ? res : (res as { rows: { n: number }[] }).rows) as {
      n: number;
    }[];
    return list[0]?.n ?? 0;
  } catch {
    return 0;
  }
}
