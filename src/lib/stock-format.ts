/**
 * 종목 브리핑 표기. **순수 함수만** 둔다.
 *
 * 값이 없으면 `-`를 찍는다. 원본의 `N/A`는 "미공시 또는 계산 불가"라 0과 다르다.
 */

const NF0 = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const NF2 = new Intl.NumberFormat("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const DASH = "-";

/** 정수 (주가, 억원) */
export const fmtInt = (v: number | null | undefined): string =>
  v === null || v === undefined ? DASH : NF0.format(v);

/** 원 → 억원 정수 */
export const fmtEok = (won: number | null | undefined): string =>
  won === null || won === undefined ? DASH : NF0.format(Math.round(won / 1e8));

/** 배수 (PER, PBR). PER은 적자면 계산하지 않는다 */
export const fmtMultiple = (v: number | null | undefined, digits: 1 | 2 = 1): string =>
  v === null || v === undefined ? DASH : `${(digits === 2 ? NF2 : NF1).format(v)}배`;

/** 비율 (영업이익률, ROE). 부호를 붙이지 않는다 */
export const fmtRatio = (v: number | null | undefined): string =>
  v === null || v === undefined ? DASH : `${NF1.format(v)}%`;

/** 증감률. 양수에 `+`를 붙인다 */
export const fmtChange = (v: number | null | undefined): string =>
  v === null || v === undefined ? DASH : `${v > 0 ? "+" : ""}${NF1.format(v)}%`;

/** 증감 색. 국내 관례대로 오르면 빨강, 내리면 파랑 */
export const toneOf = (v: number | null | undefined): "up" | "down" | "" =>
  v === null || v === undefined || v === 0 ? "" : v > 0 ? "up" : "down";

/** 재무제표 구분 */
export const fsLabel = (fs: string): string => (fs === "OFS" ? "별도" : "연결");

/** `2026-11-12 12:03 KST` 처럼 원본이 적은 시각에서 `11.12 12:03`만 남긴다 */
export function runStamp(runAt: string): string {
  const m = runAt.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
  return m ? `${m[2]}.${m[3]} ${m[4]}:${m[5]}` : runAt;
}

/**
 * 과거 대비 변화. 방향을 글자로도 보이게 ▲▼를 붙인다 — 색만으로는 색각 이상이 있으면 못 읽는다.
 * `unit`이 `%p`면 비율 지표의 차이(영업이익률 40% → 52%는 +12.0%p), `%`면 증감률이다.
 */
export function fmtDelta(v: number | null | undefined, unit: "%" | "%p" = "%"): string {
  if (v === null || v === undefined) return DASH;
  if (Math.abs(v) < 0.05) return `0.0${unit}`;
  return `${v > 0 ? "▲" : "▼"} ${NF1.format(Math.abs(v))}${unit}`;
}
