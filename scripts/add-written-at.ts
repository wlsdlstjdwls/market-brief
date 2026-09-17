/**
 * daily_brief에 written_at 컬럼을 추가한다. 추가만 하고 아무것도 지우지 않는다.
 *
 * 원고 머리의 `> 작성 시각: 2026-09-17 07:34 KST` 를 그대로 담는 칸이다.
 * 적재 시각(published_at)과 다르다. 원고가 늦게 올라온 날은 둘이 몇 시간 벌어지고,
 * 화면에 둘 다 찍어야 "아침에는 없었는데 지금은 있다"가 설명된다.
 *
 * `drizzle-kit push`를 쓰지 않는 이유는 add-session.ts와 같다.
 * 원격에 스키마 정의에서 빠진 테이블(subscriber, subscription)이 남아 있어 push가 그걸 DROP하려 든다.
 *
 *   npx tsx --env-file=.env.local scripts/add-written-at.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

const STEPS: Array<[string, string]> = [
  [
    "daily_brief.written_at 컬럼 (옛 행은 null)",
    `ALTER TABLE daily_brief
       ADD COLUMN IF NOT EXISTS written_at timestamptz;`,
  ],
];

async function main() {
  for (const [name, stmt] of STEPS) {
    await db.execute(sql.raw(stmt));
    console.log(`✓ ${name}`);
  }

  const res = await db.execute<{ n: string; filled: string }>(
    sql.raw(
      "SELECT count(*)::text AS n, count(written_at)::text AS filled FROM daily_brief",
    ),
  );
  const rows = (Array.isArray(res) ? res : res.rows) as Array<{ n: string; filled: string }>;
  const r = rows[0];
  if (r) console.log(`  전체 ${r.n}건 중 작성시각 있음 ${r.filled}건`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
