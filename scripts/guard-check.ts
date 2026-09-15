/**
 * 종목 차단 필터 점검 CLI.
 *   npm run guard -- <파일|폴더> [...]
 * block 위반이 있으면 exit 1.
 */
import { readFileSync, statSync, readdirSync } from "node:fs";
import { join, extname } from "node:path";
import { scan } from "../src/lib/guard";

function collect(p: string): string[] {
  if (statSync(p).isFile()) return [p];
  return readdirSync(p)
    .flatMap((f) => collect(join(p, f)))
    .filter((f) => extname(f) === ".md");
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("사용법: npm run guard -- <파일|폴더>");
  process.exit(2);
}

let blocked = 0;
for (const target of args) {
  for (const file of collect(target)) {
    const r = scan(readFileSync(file, "utf8"));
    blocked += r.blocking.length;
    console.log(`\n=== ${file}`);
    console.log(`block ${r.blocking.length}건 / review ${r.review.length}건`);
    const u = (vs: typeof r.violations) => [...new Set(vs.map((v) => v.match))];
    console.log(`  block 고유: ${u(r.blocking).slice(0, 40).join(", ") || "없음"}`);
    console.log(`  review 고유: ${u(r.review).slice(0, 40).join(", ") || "없음"}`);
  }
}
console.log(`\n총 block ${blocked}건`);
process.exit(blocked ? 1 : 0);
