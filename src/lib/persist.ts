/** 브리핑 페이로드를 Neon에 적재한다. 적재 직전에 한 번 더 검사한다. */
import { eq, sql } from "drizzle-orm";
import { db } from "../db/index";
import {
  dailyBrief, marketIndex, macroIndicator, investorFlow, sectorIndex, briefTopic,
  publishAudit,
} from "../db/schema";
import { assertObjectClean, EquityMentionError, scan } from "./guard";
import { assertRegistryOnly, type BriefPayload } from "./extract";

function narrative(p: BriefPayload) {
  return {
    headline: p.headline, summary: p.summary,
    macroCommentary: p.macroCommentary, marketSummary: p.marketSummary,
    // 뉴스 카드도 같은 관문을 통과해야 한다. topics.ts에서 한 번 걸렀지만 여기가 마지막이다.
    topics: p.topics.map((t) => ({
      title: t.title,
      lines: t.lines.map((l) => l.text),
    })),
  };
}

/**
 * 매체명 관문.
 *
 * 산문과 달리 `blocking`만 본다. 영문 매체명이 두 글자 ASCII 종목명과 자주 겹쳐서
 * (`newspim`의 `new` = NEW, `Yahoo Finance`의 `nc` = 엔씨소프트) review까지 막으면
 * 링크가 한 장도 안 남는다. URL은 아예 보지 않는다 — `https`의 `tp`가 종목 TP로 걸린다.
 * 판단 근거는 sources.ts의 같은 주석에 있다.
 */
function assertSourcesClean(p: BriefPayload): void {
  const labels = [...p.sources, ...p.topics.flatMap((t) => t.sources)].map((x) => x.label);
  const bad = labels.flatMap((l) => scan(l).blocking);
  if (bad.length) throw new EquityMentionError("persist:sources", bad);
}

export async function persist(p: BriefPayload, publish: boolean): Promise<number> {
  assertRegistryOnly(p);

  // 적재 직전 관문. 실패해도 조용히 넘어가지 않고 감사 로그를 남긴다.
  try {
    assertObjectClean(narrative(p), "persist");
    assertSourcesClean(p);
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
    session: p.session,
    runId: p.runId,
    // 원고가 적어 둔 작성 기준시각. 없는 회차는 null로 들어간다(옛 원고에는 그 줄이 없다).
    writtenAt: p.writtenAt ? new Date(p.writtenAt) : null,
    headline: p.headline,
    summary: p.summary,
    macroCommentary: p.macroCommentary,
    marketSummary: p.marketSummary,
    sources: p.sources,
    status: publish ? ("published" as const) : ("draft" as const),
    publishedAt: publish ? new Date() : null,
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(dailyBrief)
    .values(values)
    // 같은 날짜라도 am/pm은 별개 행이다. 같은 (날짜, 세션)을 다시 넣으면 덮어쓴다.
    // published_at만은 처음 값을 지킨다. 재시도 슬롯이 하루 세 번 도는데 그때마다
    // 갱신되면 화면의 "게시" 시각이 실제로 올라간 시각이 아니라 마지막 재적재 시각이 된다.
    .onConflictDoUpdate({
      target: [dailyBrief.tradeDate, dailyBrief.session],
      set: {
        ...values,
        publishedAt: sql`COALESCE(${dailyBrief.publishedAt}, ${values.publishedAt})`,
      },
    })
    .returning({ id: dailyBrief.id });
  const briefId = row.id;

  // 자식 행은 회차마다 통째로 갈아끼운다.
  await Promise.all([
    db.delete(marketIndex).where(eq(marketIndex.briefId, briefId)),
    db.delete(macroIndicator).where(eq(macroIndicator.briefId, briefId)),
    db.delete(investorFlow).where(eq(investorFlow.briefId, briefId)),
    db.delete(sectorIndex).where(eq(sectorIndex.briefId, briefId)),
    db.delete(briefTopic).where(eq(briefTopic.briefId, briefId)),
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

  if (p.topics.length)
    await db.insert(briefTopic).values(p.topics.map((t) => ({
      briefId, kind: t.kind, rank: t.rank, title: t.title,
      impact: t.impact, lines: t.lines, sources: t.sources,
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
