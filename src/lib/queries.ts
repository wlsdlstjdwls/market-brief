import { and, desc, eq } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import { dailyBrief, briefTopic } from "../db/schema";

export type Brief = typeof dailyBrief.$inferSelect;
export type Session = "am" | "pm";

/** 화면에 쓰는 이름. 원본의 작성 기준시각대로 오전은 프리마켓, 오후는 마감 종합이다. */
export const SESSION_LABEL: Record<Session, string> = {
  pm: "마감 종합",
  am: "프리마켓",
};

/** 탭은 항상 이 순서다. 기본(먼저 보여줄 것)이 앞. */
export const SESSION_ORDER: Session[] = ["pm", "am"];

export function isSession(v: unknown): v is Session {
  return v === "am" || v === "pm";
}

export interface BriefListItem {
  tradeDate: string;
  headline: string;
  summary: string;
  publishedAt: Date | null;
}

/**
 * 아카이브·최근 목록용. 한 날짜에 회차가 둘이어도 한 줄로만 센다(마감 종합 우선).
 * 날짜 페이지 안에 탭이 있으므로 목록까지 두 줄로 늘릴 이유가 없다.
 *
 * DB가 없거나 아직 마이그레이션 전이면 빈 목록으로 떨어진다 (빌드 실패 방지).
 */
export async function listBriefs(limit = 60): Promise<BriefListItem[]> {
  if (!hasDb()) return [];
  try {
    const rows = await db
      .select({
        tradeDate: dailyBrief.tradeDate,
        session: dailyBrief.session,
        headline: dailyBrief.headline,
        summary: dailyBrief.summary,
        publishedAt: dailyBrief.publishedAt,
      })
      .from(dailyBrief)
      .where(eq(dailyBrief.status, "published"))
      .orderBy(desc(dailyBrief.tradeDate))
      // 날짜마다 최대 두 행이므로 넉넉히 받아서 접는다.
      .limit(limit * 2);

    const byDate = new Map<string, (typeof rows)[number]>();
    for (const r of rows) {
      const cur = byDate.get(r.tradeDate);
      // 같은 날짜면 pm이 이긴다. pm이 없는 날만 am이 대표가 된다.
      if (!cur || (cur.session === "am" && r.session === "pm")) byDate.set(r.tradeDate, r);
    }
    return [...byDate.values()]
      .sort((a, b) => (a.tradeDate < b.tradeDate ? 1 : -1))
      .slice(0, limit)
      .map(({ tradeDate, headline, summary, publishedAt }) => ({
        tradeDate, headline, summary, publishedAt,
      }));
  } catch (e) {
    console.error("listBriefs 실패:", e);
    return [];
  }
}

/**
 * 한 회차를 읽는다.
 *
 * @param tradeDate 비우면 가장 최근 발행 날짜
 * @param session   비우면 그 날짜에 있는 것 중 마감 종합 우선
 *
 * sessions에는 그 날짜에 발행된 회차가 전부 담긴다. 화면의 탭이 이걸 보고 그려진다.
 */
export async function getBrief(tradeDate?: string, session?: Session) {
  if (!hasDb()) return null;
  try {
    const date = tradeDate ?? (await latestDate());
    if (!date) return null;

    const rows = await db
      .select()
      .from(dailyBrief)
      .where(and(eq(dailyBrief.tradeDate, date), eq(dailyBrief.status, "published")));
    if (!rows.length) return null;

    const sessions = SESSION_ORDER.filter((s) => rows.some((r) => r.session === s));
    // 요청한 회차가 그날 없으면(오전만 있는 날에 pm 요청 등) 있는 것으로 떨어진다.
    const picked =
      (session && rows.find((r) => r.session === session)) ??
      rows.find((r) => r.session === "pm") ??
      rows[0];
    if (!picked) return null;

    /*
     * 화면이 뉴스만 싣기 때문에 지수, 금리, 수급, 업종은 더 이상 읽지 않는다.
     * 테이블과 수집 파이프라인은 그대로 있으니 되살리려면 여기에 조회를 다시 넣으면 된다.
     */
    const topics = await db
      .select()
      .from(briefTopic)
      .where(eq(briefTopic.briefId, picked.id))
      .orderBy(briefTopic.kind, briefTopic.rank);

    return { brief: picked, topics, sessions };
  } catch (e) {
    console.error("getBrief 실패:", e);
    return null;
  }
}

/** 가장 최근 발행 날짜 하나. 회차가 둘이어도 날짜는 하나다. */
async function latestDate(): Promise<string | null> {
  const [row] = await db
    .select({ tradeDate: dailyBrief.tradeDate })
    .from(dailyBrief)
    .where(eq(dailyBrief.status, "published"))
    .orderBy(desc(dailyBrief.tradeDate))
    .limit(1);
  return row?.tradeDate ?? null;
}
