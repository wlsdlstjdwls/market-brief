/**
 * 평일 공시 갱신 적재. `fin_daily.py`가 다시 수집한 종목만 최신 회차 안에서 갈아 끼운다.
 * 회차(`fin_run`)는 새로 만들지 않는다(2026-11-19 사용자 지시, "회차는 토요일만").
 *
 *   npx tsx --env-file=.env.local scripts/patch-fin.ts --dir out [--dry-run]
 *
 * `--dir` 아래 `changes.json`과 `run/data.json`을 읽는다. 바뀐 종목이 없으면 아무것도 안 한다.
 * 다시 수집에 실패한 종목은 건너뛴다 — `seen`이 안 남으므로 다음 날 다시 시도된다.
 * 그룹(`group_name`)과 순서(`ord`)는 회차 것을 지킨다. `snap`, `detail`, 이름, 시장만 바꾼다.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { applyPatch, toCard, trimData, type Stock } from "../src/lib/stocks";

const argv = process.argv.slice(2);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const rowsOf = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];

type Changes = {
  on: string;
  checked: number;
  changed: Array<{ code: string; name: string; group: string; titles: string[]; seen: string[] }>;
};

async function main() {
  const dir = opt("dir");
  if (!dir) throw new Error("--dir 를 주세요.");
  const changes = JSON.parse(readFileSync(join(dir, "changes.json"), "utf8")) as Changes;
  if (!changes.changed.length) {
    console.log(`${changes.on} 새 공시 없음 (${changes.checked}종목 확인)`);
    return;
  }
  const dataPath = join(dir, "run", "data.json");
  if (!existsSync(dataPath)) throw new Error(`${dataPath} 가 없습니다. 수집기가 실패했나 봅니다.`);
  const fresh = new Map(trimData(JSON.parse(readFileSync(dataPath, "utf8"))).stocks.map((s) => [s.code, s]));

  const { db } = await import("../src/db/index");
  const run = rowsOf<{ run_date: string }>(
    await db.execute(sql`SELECT run_date::text AS run_date FROM fin_run ORDER BY run_date DESC LIMIT 1`),
  )[0];
  if (!run) throw new Error("fin_run에 회차가 없습니다.");

  const updates = [];
  for (const c of changes.changed) {
    const s = fresh.get(c.code);
    if (!s) {
      console.log(`  ${c.name}: 다시 수집 실패, 건너뜀 (내일 다시 시도된다)`);
      continue;
    }
    const prev = rowsOf<{ detail: Stock }>(
      await db.execute(sql`SELECT detail FROM fin_stock WHERE run_date = ${run.run_date} AND code = ${c.code}`),
    )[0];
    if (!prev) {
      console.log(`  ${c.name}: ${run.run_date} 회차에 없는 종목, 건너뜀`);
      continue;
    }
    const merged = applyPatch(s, prev.detail, { on: changes.on, titles: c.titles, seen: c.seen });
    console.log(`  ${c.name}: ${merged.snap.last_q ?? "-"} 분기, 공시 ${c.titles.join(", ")}`);
    updates.push(sql`
      UPDATE fin_stock SET name = ${merged.name}, market = ${merged.market},
        snap = ${JSON.stringify(toCard(merged))}::jsonb, detail = ${JSON.stringify(merged)}::jsonb
      WHERE run_date = ${run.run_date} AND code = ${merged.code}`);
  }

  if (argv.includes("--dry-run") || !updates.length) {
    console.log(`${updates.length}종목 갱신 대상${argv.includes("--dry-run") ? " (dry-run, 적재 안 함)" : ""}`);
    return;
  }
  await db.batch(updates.map((q) => db.execute(q)) as unknown as Parameters<typeof db.batch>[0]);
  console.log(`✓ ${run.run_date} 회차에서 ${updates.length}종목 갱신 (${changes.on} 공시 반영)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
