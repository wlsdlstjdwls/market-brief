import { desc, eq, sql } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import { dailyBrief } from "../db/schema";

export type Brief = typeof dailyBrief.$inferSelect;
export type Session = "am" | "pm";

/**
 * 화면에 쓰는 이름. DB의 am/pm과 1:1이다.
 * 증시 용어(프리마켓, 마감 종합)를 쓰지 않는다 — 이 사이트는 시황이 아니라 뉴스를 싣는다.
 * 여기만 고치면 탭, 마스트헤드, 페이지 제목이 같이 바뀐다.
 */
export const SESSION_LABEL: Record<Session, string> = {
  pm: "마감 브리핑",
  am: "아침 브리핑",
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

/** 화면이 쓰는 회차 한 벌. 카드가 회차 안에 같이 들어 있다. */
export interface BriefDayItem {
  brief: {
    id: number;
    tradeDate: string;
    session: Session;
    runId: string;
    writtenAt: string | null;
    publishedAt: string | null;
    headline: string;
    summary: string;
    macroCommentary: string;
    marketSummary: string;
    sources: unknown;
  };
  topics: Array<{
    kind: string;
    rank: number;
    title: string;
    impact: string;
    lines: unknown;
    sources: unknown;
  }>;
}

/**
 * 한 날짜에 발행된 회차를 **전부** 읽는다. 카드까지 **질의 한 번**에 받는다.
 *
 * 전에는 ① 최근 날짜 ② 그 날짜의 회차 ③ 그 회차의 카드를 세 번 나눠 물었다.
 * Neon HTTP 드라이버는 질의마다 연결을 새로 열고, 함수와 DB가 다른 대륙에 있으면
 * 왕복 한 번이 200ms를 넘는다 — 그것만으로 0.5초가 나갔다.
 * `COALESCE`로 「날짜를 안 주면 가장 최근 날짜」까지 같은 질의 안에서 고른다.
 *
 * 회차를 골라 주지 않고 둘 다 돌려주는 이유는 화면 쪽 사정이다 — 날짜 페이지가
 * `searchParams`를 읽지 않아야 ISR 캐시가 산다. 탭 전환은 브라우저가 한다.
 *
 * @param tradeDate 비우면 가장 최근 발행 날짜
 */
export async function getBriefDay(tradeDate?: string): Promise<BriefDayItem[]> {
  if (!hasDb()) return [];
  try {
    const target = tradeDate
      ? sql`${tradeDate}::date`
      : sql`(SELECT max(trade_date) FROM daily_brief WHERE status = 'published')`;

    const res = await db.execute<BriefDayItem["brief"] & { topics: BriefDayItem["topics"] }>(
      sql`SELECT b.id,
                 b.trade_date::text                    AS "tradeDate",
                 b.session::text                       AS session,
                 b.run_id                              AS "runId",
                 b.written_at                          AS "writtenAt",
                 b.published_at                        AS "publishedAt",
                 b.headline,
                 b.summary,
                 b.macro_commentary                    AS "macroCommentary",
                 b.market_summary                      AS "marketSummary",
                 b.sources,
                 (SELECT coalesce(jsonb_agg(
                           jsonb_build_object('kind', t.kind, 'rank', t.rank, 'title', t.title,
                                              'impact', t.impact, 'lines', t.lines,
                                              'sources', t.sources)
                           ORDER BY t.kind, t.rank), '[]'::jsonb)
                    FROM brief_topic t WHERE t.brief_id = b.id) AS topics
            FROM daily_brief b
           WHERE b.status = 'published' AND b.trade_date = ${target}`,
    );
    const rows = (Array.isArray(res) ? res : (res as { rows: unknown[] }).rows) as Array<
      BriefDayItem["brief"] & { topics: BriefDayItem["topics"] }
    >;

    // 탭 순서와 같게 정렬해 둔다. 화면이 순서를 다시 만들 이유가 없다.
    return SESSION_ORDER.flatMap((s) => {
      const r = rows.find((x) => x.session === s);
      if (!r) return [];
      const { topics, ...brief } = r;
      return [{ brief, topics: topics ?? [] }];
    });
  } catch (e) {
    console.error("getBriefDay 실패:", e);
    return [];
  }
}

/**
 * 한 회차만. 홈과 아카이브처럼 탭이 없는 자리가 쓴다.
 *
 * @param session 비우면 마감 브리핑 우선
 */
export async function getBrief(tradeDate?: string, session?: Session) {
  const items = await getBriefDay(tradeDate);
  if (!items.length) return null;
  const sessions = items.map((i) => i.brief.session);
  // 요청한 회차가 그날 없으면(아침판만 있는 날에 pm 요청 등) 있는 것으로 떨어진다.
  const picked =
    (session && items.find((i) => i.brief.session === session)) ??
    items.find((i) => i.brief.session === "pm") ??
    items[0];
  return { brief: picked.brief, topics: picked.topics, sessions };
}
