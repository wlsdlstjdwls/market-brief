/**
 * 관리자 콘솔이 읽는 값. **이 파일은 DB를 읽기만 한다.**
 *
 * 콘솔이 보는 것은 둘이다 — 「오늘 회차가 제대로 나갔나」와 「무엇이 빠졌나」.
 * 고치는 일은 여전히 `ingest.ts`와 워크플로가 한다. 여기서 원고를 다시 읽거나
 * 값을 덮어쓰지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db/index";
import { VISIT_SUMMARY_SQL, type VisitCards } from "./analytics";

/** drizzle neon-http 결과가 배열이거나 `{ rows }`다. 한 줄로 흡수한다 */
async function rows<T extends Record<string, unknown>>(text: string): Promise<T[]> {
  const res = await db.execute<T>(sql.raw(text));
  return (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];
}

/*
 * 라벨과 시각 포맷은 `admin-format.ts`에 있다 — 클라이언트 컴포넌트도 쓰는 순수 함수라
 * DB를 들여오는 이 파일에 두면 브라우저 번들에 드라이버가 딸려 온다.
 * 기존 호출부가 그대로 돌게 여기서 다시 내보낸다.
 */
export { SESSION_LABEL, stamp, ago, type Session } from "./admin-format";
import type { Session } from "./admin-format";

/** 한 회차 한 줄. 목록과 대시보드가 같은 모양을 쓴다 */
export type BriefRow = {
  id: number;
  tradeDate: string;
  session: Session;
  runId: string;
  status: "draft" | "published" | "blocked";
  headline: string;
  writtenAt: string | null;
  publishedAt: string | null;
  notifiedAt: string | null;
  /** 뉴스, 테마, 업종 카드를 합친 수 */
  topics: number;
  /** 카드에 붙은 기사 링크 수. 2026-09-18 회차부터 붙는다 — 그 전이 0인 건 정상이다 */
  topicSources: number;
  /** 문서 말미 출처 목록 수 */
  docSources: number;
  /** 본문 길이(국내 + 해외 산문). 0이면 뉴스 카드만 있는 회차다 */
  proseLen: number;
};

/** 회차 한 줄을 뽑는 공통 SELECT. 목록과 대시보드가 같은 식을 쓴다 */
const BRIEF_SELECT = `
  SELECT b.id,
         b.trade_date::text                        AS "tradeDate",
         b.session::text                           AS session,
         b.run_id                                  AS "runId",
         b.status::text                            AS status,
         b.headline,
         to_char(b.written_at   AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI') AS "writtenAt",
         to_char(b.published_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI') AS "publishedAt",
         to_char(b.notified_at  AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD"T"HH24:MI') AS "notifiedAt",
         coalesce(t.n, 0)::int                     AS topics,
         coalesce(t.src, 0)::int                   AS "topicSources",
         jsonb_array_length(b.sources)::int        AS "docSources",
         (length(b.market_summary) + length(b.macro_commentary))::int AS "proseLen"
    FROM daily_brief b
    LEFT JOIN (
      SELECT brief_id,
             count(*) AS n,
             sum(jsonb_array_length(sources)) AS src
        FROM brief_topic GROUP BY brief_id
    ) t ON t.brief_id = b.id`;

/** 카드 종류별 수. 대시보드에서 「뉴스 2 / 테마 3 / 업종 5」로 편다 */
export type TopicMix = { news: number; theme: number; sector: number };

export type DashboardStats = {
  /** 회차 총수 (draft 포함) */
  total: number;
  published: number;
  draft: number;
  blocked: number;
  /** 날짜 수. 회차가 둘인 날이 있어 total과 다르다 */
  days: number;
  firstDate: string | null;
  lastDate: string | null;
  /** 카드 총수 */
  topics: number;
  /** 기사 링크가 붙은 카드 수 */
  topicsWithSources: number;
};

/** 발행은 됐는데 채널에 안 나간 회차. `notified_at`이 비어 있고 48시간 안이면 아직 나갈 수 있다 */
export type PendingNotify = { tradeDate: string; session: Session; publishedAt: string | null };

export type AuditRow = {
  id: number;
  tradeDate: string;
  stage: "ingest" | "publish" | "render";
  result: "pass" | "fail";
  violationCount: number;
  violations: unknown;
  checkedAt: string;
};

export type Dashboard = {
  /** 오늘(KST) 날짜 */
  today: string;
  /** 오늘 나온 회차. 없으면 빈 배열 — 주말·공휴일에는 이게 정상이다 */
  todayBriefs: BriefRow[];
  /** 최근 회차 (오늘 것 포함, 최신 순) */
  recent: BriefRow[];
  mix: TopicMix;
  stats: DashboardStats;
  pendingNotify: PendingNotify[];
  /** 최근 30일 차단 실패 */
  auditFails: number;
  visits: VisitCards;
};

/**
 * 대시보드가 쓰는 값 전부. **질의 한 번**이다 —
 * Neon HTTP 드라이버는 질의마다 연결을 새로 여느라 나눠 던지면 왕복만 늘어난다.
 */
export async function dashboardData(recentN = 10): Promise<Dashboard> {
  const [row] = await rows<{
    today: string;
    recent: BriefRow[];
    mix: TopicMix;
    stats: DashboardStats;
    pending: PendingNotify[];
    audit_fails: number;
    visits: VisitCards;
  }>(
    `WITH recent AS (
       ${BRIEF_SELECT}
       ORDER BY b.trade_date DESC, b.session DESC
       LIMIT ${recentN}
     ), mix AS (
       SELECT count(*) FILTER (WHERE kind = 'news')::int   AS news,
              count(*) FILTER (WHERE kind = 'theme')::int  AS theme,
              count(*) FILTER (WHERE kind = 'sector')::int AS sector
         FROM brief_topic
     ), stats AS (
       SELECT count(*)::int                                            AS total,
              count(*) FILTER (WHERE status = 'published')::int        AS published,
              count(*) FILTER (WHERE status = 'draft')::int            AS draft,
              count(*) FILTER (WHERE status = 'blocked')::int          AS blocked,
              count(DISTINCT trade_date)::int                          AS days,
              min(trade_date)::text                                    AS "firstDate",
              max(trade_date)::text                                    AS "lastDate",
              (SELECT count(*) FROM brief_topic)::int                  AS topics,
              (SELECT count(*) FROM brief_topic
                WHERE jsonb_array_length(sources) > 0)::int            AS "topicsWithSources"
         FROM daily_brief
     ), pending AS (
       -- 48시간을 넘긴 회차는 notify 스크립트가 어차피 건너뛴다. 「아직 나갈 수 있는 것」만 띄운다
       SELECT trade_date::text AS "tradeDate", session::text AS session,
              to_char(published_at AT TIME ZONE 'Asia/Seoul', 'MM-DD HH24:MI') AS "publishedAt"
         FROM daily_brief
        WHERE status = 'published' AND notified_at IS NULL
          AND published_at > now() - interval '48 hours'
        ORDER BY trade_date DESC, session DESC
     )
     SELECT (now() AT TIME ZONE 'Asia/Seoul')::date::text AS today,
            (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM recent r)   AS recent,
            (SELECT to_jsonb(m) FROM mix m)                                        AS mix,
            (SELECT to_jsonb(s) FROM stats s)                                      AS stats,
            (SELECT coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM pending p)  AS pending,
            (SELECT count(*) FROM publish_audit
              WHERE result = 'fail' AND checked_at > now() - interval '30 days')::int
                                                                                   AS audit_fails,
            (SELECT to_jsonb(v) FROM (${VISIT_SUMMARY_SQL}) v)                     AS visits`,
  );

  const today = row.today;
  return {
    today,
    todayBriefs: row.recent.filter((b) => b.tradeDate === today),
    recent: row.recent,
    mix: row.mix,
    stats: row.stats,
    pendingNotify: row.pending,
    auditFails: row.audit_fails,
    visits: row.visits,
  };
}

/** 회차 목록 한 쪽. 기본 60줄이면 최근 한 달 남짓이 한 화면에 들어온다 */
export async function briefList(limit = 60, offset = 0): Promise<BriefRow[]> {
  const n = Math.max(1, Math.min(300, Math.floor(limit)));
  const o = Math.max(0, Math.floor(offset));
  return rows<BriefRow>(
    `${BRIEF_SELECT} ORDER BY b.trade_date DESC, b.session DESC LIMIT ${n} OFFSET ${o}`,
  );
}

export async function briefCount(): Promise<number> {
  const [r] = await rows<{ n: number }>(`SELECT count(*)::int AS n FROM daily_brief`);
  return r?.n ?? 0;
}

/**
 * 차단 로그. `publish_audit`은 통과도 남기므로 기본은 **실패만** 본다 —
 * 통과 줄까지 섞으면 회차마다 몇 줄씩 쌓여 정작 볼 것이 묻힌다.
 */
export async function auditList(onlyFail = true, limit = 100): Promise<AuditRow[]> {
  const n = Math.max(1, Math.min(500, Math.floor(limit)));
  const where = onlyFail ? `WHERE result = 'fail'` : ``;
  return rows<AuditRow>(
    `SELECT id,
            trade_date::text            AS "tradeDate",
            stage::text                 AS stage,
            result::text                AS result,
            violation_count             AS "violationCount",
            violations,
            to_char(checked_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') AS "checkedAt"
       FROM publish_audit ${where}
      ORDER BY checked_at DESC LIMIT ${n}`,
  );
}

/** 단계별 통과·실패 집계. 차단 화면 머리에 한 줄로 얹는다 */
export async function auditSummary(): Promise<
  { stage: string; pass: number; fail: number }[]
> {
  return rows<{ stage: string; pass: number; fail: number }>(
    `SELECT stage::text AS stage,
            count(*) FILTER (WHERE result = 'pass')::int AS pass,
            count(*) FILTER (WHERE result = 'fail')::int AS fail
       FROM publish_audit GROUP BY 1 ORDER BY 1`,
  );
}
