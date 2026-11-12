import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Shell from "../../../components/Shell";
import { StockDisclaimer } from "../../../components/StockWeekView";
import Term from "../../../components/Term";
import StockCharts from "../../../components/stocks/StockCharts";
import { getStockDetail, latestCodes } from "../../../lib/stock-queries";
import {
  compareRows,
  pendingResults,
  type CompareRow,
  type Stock,
  type StockPeriod,
} from "../../../lib/stocks";
import {
  fmtChange,
  fmtDelta,
  fmtEok,
  fmtInt,
  fmtMultiple,
  fmtRatio,
  fsLabel,
  runStamp,
  toneOf,
} from "../../../lib/stock-format";

/**
 * 종목 하나. 늘 **최신 회차**를 읽는다 — 지난 회차의 종목 화면은 두지 않았다.
 * 구성은 stock-analysis `docs/market-brief-재무연동.md` 4.2장(원본 대시보드.html)을 따른다.
 *
 * 순서가 요점이다(사용자 지시, "그림과 표가 위, 글은 아래"):
 * 주가와 52주 위치 → 숫자 칸 12개 → 신호 → 차트 → 수급, 배당, 일정 → 과거 비교 → 공시 → 분기, 연간 표.
 */
export const revalidate = 600;

type Params = { params: Promise<{ code: string }> };

const CODE_RE = /^[0-9A-Z]{6}$/;

async function find(code: string) {
  return CODE_RE.test(code) ? getStockDetail(code) : null;
}

export async function generateStaticParams() {
  try {
    return (await latestCodes()).map((code) => ({ code }));
  } catch {
    // 빌드 때 DB가 막혀도 빌드는 깨지지 않게. 첫 요청이 그린다
    return [];
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const hit = await find(code);
  if (!hit) return { title: "종목 브리핑", robots: { index: false, follow: false } };
  const title = `${hit.stock.name} 재무 추세`;
  const description = `${hit.stock.name}의 실적, 주가, 수급, 현금흐름 추이. 공개 공시와 시세로 계산한 참고 자료이며 투자 권유가 아닙니다.`;
  return {
    title,
    description,
    alternates: { canonical: `/stocks/${code}` },
    // 색인하지 않는다(연동 문서 3.3)
    robots: { index: false, follow: false },
    openGraph: { type: "article", title, description, url: `/stocks/${code}` },
  };
}

function PeriodTable({
  rows,
  roeLabel,
  qoq,
  uid,
}: {
  rows: Array<{ key: string } & StockPeriod>;
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
              <td className="num">{fmtEok(r.rev)}</td>
              <td className={`num ${r.op !== null && r.op < 0 ? "down" : ""}`}>{fmtEok(r.op)}</td>
              <td className={`num ${r.ni !== null && r.ni < 0 ? "down" : ""}`}>{fmtEok(r.ni)}</td>
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

function fmtValue(row: CompareRow, v: number | null): string {
  if (row.kind === "eok") return fmtEok(v);
  if (row.kind === "ratio") return fmtRatio(v);
  if (row.kind === "won") return fmtInt(v);
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
                  <td className="num">{fmtValue(r, r.now)}</td>
                  <td className="num faint">{fmtValue(r, r.prev)}</td>
                  <td className={`num ${toneOf(r.dPrev)}`}>{fmtDelta(r.dPrev, unit)}</td>
                  <td className="num faint">{fmtValue(r, r.yearAgo)}</td>
                  <td className={`num ${toneOf(r.dYear)}`}>{fmtDelta(r.dYear, unit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="stk-note">
        재무는 {lastQ ?? "최근 분기"}를 직전 분기, 전년 같은 분기와 비교했습니다(억원). 주가,
        PER, PBR은 13주 전, 52주 전 주봉과 비교했습니다. 비율 지표의 변화는 %p, 나머지는 %입니다.
        기준 값이 0 이하(적자)면 증감률을 계산하지 않습니다.
      </p>
    </>
  );
}

export default async function StockPage({ params }: Params) {
  const { code } = await params;
  const hit = await find(code);
  if (!hit) notFound();
  const { stock: s, runAt } = hit;
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
    {
      label: "외국인 지분율",
      value: fmtRatio(n.hold_now),
      sub: <span>60일 {fmtDelta(n.hold_chg_60, "%p")}</span>,
    },
    {
      label: "외국인 20일",
      value: n.frgn_20 === null ? "-" : `${fmtEok(n.frgn_20)}억`,
      tone: toneOf(n.frgn_20),
      sub: <span>기관 {n.organ_20 === null ? "-" : `${fmtEok(n.organ_20)}억`}</span>,
    },
    {
      label: "영업CF/순이익",
      value: fmtRatio(n.cash_conv),
      sub: <span>FCF {n.fcf_fy === null ? "-" : `${fmtEok(n.fcf_fy)}억`}</span>,
    },
    {
      label: "배당수익률",
      value: fmtRatio(n.div_yield),
      sub: <span>주당 {n.dps === null ? "-" : `${fmtInt(n.dps)}원`}</span>,
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
    <Shell>
      <header className="masthead stx-masthead">
        <p className="stk-crumb">
          <Link href="/stocks">종목 브리핑</Link>
          <span>{s.sector}</span>
          {s.market ? <span>{s.market}</span> : null}
        </p>
        <div className="masthead-row">
          <h1 className="page-title">{s.name}</h1>
          <span className="masthead-meta">{s.code}</span>
        </div>
        <div className="sd-price">
          <b>{n.price === null ? "-" : `${fmtInt(n.price)}원`}</b>
          {/* 장중에 돌린 회차면 확정 종가가 아니다. 그 시점을 주가 바로 옆에 적는다 */}
          {n.asof ? <span className="sd-asof">({n.asof})</span> : null}
          <ul>
            {moves.map(([label, v]) => (
              <li key={label}>
                <span>{label}</span>
                <em className={toneOf(v) ? `stk-${toneOf(v)}` : undefined}>{fmtChange(v)}</em>
              </li>
            ))}
          </ul>
        </div>
        <Range52 lo={n.lo52} hi={n.hi52} pos={n.pos52} fromHi={n.from_hi} />
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
          {runAt ? <span>{runStamp(runAt)} 수집</span> : null}
        </p>
        {pending ? (
          <p className="sd-pending">
            <b>
              {pending.d.replace(/-/g, ".")}에 {pending.quarter.slice(0, 4)}년 {pending.quarter.slice(-1)}분기
              잠정실적이 공시됐습니다.
            </b>{" "}
            아래 재무 숫자는 아직 {n.last_q} 기준입니다. 분기 숫자는 정기보고서에서 받아 오므로 분기보고서가
            제출된 뒤 다음 회차에 반영됩니다.{" "}
            <a href={pending.url} target="_blank" rel="noopener noreferrer">
              잠정실적 공시 보기
            </a>
          </p>
        ) : null}
      </header>

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
          <p className="sec-label">수급, 배당, 일정</p>
          <p className="sec-note">요약</p>
        </div>
        <div className="sec-body sd-mini-grid">
          <FlowSummary s={s} />
          <DivSummary s={s} />
          <SchedSummary s={s} />
        </div>
      </section>

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">과거와 비교</p>
          <p className="sec-note">직전 분기, 1년 전</p>
        </div>
        <div className="sec-body">
          <CompareTable stock={s} />
        </div>
      </section>

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
            <p className="stk-note">제목을 누르면 DART 원문으로 갑니다.</p>
          </div>
        </section>
      ) : null}

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">분기 실적</p>
          <p className="sec-note">억원, 최근 12분기</p>
        </div>
        <div className="sec-body">
          <PeriodTable rows={s.quarters} roeLabel="ROE (TTM)" qoq uid="q" />
        </div>
      </section>

      <section className="sec">
        <div className="sec-gutter">
          <p className="sec-label">연간 실적</p>
          <p className="sec-note">억원, 최근 5년</p>
        </div>
        <div className="sec-body">
          <PeriodTable rows={s.annual} roeLabel="ROE" qoq={false} uid="a" />
        </div>
      </section>

      {s.warn?.length ? <p className="stk-note">수집 경고: {s.warn.join(", ")}</p> : null}
      <StockDisclaimer />
    </Shell>
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
}: {
  lo: number | null;
  hi: number | null;
  pos: number | null;
  fromHi: number | null;
}) {
  if (lo === null || hi === null || pos === null) return null;
  const p = Math.max(0, Math.min(100, pos));
  return (
    <div className="sd-range" aria-label={`52주 범위에서 ${Math.round(p)} 위치`}>
      <span className="sd-range-end">
        <Term label="52주 위치" uid="range52" />
        <b>{fmtInt(lo)}</b>
      </span>
      <span className="sd-range-track">
        <span className="sd-range-fill" style={{ width: `${p}%` }} />
        <span className="sd-range-dot" style={{ left: `${p}%` }} />
      </span>
      <span className="sd-range-end sd-range-end--hi">
        <b>{fmtInt(hi)}</b>
        <span>고가 대비 {fmtChange(fromHi)}</span>
      </span>
    </div>
  );
}

const eokOr = (v: number | null | undefined) => (v === null || v === undefined ? "-" : `${fmtEok(v)}억`);

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
                  <td className="num">{v === null ? "-" : `${fmtInt(v)}원`}</td>
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
    </div>
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
