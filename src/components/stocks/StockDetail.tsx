import Link from "next/link";
import { StockDisclaimer } from "../StockWeekView";
import Term from "../Term";
import StockCharts from "./StockCharts";
import DivJump from "./DivJump";
import LiveQuote from "./LiveQuote";
import IndexCandles from "../market/IndexCandles";
import ExternalIcon from "../ExternalIcon";
import { classifyDividends, dividendYears, payCycle } from "../../lib/dividends";
import type { getStockDetail } from "../../lib/stock-queries";
import {
  compareRows,
  pendingResults,
  type CompareRow,
  type Stock,
  type StockPeriod,
} from "../../lib/stocks";
import {
  fmtChange,
  fmtDelta,
  fmtAmt,
  fmtInt,
  fmtMoney,
  fmtMultiple,
  fmtPrice,
  fmtPriceNum,
  fmtRatio,
  fsLabel,
  isUsd,
  toneOf,
} from "../../lib/stock-format";

/**
 * 종목 하나. 늘 **최신 회차**를 읽는다 — 지난 회차의 종목 화면은 두지 않았다.
 * 구성은 stock-analysis `docs/market-brief-재무연동.md` 4.2장(원본 대시보드.html)을 따른다.
 *
 * 순서가 요점이다(사용자 지시, "그림과 표가 위, 글은 아래"):
 * 주가와 52주 위치 → 숫자 칸 12개 → 신호 → 차트 → 수급, 배당, 일정 → 과거 비교 → 공시 → 분기, 연간 표.
 */

export type StockHit = NonNullable<Awaited<ReturnType<typeof getStockDetail>>>;

function PeriodTable({
  rows,
  roeLabel,
  qoq,
  uid,
  cur,
}: {
  rows: Array<{ key: string } & StockPeriod>;
  cur: Stock["cur"];
  roeLabel: string;
  /** 분기 표만 직전 분기 대비 열을 둔다. 연간에는 그 값이 없다 */
  qoq: boolean;
  uid: string;
}) {
  const cols = [
    "매출",
    "영업이익",
    "순이익",
    "영업이익률",
    "매출 YoY",
    ...(qoq ? ["매출 QoQ"] : []),
    "영업이익 YoY",
    ...(qoq ? ["영업이익 QoQ"] : []),
    roeLabel,
    "부채비율",
  ];
  return (
    <div className="stk-table">
      <table>
        <thead>
          <tr>
            <th>기간</th>
            {cols.map((c) => (
              <th key={c} className="num">
                <Term label={c} uid={`${uid}-${c}`} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 최근이 위로 오게 뒤집는다 */}
          {[...rows].reverse().map((r) => (
            <tr key={r.key}>
              <th scope="row">{r.key}</th>
              <td className="num">{fmtAmt(r.rev, cur)}</td>
              <td className={`num ${r.op !== null && r.op < 0 ? "down" : ""}`}>{fmtAmt(r.op, cur)}</td>
              <td className={`num ${r.ni !== null && r.ni < 0 ? "down" : ""}`}>{fmtAmt(r.ni, cur)}</td>
              <td className="num">{fmtRatio(r.opm)}</td>
              <td className={`num ${toneOf(r.rev_yoy)}`}>{fmtChange(r.rev_yoy)}</td>
              {qoq ? (
                <td className={`num ${toneOf(r.rev_qoq)}`}>{fmtChange(r.rev_qoq)}</td>
              ) : null}
              <td className={`num ${toneOf(r.op_yoy)}`}>{fmtChange(r.op_yoy)}</td>
              {qoq ? (
                <td className={`num ${toneOf(r.op_qoq)}`}>{fmtChange(r.op_qoq)}</td>
              ) : null}
              <td className="num">{fmtRatio(r.roe)}</td>
              <td className="num">{r.debt_ratio === null ? "-" : `${fmtInt(r.debt_ratio)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtValue(row: CompareRow, v: number | null, cur: Stock["cur"]): string {
  if (row.kind === "eok") return fmtAmt(v, cur);
  if (row.kind === "ratio") return fmtRatio(v);
  if (row.kind === "won") return fmtPriceNum(v, cur);
  return fmtMultiple(v, row.label === "PBR" ? 2 : 1);
}

/**
 * 과거와 비교. 지금 값 옆에 직전 분기, 1년 전 값과 그 사이 변화를 ▲▼로 놓는다.
 * 재무는 분기 기준(직전 분기 / 전년 동기), 주가와 배수는 주봉 기준(13주 전 / 52주 전)이다.
 */
function CompareTable({ stock }: { stock: Stock }) {
  const { lastQ, rows } = compareRows(stock);
  return (
    <>
      <div className="stk-table">
        <table>
          <thead>
            <tr>
              <th>지표</th>
              <th className="num">지금</th>
              <th className="num">직전 분기</th>
              <th className="num">변화</th>
              <th className="num">1년 전</th>
              <th className="num">변화</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const unit = r.kind === "ratio" ? "%p" : "%";
              // 부채비율은 오르는 게 나쁜 쪽이지만 색은 방향만 뜻한다(빨강 = 올랐다)
              return (
                <tr key={r.label} className={r.kind === "won" ? "stk-split" : undefined}>
                  <th scope="row">
                    <Term label={r.label} uid={`c-${r.label}`} />
                  </th>
                  <td className="num">{fmtValue(r, r.now, stock.cur)}</td>
                  <td className="num faint">{fmtValue(r, r.prev, stock.cur)}</td>
                  <td className={`num ${toneOf(r.dPrev)}`}>{fmtDelta(r.dPrev, unit)}</td>
                  <td className="num faint">{fmtValue(r, r.yearAgo, stock.cur)}</td>
                  <td className={`num ${toneOf(r.dYear)}`}>{fmtDelta(r.dYear, unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="stk-note">
        재무는 {lastQ ?? "최근 분기"}를 직전 분기, 전년 같은 분기와 비교했습니다. 주가,
        PER, PBR은 13주 전, 52주 전 주봉과 비교했습니다. 비율 지표의 변화는 %p, 나머지는 %입니다.
        기준 값이 0 이하(적자)면 증감률을 계산하지 않습니다.
      </p>
    </>
  );
}

export default function StockDetail({
  hit,
  inModal = false,
}: {
  hit: StockHit;
  /** 팝업 안이면 머리의 "종목 브리핑" 경로 링크를 뺀다(닫기 버튼이 그 일을 한다) */
  inModal?: boolean;
}) {
  const { stock: s, runAt } = hit;
  // 해외 종목(2026-11-23)은 달러이고 외국인, 기관 수급이 없다
  const usd = isUsd(s.cur);
  const updatedOn = s.patch?.on ?? runAt.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  const n = s.snap;

  const pending = pendingResults(n.last_q, s.disc);
  const { rows: cmp } = compareRows(s);
  const yearDelta = (label: string) => {
    const r = cmp.find((c) => c.label === label);
    return r ? { v: r.dYear, unit: r.kind === "ratio" ? ("%p" as const) : ("%" as const) } : null;
  };

  /**
   * 맨 위 숫자 칸 12개 (연동 문서 4.2 "요약 타일"). 아래 작은 줄은 비교 기준이다 —
   * "1년 전보다 나아졌나"가 사용자가 먼저 보고 싶어 한 것이다.
   */
  const tiles: Array<{ label: string; value: string; tone?: string; sub?: React.ReactNode }> = [
    { label: "PER", value: n.deficit ? "적자" : fmtMultiple(n.per), sub: <Delta d={yearDelta("PER")} /> },
    { label: "PBR", value: fmtMultiple(n.pbr, 2), sub: <Delta d={yearDelta("PBR")} /> },
    { label: "ROE (TTM)", value: fmtRatio(n.roe), sub: <Delta d={yearDelta("ROE (TTM)")} /> },
    { label: "영업이익률", value: fmtRatio(n.opm), sub: <Delta d={yearDelta("영업이익률")} /> },
    {
      label: "매출 YoY",
      value: fmtChange(n.rev_yoy),
      tone: toneOf(n.rev_yoy),
      sub: <span>직전 분기 대비 {fmtChange(n.rev_qoq)}</span>,
    },
    {
      label: "영업이익 YoY",
      value: fmtChange(n.op_yoy),
      tone: toneOf(n.op_yoy),
      sub: <span>직전 분기 대비 {fmtChange(n.op_qoq)}</span>,
    },
    {
      label: "지수 대비 3개월",
      value: fmtDelta(n.rel_3m, "%p"),
      tone: toneOf(n.rel_3m),
      sub: <span>1년 {fmtDelta(n.rel_1y, "%p")}</span>,
    },
    // 해외 종목에는 외국인, 기관 수급이 없다. 그 두 칸 자리에 시가총액과 52주 고가 대비를 둔다
    ...(usd
      ? [
          { label: "시가총액", value: fmtMoney(n.mcap, s.cur), sub: <span>{n.date ? `${n.date.slice(2).replace(/-/g, ".")} 주가 기준` : ""}</span> },
          { label: "고가 대비", value: fmtChange(n.from_hi), tone: toneOf(n.from_hi), sub: <span>52주 고가 {fmtPrice(n.hi52, s.cur)}</span> },
        ]
      : [
          {
            label: "외국인 지분율",
            value: fmtRatio(n.hold_now),
            sub: <span>60일 {fmtDelta(n.hold_chg_60, "%p")}</span>,
          },
          {
            label: "외국인 20일",
            value: fmtAmt(n.frgn_20, s.cur),
            tone: toneOf(n.frgn_20),
            sub: <span>기관 {fmtAmt(n.organ_20, s.cur)}</span>,
          },
        ]),
    {
      label: "영업CF/순이익",
      value: fmtRatio(n.cash_conv),
      sub: <span>FCF {fmtMoney(n.fcf_fy, s.cur)}</span>,
    },
    {
      label: "배당수익률",
      value: fmtRatio(n.div_yield),
      sub: <span>주당 {fmtPrice(n.dps, s.cur)}</span>,
    },
    {
      label: "다음 실적 예상",
      value: n.next_earn ? n.next_earn.slice(2).replace(/-/g, ".") : "-",
      sub: <span>{n.next_earn ? "과거 패턴 추정" : "추정 불가"}</span>,
    },
  ];

  const moves: Array<[string, number | null]> = [
    ["1주", n.chg_1w],
    ["1개월", n.chg_1m],
    ["3개월", n.chg_3m],
    ["1년", n.chg_1y],
  ];

  return (
    <>
      <header className="masthead stx-masthead">
        <p className="stk-crumb">
          {inModal ? null : <Link href="/stocks">종목 브리핑</Link>}
          <span>{s.sector}</span>
          {s.market ? <span>{s.market}</span> : null}
        </p>
        <div className="masthead-row">
          <h1 className="page-title">{s.name}</h1>
          <span className="masthead-meta">{s.code}</span>
        </div>
        <LiveQuote code={s.code} cur={s.cur} from={n.price} />
        <div className="sd-price">
          <b>{fmtPrice(n.price, s.cur)}</b>
          {/* 장중에 돌린 회차면 확정 종가가 아니다. 그 시점을 주가 바로 옆에 적는다 */}
          {n.asof ? <span className="sd-asof">({n.asof})</span> : null}
          {/* 위 현재가(LiveQuote)와 기준이 다르다. 이 값은 주간 수집 시점 주가다 */}
          {n.date ? <span className="sd-asof">{n.date.slice(5).replace("-", ".")} 수집</span> : null}
          <ul>
            {moves.map(([label, v]) => (
              <li key={label}>
                <span>{label}</span>
                <em className={toneOf(v) ? `stk-${toneOf(v)}` : undefined}>{fmtChange(v)}</em>
              </li>
            ))}
          </ul>
        </div>
        <Range52 lo={n.lo52} hi={n.hi52} pos={n.pos52} fromHi={n.from_hi} cur={s.cur} />
        <p className="edition">
          <span>{fsLabel(s.fs)} 재무제표</span>
          {/* 재무와 주가의 기준일이 다르다. 둘 다 적는다(연동 문서 5장) */}
          {n.last_q ? <span>재무 {n.last_q}</span> : null}
          {n.date ? (
            <span>
              주가 {n.date.replace(/-/g, ".")}
              {/* asof가 없다고 종가로 단정하지 않는다. 필드가 생기기 전 판(2026-11-12 run-1333)은
                  장중가인데 asof가 비어 있다 */}
              {n.asof ? ` ${n.asof}` : ""}
            </span>
          ) : null}
          {/* 이 종목 숫자를 마지막으로 받은 날. 평일 공시 갱신이 있었으면 그날이다(2026-11-19 사용자 지시, 날짜만) */}
          {updatedOn ? <span className="sd-updated">{updatedOn.replace(/-/g, ".")} 갱신</span> : null}
        </p>
        {pending && usd ? (
          <p className="sd-pending">
            <b>
              {pending.d.replace(/-/g, ".")}에 {pending.quarter.slice(0, 4)}년 {pending.quarter.slice(-1)}분기
              실적 발표(8-K)가 나왔습니다.
            </b>{" "}
            아래 재무 숫자는 아직 {n.last_q} 기준입니다. 분기 숫자는 분기보고서(10-Q)에서 받아 오므로 보고서가
            제출된 뒤 수집에 반영됩니다.{" "}
            <a href={pending.url} target="_blank" rel="noopener noreferrer">
              실적 발표 보기
            </a>
          </p>
        ) : pending ? (
          <p className="sd-pending">
            <b>
              {pending.d.replace(/-/g, ".")}에 {pending.quarter.slice(0, 4)}년 {pending.quarter.slice(-1)}분기
              잠정실적이 공시됐습니다.
            </b>{" "}
            아래 재무 숫자는 아직 {n.last_q} 기준입니다. 분기 숫자는 정기보고서에서 받아 오므로 분기보고서가
            제출되면 그날 밤 21시 공시 갱신에 반영됩니다.{" "}
            <a href={pending.url} target="_blank" rel="noopener noreferrer">
              잠정실적 공시 보기
            </a>
          </p>
        ) : null}
        {s.patch ? (
          <p className="sd-patched">
            <b>{s.patch.on.replace(/-/g, ".")} 새 공시로 이 종목만 다시 수집했습니다.</b>{" "}
            ({s.patch.titles.join(", ")}) 주가와 수급도 그날 기준이라 목록의 다른 종목보다 기준일이 새롭습니다.
          </p>
        ) : null}
      </header>

      {/* 종목 차트: 지수 차트(IndexCandles)를 그대로 쓴다(2026-11-24 사용자 지시). 캔들, 이동평균, 거래대금,
          외국인/기관 순매수(주), RSI, 확대 축소, 전체화면, 지표 설정까지 같다. 종목별 신용잔고는 원천이 없어 빠진다 */}
      <IndexCandles indexKey={s.code} name={s.name} kind="stock" />

      <div className="sd-tiles">
        {tiles.map((t) => (
          <div key={t.label} className="sd-tile">
            <span>
              <Term label={t.label} uid={`tile-${t.label}`} />
            </span>
            <b className={t.tone ? `stk-${t.tone}` : undefined}>{t.value}</b>
            {t.sub ? <small>{t.sub}</small> : null}
          </div>
        ))}
      </div>

      {s.signals.length ? (
        <ul className="sd-signals" aria-label="자동 추세 신호">
          {s.signals.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
      ) : null}

      <StockCharts stock={s} />

      <section className="sec sec--first sd-after">
        <div className="sec-gutter">
          <p className="sec-label">{usd ? "배당, 일정" : "수급, 배당, 일정"}</p>
          <p className="sec-note">요약</p>
        </div>
        <div className="sec-body sd-mini-grid">
          {usd ? null : <FlowSummary s={s} />}
          <DivSummary s={s} />
          <SchedSummary s={s} />
        </div>
      </section>

      <DivHistory s={s} />

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">과거와 비교</p>
          <p className="sec-note">직전 분기, 1년 전</p>
        </div>
        <div className="sec-body">
          <CompareTable stock={s} />
        </div>
      </section>

      <StockNews s={s} />

      {s.disc?.length ? (
        <section className="sec">
          <div className="sec-gutter">
            <p className="sec-label">최근 공시</p>
            <p className="sec-note">1년, 정기보고서 제외</p>
          </div>
          <div className="sec-body">
            <ul className="sd-disc">
              {s.disc.map((d) => (
                <li key={d.url}>
                  <span className="sd-disc-date">{d.d.replace(/-/g, ".")}</span>
                  <span className="sd-disc-cat">{d.cat}</span>
                  <a href={d.url} target="_blank" rel="noopener noreferrer">
                    {d.title}
                  </a>
                </li>
              ))}
            </ul>
            <p className="stk-note">
              {usd ? "제목을 누르면 SEC 원문(영문)으로 갑니다." : "제목을 누르면 DART 원문으로 갑니다."}
            </p>
          </div>
        </section>
      ) : null}

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">분기 실적</p>
          <p className="sec-note">최근 12분기{usd ? ", 달력 분기 기준" : ""}</p>
        </div>
        <div className="sec-body">
          <PeriodTable rows={s.quarters} roeLabel="ROE (TTM)" qoq uid="q" cur={s.cur} />
        </div>
      </section>

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">연간 실적</p>
          <p className="sec-note">최근 5년</p>
        </div>
        <div className="sec-body">
          <PeriodTable rows={s.annual} roeLabel="ROE" qoq={false} uid="a" cur={s.cur} />
        </div>
      </section>

      {s.warn?.length ? <p className="stk-note">수집 경고: {s.warn.join(", ")}</p> : null}
      <StockDisclaimer />
    </>
  );
}

/** 1년 전 대비 한 줄. 값이 없으면 그리지 않는다 */
function Delta({ d }: { d: { v: number | null; unit: "%" | "%p" } | null }) {
  if (!d || d.v === null) return null;
  return (
    <span>
      1년 전 대비 <em className={`stk-${toneOf(d.v)}`}>{fmtDelta(d.v, d.unit)}</em>
    </span>
  );
}

/** 52주 저가와 고가 사이 지금 위치. 막대 하나로 "바닥 근처인가 꼭대기 근처인가"를 보여 준다 */
function Range52({
  lo,
  hi,
  pos,
  fromHi,
  cur,
}: {
  lo: number | null;
  hi: number | null;
  pos: number | null;
  fromHi: number | null;
  cur: Stock["cur"];
}) {
  if (lo === null || hi === null || pos === null) return null;
  const p = Math.max(0, Math.min(100, pos));
  return (
    <div className="sd-range" aria-label={`52주 범위에서 ${Math.round(p)} 위치`}>
      <span className="sd-range-end">
        <Term label="52주 위치" uid="range52" />
        <b>{fmtPriceNum(lo, cur)}</b>
      </span>
      <span className="sd-range-track">
        <span className="sd-range-fill" style={{ width: `${p}%` }} />
        <span className="sd-range-dot" style={{ left: `${p}%` }} />
      </span>
      <span className="sd-range-end sd-range-end--hi">
        <b>{fmtPriceNum(hi, cur)}</b>
        <span>고가 대비 {fmtChange(fromHi)}</span>
      </span>
    </div>
  );
}

const eokOr = (v: number | null | undefined) => fmtAmt(v, "KRW");

function FlowSummary({ s }: { s: Stock }) {
  const f = s.flowSum;
  if (!f) return null;
  const row = (label: string, k: string) => (
    <tr>
      <th scope="row">{label}</th>
      {[5, 20, 60].map((d) => {
        const v = f[`${k}_${d}`] ?? null;
        return (
          <td key={d} className={`num ${toneOf(v)}`}>
            {eokOr(v)}
          </td>
        );
      })}
    </tr>
  );
  return (
    <div className="sd-mini">
      <h3>수급 <small>순매수 근사</small></h3>
      <div className="stk-table">
        <table>
          <thead>
            <tr>
              <th />
              <th className="num">5일</th>
              <th className="num">20일</th>
              <th className="num">60일</th>
            </tr>
          </thead>
          <tbody>
            {row("외국인", "frgn")}
            {row("기관", "organ")}
          </tbody>
        </table>
      </div>
      <p className="stk-note">
        외국인 지분율 {fmtRatio(f.hold_now ?? null)} (20일 {fmtDelta(f.hold_chg_20 ?? null, "%p")}, 60일{" "}
        {fmtDelta(f.hold_chg_60 ?? null, "%p")})
      </p>
    </div>
  );
}

function DivSummary({ s }: { s: Stock }) {
  const d = s.div;
  return (
    <div className="sd-mini">
      <h3>배당</h3>
      {d ? (
        <div className="stk-table">
          <table>
            <thead>
              <tr>
                <th>사업연도</th>
                <th className="num">주당배당금</th>
                <th className="num">수익률</th>
                <th className="num">배당성향</th>
              </tr>
            </thead>
            <tbody>
              {d.dps.map((v, i) => (
                <tr key={i}>
                  <th scope="row">{d.year - i}</th>
                  <td className="num">{fmtPrice(v, s.cur)}</td>
                  <td className="num">{fmtRatio(d.yield[i] ?? null)}</td>
                  <td className="num">{fmtRatio(d.payout[i] ?? null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="stk-note">최근 배당이 없습니다.</p>
      )}
      {d ? <p className="stk-note">지금 주가 기준 수익률 {fmtRatio(d.yieldNow)}</p> : null}
      {/* 분기 몫과 특별배당은 아래 "배당 내역" 절에 있다. 여기서 찾는 사람이 많아 바로 가는 길을 둔다 */}
      {s.divEvents?.length ? (
        <DivJump />
      ) : null}
    </div>
  );
}

/**
 * 배당 지급 건별 내역 (2026-11-23 사용자 지시, "분기별 배당이랑 특별배당도 따로 보여 줘").
 * 위 "배당" 칸은 DART 사업보고서의 사업연도 합계이고, 여기는 배당락일 기준 한 건씩이다.
 * 특별배당은 원천이 표시해 주지 않아 금액으로 추정한다(`lib/dividends.ts`).
 */
function DivHistory({ s }: { s: Stock }) {
  const rows = classifyDividends(s.divEvents ?? []);
  if (!rows.length) return null;
  const years = dividendYears(rows).slice(0, 5);
  const thisYear = Number(new Date().toISOString().slice(0, 4));
  const cycle = payCycle(years, thisYear);
  const recent = [...rows].reverse().slice(0, 12);
  const specials = rows.filter((r) => r.special);
  const lastSpecial = specials[specials.length - 1];

  return (
    <section className="sec sd-div" id="sd-div">
      <div className="sec-gutter">
        <p className="sec-label">배당 내역</p>
        <p className="sec-note">배당락일 기준, 주당 금액</p>
      </div>
      <div className="sec-body">
        <ul className="sd-div-facts">
          {cycle ? (
            <li>
              <span>지급 주기</span>
              <b>{cycle}</b>
            </li>
          ) : null}
          <li>
            <span>최근 지급</span>
            <b>
              {fmtPrice(recent[0].amt, s.cur)} <small>{recent[0].d.replace(/-/g, ".")}</small>
            </b>
          </li>
          <li>
            <span>특별배당 (추정)</span>
            <b>
              {lastSpecial ? (
                <>
                  {fmtPrice(lastSpecial.amt, s.cur)} <small>{lastSpecial.d.replace(/-/g, ".")}</small>
                </>
              ) : (
                "최근 없음"
              )}
            </b>
          </li>
        </ul>

        <div className="sd-div-grid">
          <div className="stk-table">
            <table>
              <thead>
                <tr>
                  <th>연도</th>
                  <th className="num">정기 배당</th>
                  <th className="num">횟수</th>
                  <th className="num">특별 (추정)</th>
                  <th className="num">합계</th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.year}>
                    <th scope="row">
                      {y.year}
                      {y.year === thisYear ? <small> 진행 중</small> : null}
                    </th>
                    <td className="num">{y.count ? fmtPrice(y.regular, s.cur) : "-"}</td>
                    <td className="num">{y.count || "-"}</td>
                    <td className={y.special ? "num sd-div-special" : "num"}>
                      {y.special ? fmtPrice(y.special, s.cur) : "-"}
                    </td>
                    <td className="num">
                      <b>{fmtPrice(y.regular + y.special, s.cur)}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="stk-table">
            <table>
              <thead>
                <tr>
                  <th>배당락일</th>
                  <th className="num">주당</th>
                  <th>구분</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.d}>
                    <th scope="row">{r.d.replace(/-/g, ".")}</th>
                    <td className="num">{fmtPrice(r.amt, s.cur)}</td>
                    <td>{r.special ? <span className="sd-div-tag">특별 (추정)</span> : "정기"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="stk-note">
          특별배당은 원천이 따로 표시하지 않아 그 회사의 다른 지급액 중앙값의 1.8배 이상인 건을 특별로
          추정했습니다. 연도는 배당락일 기준이라 위 사업연도 합계와 다를 수 있습니다.
        </p>
      </div>
    </section>
  );
}

function SchedSummary({ s }: { s: Stock }) {
  const c = s.sched;
  return (
    <div className="sd-mini">
      <h3>실적 발표</h3>
      {c ? (
        <dl className="sd-dl">
          <dt>다음 발표 예상</dt>
          <dd>
            <b>{c.nextExpected ? `${c.nextExpected.replace(/-/g, ".")} 예상` : "-"}</b>
          </dd>
          <dt>최근 발표</dt>
          <dd>{c.recent.length ? c.recent.map((d) => d.slice(2).replace(/-/g, ".")).join(", ") : "-"}</dd>
          <dt>기준</dt>
          <dd>
            {c.basis ?? "-"}
            {c.typicalLag !== null ? `, 분기 말 뒤 약 ${c.typicalLag}일` : ""}
          </dd>
          {c.lastIr ? (
            <>
              <dt>최근 IR</dt>
              <dd>{c.lastIr.replace(/-/g, ".")}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="stk-note">발표 패턴을 추정하지 못했습니다.</p>
      )}
      <p className="stk-note">과거 발표 패턴으로 추정한 날짜입니다. 확정 일정이 아닙니다.</p>
    </div>
  );
}

/** 처음에 펼쳐 두는 뉴스 수. 나머지는 접어 둔다 */
const NEWS_OPEN = 4;

/**
 * 최근 종목 뉴스(원고 `종목뉴스.md`, 30일). 적재는 `scripts/stock-news.ts`, 규칙은 `src/lib/stock-news.ts`.
 * 호재/악재 꼬리표, 목표가, 추천 문장은 적재 때 이미 뺐다. 기사 링크는 매체명만 보인다.
 */
function StockNews({ s }: { s: Stock }) {
  const items = s.news ?? [];
  if (!items.length) return null;
  const row = (n: (typeof items)[number], i: number) => (
    <li key={`${n.d}-${n.s}-${i}`}>
      <p className="sd-news-meta">
        {n.d.slice(5).replace("-", ".")} {n.s === "am" ? "아침" : "마감"}
      </p>
      <div className="sd-news-body">
        {n.title ? <p className="sd-news-title">{n.title}</p> : null}
        <p className="sd-news-text">{n.text}</p>
        {n.src.length ? (
          <p className="sd-news-src">
            {n.src.map((l) => (
              <a key={l.url} className="source-chip" href={l.url} target="_blank" rel="noopener noreferrer nofollow">
                {l.label}
                <ExternalIcon />
              </a>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  );
  return (
    <section className="sec" id="sd-news">
      <div className="sec-gutter">
        <p className="sec-label">최근 뉴스</p>
        <p className="sec-note">30일, 사실만 추렸습니다</p>
      </div>
      <div className="sec-body">
        <ul className="sd-news">{items.slice(0, NEWS_OPEN).map(row)}</ul>
        {items.length > NEWS_OPEN ? (
          <details className="sd-news-more">
            <summary>이전 뉴스 {items.length - NEWS_OPEN}건 더 보기</summary>
            <ul className="sd-news">{items.slice(NEWS_OPEN).map((n, i) => row(n, i + NEWS_OPEN))}</ul>
          </details>
        ) : null}
        <p className="stk-note">
          더 브리핑 원고의 종목 뉴스에서 목표주가, 추천, 호재/악재 판단을 빼고 사실만 옮겼습니다. 매체명을 누르면 원문으로 갑니다.
        </p>
      </div>
    </section>
  );
}
