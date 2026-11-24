import { indexQuotes, indexSeries, stockQuote, type SeriesRange } from "../../../lib/quotes";

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
