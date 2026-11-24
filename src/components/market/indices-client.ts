/**
 * 지수 값을 브라우저에서 받는다. 종목 브리핑 머리 카드(IndexCards)가 쓴다.
 * 30초 안의 두 번째 요청은 같은 Promise를 돌려준다.
 * 이 파일은 클라이언트 번들에 실린다. 서버 모듈(quotes.ts)을 들여오지 않는다.
 */
export type Series = { c: number[]; base: number };
export type IndexQuote = {
  key: string;
  name: string;
  price: number;
  pct: number;
  open: boolean;
  at: string | null;
  spark: Series | null;
};

let last: { at: number; p: Promise<IndexQuote[]> } | null = null;

export function getIndices(force = false): Promise<IndexQuote[]> {
  if (!force && last && Date.now() - last.at < 30_000) return last.p;
  const p = fetch("/api/quotes")
    .then((r) => (r.ok ? r.json() : { indices: [] }))
    .then((j: { indices?: IndexQuote[] }) => j.indices ?? [])
    .catch(() => [] as IndexQuote[]);
  last = { at: Date.now(), p };
  return p;
}
