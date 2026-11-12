/**
 * 종목 브리핑 질의. 뉴스 쪽 `queries.ts`와 일부러 갈라 뒀다 — 뉴스 화면이 이 파일을
 * import 하는 일이 없어야 종목이 뉴스 지면으로 새지 않는다.
 *
 * 목록 화면은 `fin_stock.snap`(카드 요약)만 읽는다. 종목 하나가 `detail`로 수십 KB라
 * 33종목을 통째로 읽으면 회차당 1MB 가까이 된다.
 */
import { cache } from "react";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import { finRun, finStock } from "../db/schema";
import type { Stock, StockCard } from "./stocks";

export type FinWeek = {
  runDate: string;
  runAt: string;
  summary: string | null;
  fails: Array<[string, string]>;
  cards: StockCard[];
};

async function loadRun(runDate: string | null): Promise<FinWeek | null> {
  if (!hasDb()) return null;
  const runs = await db
    .select()
    .from(finRun)
    .where(runDate ? eq(finRun.runDate, runDate) : undefined)
    .orderBy(desc(finRun.runDate))
    .limit(1);
  const run = runs[0];
  if (!run) return null;
  const rows = await db
    .select({ snap: finStock.snap })
    .from(finStock)
    .where(eq(finStock.runDate, run.runDate))
    .orderBy(asc(finStock.ord));
  return {
    runDate: run.runDate,
    runAt: run.runAt,
    summary: run.summary,
    fails: (run.fails as Array<[string, string]>) ?? [],
    cards: rows.map((r) => r.snap as StockCard),
  };
}

/** 가장 최근 회차. 없으면 null */
export const getLatestWeek = cache(() => loadRun(null));

/** 특정 회차. 지난 회차 화면용 */
export const getWeek = cache((runDate: string) => loadRun(runDate));

/** 회차 날짜 목록 (최신순) */
export async function listWeeks(limit = 60): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await db
    .select({ runDate: finRun.runDate })
    .from(finRun)
    .orderBy(desc(finRun.runDate))
    .limit(limit);
  return rows.map((r) => r.runDate);
}

/** 최신 회차의 종목 코드 목록 (빌드 때 미리 굽기, sitemap) */
export async function latestCodes(): Promise<string[]> {
  const week = await getLatestWeek();
  return week?.cards.map((c) => c.code) ?? [];
}

/**
 * 종목 하나. 늘 **최신 회차**에서 읽는다 — 관심종목에서 빠진 종목은 404다.
 * `generateMetadata`와 본문이 같이 부르므로 cache로 한 번만 친다.
 */
export const getStockDetail = cache(
  async (code: string): Promise<{ stock: Stock; runDate: string; runAt: string } | null> => {
    if (!hasDb()) return null;
    const week = await getLatestWeek();
    if (!week) return null;
    const rows = await db
      .select({ detail: finStock.detail })
      .from(finStock)
      .where(and(eq(finStock.runDate, week.runDate), eq(finStock.code, code)))
      .limit(1);
    const d = rows[0]?.detail as Stock | undefined;
    return d ? { stock: d, runDate: week.runDate, runAt: week.runAt } : null;
  },
);
