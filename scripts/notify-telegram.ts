/**
 * 발행 알림을 텔레그램 채널로 보낸다.
 *
 *   npx tsx --env-file=.env.local scripts/notify-telegram.ts --date 2026-09-19 --session am
 *   npx tsx --env-file=.env.local scripts/notify-telegram.ts --dry-run       (오늘 것 미리보기)
 *
 * 설계 원칙 셋.
 *
 * 1. **본문을 통째로 보낸다** (2026-09-18 사용자 지시). 카드 전부와 국내/해외 산문까지
 *    싣고 4096자 한도에 맞춰 여러 통으로 쪼갠다. 이 경로는 렌더 단계(`renderMarkdown`)를
 *    타지 않으므로 **보내기 직전의 `violations()`가 종목 차단의 유일한 방어선이다.**
 *    한 건이라도 걸리면 그 회차는 통째로 발송하지 않는다.
 *    RSS는 여전히 요약만 싣는다 — 그쪽은 기계가 읽는 피드라 판단이 다르다.
 *
 * 2. **한 회차는 한 번만 나간다.** `daily_brief.notified_at`이 근거다. 회차마다 슬롯이
 *    여섯 번 돌고 손으로 재적재하는 일도 있는데 채널에 나간 글은 지워도 이미 읽힌다.
 *
 * 3. **오래된 회차는 안 보낸다.** 과거 회차를 재적재하다가 몇 달 치가 한꺼번에 나가는
 *    사고를 막는다. `published_at`이 MAX_AGE_HOURS보다 오래됐으면 건너뛴다.
 *
 * secret이 없으면 조용히 끝낸다(exit 0). 로컬 개발과 워크플로 양쪽에서 같은 판단이다.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { briefTopic, dailyBrief } from "../src/db/schema";
import { compose, violations } from "../src/lib/notify";

/** 이보다 오래 전에 발행된 회차는 보내지 않는다. 재적재 사고 방지용. */
const MAX_AGE_HOURS = 48;

const TOKEN = process.env.TG_CHANNEL_BOT_TOKEN ?? "";
const CHAT = process.env.TG_CHANNEL_ID ?? "";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);


const dryRun = has("dry-run");
const force = has("force");
const date = arg("date") ?? todayKst();
const session = arg("session");

/** Vercel도 GitHub 러너도 UTC로 돈다. 날짜 기준은 항상 KST다. */
function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function send(text: string, preview: boolean): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text,
      // HTML 모드. 이스케이프할 글자가 &, <, > 셋뿐이라 사고가 나지 않는다 (notify.ts의 esc).
      parse_mode: "HTML",
      // 미리보기는 링크가 든 마지막 통에서만 켠다. 앞 통에 켜면 빈 카드가 붙는다.
      disable_web_page_preview: !preview,
    }),
  });
  const body = (await res.json()) as { ok?: boolean; description?: string };
  if (!res.ok || !body.ok) {
    throw new Error(`텔레그램 발송 실패 (${res.status}): ${body.description ?? "알 수 없음"}`);
  }
}

async function main() {
  if (!dryRun && (!TOKEN || !CHAT)) {
    console.log("TG_CHANNEL_BOT_TOKEN / TG_CHANNEL_ID 없음 — 발송 건너뜀");
    return;
  }

  const where = [eq(dailyBrief.tradeDate, date), eq(dailyBrief.status, "published")];
  if (session) where.push(eq(dailyBrief.session, session as "am" | "pm"));
  if (!force) where.push(isNull(dailyBrief.notifiedAt));

  const rows = await db
    .select({
      id: dailyBrief.id,
      tradeDate: dailyBrief.tradeDate,
      session: dailyBrief.session,
      headline: dailyBrief.headline,
      summary: dailyBrief.summary,
      marketSummary: dailyBrief.marketSummary,
      macroCommentary: dailyBrief.macroCommentary,
      publishedAt: dailyBrief.publishedAt,
    })
    .from(dailyBrief)
    .where(and(...where));

  if (!rows.length) {
    console.log(`${date}${session ? ` ${session}` : ""} — 발송할 회차 없음 (이미 보냈거나 미발행)`);
    return;
  }

  let sent = 0;
  for (const b of rows) {
    const label = `${b.tradeDate} ${b.session}`;
    const ageH = b.publishedAt
      ? (Date.now() - new Date(b.publishedAt).getTime()) / 36e5
      : Number.POSITIVE_INFINITY;

    if (!force && ageH > MAX_AGE_HOURS) {
      console.log(`- ${label} 건너뜀 — ${Math.round(ageH)}시간 전 발행 (${MAX_AGE_HOURS}시간 초과)`);
      continue;
    }

    // 그날 카드 전부. 적재 때 이미 걸러진 값이지만 prose에 실려 한 번 더 검사된다.
    const topics = await db
      .select({
        kind: briefTopic.kind,
        title: briefTopic.title,
        impact: briefTopic.impact,
        lines: briefTopic.lines,
      })
      .from(briefTopic)
      .where(eq(briefTopic.briefId, b.id))
      .orderBy(briefTopic.kind, briefTopic.rank);

    const { chunks, prose } = compose(
      b,
      topics.map((t) => ({
        kind: t.kind,
        title: t.title,
        impact: t.impact,
        lines: Array.isArray(t.lines) ? (t.lines as Array<{ label?: string; text?: string }>) : [],
      })),
    );
    const bad = violations(prose);
    if (bad.length) {
      console.error(`✗ ${label} 발송 중단 — 종목 표기 ${bad.length}건`);
      for (const v of bad.slice(0, 5)) console.error(`    ${v}`);
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      const total = chunks.join("").length;
      console.log(`--- ${label} (dry-run, ${chunks.length}통 ${total}자)`);
      console.log(`${chunks.join("\n\n=== 다음 통 ===\n\n")}\n`);
      continue;
    }

    // 미리보기는 링크가 든 마지막 통에서만 켠다.
    for (const [i, chunk] of chunks.entries()) {
      await send(chunk, i === chunks.length - 1);
    }
    await db.update(dailyBrief).set({ notifiedAt: new Date() }).where(eq(dailyBrief.id, b.id));
    console.log(`✓ ${label} 발송 완료 (${chunks.length}통)`);
    sent += 1;
  }

  if (!dryRun) console.log(`발송 ${sent}건`);
}

await main();
