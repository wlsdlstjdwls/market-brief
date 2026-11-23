/**
 * 종목 브리핑 회차의 종목마다 배당 지급 건별 내역을 받아 `fin_stock.detail.divEvents`에 넣는다.
 * (2026-11-23 사용자 지시, "분기별 배당이랑 특별배당도 따로 보여 줘". 분류는 `src/lib/dividends.ts`)
 *
 *   npx tsx --env-file=.env.local scripts/fetch-div.ts            # 최신 회차
 *   npx tsx --env-file=.env.local scripts/fetch-div.ts --date 2026-11-21
 *   ... --dry-run                                                  # 받기만 하고 적재 안 함
 *
 * 원천은 Yahoo 시세(배당 이벤트). 키가 없고 국내(.KS/.KQ), 해외 티커를 같이 받는다.
 * 원본 수집기(stock-analysis `fin_trend.py`)는 고치지 않는다 — DART 사업보고서 배당은 연간 합계라
 * 분기 몫과 특별배당이 안 갈려서 이쪽에서 따로 받아 붙인다.
 *
 * `detail`의 다른 값은 건드리지 않고 `divEvents` 키 하나만 바꾼다(jsonb_set). 국내 토요일 적재
 * (`ingest-fin.ts`)가 줄을 통째로 갈아 끼우므로 워크플로에서 적재 **뒤에** 돈다. 평일 공시 갱신
 * (`patch-fin.ts`)은 `applyPatch`가 이전 값을 물려받는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db";
import type { DivEvent } from "../src/lib/dividends";

const argv = process.argv.slice(2);
const dateArg = argv.includes("--date") ? argv[argv.indexOf("--date") + 1] : null;
const dry = argv.includes("--dry-run");

/** 최근 몇 해 치를 담나. 연도별 합계 5칸과 특별배당 판정에 충분하다 */
const RANGE = "6y";

type Row = { code: string; name: string; market: string | null; cur: string | null };

const rowsOf = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[]));

function symbolOf(r: Row): string | null {
  if (r.cur === "USD") return r.code;
  if (!/^\d{6}$/.test(r.code)) return null;
  return r.code + (r.market === "코스닥" ? ".KQ" : ".KS");
}

async function fetchEvents(symbol: string): Promise<DivEvent[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${RANGE}&interval=1mo&events=div`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (thebriefing.kr market-brief)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as {
    chart?: { result?: Array<{ events?: { dividends?: Record<string, { date: number; amount: number }> } }> };
  };
  const ev = j.chart?.result?.[0]?.events?.dividends ?? {};
  return Object.values(ev)
    .map((e) => ({ d: new Date(e.date * 1000).toISOString().slice(0, 10), amt: e.amount }))
    .filter((e) => Number.isFinite(e.amt) && e.amt > 0)
    .sort((a, b) => (a.d < b.d ? -1 : 1));
}

const runDate =
  dateArg ??
  rowsOf<{ d: string }>(await db.execute(sql`SELECT max(run_date)::text AS d FROM fin_run`))[0]?.d;
if (!runDate) throw new Error("회차가 없다");

const stocks = rowsOf<Row>(
  await db.execute(sql`SELECT code, name, market, detail->>'cur' AS cur FROM fin_stock WHERE run_date = ${runDate} ORDER BY ord`),
);

let ok = 0;
const fails: string[] = [];
for (const s of stocks) {
  const symbol = symbolOf(s);
  if (!symbol) continue;
  try {
    const events = await fetchEvents(symbol);
    ok++;
    console.log(`  ${s.name} (${symbol}) ${events.length}건`);
    if (!dry) {
      await db.execute(sql`
        UPDATE fin_stock SET detail = jsonb_set(detail, '{divEvents}', ${JSON.stringify(events)}::jsonb, true)
        WHERE run_date = ${runDate} AND code = ${s.code}`);
    }
  } catch (e) {
    fails.push(`${s.name}: ${(e as Error).message}`);
  }
  await new Promise((r) => setTimeout(r, 250)); // 원천에 예의
}

console.log(`${dry ? "dry-run " : ""}${runDate} 회차 ${ok}/${stocks.length}종목 배당 내역${dry ? " (적재 안 함)" : " 적재"}`);
if (fails.length) console.warn(`실패 ${fails.length}건\n  ${fails.join("\n  ")}`);
