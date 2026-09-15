/**
 * 발행 결과 검증.
 *   npm run verify                 DB의 published 브리핑 전체를 검사
 *   npm run verify -- page.html    저장한 페이지의 "보이는 텍스트"만 검사
 *
 * HTML 전체를 그대로 검사하면 minify된 JS 식별자(lg, nc 등)가 종목명 사전에
 * 걸려 노이즈가 된다. script·style을 걷어내고 화면에 보이는 텍스트만 본다.
 */
import { readFileSync } from "node:fs";
import { scan } from "../src/lib/guard";
import { INDICES, MACROS, SECTORS } from "../src/lib/registry";

/** 레지스트리 표준 명칭은 우리가 정한 값이라 사전 충돌이 나도 위반이 아니다. */
const REGISTRY_NAMES = [
  ...INDICES.map((d) => d.name),
  ...MACROS.map((d) => d.name),
  ...SECTORS.map((d) => d.name),
];

function isRegistryName(match: string, context: string): boolean {
  return REGISTRY_NAMES.some((n) => n.includes(match) && context.includes(n));
}

function visibleText(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

function check(label: string, text: string): number {
  const r = scan(text);
  const real = r.blocking.filter((v) => !isRegistryName(v.match, v.context));
  console.log(`\n=== ${label}`);
  console.log(`  검사 ${text.length}자`);
  console.log(`  위반 ${real.length}건`);
  for (const v of real.slice(0, 10)) {
    console.log(`    [${v.rule}] "${v.match}" :: ${v.context}`);
  }
  const ignored = r.blocking.length - real.length;
  if (ignored) console.log(`  (레지스트리 표준 명칭 ${ignored}건은 위반 아님)`);
  return real.length;
}

async function checkDb(): Promise<number> {
  const { db } = await import("../src/db/index");
  const { dailyBrief, marketIndex, macroIndicator, sectorIndex, briefTopic } =
    await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");

  const briefs = await db
    .select()
    .from(dailyBrief)
    .where(eq(dailyBrief.status, "published"));
  console.log(`published 브리핑 ${briefs.length}건`);

  let total = 0;
  for (const b of briefs) {
    const text = [b.headline, b.summary, b.macroCommentary, b.marketSummary].join(
      "\n",
    );
    total += check(`daily_brief ${b.tradeDate}`, text);

    const [idx, mac, sec, topics] = await Promise.all([
      db.select().from(marketIndex).where(eq(marketIndex.briefId, b.id)),
      db.select().from(macroIndicator).where(eq(macroIndicator.briefId, b.id)),
      db.select().from(sectorIndex).where(eq(sectorIndex.briefId, b.id)),
      db.select().from(briefTopic).where(eq(briefTopic.briefId, b.id)),
    ]);
    // 뉴스 카드는 산문이라 라벨 화이트리스트가 아니라 본문 스캔으로 본다.
    const topicText = topics
      .flatMap((t) => [
        t.title,
        ...(Array.isArray(t.lines)
          ? (t.lines as Array<{ text?: unknown }>).map((l) =>
              typeof l?.text === "string" ? l.text : "",
            )
          : []),
      ])
      .join("\n");
    if (topicText) total += check(`brief_topic ${b.tradeDate} (${topics.length}장)`, topicText);

    const labels = [
      ...idx.map((r) => r.indexName),
      ...mac.map((r) => r.name),
      ...sec.map((r) => r.sectorName),
    ];
    const stray = labels.filter((l) => !REGISTRY_NAMES.includes(l));
    console.log(
      `  구조화 라벨 ${labels.length}개 중 레지스트리 밖 ${stray.length}개${
        stray.length ? `: ${stray.join(", ")}` : ""
      }`,
    );
    total += stray.length;
  }
  return total;
}

async function main() {
  const files = process.argv.slice(2);
  let total = 0;

  if (files.length) {
    for (const f of files) {
      total += check(f, visibleText(readFileSync(f, "utf8")));
    }
  } else {
    total += await checkDb();
  }

  console.log(`\n총 위반 ${total}건`);
  process.exitCode = total ? 1 : 0;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
