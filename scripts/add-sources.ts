/**
 * `daily_brief.sources` · `brief_topic.sources` 추가 (1회성).
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 스키마에서 걷어낸 `subscriber`·`subscription`이
 * 원격에 남아 있어 push가 그 둘을 DROP하려 들기 때문이다 (CLAUDE.md 참고).
 * 이 스크립트는 컬럼을 더하기만 하고 아무것도 지우지 않는다. 여러 번 돌려도 안전하다.
 *
 *   npx tsx --env-file=.env.local scripts/add-sources.ts
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL이 없습니다. --env-file=.env.local 을 붙이세요.");
  process.exit(1);
}

const sql = neon(url);

await sql`ALTER TABLE daily_brief ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb`;
await sql`ALTER TABLE brief_topic ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb`;

const cols = await sql`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE column_name = 'sources' AND table_name IN ('daily_brief', 'brief_topic')
  ORDER BY table_name`;

console.log("✓ 적용 완료:", cols.map((c) => `${c.table_name}.${c.column_name}`).join(", "));
