/**
 * 종목 브리핑 적재 회귀.
 *
 * 요약 원고는 루틴(LLM)이 쓴다. 매수, 매도 추천이 섞여 들어와도 화면에 나가면 안 된다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { applyPatch, cleanSummary, knownReceipts, pickRun, rcpNoOf, toCard, trimData, type Stock } from "../src/lib/stocks";

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

test("해외 종목은 티커 코드와 달러를 받고 SEC 공시 링크를 남긴다", () => {
  const out = trimData({
    run_at: "2026-11-23 15:00 KST",
    stocks: [
      {
        sector: "AI 반도체", name: "엔비디아", code: "NVDA", cur: "USD", market: "나스닥",
        snap: { price: 125.53, deficit: false },
        disc: [
          { d: "2026-11-19", cat: "실적", title: "8-K 실적 발표", url: "https://www.sec.gov/Archives/edgar/data/1045810/x/a.htm" },
          { d: "2026-11-18", cat: "실적", title: "가짜", url: "https://example.com/a" },
        ],
      },
      // 국내 줄은 통화가 없어도 원이다(옛 적재분)
      { sector: "반도체", name: "가", code: "000001", snap: { price: 1, deficit: false } },
      // 티커 모양이 아니면 버린다
      { sector: "x", name: "나", code: "nvda", cur: "USD", snap: { price: 1, deficit: false } },
    ],
  });
  assert.equal(out.stocks.length, 2);
  const [us, kr] = out.stocks;
  assert.equal(us.cur, "USD");
  assert.equal(toCard(us).cur, "USD");
  assert.deepEqual(us.disc.map((d) => d.title), ["8-K 실적 발표"]);
  assert.equal(kr.cur, "KRW");
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

/*
 * 평일 공시 갱신(2026-11-19). 같은 공시로 매일 다시 수집하면 안 되고, 회차의 그룹은 지켜야 한다.
 */
const DART = (n: string) => `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${n}`;

test("공시 주소에서 접수번호를 뽑는다", () => {
  assert.equal(rcpNoOf(DART("20261112900396")), "20261112900396");
  assert.equal(rcpNoOf("https://example.com/x"), null);
  assert.equal(
    rcpNoOf("https://www.sec.gov/Archives/edgar/data/1045810/000104581026000123/nvda-8k.htm"),
    "000104581026000123",
  );
});

test("이미 본 공시는 저장된 목록과 지난 갱신 기록을 합친다", () => {
  const known = knownReceipts({
    disc: [{ d: "2026-11-12", cat: "수주", title: "단일판매", url: DART("20261112900396") }],
    patch: { on: "2026-11-18", titles: ["분기보고서"], seen: ["20261118000111"] },
  });
  assert.deepEqual(known.sort(), ["20261112900396", "20261118000111"]);
});

test("갱신은 그룹을 지키고, 본 공시 번호를 쌓고, 카드에 표시를 단다", () => {
  const raw = {
    stocks: [
      {
        name: "테스트",
        code: "123456",
        sector: "임시그룹",
        snap: { price: 1000, last_q: "2026Q3", deficit: false },
        quarters: [],
        annual: [],
        weekly: [],
        disc: [],
      },
    ],
  };
  const fresh = trimData(raw).stocks[0];
  const prev = { sector: "반도체", disc: [], patch: { on: "2026-11-17", titles: ["a"], seen: ["20261117000001"] } };
  const merged = applyPatch(fresh, prev, { on: "2026-11-19", titles: ["분기보고서 (2026.09)"], seen: ["20261119000002"] });
  assert.equal(merged.sector, "반도체");
  assert.deepEqual(merged.patch?.seen.sort(), ["20261117000001", "20261119000002"]);
  const card = toCard(merged as Stock);
  assert.deepEqual(card.patched, { on: "2026-11-19", titles: ["분기보고서 (2026.09)"] });
  assert.equal(card.sector, "반도체");
});
