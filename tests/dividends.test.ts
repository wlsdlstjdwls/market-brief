import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classifyDividends, dividendYears, payCycle } from "../src/lib/dividends";

const samsung = [
  { d: "2025-03-28", amt: 365 }, { d: "2025-06-27", amt: 367 }, { d: "2025-09-29", amt: 370 },
  { d: "2025-12-29", amt: 566 }, { d: "2026-03-30", amt: 372 }, { d: "2026-06-29", amt: 374 },
  { d: "2026-09-29", amt: 4601 },
];

test("특별배당은 다른 지급액 중앙값의 1.8배 이상만 잡고, 기말배당은 정기로 둔다", () => {
  const rows = classifyDividends(samsung);
  assert.deepEqual(rows.filter((r) => r.special).map((r) => r.d), ["2026-09-29"]);
  assert.equal(rows.find((r) => r.d === "2025-12-29")!.special, false);
});

test("연도별로 정기와 특별을 나눠 더하고 최근 해부터 준다", () => {
  const ys = dividendYears(classifyDividends(samsung));
  assert.equal(ys[0].year, 2026);
  assert.equal(ys[0].special, 4601);
  assert.equal(ys[0].regular, 746);
  assert.equal(ys[1].count, 4);
  assert.equal(payCycle(ys, 2026), "분기배당");
});

test("지급이 셋 미만이면 특별로 보지 않는다", () => {
  const rows = classifyDividends([{ d: "2025-04-01", amt: 100 }, { d: "2026-04-01", amt: 900 }]);
  assert.equal(rows.some((r) => r.special), false);
});
