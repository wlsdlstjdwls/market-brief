/**
 * 회차 중간에 관심종목을 더할 때 쓴다. 원본 수집기(`fin_trend.py`)로 새 종목만 따로 받은 결과를
 * 최신 종목 회차 안에 **끼워 넣는다.** 이미 있는 종목은 건너뛴다. 회차를 새로 만들지 않는다.
 *
 *   python fin_trend.py --watchlist 새종목만.md --out out/run     (stock-analysis에서, 출력은 바깥으로)
 *   npx tsx --env-file=.env.local scripts/add-fin-stocks.ts --dir out/run [--dry-run]
 *
 * 다음 토요일 회차부터는 관심종목 문서(4.4절)를 그대로 읽으므로 이 스크립트가 필요 없다.
 * 끼운 뒤에 `fetch-div.ts`(배당 내역), `stock-news.ts`(종목 뉴스)를 다시 돌린다.
 * 순서(`ord`)는 회차 맨 뒤에 붙인다. 그룹순 정렬은 그룹 안에서 ord를 보므로 기존 그룹에 섞여 들어간다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";
import { toCard, trimData } from "../src/lib/stocks";

const argv = process.argv.slice(2);
const dir = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : null;
if (!dir) throw new Error("--dir 를 주세요 (fin_trend.py 출력 폴더)");
const dry = argv.includes("--dry-run");
const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

const data = trimData(JSON.parse(readFileSync(join(dir, "data.json"), "utf8")));
const run = rowsOf<{ d: string }>(await db.execute(sql`SELECT max(run_date)::text AS d FROM fin_run`))[0]?.d;
if (!run) throw new Error("종목 회차가 없다");

const have = new Set(
  rowsOf<{ code: string }>(await db.execute(sql`SELECT code FROM fin_stock WHERE run_date = ${run}`)).map((r) => r.code),
);
const maxOrd =
  rowsOf<{ m: number | null }>(await db.execute(sql`SELECT max(ord) AS m FROM fin_stock WHERE run_date = ${run}`))[0]?.m ?? -1;

const add = data.stocks.filter((s) => !have.has(s.code));
for (const s of data.stocks) console.log(`  ${s.name} (${s.code}, ${s.sector}) ${have.has(s.code) ? "이미 있음, 건너뜀" : "추가"}`);

if (!dry && add.length) {
  await db.batch(
    add.map((s, i) =>
      db.execute(sql`
        INSERT INTO fin_stock (run_date, code, name, market, group_name, ord, snap, detail)
        VALUES (${run}, ${s.code}, ${s.name}, ${s.market}, ${s.sector}, ${Number(maxOrd) + 1 + i},
                ${JSON.stringify(toCard(s))}::jsonb, ${JSON.stringify(s)}::jsonb)`),
    ) as unknown as Parameters<typeof db.batch>[0],
  );
}
console.log(`${dry ? "dry-run " : ""}${run} 회차에 ${add.length}종목 ${dry ? "추가 예정" : "추가"}`);
