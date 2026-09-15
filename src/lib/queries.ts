import { desc, eq } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import {
  dailyBrief,
  marketIndex,
  macroIndicator,
  investorFlow,
  sectorIndex,
} from "../db/schema";

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

    const [indices, macros, flows, sectors] = await Promise.all([
      db
        .select()
        .from(marketIndex)
        .where(eq(marketIndex.briefId, brief.id))
        .orderBy(marketIndex.sortOrder),
      db
        .select()
        .from(macroIndicator)
        .where(eq(macroIndicator.briefId, brief.id))
        .orderBy(macroIndicator.sortOrder),
      db.select().from(investorFlow).where(eq(investorFlow.briefId, brief.id)),
      db
        .select()
        .from(sectorIndex)
        .where(eq(sectorIndex.briefId, brief.id))
        .orderBy(sectorIndex.rank),
    ]);

    return { brief, indices, macros, flows, sectors };
  } catch (e) {
    console.error("getBrief 실패:", e);
    return null;
  }
}
