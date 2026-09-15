/**
 * 원본 리포트 → Neon 적재.
 *   npm run ingest -- --dry-run            최신 회차 미리보기 (DB 접속 없음)
 *   npm run ingest -- --date 2026-09-08    특정 일자
 *   npm run ingest -- --publish            검사 통과 시 published 상태로 적재
 *
 * 원본 파일은 읽기만 한다. 기존 텔레그램 파이프라인은 건드리지 않는다.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { buildPayload, SOURCE_ALLOW, type BriefPayload, type MarketData } from "../src/lib/extract";
import { assertObjectClean, EquityMentionError, scan } from "../src/lib/guard";

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const ROOT = process.env.REPORT_ROOT ?? "../요약/뉴스";

/** REPORT_ROOT/{YYYY}/{MM}/{YYYY-MM-DD}/run-XXXX 중 최신 */
function findRun(date?: string): { dir: string; tradeDate: string; runId: string } {
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
  const runs = readdirSync(dayDir).filter((e) => /^run-/.test(e)).sort();
  if (!runs.length) throw new Error(`${dayDir}에 run-* 폴더가 없습니다.`);
  const runId = runs[runs.length - 1];
  return { dir: join(dayDir, runId), tradeDate: basename(dayDir), runId };
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
function readMarket(tradeDate: string): MarketData {
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

function report(p: BriefPayload) {
  console.log(`\n■ ${p.tradeDate} / ${p.runId}`);
  console.log(`  헤드라인 : ${p.headline}`);
  console.log(`  지수 ${p.indices.length} · 지표 ${p.macros.length} · 수급 ${p.flows.length} · 섹터 ${p.sectors.length}`);
  for (const i of p.indices) console.log(`    [지수] ${i.indexName} ${i.close ?? "-"} (${i.changePct ?? "-"}%)`);
  for (const m of p.macros) console.log(`    [지표] ${m.name} ${m.value ?? "-"}${m.unit} (${m.changePct ?? "-"}%)`);
  for (const f of p.flows) console.log(`    [수급] ${f.market} ${f.investor} ${f.netAmount ?? "-"}`);
  for (const s of p.sectors) console.log(`    [섹터] ${s.sectorName} (${s.changePct ?? "-"}%)`);
  console.log(`  본문 : 매크로 ${p.macroCommentary.length}자 / 시장 ${p.marketSummary.length}자`);
  const bySection = new Map<string, number>();
  for (const d of p.dropped) bySection.set(d.reason, (bySection.get(d.reason) ?? 0) + 1);
  console.log(`  제외 블록 ${p.dropped.length}건 ${JSON.stringify(Object.fromEntries(bySection))}`);
  const terms = [...new Set(p.dropped.flatMap((d) => d.matches ?? []))];
  if (terms.length) console.log(`    제외 사유 종목표기: ${terms.slice(0, 25).join(", ")}${terms.length > 25 ? " …" : ""}`);
}

async function main() {
  const { dir, tradeDate, runId } = findRun(opt("date"));
  console.log(`원본: ${dir} (읽기 전용)`);
  const payload = buildPayload(readSources(dir), tradeDate, runId, readMarket(tradeDate));
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
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL이 없습니다. .env.local에 Neon 연결 문자열을 넣거나 --dry-run을 쓰세요.");
    process.exit(2);
  }
  const { persist } = await import("../src/lib/persist");
  const id = await persist(payload, flag("publish"));
  console.log(`✓ 적재 완료 brief_id=${id} status=${flag("publish") ? "published" : "draft"}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
