/**
 * Neon Postgres 스키마 (Drizzle).
 *
 * 설계 원칙: 개별 종목을 담을 수 있는 컬럼을 어떤 테이블에도 만들지 않는다.
 * ticker / stock_name / symbol / isin 같은 컬럼은 존재하지 않으며, 추가해서도 안 된다.
 * 섹터 근거 수치는 개별 종목이 아니라 KRX 업종지수(sectorIndex)만 사용한다.
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

/** 일자별 브리핑 본문. 여기에 들어가는 텍스트는 전부 차단 필터를 통과한 것만. */
export const dailyBrief = pgTable(
  "daily_brief",
  {
    id: serial("id").primaryKey(),
    tradeDate: date("trade_date").notNull(),
    /** 원본 회차 식별자 (예: run-1535). 추적용이며 원본은 수정하지 않는다. */
    runId: varchar("run_id", { length: 32 }).notNull(),
    headline: text("headline").notNull(),
    /** 한 줄 요약 */
    summary: text("summary").notNull(),
    /** 매크로 해설 본문 (마크다운) */
    macroCommentary: text("macro_commentary").notNull(),
    /** 시장 개요 본문 (마크다운) */
    marketSummary: text("market_summary").notNull(),
    status: briefStatus("status").notNull().default("draft"),
    /** 유료 전환 대비 자리. MVP에서는 전부 'free'. */
    tier: varchar("tier", { length: 16 }).notNull().default("free"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_brief_trade_date_key").on(t.tradeDate),
    index("daily_brief_status_idx").on(t.status, t.tradeDate),
  ]
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

/** KRX 업종지수 기반 섹터 강약. 개별 종목을 대체하는 유일한 근거 수치. */
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

/* ---------- 유료 전환 대비 스텁. MVP에서는 화면·결제 코드를 붙이지 않는다. ---------- */

export const subscriber = pgTable(
  "subscriber",
  {
    id: serial("id").primaryKey(),
    email: varchar("email", { length: 320 }).notNull(),
    locale: varchar("locale", { length: 8 }).notNull().default("ko"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    confirmToken: varchar("confirm_token", { length: 64 }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscriber_email_key").on(t.email)]
);

export const subscription = pgTable("subscription", {
  id: serial("id").primaryKey(),
  subscriberId: integer("subscriber_id").notNull().references(() => subscriber.id, { onDelete: "cascade" }),
  plan: varchar("plan", { length: 16 }).notNull().default("free"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
