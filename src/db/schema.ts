/**
 * Neon Postgres 스키마 (Drizzle).
 *
 * 설계 원칙: 개별 종목을 담을 수 있는 컬럼을 어떤 테이블에도 만들지 않는다.
 * ticker / stock_name / symbol / isin 같은 컬럼은 존재하지 않으며, 추가해서도 안 된다.
 * 섹터 근거 수치는 개별 종목이 아니라 업종 등락률(sectorIndex)만 사용한다.
 */

import {
  pgTable, serial, integer, text, varchar, boolean, date, timestamp,
  numeric, jsonb, uniqueIndex, index, pgEnum,
} from "drizzle-orm/pg-core";

export const briefStatus = pgEnum("brief_status", ["draft", "published", "blocked"]);
export const macroKind = pgEnum("macro_kind", ["rate", "fx", "oil", "commodity", "volatility"]);
export const investorType = pgEnum("investor_type", ["foreign", "institution", "retail"]);
export const termType = pgEnum("term_type", ["name", "code", "alias", "phrase"]);
export const auditResult = pgEnum("audit_result", ["pass", "fail"]);
export const auditStage = pgEnum("audit_stage", ["ingest", "publish", "render"]);
export const topicKind = pgEnum("topic_kind", ["news", "theme", "sector"]);
export const briefSession = pgEnum("brief_session", ["am", "pm"]);

/** 일자별 브리핑 본문. 여기에 들어가는 텍스트는 전부 차단 필터를 통과한 것만. */
export const dailyBrief = pgTable(
  "daily_brief",
  {
    id: serial("id").primaryKey(),
    tradeDate: date("trade_date").notNull(),
    /**
     * 회차 구분. 원본 루틴이 하루 두 번 쓴다.
     *   am — 07:4x 프리마켓 에디션 (전일 미국장 + 오늘 전망). 날짜 폴더 루트에 놓인다.
     *   pm — 15:3x 마감 종합 (당일 종가 확정). run-HHMM/ 하위에 놓인다.
     * 같은 날짜에 둘이 공존하므로 유니크 키는 (trade_date, session)이다.
     */
    session: briefSession("session").notNull().default("pm"),
    /** 원본 회차 식별자 (예: run-1535). 추적용이며 원본은 수정하지 않는다. */
    runId: varchar("run_id", { length: 32 }).notNull(),
    /**
     * 원고가 적어 둔 작성 기준시각 (`> 작성 시각: 2026-09-17 07:34 KST`).
     * 화면의 "원고 07:34 작성" 표기가 이 값이다. 적재 시각(publishedAt)과는 다르다 —
     * 원고가 늦게 올라오면 둘이 몇 시간씩 벌어진다.
     * 옛 회차에는 이 줄이 없어 null이고, 그때는 runId의 HHMM으로 떨어진다.
     */
    writtenAt: timestamp("written_at", { withTimezone: true }),
    headline: text("headline").notNull(),
    /** 한 줄 요약 */
    summary: text("summary").notNull(),
    /** 매크로 해설 본문 (마크다운) */
    macroCommentary: text("macro_commentary").notNull(),
    /** 시장 개요 본문 (마크다운) */
    marketSummary: text("market_summary").notNull(),
    /** [{ label, url }] 그 회차가 인용한 기사. 원고 말미 `## 출처(주요)` 목록에서 온다 */
    sources: jsonb("sources").notNull().default([]),
    status: briefStatus("status").notNull().default("draft"),
    /** 유료 전환 대비 자리. MVP에서는 전부 'free'. */
    tier: varchar("tier", { length: 16 }).notNull().default("free"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /**
     * 텔레그램 채널에 알림을 보낸 시각. **중복 발송을 막는 유일한 근거다.**
     *
     * 회차마다 슬롯이 여섯 번 돌고 손으로 재적재하는 일도 있는데, 채널에 나간 글은
     * 되돌릴 수 없다. 값이 차 있으면 다시 보내지 않는다(`--force`로만 넘긴다).
     * 컬럼을 더할 때 이미 있던 회차는 전부 지금 시각으로 찍어 과거 글이 한꺼번에
     * 나가는 사고를 막았다 (`scripts/add-notified-at.ts`).
     */
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_brief_trade_date_session_key").on(t.tradeDate, t.session),
    index("daily_brief_status_idx").on(t.status, t.tradeDate),
  ]
);

/**
 * 뉴스 분석 카드. 원본 리포트의 Executive Summary·핵심 테마에서 뽑는다.
 *
 * 종목명을 담는 칸은 여기에도 없다. lines는 [{label, text}] 배열이고, 들어가기 전에
 * src/lib/topics.ts가 카드 단위로, persist.ts가 적재 직전에 한 번 더 검사한다.
 */
export const briefTopic = pgTable(
  "brief_topic",
  {
    id: serial("id").primaryKey(),
    briefId: integer("brief_id").notNull().references(() => dailyBrief.id, { onDelete: "cascade" }),
    kind: topicKind("kind").notNull(),
    rank: integer("rank").notNull().default(0),
    title: text("title").notNull(),
    /** 영향도 등급 (뉴스만). 테마는 빈 문자열 */
    impact: varchar("impact", { length: 16 }).notNull().default(""),
    /** [{ label, text }] 순서 그대로 화면에 찍는다 */
    lines: jsonb("lines").notNull(),
    /** [{ label, url }] 그 카드가 인용한 기사. 매체명만 담는다 (제목에는 종목이 흔하다) */
    sources: jsonb("sources").notNull().default([]),
  },
  (t) => [index("brief_topic_brief_idx").on(t.briefId, t.kind, t.rank)]
);

/** 지수 (KOSPI, KOSDAQ, S&P500 ...). 개별 종목 아님. */
export const marketIndex = pgTable(
  "market_index",
  {
    id: serial("id").primaryKey(),
    briefId: integer("brief_id").notNull().references(() => dailyBrief.id, { onDelete: "cascade" }),
    indexCode: varchar("index_code", { length: 32 }).notNull(),
    indexName: varchar("index_name", { length: 64 }).notNull(),
    close: numeric("close", { precision: 14, scale: 2 }),
    changePct: numeric("change_pct", { precision: 8, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("market_index_brief_idx").on(t.briefId)]
);

/** 금리·환율·유가·변동성 */
export const macroIndicator = pgTable(
  "macro_indicator",
  {
    id: serial("id").primaryKey(),
    briefId: integer("brief_id").notNull().references(() => dailyBrief.id, { onDelete: "cascade" }),
    kind: macroKind("kind").notNull(),
    name: varchar("name", { length: 64 }).notNull(),
    value: numeric("value", { precision: 14, scale: 4 }),
    unit: varchar("unit", { length: 16 }),
    changePct: numeric("change_pct", { precision: 8, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("macro_indicator_brief_idx").on(t.briefId)]
);

/** 투자주체별 수급. 시장 전체 집계이며 종목별 수급은 담지 않는다. */
export const investorFlow = pgTable(
  "investor_flow",
  {
    id: serial("id").primaryKey(),
    briefId: integer("brief_id").notNull().references(() => dailyBrief.id, { onDelete: "cascade" }),
    market: varchar("market", { length: 16 }).notNull(),
    investor: investorType("investor").notNull(),
    /** 순매수 금액(억원). 음수면 순매도 */
    netAmount: numeric("net_amount", { precision: 16, scale: 2 }),
  },
  (t) => [index("investor_flow_brief_idx").on(t.briefId)]
);

/**
 * 업종 강약. 개별 종목을 대체하는 유일한 근거 수치.
 * 컬럼명 krxSectorCode는 KRX 업종지수를 쓰던 때 붙인 이름이다. 지금 값은 네이버 업종
 * 등락률을 registry SECTORS 코드로 묶은 것이다(scripts/fetch_market.py 참고).
 * 이름만 남겨 둔 이유는 컬럼 개명이 얻는 것보다 잃는 게 커서다.
 */
export const sectorIndex = pgTable(
  "sector_index",
  {
    id: serial("id").primaryKey(),
    briefId: integer("brief_id").notNull().references(() => dailyBrief.id, { onDelete: "cascade" }),
    krxSectorCode: varchar("krx_sector_code", { length: 32 }).notNull(),
    sectorName: varchar("sector_name", { length: 64 }).notNull(),
    changePct: numeric("change_pct", { precision: 8, scale: 2 }),
    rank: integer("rank"),
  },
  (t) => [index("sector_index_brief_idx").on(t.briefId)]
);

/** 금칙어 사전. data/ticker_names.json에서 시드한다. */
export const blockedTerm = pgTable(
  "blocked_term",
  {
    id: serial("id").primaryKey(),
    term: varchar("term", { length: 128 }).notNull(),
    termType: termType("term_type").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [uniqueIndex("blocked_term_term_key").on(t.term)]
);

/** 차단 필터 검사 이력. 통과·실패 모두 남긴다. */
export const publishAudit = pgTable(
  "publish_audit",
  {
    id: serial("id").primaryKey(),
    tradeDate: date("trade_date").notNull(),
    briefId: integer("brief_id").references(() => dailyBrief.id, { onDelete: "set null" }),
    stage: auditStage("stage").notNull(),
    result: auditResult("result").notNull(),
    violationCount: integer("violation_count").notNull().default(0),
    violations: jsonb("violations"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("publish_audit_date_idx").on(t.tradeDate)]
);
