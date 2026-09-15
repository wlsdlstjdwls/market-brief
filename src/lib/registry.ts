/**
 * 지수·매크로·업종 화이트리스트.
 *
 * 구조화 필드(지수명·지표명·업종명)는 원문 문자열을 그대로 쓰지 않고
 * 반드시 이 레지스트리의 표준 명칭으로 바꿔 저장한다.
 * 그래야 "러셀2000"처럼 종목명과 겹치는 표기가 DB에 들어가는 일이 원천 차단된다.
 */

export interface IndexDef { code: string; name: string; match: string[]; order: number }
export interface MacroDef {
  key: string; name: string; kind: "rate" | "fx" | "oil" | "commodity" | "volatility";
  unit: string; match: string[]; order: number;
}
export interface SectorDef { code: string; name: string; match: string[] }

export const INDICES: IndexDef[] = [
  { code: "KOSPI",   name: "코스피",        match: ["코스피", "kospi"], order: 1 },
  { code: "KOSDAQ",  name: "코스닥",        match: ["코스닥", "kosdaq"], order: 2 },
  { code: "SPX",     name: "S&P 500",       match: ["s&p500", "s&p 500", "sp500"], order: 3 },
  { code: "IXIC",    name: "나스닥 종합",    match: ["나스닥종합", "나스닥 종합", "나스닥"], order: 4 },
  { code: "DJI",     name: "다우존스 산업",  match: ["다우존스", "다우 존스", "다우"], order: 5 },
  { code: "RUT",     name: "러셀 2000",      match: ["러셀2000", "러셀 2000", "russell"], order: 6 },
  { code: "SOX",     name: "필라델피아 반도체", match: ["필라델피아 반도체", "필라델피아반도체", "sox"], order: 7 },
  { code: "N225",    name: "닛케이 225",     match: ["닛케이"], order: 8 },
  { code: "SHCOMP",  name: "상하이 종합",    match: ["상하이종합", "상하이 종합"], order: 9 },
];

export const MACROS: MacroDef[] = [
  { key: "UST10Y", name: "미 국채 10년물 금리", kind: "rate", unit: "%", match: ["10년물", "10년 국채"], order: 1 },
  { key: "UST2Y",  name: "미 국채 2년물 금리",  kind: "rate", unit: "%", match: ["2년물", "2년 국채"], order: 2 },
  { key: "KTB3Y",  name: "국고채 3년물 금리",   kind: "rate", unit: "%", match: ["국고채 3년", "국고 3년"], order: 3 },
  { key: "DXY",    name: "달러인덱스",          kind: "fx", unit: "pt", match: ["달러인덱스", "dxy", "달러 인덱스"], order: 4 },
  { key: "USDKRW", name: "원/달러 환율",        kind: "fx", unit: "원", match: ["원/달러", "원달러", "usd/krw"], order: 5 },
  { key: "USDJPY", name: "엔/달러 환율",        kind: "fx", unit: "엔", match: ["엔/달러", "달러/엔"], order: 6 },
  { key: "WTI",    name: "WTI 유가",            kind: "oil", unit: "USD", match: ["wti"], order: 7 },
  { key: "BRENT",  name: "브렌트유",            kind: "oil", unit: "USD", match: ["브렌트"], order: 8 },
  { key: "GOLD",   name: "금",                  kind: "commodity", unit: "USD", match: ["금(gold)", "금 (gold)", "gold", "국제 금"], order: 9 },
  { key: "VIX",    name: "VIX 변동성지수",      kind: "volatility", unit: "pt", match: ["vix"], order: 10 },
];

/** KRX 업종지수 기준 섹터. 개별 종목을 대체하는 유일한 근거 단위. */
export const SECTORS: SectorDef[] = [
  { code: "SEMI",      name: "반도체",        match: ["반도체", "메모리"] },
  { code: "SEMI_EQP",  name: "반도체 장비·소재", match: ["반도체 장비", "소부장", "장비·소재"] },
  { code: "BATTERY",   name: "2차전지",       match: ["2차전지", "이차전지", "배터리"] },
  { code: "AUTO",      name: "자동차",        match: ["자동차", "완성차", "운수장비"] },
  { code: "BIO",       name: "제약·바이오",   match: ["바이오", "제약", "헬스케어"] },
  { code: "FIN",       name: "금융",          match: ["금융", "은행", "증권", "보험"] },
  { code: "CHEM",      name: "화학",          match: ["화학", "정유"] },
  { code: "STEEL",     name: "철강·금속",     match: ["철강", "금속"] },
  { code: "SHIP",      name: "조선",          match: ["조선", "해운"] },
  { code: "CONST",     name: "건설",          match: ["건설", "건자재"] },
  { code: "POWER",     name: "전력·에너지",   match: ["전력", "원전", "에너지", "변압", "전선"] },
  { code: "IT_HW",     name: "IT 하드웨어",   match: ["전기전자", "it 하드웨어", "mlcc", "부품"] },
  { code: "INTERNET",  name: "인터넷·소프트웨어", match: ["인터넷", "소프트웨어", "플랫폼", "게임"] },
  { code: "ROBOT",     name: "로봇·자동화",   match: ["로봇", "피지컬ai", "자동화"] },
  { code: "SOLAR",     name: "신재생·태양광", match: ["태양광", "신재생", "풍력"] },
  { code: "DEFENSE",   name: "방산·항공우주", match: ["방산", "항공우주", "우주"] },
  { code: "CONSUMER",  name: "필수소비재",    match: ["음식료", "유통", "소비재"] },
  { code: "TELCO",     name: "통신",          match: ["통신"] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function matchIndex(label: string): IndexDef | null {
  const l = norm(label);
  return INDICES.find((d) => d.match.some((m) => l.includes(m))) ?? null;
}
export function matchMacro(label: string): MacroDef | null {
  const l = norm(label);
  return MACROS.find((d) => d.match.some((m) => l.includes(m))) ?? null;
}
export function matchSector(label: string): SectorDef | null {
  const l = norm(label);
  return SECTORS.find((d) => d.match.some((m) => l.includes(m))) ?? null;
}
