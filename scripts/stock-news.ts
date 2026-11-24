/**
 * 종목별 뉴스를 종목 브리핑 최신 회차의 종목 줄에 붙인다(`fin_stock.detail.news`). 규칙은 `src/lib/stock-news.ts`.
 *
 *   REPORT_ROOT=…/요약/뉴스 npx tsx --env-file=.env.local scripts/stock-news.ts [--dry-run] [--days 30]
 *
 * **매번 최근 N일 원고를 전부 다시 읽어 통째로 갈아 끼운다.** 토요일 적재(`ingest-fin.ts`)가 종목 줄을
 * 새로 넣어 이 값이 사라져도 다음 실행에서 그대로 복원된다. 그래서 일일 갱신과 토요일 적재 뒤에 둘 다 건다.
 * 뉴스가 없는 종목은 빈 배열로 덮는다(30일이 지난 뉴스가 남지 않게).
 *
 * 원고는 읽기 전용으로 연다. 날짜 폴더 루트의 `종목뉴스.md`가 아침판, `run-HHMM/` 안의 것이 마감판이다.
 * `detail`의 다른 값은 건드리지 않는다(jsonb_set).
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import {
  NEWS_ALIASES, nameKey, namesIn, parseStockNews, trimNews, type StockNewsItem,
} from "../src/lib/stock-news";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry-run");
const days = Number(argv.includes("--days") ? argv[argv.indexOf("--days") + 1] : 30);
const ROOT = process.env.REPORT_ROOT ?? "../요약/뉴스";

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

/** 오늘(KST)부터 거꾸로 N일 */
function recentDates(n: number): string[] {
  const now = Date.now() + 9 * 3600_000;
  return Array.from({ length: n }, (_, i) => new Date(now - i * 86400_000).toISOString().slice(0, 10));
}

/** 그날의 원고 파일: 루트 = am, run-* = pm(가장 늦은 것 하나) */
function filesOf(date: string): Array<{ s: "am" | "pm"; path: string }> {
  const day = join(ROOT, date.slice(0, 4), date.slice(5, 7), date);
  if (!existsSync(day)) return [];
  const out: Array<{ s: "am" | "pm"; path: string }> = [];
  const root = join(day, "종목뉴스.md");
  if (existsSync(root)) out.push({ s: "am", path: root });
  const runs = readdirSync(day).filter((e) => /^run-\d{4}$/.test(e)).sort();
  const last = runs.reverse().find((r) => existsSync(join(day, r, "종목뉴스.md")));
  if (last) out.push({ s: "pm", path: join(day, last, "종목뉴스.md") });
  return out;
}

const runDate = rowsOf<{ d: string }>(await db.execute(sql`SELECT max(run_date)::text AS d FROM fin_run`))[0]?.d;
if (!runDate) throw new Error("종목 브리핑 회차가 없다");

const stocks = rowsOf<{ code: string; name: string }>(
  await db.execute(sql`SELECT code, name FROM fin_stock WHERE run_date = ${runDate}`),
);
const byKey = new Map(stocks.map((s) => [nameKey(s.name), s.code]));
for (const [alias, name] of Object.entries(NEWS_ALIASES)) {
  const code = byKey.get(nameKey(name));
  if (code) byKey.set(nameKey(alias), code);
}
// 제목 안에서 찾을 이름들(관심종목 이름 + 별칭)
const allNames = [...stocks.map((s) => s.name), ...Object.keys(NEWS_ALIASES)];

const news = new Map<string, StockNewsItem[]>(stocks.map((s) => [s.code, []]));
const unmatched = new Map<string, number>();
let files = 0;
for (const d of recentDates(days)) {
  for (const f of filesOf(d)) {
    files++;
    for (const e of parseStockNews(readFileSync(f.path, "utf8"))) {
      const found = namesIn(e.heading, allNames);
      if (!found.length) unmatched.set(e.heading.slice(0, 20), (unmatched.get(e.heading.slice(0, 20)) ?? 0) + 1);
      const codes = new Set(found.map((n) => byKey.get(nameKey(n))).filter((c): c is string => !!c));
      for (const code of codes)
        news.get(code)!.push({ d, s: f.s, ...(e.title ? { title: e.title } : {}), text: e.text, src: e.src });
    }
  }
}

let withNews = 0;
for (const s of stocks) {
  const items = trimNews(news.get(s.code)!);
  if (items.length) withNews++;
  if (!dry) {
    await db.execute(sql`
      UPDATE fin_stock SET detail = jsonb_set(detail, '{news}', ${JSON.stringify(items)}::jsonb, true)
      WHERE run_date = ${runDate} AND code = ${s.code}`);
  }
}

console.log(
  `${dry ? "dry-run " : ""}${runDate} 회차: 원고 ${files}편, 뉴스 붙은 종목 ${withNews}/${stocks.length}` +
    (dry ? " (적재 안 함)" : ""),
);
const top = [...unmatched].sort((a, b) => b[1] - a[1]).slice(0, 15);
if (top.length) console.log(`관심종목 밖 꼭지(상위): ${top.map(([n, c]) => `${n} ${c}`).join(", ")}`);
