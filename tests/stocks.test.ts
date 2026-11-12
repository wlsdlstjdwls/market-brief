/**
 * 종목 브리핑 적재 회귀.
 *
 * 요약 원고는 루틴(LLM)이 쓴다. 매수, 매도 추천이 섞여 들어와도 화면에 나가면 안 된다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cleanSummary, pickRun, trimData } from "../src/lib/stocks";

test("추천 표현이 든 줄은 버리고 수급 용어는 남긴다", () => {
  const md = [
    "# 관심종목 재무 추세 주간 요약 (2026-11-12)",
    "",
    "## 1. 결론",
    "",
    "- 반도체 영업이익률이 가장 높다.",
    "- 지금이 매수 적기다.",
    "- 목표주가 30만 원.",
    "- 외국인 순매수가 이어졌다.",
    "- 비중 확대를 권한다.",
  ].join("\n");
  const out = cleanSummary(md);
  assert.match(out, /영업이익률이 가장 높다/);
  assert.match(out, /순매수가 이어졌다/);
  assert.doesNotMatch(out, /매수 적기|목표주가|비중 확대/);
  assert.doesNotMatch(out, /^# /m);
});

test("작업 메모(파일, 폴더 얘기)는 버리고 비게 된 제목도 뺀다", () => {
  const md = [
    "> 숫자는 같은 폴더의 `섹터비교.md` 값만 인용했다.",
    "",
    "## 2. 신규 공시 반영 종목",
    "",
    "비교 대상 없음. `요약/재무/` 아래에 다른 날짜 폴더가 없다.",
    "",
    "## 3. 섹터별 체크",
    "",
    "**반도체**: 매출 YoY 130.0%.",
  ].join("\n");
  const out = cleanSummary(md);
  assert.doesNotMatch(out, /섹터비교|폴더/);
  assert.doesNotMatch(out, /신규 공시 반영/);
  assert.match(out, /## 3\. 섹터별 체크/);
});

test("가장 늦은 run-HHMM을 고르고 없으면 루트", () => {
  const has = (set: string[]) => (rel: string) => set.includes(rel);
  assert.equal(pickRun(["data.json", "run-0910", "run-1206"], has(["", "run-0910", "run-1206"])), "run-1206");
  assert.equal(pickRun(["data.json", "run-1206"], has([""])), "");
  assert.equal(pickRun([], has([])), null);
});

test("수집 실패 종목은 빼고 주봉은 2년치만 남긴다", () => {
  const weekly = Array.from({ length: 270 }, (_, i) => ({ d: `w${i}`, c: i + 1 }));
  const out = trimData({
    run_at: "2026-11-12 12:03 KST",
    stocks: [
      { sector: "반도체", name: "가", code: "000001", snap: { price: 1, deficit: false }, weekly, quarters: { "2026Q2": { rev: 1 } } },
      { sector: "반도체", name: "나", code: "000002" },
    ],
  });
  assert.equal(out.stocks.length, 1);
  assert.equal(out.stocks[0].weekly.length, 104);
  assert.equal(out.stocks[0].weekly.at(-1)?.c, 270);
  assert.equal(out.stocks[0].quarters[0].key, "2026Q2");
  assert.throws(() => trimData({ stocks: [] }));
});

test("과거 비교는 분기 이름으로 직전 분기와 전년 동기를 찾는다", async () => {
  const { compareRows } = await import("../src/lib/stocks");
  const q = (key: string, rev: number, opm: number) => ({ key, rev, opm });
  const data = trimData({
    stocks: [
      {
        sector: "반도체",
        name: "가",
        code: "000001",
        snap: { last_q: "2026Q2" },
        // 2025Q4가 빠져 있다. 칸 수로 세면 직전 분기를 2025Q3로 잘못 잡는다
        quarters: {
          "2025Q1": q("2025Q1", 50, 5),
          "2025Q2": q("2025Q2", 100, 10),
          "2025Q3": q("2025Q3", 120, 12),
          "2026Q1": q("2026Q1", 150, 20),
          "2026Q2": q("2026Q2", 200, 25),
        },
      },
    ],
  });
  const { lastQ, rows } = compareRows(data.stocks[0]);
  assert.equal(lastQ, "2026Q2");
  const rev = rows.find((r) => r.label === "매출")!;
  assert.equal(rev.prev, 150);
  assert.equal(rev.yearAgo, 100);
  assert.equal(rev.dYear, 100);
  const opm = rows.find((r) => r.label === "영업이익률")!;
  assert.equal(opm.dPrev, 5); // %p
  assert.equal(opm.dYear, 15);
});

test("잠정실적이 나왔는데 분기 숫자에 안 들어간 회사를 찾는다", async () => {
  const { pendingResults } = await import("../src/lib/stocks");
  const disc = [
    { d: "2026-11-12", cat: "실적", title: "연결재무제표기준영업(잠정)실적(공정공시)", url: "u1" },
    { d: "2026-08-12", cat: "실적", title: "연결재무제표기준영업(잠정)실적(공정공시)", url: "u2" },
  ];
  // 반영 2026Q2, 3분기 말(09-30) 뒤에 실적 공시 → 3분기 미반영 (2026-11-12 에스피지)
  assert.deepEqual(pendingResults("2026Q2", disc), { d: "2026-11-12", url: "u1", quarter: "2026Q3" });
  // 이미 3분기가 반영됐으면 없다
  assert.equal(pendingResults("2026Q3", disc), null);
  // 4분기 다음은 이듬해 1분기. 1분기 말(03-31) 전 공시는 4분기 것이라 해당 없음
  assert.equal(pendingResults("2025Q4", [{ d: "2026-02-05", cat: "실적", title: "", url: "x" }]), null);
  assert.equal(pendingResults(null, disc), null);
});
