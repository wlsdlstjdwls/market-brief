/**
 * brief_topic 테이블을 추가한다. 만들기만 하고 아무것도 지우지 않는다.
 *
 * `drizzle-kit push`를 쓰지 않는 이유: 지금 원격에는 스키마 정의에서 빠진
 * subscriber·subscription 테이블이 남아 있어서, push는 그 둘을 DROP하려 든다
 * (CLAUDE.md "이메일 구독 삭제" 절 참고). 새 테이블만 필요한 회차라 SQL을 직접 친다.
 *
 *   npx tsx --env-file=.env.local scripts/add-brief-topic.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

const STEPS: Array<[string, string]> = [
  [
    "topic_kind enum",
    `DO $$ BEGIN
       CREATE TYPE topic_kind AS ENUM ('news', 'theme');
     EXCEPTION WHEN duplicate_object THEN NULL;
     END $$;`,
  ],
  [
    "brief_topic 테이블",
    `CREATE TABLE IF NOT EXISTS brief_topic (
       id serial PRIMARY KEY,
       brief_id integer NOT NULL REFERENCES daily_brief(id) ON DELETE CASCADE,
       kind topic_kind NOT NULL,
       rank integer NOT NULL DEFAULT 0,
       title text NOT NULL,
       impact varchar(16) NOT NULL DEFAULT '',
       lines jsonb NOT NULL
     );`,
  ],
  [
    "brief_topic_brief_idx 인덱스",
    `CREATE INDEX IF NOT EXISTS brief_topic_brief_idx
       ON brief_topic (brief_id, kind, rank);`,
  ],
];

async function main() {
  for (const [name, stmt] of STEPS) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }
  const res = await db.execute<{ n: string }>(
    sql.raw("SELECT count(*)::text AS n FROM brief_topic"),
  );
  const rows = (Array.isArray(res) ? res : res.rows) as Array<{ n: string }>;
  console.log(`brief_topic 행 ${rows[0]?.n ?? "?"}건`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
