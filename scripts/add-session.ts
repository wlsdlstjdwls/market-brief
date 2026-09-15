/**
 * daily_brief에 session 컬럼을 추가하고 유니크 키를 (trade_date, session)으로 바꾼다.
 * 기존 행은 전부 pm(마감 종합)이다. 추가만 하고 행은 하나도 지우지 않는다.
 *
 * 원본 루틴이 하루 두 번 쓴다는 걸 2026-09-15에 확인했다.
 *   07:4x 프리마켓 → 날짜 폴더 루트,  15:3x 마감 종합 → run-HHMM/
 * 여태 pm만 적재됐고 am은 통째로 버려지고 있었다.
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 add-brief-topic.ts와 같다.
 * 원격에 스키마 정의에서 빠진 테이블이 남아 있어 push가 그걸 DROP하려 든다.
 *
 *   npx tsx --env-file=.env.local scripts/add-session.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

const STEPS: Array<[string, string]> = [
  [
    "brief_session enum",
    `DO $$ BEGIN
       CREATE TYPE brief_session AS ENUM ('am', 'pm');
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$;`,
  ],
  [
    "daily_brief.session 컬럼 (기존 행은 pm)",
    `ALTER TABLE daily_brief
       ADD COLUMN IF NOT EXISTS session brief_session NOT NULL DEFAULT 'pm';`,
  ],
  [
    "새 유니크 키 (trade_date, session)",
    `CREATE UNIQUE INDEX IF NOT EXISTS daily_brief_trade_date_session_key
       ON daily_brief (trade_date, session);`,
  ],
  // 옛 유니크 키(trade_date 단독)가 남아 있으면 같은 날짜의 am이 들어가지 못한다.
  // 새 키를 만든 뒤에 지운다. 제약으로 걸렸는지 인덱스로 걸렸는지는 환경마다 달라서
  // 둘 다 시도한다. 드라이버가 한 번에 한 문장만 받으므로 단계를 나눈다.
  [
    "옛 유니크 제약 제거",
    `ALTER TABLE daily_brief DROP CONSTRAINT IF EXISTS daily_brief_trade_date_key;`,
  ],
  [
    "옛 유니크 인덱스 제거",
    `DROP INDEX IF EXISTS daily_brief_trade_date_key;`,
  ],
];

async function main() {
  for (const [name, stmt] of STEPS) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }

  const res = await db.execute<{ session: string; n: string }>(
    sql.raw(
      "SELECT session::text AS session, count(*)::text AS n FROM daily_brief GROUP BY session ORDER BY session",
    ),
  );
  const rows = (Array.isArray(res) ? res : res.rows) as Array<{ session: string; n: string }>;
  for (const r of rows) console.log(`  ${r.session} ${r.n}건`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
