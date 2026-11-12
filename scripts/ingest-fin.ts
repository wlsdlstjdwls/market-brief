/**
 * 종목 브리핑(주간 재무 추세) 적재. 연동 규격: stock-analysis `docs/market-brief-재무연동.md` 3.2장.
 *
 *   npx tsx --env-file=.env.local scripts/ingest-fin.ts                 # 오늘(KST) 폴더
 *   npx tsx --env-file=.env.local scripts/ingest-fin.ts --date 2026-11-12
 *   npx tsx --env-file=.env.local scripts/ingest-fin.ts --latest        # 가장 최근 폴더
 *   npx tsx scripts/ingest-fin.ts --latest --dry-run                    # DB 없이 미리보기
 *   ... --skip-missing   그 날짜 폴더가 아직 없으면 실패 대신 스킵 (자동 실행용)
 *   ... --force          같은 판이 이미 적재돼 있어도 다시 넣는다
 *
 * 원본 위치는 `STOCK_ROOT` (기본 `../요약/재무`). 그 아래 `YYYY/YYYY-MM-DD/[run-HHMM/]`.
 * 원본은 **읽기만 한다.**
 *
 * 뉴스 적재(`ingest.ts`)와 경로가 완전히 갈린다. `fin_run`, `fin_stock` 두 표만 쓰고
 * 뉴스 쪽 `guard.ts`는 부르지 않는다(이 지면에서는 종목이 정상 데이터다).
 *
 * **이미 있으면 건너뛰는 기준은 날짜가 아니라 판(source_path)이다.** 같은 날 루틴이 다시 돌면
 * `run-1206` 뒤에 `run-1333`이 생긴다. 날짜로만 막으면 고친 판이 영영 안 올라간다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { cleanSummary, pickRun, toCard, trimData } from "../src/lib/stocks";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const ROOT = process.env.STOCK_ROOT ?? "../요약/재무";

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** `ROOT/YYYY/YYYY-MM-DD` 전부, 날짜 순 */
function allDates(): string[] {
  if (!existsSync(ROOT)) return [];
  const out: string[] = [];
  for (const y of readdirSync(ROOT)) {
    if (!/^\d{4}$/.test(y)) continue;
    for (const d of readdirSync(join(ROOT, y))) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) out.push(d);
    }
  }
  return out.sort();
}

const rowsOf = <T>(res: unknown): T[] =>
  (Array.isArray(res) ? res : (res as { rows: T[] }).rows) as T[];

async function main() {
  const date = flag("latest") ? allDates().at(-1) : (opt("date") ?? kstToday());
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`날짜를 정하지 못했습니다 (STOCK_ROOT=${ROOT}).`);
  }

  const dir = join(ROOT, date.slice(0, 4), date);
  if (!existsSync(dir)) {
    if (flag("skip-missing")) {
      console.log(`${date} 폴더 없음, 건너뜀 (${dir})`);
      return;
    }
    throw new Error(`${dir} 가 없습니다.`);
  }

  const run = pickRun(readdirSync(dir), (rel) => existsSync(join(dir, rel, "data.json")));
  if (run === null) {
    if (flag("skip-missing")) {
      console.log(`${date} data.json 없음, 건너뜀`);
      return;
    }
    throw new Error(`${dir} 아래에 data.json이 없습니다.`);
  }

  const base = join(dir, run);
  const sourcePath = [date.slice(0, 4), date, run].filter(Boolean).join("/");
  const data = trimData(JSON.parse(readFileSync(join(base, "data.json"), "utf8")));

  // 주간 요약은 run-HHMM/ 안에만 있을 때가 있다. 고른 판에 없으면 루트를 본다
  const summaryPath = [join(base, "주간요약.md"), join(dir, "주간요약.md")].find(existsSync);
  const summary = summaryPath ? cleanSummary(readFileSync(summaryPath, "utf8")) : null;

  const quarters = new Map<string, number>();
  for (const s of data.stocks) {
    const q = s.snap.last_q ?? "없음";
    quarters.set(q, (quarters.get(q) ?? 0) + 1);
  }
  console.log(
    `${date} ${sourcePath} — ${data.stocks.length}종목, ` +
      `${new Set(data.stocks.map((s) => s.sector)).size}그룹, 요약 ${summary ? `${summary.length}자` : "없음"}`,
  );
  console.log(`  최신 분기: ${[...quarters].map(([q, n]) => `${q} ${n}`).join(", ")}`);
  if (data.fails.length) {
    console.log(`  수집 실패: ${data.fails.map(([n, why]) => `${n}(${why})`).join(", ")}`);
  }

  if (flag("dry-run")) return;

  const { db } = await import("../src/db/index");

  if (!flag("force")) {
    const have = rowsOf<{ source_path: string }>(
      await db.execute(sql`SELECT source_path FROM fin_run WHERE run_date = ${date}`),
    );
    if (have[0]?.source_path === sourcePath) {
      console.log(`이미 적재됨 (${sourcePath}), 건너뜀. 다시 넣으려면 --force`);
      return;
    }
  }

  // neon-http는 대화형 트랜잭션이 없다. batch가 한 트랜잭션으로 묶인다.
  // 회차 한 줄을 갈아끼우고, 그 회차의 종목 줄을 지운 뒤 다시 넣는다.
  const inserts = data.stocks.map(
    (s, i) => sql`
      INSERT INTO fin_stock (run_date, code, name, market, group_name, ord, snap, detail)
      VALUES (${date}, ${s.code}, ${s.name}, ${s.market}, ${s.sector}, ${i},
              ${JSON.stringify(toCard(s))}::jsonb, ${JSON.stringify(s)}::jsonb)`,
  );
  await db.batch([
    db.execute(sql`
      INSERT INTO fin_run (run_date, run_at, source_path, fails, summary)
      VALUES (${date}, ${data.runAt}, ${sourcePath}, ${JSON.stringify(data.fails)}::jsonb, ${summary})
      ON CONFLICT (run_date) DO UPDATE SET
        run_at = excluded.run_at,
        source_path = excluded.source_path,
        fails = excluded.fails,
        summary = excluded.summary,
        ingested_at = now()`),
    db.execute(sql`DELETE FROM fin_stock WHERE run_date = ${date}`),
    ...inserts.map((q) => db.execute(q)),
  ] as unknown as Parameters<typeof db.batch>[0]);
  console.log(`✓ fin_run, fin_stock ${data.stocks.length}행 적재 (${sourcePath})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
