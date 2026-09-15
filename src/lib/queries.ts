import { desc, eq } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import { dailyBrief, briefTopic } from "../db/schema";

export type Brief = typeof dailyBrief.$inferSelect;

export interface BriefListItem {
  tradeDate: string;
  headline: string;
  summary: string;
  publishedAt: Date | null;
}

/** DB가 없거나 아직 마이그레이션 전이면 빈 목록으로 떨어진다 (빌드 실패 방지). */
export async function listBriefs(limit = 60): Promise<BriefListItem[]> {
  if (!hasDb()) return [];
  try {
    return await db
      .select({
        tradeDate: dailyBrief.tradeDate,
        headline: dailyBrief.headline,
        summary: dailyBrief.summary,
        publishedAt: dailyBrief.publishedAt,
      })
      .from(dailyBrief)
      .where(eq(dailyBrief.status, "published"))
      .orderBy(desc(dailyBrief.tradeDate))
      .limit(limit);
  } catch (e) {
    console.error("listBriefs 실패:", e);
    return [];
  }
}

export async function getBrief(tradeDate?: string) {
  if (!hasDb()) return null;
  try {
    const rows = tradeDate
      ? await db
          .select()
          .from(dailyBrief)
          .where(eq(dailyBrief.tradeDate, tradeDate))
          .limit(1)
      : await db
          .select()
          .from(dailyBrief)
          .where(eq(dailyBrief.status, "published"))
          .orderBy(desc(dailyBrief.tradeDate))
          .limit(1);

    const brief = rows[0];
    if (!brief || brief.status !== "published") return null;

    /*
     * 화면이 뉴스만 싣기 때문에 지수, 금리, 수급, 업종은 더 이상 읽지 않는다.
     * 테이블과 수집 파이프라인은 그대로 있으니 되살리려면 여기에 조회를 다시 넣으면 된다.
     */
    const topics = await db
      .select()
      .from(briefTopic)
      .where(eq(briefTopic.briefId, brief.id))
      .orderBy(briefTopic.kind, briefTopic.rank);

    return { brief, topics };
  } catch (e) {
    console.error("getBrief 실패:", e);
    return null;
  }
}
