/**
 * `page_view` 표를 만든다. 1회성이고 **아무것도 지우지 않는다.**
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 기존 스크립트들과 같다 — 원격에 스키마에서 빠진
 * `subscriber`·`subscription`이 남아 있어 push가 그 둘을 DROP하려 든다.
 *
 *   npx tsx --env-file=.env.local scripts/add-page-view.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

const STEPS: [string, string][] = [
  [
    "page_view 테이블",
    `CREATE TABLE IF NOT EXISTS page_view (
       id            bigserial PRIMARY KEY,
       visitor_id    uuid NOT NULL,
       path          varchar(200) NOT NULL,
       referrer_host varchar(100),
       entry         boolean NOT NULL DEFAULT false,
       created_at    timestamptz NOT NULL DEFAULT now()
     );`,
  ],
  [
    "시각 인덱스",
    `CREATE INDEX IF NOT EXISTS page_view_created_idx ON page_view (created_at);`,
  ],
  [
    "방문자 인덱스",
    `CREATE INDEX IF NOT EXISTS page_view_visitor_idx ON page_view (visitor_id, created_at);`,
  ],
  [
    // 유입 집계는 entry만 본다. 부분 인덱스로 두면 표가 커져도 그 질의만 싸게 돈다
    "유입 부분 인덱스",
    `CREATE INDEX IF NOT EXISTS page_view_entry_idx
       ON page_view (created_at) WHERE entry;`,
  ],
];

async function main() {
  for (const [name, stmt] of STEPS) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }
  const res = await db.execute<{ n: string }>(
    sql.raw("SELECT count(*)::text AS n FROM page_view"),
  );
  const rows = (Array.isArray(res) ? res : res.rows) as Array<{ n: string }>;
  console.log(`page_view 행 ${rows[0]?.n ?? "?"}건`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
