"use client";

/**
 * 종목 화면의 차트 묶음. 원본 `대시보드.html` 구성(연동 문서 4.2)을 옮겼다.
 *
 *   주가 (주봉)                         ← 한 장 넓게
 *   1년 성과: 종목 vs 소속 지수         ← 한 장 넓게
 *   [분기 | 연간]
 *   매출, 영업이익      | 영업이익률, ROE
 *   PER (주봉)          | PBR (주봉)
 *   현금흐름 (연간)     | 외국인, 기관 순매수 (60거래일)
 *   외국인 지분율 (60거래일)
 *
 * 축은 하나(dataviz 규칙). 단위가 다르면 차트를 나눈다. 분기, 연간 토글은 재무 차트 두 장에만 걸린다.
 */
import { useState } from "react";
import { BarChart, LineChart } from "./Charts";
import type { Stock } from "../../lib/stocks";

const NF0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });

const won = (v: number) => NF0.format(v);
const eok = (v: number) => NF0.format(v);
const pct = (v: number) => `${NF1.format(v)}%`;
const mult = (v: number) => `${NF1.format(v)}배`;
const toEok = (v: number | null) => (v === null ? null : v / 1e8);
const dot = (d: string) => d.replace(/-/g, ".");

export default function StockCharts({ stock: s }: { stock: Stock }) {
  const [period, setPeriod] = useState<"Q" | "Y">("Q");
  const P = period === "Q" ? s.quarters : s.annual;
  const pLabels = P.map((p) => (period === "Q" ? `${p.key.slice(2, 4)}${p.key.slice(4)}` : p.key));
  const weekly = s.weekly;
  const wLabels = weekly.map((w) => dot(w.d));
  const perf = s.perf ?? [];
  const flows = s.flows ?? [];
  const cf = s.cfAnnual ?? [];

  return (
    <div className="sc">
      <figure className="sc-fig">
        <figcaption>
          주가 <small>주봉 종가, 원</small>
        </figcaption>
        <LineChart
          labels={wLabels}
          series={[{ name: "종가", color: "--s1", values: weekly.map((w) => w.c) }]}
          fmt={won}
          height={240}
        />
      </figure>

      {perf.length > 1 ? (
        <figure className="sc-fig sc-fig--gap">
          <figcaption>
            1년 성과 <small>52주 전 = 100, 종목과 소속 지수</small>
          </figcaption>
          <LineChart
            labels={perf.map((p) => dot(p.d))}
            series={[
              { name: s.name, color: "--s1", values: perf.map((p) => p.s) },
              { name: s.market === "코스닥" ? "코스닥 지수" : "코스피 지수", color: "--s2", values: perf.map((p) => p.i) },
            ]}
            fmt={(v) => NF0.format(v)}
            height={220}
          />
        </figure>
      ) : null}

      <div className="sc-toggle" role="group" aria-label="재무 차트 기간">
        <span>재무 차트</span>
        <button type="button" aria-pressed={period === "Q"} onClick={() => setPeriod("Q")}>
          분기
        </button>
        <button type="button" aria-pressed={period === "Y"} onClick={() => setPeriod("Y")}>
          연간
        </button>
      </div>

      <div className="sc-grid">
        <figure className="sc-fig">
          <figcaption>
            매출, 영업이익 <small>억원</small>
          </figcaption>
          <BarChart
            labels={pLabels}
            series={[
              { name: "매출", color: "--s1", values: P.map((p) => toEok(p.rev)) },
              { name: "영업이익", color: "--s2", values: P.map((p) => toEok(p.op)) },
            ]}
            fmt={eok}
          />
        </figure>
        <figure className="sc-fig">
          <figcaption>
            영업이익률, ROE <small>%</small>
          </figcaption>
          <LineChart
            labels={pLabels}
            series={[
              { name: "영업이익률", color: "--s1", values: P.map((p) => p.opm) },
              { name: period === "Q" ? "ROE (TTM)" : "ROE", color: "--s2", values: P.map((p) => p.roe) },
            ]}
            fmt={pct}
            zero
          />
        </figure>
        <figure className="sc-fig">
          <figcaption>
            PER <small>배, 주봉. 적자 구간은 비운다</small>
          </figcaption>
          <LineChart
            labels={wLabels}
            series={[{ name: "PER", color: "--s1", values: weekly.map((w) => w.per ?? null) }]}
            fmt={mult}
            maxXLabels={4}
          />
        </figure>
        <figure className="sc-fig">
          <figcaption>
            PBR <small>배, 주봉</small>
          </figcaption>
          <LineChart
            labels={wLabels}
            series={[{ name: "PBR", color: "--s1", values: weekly.map((w) => w.pbr ?? null) }]}
            fmt={(v) => `${v.toFixed(v < 10 ? 2 : 1)}배`}
            maxXLabels={4}
          />
        </figure>

        {cf.length ? (
          <figure className="sc-fig">
            <figcaption>
              현금흐름 <small>연간, 억원</small>
            </figcaption>
            <BarChart
              labels={cf.map((c) => c.key)}
              series={[
                { name: "영업CF", color: "--s1", values: cf.map((c) => toEok(c.ocf)) },
                { name: "FCF", color: "--s2", values: cf.map((c) => toEok(c.fcf)) },
              ]}
              fmt={eok}
            />
          </figure>
        ) : null}

        {flows.length ? (
          <figure className="sc-fig">
            <figcaption>
              외국인, 기관 순매수 <small>일별, 억원, 최근 60거래일</small>
            </figcaption>
            <BarChart
              labels={flows.map((f) => dot(f.d))}
              series={[
                { name: "외국인", color: "--s1", values: flows.map((f) => toEok(f.frgn)) },
                { name: "기관", color: "--s2", values: flows.map((f) => toEok(f.organ)) },
              ]}
              fmt={eok}
            />
          </figure>
        ) : null}

        {flows.some((f) => f.hold !== null) ? (
          <figure className="sc-fig">
            <figcaption>
              외국인 지분율 <small>%, 최근 60거래일</small>
            </figcaption>
            <LineChart
              labels={flows.map((f) => dot(f.d))}
              series={[{ name: "외국인 지분율", color: "--s1", values: flows.map((f) => f.hold) }]}
              fmt={(v) => `${v.toFixed(1)}%`}
              maxXLabels={4}
            />
          </figure>
        ) : null}
      </div>
      <p className="stk-note">
        수급 금액은 일별 순매수 수량에 종가를 곱한 근사치입니다. PER, PBR 주봉 값은 그 시점에
        공시가 끝난 분기 기준입니다.
      </p>
    </div>
  );
}
