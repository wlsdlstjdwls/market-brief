/**
 * `daily_brief.notified_at` 추가 (1회성).
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 스키마에서 걷어낸 `subscriber`·`subscription`이
 * 원격에 남아 있어 push가 그 둘을 DROP하려 들기 때문이다 (CLAUDE.md 참고).
 * 이 스크립트는 컬럼을 더하기만 하고 아무것도 지우지 않는다. 여러 번 돌려도 안전하다.
 *
 * **이미 있던 회차는 전부 "발송함"으로 찍는다.** 컬럼만 더하고 비워 두면 다음 발송
 * 때 과거 78회차가 한꺼번에 채널로 나간다. 채널에 나간 글은 되돌릴 수 없어서
 * 여기서 한 번에 막는다. 이 표시는 "보냈다"가 아니라 "보낼 대상이 아니다"라는 뜻이다.
 *
 *   npx tsx --env-file=.env.local scripts/add-notified-at.ts
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 없습니다. --env-file=.env.local 을 붙이세요.");
  process.exit(1);
}

const sql = neon(url);

await sql`ALTER TABLE daily_brief ADD COLUMN IF NOT EXISTS notified_at timestamptz`;

// 컬럼을 막 만든 회차(= 지금까지 발행된 전부)를 발송 대상에서 뺀다.
const stamped = await sql`
  UPDATE daily_brief SET notified_at = now()
  WHERE notified_at IS NULL
  RETURNING trade_date, session`;

const pending = await sql`
  SELECT count(*)::int AS n FROM daily_brief WHERE notified_at IS NULL`;

console.log(`✓ notified_at 추가 완료`);
console.log(`  기존 회차 ${stamped.length}건을 발송 대상에서 제외했다`);
console.log(`  남은 발송 대기 ${pending[0]?.n ?? 0}건 (0이 정상)`);
