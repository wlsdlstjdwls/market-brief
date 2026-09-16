/**
 * 해당 (일자, 회차)가 이미 published로 들어가 있는지 묻는다.
 *
 *   npx tsx scripts/brief-exists.ts --date 2026-09-16 --session am   → true | false
 *
 * 재시도 슬롯이 여러 번 도는데(daily-update.yml) 이미 받아 간 회차를
 * 매번 다시 적재할 이유가 없다. persist가 upsert라 다시 넣어도 결과는
 * 같지만, 늦게 도착한 원고를 덮어쓰는 일도 없고 로그도 읽기 쉬워진다.
 *
 * 회차를 비우면 항상 false다. "그날 있는 회차를 전부"는 무엇이 빠졌는지
 * 여기서 알 수 없으므로 판단을 ingest에 넘긴다.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { dailyBrief } from "../src/db/schema";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const date = arg("date");
const session = arg("session");

if (!date) {
  console.error("--date YYYY-MM-DD 가 필요합니다.");
  process.exit(2);
}

if (!session) {
  console.log("false");
  process.exit(0);
}

const rows = await db
  .select({ id: dailyBrief.id })
  .from(dailyBrief)
  .where(
    and(
      eq(dailyBrief.tradeDate, date),
      eq(dailyBrief.session, session as "am" | "pm"),
      eq(dailyBrief.status, "published"),
    ),
  )
  .limit(1);

console.log(rows.length > 0 ? "true" : "false");
