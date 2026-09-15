/**
 * 원본 리포트 → Neon 적재.
 *   npm run ingest -- --dry-run            최신 회차 미리보기 (DB 접속 없음)
 *   npm run ingest -- --date 2026-09-08    특정 일자
 *   npm run ingest -- --publish            검사 통과 시 published 상태로 적재
 *   npm run ingest -- --session am         그 날짜의 오전(프리마켓)판만
 *
 * 세션을 지정하지 않으면 그날 있는 회차를 전부 적재한다(오전판 + 오후판).
 *
 * 원본 파일은 읽기만 한다. 기존 텔레그램 파이프라인은 건드리지 않는다.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import {
  buildPayload, SOURCE_ALLOW,
  type BriefPayload, type BriefSession, type MarketData,
} from "../src/lib/extract";
import { assertObjectClean, EquityMentionError, scan } from "../src/lib/guard";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const ROOT = process.env.REPORT_ROOT ?? "../요약/뉴스";

/** 그 날짜 폴더에서 나온 회차 하나. */
interface Run {
  dir: string;
  tradeDate: string;
  runId: string;
  session: BriefSession;
}

/**
 * 원본이 적어 둔 작성 기준시각을 읽는다. 예: `> 작성 기준시각: 2026-09-08 07:42 KST`
 * 여기서 뽑는 건 시각뿐이다. 시장 수치는 원문에서 절대 읽지 않는다(fetch_market.py 담당).
 */
function writtenAt(dir: string): number | null {
  for (const name of SOURCE_ALLOW) {
    const p = join(dir, name);
    if (!existsSync(p)) continue;
    const head = readFileSync(p, "utf8").slice(0, 2000);
    const m = head.match(/작성\s*기준시각[^0-9]*\d{4}-\d{2}-\d{2}\s+(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 100 + Number(m[2]);
  }
  return null;
}

/**
 * 회차가 오전판인지 오후판인지 가른다.
 *   1순위 원본의 작성 기준시각   2순위 폴더명의 HHMM (run-1535)   3순위 fallback
 * 12:00 전이면 프리마켓(am)이다. 실제 분포는 07:4x와 15:3x로 멀찍이 갈려 있다.
 *
 * 2026-08-26 이전 회차에는 "작성 기준시각" 줄이 없다. 그런 날은 폴더 구조가 근거다
 * (run-HHMM/이 따로 있으면 루트에 남은 쪽이 오전판) — findRuns가 fallback으로 넘긴다.
 */
function sessionOf(dir: string, runId: string, fallback: BriefSession = "pm"): BriefSession {
  const hhmm = writtenAt(dir) ?? (/\d/.test(runId) ? Number(runId.replace(/\D/g, "")) : NaN);
  if (!Number.isFinite(hhmm)) return fallback;
  return hhmm < 1200 ? "am" : "pm";
}

/**
 * REPORT_ROOT/{YYYY}/{MM}/{YYYY-MM-DD}/ 아래의 회차를 전부 찾는다.
 *
 * 원본 루틴은 하루 두 번 쓰고, 두 판이 서로 다른 자리에 놓인다.
 *   날짜 폴더 루트  — 07:4x 프리마켓 에디션
 *   run-HHMM/       — 15:3x 마감 종합
 * 둘 중 하나만 있는 날도 있다(공휴일 직전, 루틴 중단 등). 있는 것만 돌려준다.
 */
function findRuns(date?: string): Run[] {
  const dayDirs: string[] = [];
  const walk = (p: string, depth: number) => {
    if (depth > 3 || !existsSync(p)) return;
    for (const e of readdirSync(p)) {
      const full = join(p, e);
      if (!statSync(full).isDirectory()) continue;
      if (/^\d{4}-\d{2}-\d{2}$/.test(e)) dayDirs.push(full);
      else walk(full, depth + 1);
    }
  };
  walk(ROOT, 0);
  if (!dayDirs.length) throw new Error(`리포트를 찾을 수 없습니다: ${ROOT}`);
  dayDirs.sort();
  const dayDir = date ? dayDirs.find((d) => d.endsWith(date)) : dayDirs[dayDirs.length - 1];
  if (!dayDir) throw new Error(`${date} 회차가 없습니다.`);
  const tradeDate = basename(dayDir);

  const hasSources = (d: string) => SOURCE_ALLOW.some((n) => existsSync(join(d, n)));

  const runDirs = readdirSync(dayDir)
    .filter((x) => /^run-/.test(x))
    .sort()
    .map((e) => ({ name: e, dir: join(dayDir, e) }))
    .filter((r) => statSync(r.dir).isDirectory() && hasSources(r.dir));

  const found: Run[] = [];
  // 날짜 폴더 루트에 원본이 바로 놓인 회차. 보통 프리마켓판이고,
  // 오후 루틴만 돈 날은 여기에 마감판이 놓이기도 한다(2026-09-07 등).
  // 시각을 못 읽는 옛 회차는 run-HHMM/의 존재로 가른다 — 그게 따로 있으면 루트는 오전판이다.
  if (hasSources(dayDir)) {
    const fallback: BriefSession = runDirs.length ? "am" : "pm";
    found.push({
      dir: dayDir, tradeDate, runId: "run-none",
      session: sessionOf(dayDir, "run-none", fallback),
    });
  }
  for (const r of runDirs) {
    found.push({ dir: r.dir, tradeDate, runId: r.name, session: sessionOf(r.dir, r.name) });
  }
  if (!found.length) throw new Error(`${tradeDate}에 허용된 원본이 없습니다.`);

  // 같은 세션이 둘 이상이면 뒤에 온 것(더 늦은 회차)만 남긴다.
  const bySession = new Map<BriefSession, Run>();
  for (const r of found) bySession.set(r.session, r);
  return [...bySession.values()].sort((a, b) => (a.session === "am" ? -1 : 1));
}

function readSources(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of SOURCE_ALLOW) {
    const p = join(dir, name);
    if (existsSync(p)) out[name] = readFileSync(p, "utf8");
  }
  if (!Object.keys(out).length) throw new Error(`${dir}에 허용된 원본이 없습니다.`);
  return out;
}

/**
 * scripts/fetch_market.py가 받아 둔 실제 시세.
 * 없으면 수치 없이 진행한다. 리포트 산문에서 숫자를 추정하지 않는다.
 */
function readMarket(tradeDate: string, session: BriefSession): MarketData {
  // 오전판은 장이 열리기도 전에 쓴 글이다. 그날 종가를 붙이면 글과 수치가 어긋난다.
  if (session === "am") return { tradeDate };
  const p = join(import.meta.dirname, "..", "data", "market", `${tradeDate}.json`);
  if (!existsSync(p)) {
    console.warn(
      `  ! 시세 파일 없음: ${p}
` +
        `    먼저 실행하세요:  python scripts/fetch_market.py ${tradeDate}`
    );
    return { tradeDate };
  }
  return JSON.parse(readFileSync(p, "utf8")) as MarketData;
}

function narrativeOf(p: BriefPayload) {
  return {
    headline: p.headline, summary: p.summary,
    macroCommentary: p.macroCommentary, marketSummary: p.marketSummary,
  };
}

const SESSION_KO: Record<BriefSession, string> = { am: "프리마켓", pm: "마감 종합" };

function report(p: BriefPayload) {
  console.log(`\n■ ${p.tradeDate} / ${SESSION_KO[p.session]} / ${p.runId}`);
  console.log(`  헤드라인 : ${p.headline}`);
  console.log(`  지수 ${p.indices.length} / 지표 ${p.macros.length} / 수급 ${p.flows.length} / 섹터 ${p.sectors.length}`);
  for (const i of p.indices) console.log(`    [지수] ${i.indexName} ${i.close ?? "-"} (${i.changePct ?? "-"}%)`);
  for (const m of p.macros) console.log(`    [지표] ${m.name} ${m.value ?? "-"}${m.unit} (${m.changePct ?? "-"}%)`);
  for (const f of p.flows) console.log(`    [수급] ${f.market} ${f.investor} ${f.netAmount ?? "-"}`);
  for (const s of p.sectors) console.log(`    [섹터] ${s.sectorName} (${s.changePct ?? "-"}%)`);
  const KIND_KO = { news: "뉴스", theme: "테마", sector: "업종" } as const;
  const count = (k: string) => p.topics.filter((t) => t.kind === k).length;
  console.log(
    `  뉴스 ${count("news")} / 테마 ${count("theme")} / 업종 ${count("sector")}`,
  );
  for (const t of p.topics)
    console.log(
      `    [${KIND_KO[t.kind]}] ${t.title}${t.impact ? ` (영향도 ${t.impact})` : ""}`,
    );
  console.log(`  본문 : 매크로 ${p.macroCommentary.length}자 / 시장 ${p.marketSummary.length}자`);
  const bySection = new Map<string, number>();
  for (const d of p.dropped) bySection.set(d.reason, (bySection.get(d.reason) ?? 0) + 1);
  console.log(`  제외 블록 ${p.dropped.length}건 ${JSON.stringify(Object.fromEntries(bySection))}`);
  const terms = [...new Set(p.dropped.flatMap((d) => d.matches ?? []))];
  if (terms.length) console.log(`    제외 사유 종목표기: ${terms.slice(0, 25).join(", ")}${terms.length > 25 ? " …" : ""}`);
}

/** 회차 하나를 검사하고 적재한다. 적재했으면 brief_id, dry-run이면 null. */
async function ingestOne(run: Run): Promise<number | null> {
  console.log(`\n원본: ${run.dir} (읽기 전용)`);
  const payload = buildPayload(
    readSources(run.dir),
    run.tradeDate,
    run.runId,
    readMarket(run.tradeDate, run.session),
    run.session,
  );
  report(payload);

  // 최종 관문. 구조화 필드와 본문 전부를 검사한다. 한 건이라도 걸리면 적재하지 않는다.
  try {
    assertObjectClean(narrativeOf(payload), "ingest:narrative");
    // 구조화 필드는 텍스트 스캔이 아니라 레지스트리 소속 검증으로 이미 확정됐다
    // (buildPayload 내 assertRegistryOnly). 여기서는 본문만 다시 본다.
  } catch (e) {
    if (e instanceof EquityMentionError) {
      console.error(`\n✗ 최종 검사 실패 — 적재 중단\n${e.message}`);
      process.exit(1);
    }
    throw e;
  }
  console.log("\n✓ 최종 검사 통과 — 종목 언급 0건");

  if (flag("dry-run")) {
    console.log("(dry-run: DB 적재 안 함)");
    console.log("\n--- 본문 미리보기 ---\n" + payload.marketSummary.slice(0, 600));
    return null;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 없습니다. .env.local에 Neon 연결 문자열을 넣거나 --dry-run을 쓰세요.");
    process.exit(2);
  }
  const { persist } = await import("../src/lib/persist");
  const id = await persist(payload, flag("publish"));
  console.log(`✓ 적재 완료 brief_id=${id} status=${flag("publish") ? "published" : "draft"}`);
  return id;
}

async function main() {
  const want = opt("session");
  if (want && want !== "am" && want !== "pm") {
    console.error(`--session은 am 또는 pm입니다: ${want}`);
    process.exit(2);
  }

  const all = findRuns(opt("date"));
  const runs = want ? all.filter((r) => r.session === want) : all;
  if (!runs.length) {
    const date = all[0]?.tradeDate ?? opt("date");
    console.error(`${date}에 ${want} 회차가 없습니다. (있는 회차: ${all.map((r) => r.session).join(", ")})`);
    process.exit(2);
  }
  if (!want && all.length > 1) {
    console.log(`${all[0].tradeDate} 회차 ${all.length}건: ${all.map((r) => r.session).join(" + ")}`);
  }

  for (const run of runs) await ingestOne(run);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
