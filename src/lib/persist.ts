/** 브리핑 페이로드를 Neon에 적재한다. 적재 직전에 한 번 더 검사한다. */
import { eq } from "drizzle-orm";
import { db } from "../db/index";
import {
  dailyBrief, marketIndex, macroIndicator, investorFlow, sectorIndex, publishAudit,
} from "../db/schema";
import { assertObjectClean, EquityMentionError, scan } from "./guard";
import { assertRegistryOnly, type BriefPayload } from "./extract";

function narrative(p: BriefPayload) {
  return {
    headline: p.headline, summary: p.summary,
    macroCommentary: p.macroCommentary, marketSummary: p.marketSummary,
  };
}

export async function persist(p: BriefPayload, publish: boolean): Promise<number> {
  assertRegistryOnly(p);

  // 적재 직전 관문. 실패해도 조용히 넘어가지 않고 감사 로그를 남긴다.
  try {
    assertObjectClean(narrative(p), "persist");
  } catch (e) {
    if (e instanceof EquityMentionError) {
      await db.insert(publishAudit).values({
        tradeDate: p.tradeDate, stage: "ingest", result: "fail",
        violationCount: e.violations.length,
        violations: e.violations.slice(0, 200),
      });
    }
    throw e;
  }

  const values = {
    tradeDate: p.tradeDate,
    runId: p.runId,
    headline: p.headline,
    summary: p.summary,
    macroCommentary: p.macroCommentary,
    marketSummary: p.marketSummary,
    status: publish ? ("published" as const) : ("draft" as const),
    publishedAt: publish ? new Date() : null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(dailyBrief)
    .values(values)
    .onConflictDoUpdate({ target: dailyBrief.tradeDate, set: values })
    .returning({ id: dailyBrief.id });
  const briefId = row.id;

  // 자식 행은 회차마다 통째로 갈아끼운다.
  await Promise.all([
    db.delete(marketIndex).where(eq(marketIndex.briefId, briefId)),
    db.delete(macroIndicator).where(eq(macroIndicator.briefId, briefId)),
    db.delete(investorFlow).where(eq(investorFlow.briefId, briefId)),
    db.delete(sectorIndex).where(eq(sectorIndex.briefId, briefId)),
  ]);

  const num = (v: number | null) => (v === null ? null : String(v));
  if (p.indices.length)
    await db.insert(marketIndex).values(p.indices.map((i) => ({
      briefId, indexCode: i.indexCode, indexName: i.indexName,
      close: num(i.close), changePct: num(i.changePct), sortOrder: i.sortOrder,
    })));
  if (p.macros.length)
    await db.insert(macroIndicator).values(p.macros.map((m) => ({
      briefId, kind: m.kind, name: m.name, unit: m.unit,
      value: num(m.value), changePct: num(m.changePct), sortOrder: m.sortOrder,
    })));
  if (p.flows.length)
    await db.insert(investorFlow).values(p.flows.map((f) => ({
      briefId, market: f.market, investor: f.investor, netAmount: num(f.netAmount),
    })));
  if (p.sectors.length)
    await db.insert(sectorIndex).values(p.sectors.map((s) => ({
      briefId, krxSectorCode: s.krxSectorCode, sectorName: s.sectorName,
      changePct: num(s.changePct), rank: s.rank,
    })));

  const check = scan([p.headline, p.summary, p.macroCommentary, p.marketSummary].join("\n"));
  await db.insert(publishAudit).values({
    tradeDate: p.tradeDate, briefId, stage: publish ? "publish" : "ingest",
    result: check.violations.length ? "fail" : "pass",
    violationCount: check.violations.length,
    violations: check.violations.slice(0, 200),
  });

  return briefId;
}
