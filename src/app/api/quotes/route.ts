import {
  CANDLE_INTERVALS,
  creditBalance,
  indexCandles,
  indexFlows,
  indexQuotes,
  indexSeries,
  stockCandles,
  stockFlows,
  stockQuote,
  type CandleInterval,
  type SeriesRange,
} from "../../../lib/quotes";

/*
 * 최신 시세 (src/lib/quotes.ts).
 *   (없음)                   상단 띠 지수 다섯 + 오늘 미니 그래프(spark)
 *   ?code=005930              종목 하나 (종목 브리핑 상세만 부른다)
 *   ?series=KOSPI&range=1mo   지수 그래프 하나 (펼침 그래프의 1개월, 1년 탭)
 * CDN 캐시: 오늘 값과 그래프 60초, 1개월, 1년 그래프 10분. 원천이 막혀도 200에 빈 값을 돌려준다.
 */
const cache = (sec: number) => `public, max-age=0, s-maxage=${sec}, stale-while-revalidate=${sec * 2}`;
const RANGES: SeriesRange[] = ["1d", "1mo", "1y"];

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const code = q.get("code");
  if (code) {
    return Response.json({ quote: await stockQuote(code.toUpperCase()) }, { headers: { "Cache-Control": cache(60) } });
  }
  // ?flows=KOSPI  국내 지수 거래대금(다음 금융) + 시장 전체 신용잔고(네이버). 하루 한 번 바뀌는 값이라 1시간 캐시
  // &kind=stock 이면 종목(국내만): 거래대금(억 원) + 외국인, 기관 순매수(주). 종목별 신용잔고는 원천이 없다
  const stock = q.get("kind") === "stock";
  const flows = q.get("flows");
  if (flows) {
    if (stock) {
      return Response.json(
        { flows: await stockFlows(flows.toUpperCase()), credit: null, netUnit: "shares" },
        { headers: { "Cache-Control": cache(3600) } },
      );
    }
    const [f, c] = await Promise.all([indexFlows(flows), creditBalance()]);
    return Response.json({ flows: f, credit: c, netUnit: "won" }, { headers: { "Cache-Control": cache(3600) } });
  }
  const candles = q.get("candles");
  if (candles) {
    // ?candles=KOSPI&interval=1d|1wk|1mo  지수 캔들(일봉 2년, 주봉 10년, 월봉 전체)
    const v = q.get("interval") ?? "";
    const interval = (CANDLE_INTERVALS as string[]).includes(v) ? (v as CandleInterval) : "1d";
    return Response.json(
      { candles: stock ? await stockCandles(candles.toUpperCase(), interval) : await indexCandles(candles, interval) },
      { headers: { "Cache-Control": cache(interval === "1d" ? 300 : 3600) } },
    );
  }
  const series = q.get("series");
  if (series) {
    const range = (RANGES as string[]).includes(q.get("range") ?? "") ? (q.get("range") as SeriesRange) : "1d";
    return Response.json(
      { series: await indexSeries(series, range) },
      { headers: { "Cache-Control": cache(range === "1d" ? 60 : 600) } },
    );
  }
  const indices = await indexQuotes();
  const sparks = await Promise.all(indices.map((i) => indexSeries(i.key, "1d")));
  return Response.json(
    { indices: indices.map((i, n) => ({ ...i, spark: sparks[n] })) },
    { headers: { "Cache-Control": cache(60) } },
  );
}
