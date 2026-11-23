/**
 * 해외 종목 적재 (2026-11-23 추가). `fin_global.py`가 만든 data.json을 **최신 회차 안에** 넣는다.
 * 회차(`fin_run`)는 새로 만들지 않는다 — 회차는 국내 토요일 판이 만든다.
 *
 *   npx tsx --env-file=.env.local scripts/ingest-global.ts --dir out/global [--date 2026-11-21] [--dry-run]
 *
 * 그 회차의 해외 줄(`detail->>'cur' = 'USD'`)을 지우고 다시 넣는다. 국내 줄은 건드리지 않는다.
 * 코드 모양으로 가리지 않는 이유: 새 KRX 코드에는 영문이 섞인다(`0088M0`).
 * 순서(`ord`)는 국내 종목 뒤로 잇는다. 그룹은 해외 관심종목 파일(`data/global-watchlist.json`) 것이다.
 *
 * 토요일 워크플로는 국내 적재(`ingest-fin.ts`, 그 회차를 통째로 갈아 끼운다) **뒤에** 이걸 돌린다.
 * 순서가 바뀌면 국내 적재가 해외 줄을 지운다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { toCard, trimData } from "../src/lib/stocks";

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rowsOf = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];

async function main() {
  const dir = opt("dir");
  if (!dir) throw new Error("--dir 를 주세요.");
  const raw = JSON.parse(readFileSync(join(dir, "data.json"), "utf8")) as { stocks: Array<Record<string, unknown>> };
  // 수집기가 cur를 적지만, 빠져도 해외로 적재되게 한 번 더 박는다
  for (const s of raw.stocks) s.cur = "USD";
  const data = trimData(raw);
  for (const s of data.stocks) {
    if (s.cur !== "USD") throw new Error(`${s.name}: 통화가 USD가 아닙니다.`);
  }

  const { db } = await import("../src/db/index");
  const date =
    opt("date") ??
    rowsOf<{ d: string }>(
      await db.execute(sql`SELECT run_date::text AS d FROM fin_run ORDER BY run_date DESC LIMIT 1`),
    )[0]?.d;
  if (!date) throw new Error("fin_run에 회차가 없습니다. 국내 회차가 먼저 있어야 한다.");
  const base = rowsOf<{ m: number | null }>(
    await db.execute(
      sql`SELECT max(ord) AS m FROM fin_stock WHERE run_date = ${date} AND coalesce(detail->>'cur', 'KRW') <> 'USD'`,
    ),
  )[0]?.m;
  if (base === null || base === undefined) throw new Error(`${date} 회차에 국내 종목이 없습니다.`);

  console.log(`${date} 회차에 해외 ${data.stocks.length}종목 (실패 ${data.fails.length})`);
  for (const [n, why] of data.fails) console.log(`  실패 ${n}: ${why}`);
  if (argv.includes("--dry-run")) {
    for (const s of data.stocks) console.log(`  ${s.sector} / ${s.name} (${s.code}) ${s.snap.price} ${s.snap.last_q ?? "-"}`);
    console.log("dry-run, 적재 안 함");
    return;
  }

  const inserts = data.stocks.map(
    (s, i) => sql`
      INSERT INTO fin_stock (run_date, code, name, market, group_name, ord, snap, detail)
      VALUES (${date}, ${s.code}, ${s.name}, ${s.market}, ${s.sector}, ${base + 1 + i},
              ${JSON.stringify(toCard(s))}::jsonb, ${JSON.stringify(s)}::jsonb)`,
  );
  await db.batch([
    db.execute(sql`DELETE FROM fin_stock WHERE run_date = ${date} AND detail->>'cur' = 'USD'`),
    ...inserts.map((q) => db.execute(q)),
  ] as unknown as Parameters<typeof db.batch>[0]);
  console.log(`✓ ${date} 회차 해외 ${data.stocks.length}종목 적재`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
