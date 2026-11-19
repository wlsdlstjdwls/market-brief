/**
 * 평일 공시 확인의 대상 목록. 최신 회차의 종목과, 종목마다 이미 본 공시 접수번호를 꺼낸다.
 * `fin_daily.py`가 읽는다. DB를 읽기만 한다.
 *
 *   npx tsx --env-file=.env.local scripts/fin-daily-targets.ts out/targets.json
 */
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { knownReceipts, type Stock } from "../src/lib/stocks";

const rowsOf = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("출력 파일 경로를 주세요.");
  const { db } = await import("../src/db/index");
  const run = rowsOf<{ run_date: string }>(
    await db.execute(sql`SELECT run_date::text AS run_date FROM fin_run ORDER BY run_date DESC LIMIT 1`),
  )[0];
  if (!run) throw new Error("fin_run에 회차가 없습니다.");
  const rows = rowsOf<{ code: string; name: string; group_name: string; detail: Stock }>(
    await db.execute(sql`
      SELECT code, name, group_name, detail FROM fin_stock
      WHERE run_date = ${run.run_date} ORDER BY ord`),
  );
  const stocks = rows.map((r) => ({
    code: r.code,
    name: r.name,
    group: r.group_name,
    known: knownReceipts(r.detail),
  }));
  writeFileSync(out, JSON.stringify({ runDate: run.run_date, stocks }, null, 1));
  console.log(`${run.run_date} 회차 ${stocks.length}종목 → ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
