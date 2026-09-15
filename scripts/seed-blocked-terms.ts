/** data/ticker_names.json → blocked_term 테이블 시드. */
import { db } from "../src/db/index";
import { blockedTerm } from "../src/db/schema";
import names from "../data/ticker_names.json";

const EQUITY_PHRASES = [
  "관련주", "수혜주", "대장주", "테마주", "주도주", "추천종목", "관심종목",
  "매수추천", "매도추천", "목표주가", "목표가", "급등주", "갭상승", "갭하락", "종목추천",
];

async function main() {
  const map = names as Record<string, string>;
  const rows = [
    ...Object.keys(map).map((code) => ({ term: code, termType: "code" as const })),
    ...[...new Set(Object.values(map))].map((n) => ({ term: n, termType: "name" as const })),
    ...EQUITY_PHRASES.map((t) => ({ term: t, termType: "phrase" as const })),
  ];
  for (let i = 0; i < rows.length; i += 500) {
    await db.insert(blockedTerm).values(rows.slice(i, i + 500)).onConflictDoNothing();
  }
  console.log(`금칙어 ${rows.length}건 시드 완료`);
}
main().catch((e) => { console.error(e); process.exit(1); });
