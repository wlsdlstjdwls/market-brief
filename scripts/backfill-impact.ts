/**
 * 뉴스 카드의 빈 영향도를 원고에서 다시 읽어 채운다. 1회성. `brief_topic.impact`만 고친다.
 *
 * 2026-09-29부터 원고가 영향도를 이모지만 적었다(`- 영향도: 🔴`). 파서가 글자(`매우 큼`)만 읽어서
 * 그 뒤 회차 뉴스 카드의 영향도가 전부 비었다. 파서는 고쳤지만(`impactLevel`) 옛 회차는 재적재해야
 * 채워지는데, 마감판을 재적재하면 다시 받을 수 없는 업종 시세가 지워진다. 그래서 이 칸만 고친다.
 *
 *   REPORT_ROOT=…/stock-analysis/요약/뉴스 npx tsx --env-file=.env.local scripts/backfill-impact.ts [--dry-run]
 *
 * 카드는 제목으로 짝을 맞춘다. 원고와 DB 제목이 다르면(그 뒤 필터가 바뀐 경우) 건너뛴다.
 * 이미 영향도가 있는 카드는 건드리지 않는다.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { briefTopic, dailyBrief } from "../src/db/schema";
import { SOURCE_ALLOW } from "../src/lib/extract";
import { splitSections } from "../src/lib/markdown";
import { extractTopics } from "../src/lib/topics";

const ROOT = process.env.REPORT_ROOT ?? "../요약/뉴스";
const DRY = process.argv.includes("--dry-run");

async function main() {
  const empty = await db
    .select({ id: briefTopic.id, briefId: briefTopic.briefId, title: briefTopic.title })
    .from(briefTopic)
    .where(and(eq(briefTopic.kind, "news"), eq(briefTopic.impact, "")));
  const briefIds = [...new Set(empty.map((t) => t.briefId))];
  if (!briefIds.length) return console.log("빈 영향도 없음");

  const briefs = await db
    .select({ id: dailyBrief.id, tradeDate: dailyBrief.tradeDate, runId: dailyBrief.runId })
    .from(dailyBrief)
    .where(inArray(dailyBrief.id, briefIds));

  let filled = 0;
  let missed = 0;
  for (const b of briefs) {
    const date = String(b.tradeDate);
    const day = join(ROOT, date.slice(0, 4), date.slice(5, 7), date);
    const dir = b.runId === "run-none" ? day : join(day, b.runId);
    const impact = new Map<string, string>();
    for (const name of SOURCE_ALLOW) {
      const p = join(dir, name);
      if (!existsSync(p)) continue;
      for (const t of extractTopics(splitSections(readFileSync(p, "utf8"))))
        if (t.kind === "news" && t.impact && !impact.has(t.title)) impact.set(t.title, t.impact);
    }
    for (const t of empty.filter((x) => x.briefId === b.id)) {
      const v = impact.get(t.title);
      if (!v) {
        missed++;
        continue;
      }
      filled++;
      if (!DRY) await db.update(briefTopic).set({ impact: v }).where(eq(briefTopic.id, t.id));
    }
  }
  console.log(`${DRY ? "(dry-run) " : ""}채움 ${filled}장, 원고에서 못 찾음 ${missed}장, 회차 ${briefs.length}개`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
