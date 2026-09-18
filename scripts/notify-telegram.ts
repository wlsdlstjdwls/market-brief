/**
 * 발행 알림을 텔레그램 채널로 보낸다.
 *
 *   npx tsx --env-file=.env.local scripts/notify-telegram.ts --date 2026-09-19 --session am
 *   npx tsx --env-file=.env.local scripts/notify-telegram.ts --dry-run       (오늘 것 미리보기)
 *
 * 설계 원칙 셋.
 *
 * 1. **본문을 싣지 않는다.** 헤드라인, 한 줄 요약, 링크까지다.
 *    종목 차단의 마지막 방어선이 렌더 단계(`renderMarkdown`)인데 텔레그램은 그 경로를
 *    타지 않는다. 본문을 통째로 보내면 방어선 하나가 빠진 채 나간다. RSS와 같은 판단이고,
 *    같은 이유로 보내기 직전에 `scan`을 한 번 더 돌린다.
 *    덤으로 독자가 사이트로 들어오게 되어 광고 노출도 지킨다.
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

async function send(text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT,
      text,
      // HTML 모드. 이스케이프할 글자가 &, <, > 셋뿐이라 사고가 나지 않는다 (notify.ts의 esc).
      parse_mode: "HTML",
      // 링크 미리보기는 켜 둔다. og:image 카드가 채널에서 그대로 뜬다.
      disable_web_page_preview: false,
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

    // 그날 다룬 카드 제목 몇 줄. 적재 때 이미 걸러진 값이지만 prose에 실려 한 번 더 검사된다.
    const topics = await db
      .select({ title: briefTopic.title })
      .from(briefTopic)
      .where(eq(briefTopic.briefId, b.id))
      .orderBy(briefTopic.kind, briefTopic.rank)
      .limit(3);

    const { text, prose } = compose(b, topics.map((t) => t.title));
    const bad = violations(prose);
    if (bad.length) {
      console.error(`✗ ${label} 발송 중단 — 종목 표기 ${bad.length}건`);
      for (const v of bad.slice(0, 5)) console.error(`    ${v}`);
      process.exitCode = 1;
      continue;
    }

    if (dryRun) {
      console.log(`--- ${label} (dry-run)\n${text}\n`);
      continue;
    }

    await send(text);
    await db.update(dailyBrief).set({ notifiedAt: new Date() }).where(eq(dailyBrief.id, b.id));
    console.log(`✓ ${label} 발송 완료`);
    sent += 1;
  }

  if (!dryRun) console.log(`발송 ${sent}건`);
}

await main();
