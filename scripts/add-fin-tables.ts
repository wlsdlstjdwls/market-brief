/**
 * `fin_run`, `fin_stock` 표를 만든다. 1회성이고 **아무것도 지우지 않는다.**
 * 연동 규격: stock-analysis `docs/market-brief-재무연동.md` 3.1장.
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 기존 스크립트들과 같다 — 원격에 스키마에서 빠진
 * `subscriber`, `subscription`이 남아 있어 push가 그 둘을 DROP하려 든다.
 *
 *   npx tsx --env-file=.env.local scripts/add-fin-tables.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

const STEPS: [string, string][] = [
  [
    "fin_run 테이블",
    `CREATE TABLE IF NOT EXISTS fin_run (
       run_date    date PRIMARY KEY,
       run_at      text NOT NULL,
       source_path text NOT NULL,
       fails       jsonb NOT NULL DEFAULT '[]'::jsonb,
       summary     text,
       ingested_at timestamptz NOT NULL DEFAULT now()
     );`,
  ],
  [
    "fin_stock 테이블",
    `CREATE TABLE IF NOT EXISTS fin_stock (
       run_date   date NOT NULL REFERENCES fin_run(run_date) ON DELETE CASCADE,
       code       varchar(6) NOT NULL,
       name       text NOT NULL,
       market     text,
       group_name text NOT NULL,
       ord        integer NOT NULL,
       snap       jsonb NOT NULL,
       detail     jsonb NOT NULL
     );`,
  ],
  [
    "fin_stock 키",
    `CREATE UNIQUE INDEX IF NOT EXISTS fin_stock_pk ON fin_stock (run_date, code);`,
  ],
];

async function main() {
  for (const [name, stmt] of STEPS) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
