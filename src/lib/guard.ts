/**
 * 종목 언급 차단 필터 (fail-closed).
 *
 * 이 서비스는 개별 종목을 일절 언급하지 않는다.
 * 유료 전환 시 자본시장법상 유사투자자문업 신고 의무를 피하기 위한 사업상 전제이며,
 * "가급적"이 아니라 시스템이 강제하는 불변식이다.
 *
 * 주의: 기존 텔레그램 파이프라인에는 적용하지 않는다. 이 웹 프로젝트 전용이다.
 *
 * 탐지 대상
 *   1) 6자리 종목코드            예) 005930
 *   2) KRX 상장 종목명 사전       data/ticker_names.json (2,875종목)
 *   3) 개별 종목 지목 표현        관련주, 수혜주, 목표주가 ...
 *   4) 해외 기업의 시세 표기      "엔비디아 +2.54%", 해외 기업 셋 이상 나열
 *
 * 해외 기업명 자체는 막지 않는다 (2026-11-24, 사용자 결정 A안).
 * "엔비디아 CEO 복귀" 같은 사건 기사의 주어는 뉴스다. 막는 것은 그 이름에 붙은
 * 등락률과 종목 나열이다. 국내 종목은 이름만 나와도 그대로 막는다.
 */

import tickerNames from "../../data/ticker_names.json";

/**
 * block  = 확실한 종목 언급. 무조건 차단.
 * review = 사전에 있으나 문맥상 종목이 아닐 수 있음. 예) "러셀2000"의 러셀, "아스트라"의 아스트.
 *          조용히 통과시키지 않고 사람이 확인해야 한다.
 */
export type Severity = "block" | "review";

export interface Violation {
  match: string;
  rule: "code" | "name" | "phrase";
  severity: Severity;
  start: number;
  end: number;
  /** 사람이 읽을 근거. 앞뒤 문맥 포함 */
  context: string;
  /** review로 낮춘 이유 */
  note?: string;
}

export interface ScanResult {
  /** block 위반이 하나도 없으면 true */
  ok: boolean;
  violations: Violation[];
  blocking: Violation[];
  review: Violation[];
}

const NAME_MAP = tickerNames as Record<string, string>;

/** 종목명이 없어도 개별 종목을 지목하는 표현 자체를 금지한다. */
const EQUITY_PHRASES = [
  "관련주", "수혜주", "대장주", "테마주", "주도주",
  "추천종목", "관심종목", "매수추천", "매도추천", "목표주가", "목표가",
  "급등주", "갭상승", "갭하락", "종목추천",
];

/**
 * 사전이 KRX 표기(영문)만 갖고 있어 한글로 쓰면 빠져나가는 종목들.
 *
 * 예를 들어 사전에는 `NAVER`만 있어서 "엔비디아, 네이버에 1.48조원 투자" 같은 제목이
 * 그대로 통과했다. 실제로 새던 구멍이라 별도 목록으로 막는다.
 * 여기 없는 표기가 또 발견되면 이 목록에 추가한다.
 */
const HANGUL_ALIASES = [
  "네이버", "에스케이", "엘지", "케이티", "지에스", "씨제이", "엘에스",
  "에이치엠엠", "에스오일", "에쓰오일", "엔씨소프트", "에스케이씨",
  "케이씨씨", "에이치디씨", "에프앤에프", "엔에이치엔", "오씨아이",
  "디엘이앤씨", "포스코", "한국전력", "케이비금융", "디비하이텍",
];

/**
 * 해외 기업.
 *
 * 사전(`data/ticker_names.json`)은 KRX 상장 종목만 담는다. 그래서 "마이크로소프트 +1.52%,
 * 애플 +1.38%, 엔비디아 +2.54%" 같은 미국 종목 줄이 그대로 통과했다(2026-09-18 아침판).
 * 그 뒤로 이 목록의 이름은 나오기만 해도 막았는데, 그러면 "엔비디아 CEO 복귀"처럼
 * 시장 전체를 흔드는 사건 기사가 통째로 빠진다(2026-11-24 사용자 지적).
 *
 * 지금 기준 (A안):
 *   - 이름만 나오면 통과한다. 사건 기사의 주어다.
 *   - 이름 뒤 같은 구절에 등락률이 붙으면 막는다 (`pricedAfter`).
 *   - 같은 문장에 부호 붙은 %와 시세 낱말이 있으면 막는다 (`pricedSentence`).
 *   - 한 줄에 셋 이상 나열되면 막는다 (`GLOBAL_LIST_MIN`). 시세판이다.
 *   - "주도 종목" 같은 나열 라벨, 관련주/수혜주, 목표주가는 지금처럼 막는다.
 *
 * 국내 종목은 여기 해당하지 않는다. 이름만 나와도 막는다.
 *
 * `exclude`는 그 표기로 시작하는 보통명사. "애플리케이션", "메타버스", "인텔리전스"처럼
 * 종목이 아닌 단어까지 문단을 통째로 버리는 것을 막는다. 뒤에 이어지는 글자로 판정한다.
 * 목록에 없는 표기가 또 발견되면 여기에 추가한다.
 */
interface GlobalEquity {
  term: string;
  /** 이 패턴이 뒤에 붙으면 종목이 아니다 */
  exclude?: RegExp;
}

const GLOBAL_EQUITIES: GlobalEquity[] = [
  // 미국 빅테크
  { term: "마이크로소프트" }, { term: "애플", exclude: /^리/ }, { term: "엔비디아" },
  { term: "테슬라" }, { term: "아마존" }, { term: "알파벳" }, { term: "구글" },
  { term: "메타플랫폼" }, { term: "메타 플랫폼" }, { term: "넷플릭스" }, { term: "오라클" },
  { term: "세일즈포스" }, { term: "어도비" }, { term: "시스코" }, { term: "팔란티어" },
  { term: "스노우플레이크" }, { term: "데이터독" }, { term: "서비스나우" }, { term: "워크데이" },
  { term: "크라우드스트라이크" }, { term: "팔로알토" }, { term: "포티넷" }, { term: "지스케일러" },
  { term: "CrowdStrike" }, { term: "Palo Alto" }, { term: "Fortinet" },
  // 반도체
  { term: "브로드컴" }, { term: "인텔", exclude: /^리/ }, { term: "퀄컴" }, { term: "마이크론" },
  { term: "AMD" }, { term: "TSMC" }, { term: "ASML" }, { term: "마벨" }, { term: "온세미" },
  { term: "텍사스인스트루먼트" }, { term: "아날로그디바이스" }, { term: "램리서치" },
  { term: "어플라이드머티리얼즈" }, { term: "어플라이드 머티리얼즈" }, { term: "Intel", exclude: /^l/i },
  { term: "Nvidia" }, { term: "Micron" }, { term: "Broadcom" }, { term: "Qualcomm" },
  // 산업 금융 소비 헬스케어
  { term: "제네락" }, { term: "Generac" }, { term: "캐터필러" }, { term: "보잉" },
  { term: "록히드마틴" }, { term: "레이시온" }, { term: "허니웰" }, { term: "이튼" },
  { term: "버티브" }, { term: "슈나이더일렉트릭" }, { term: "지멘스" }, { term: "ABB" },
  { term: "골드만삭스" }, { term: "JP모건" }, { term: "모건스탠리" }, { term: "버크셔" },
  { term: "블랙록" }, { term: "마스터카드" }, { term: "페이팔" }, { term: "코인베이스" },
  { term: "마이크로스트래티지" }, { term: "로빈후드" },
  { term: "엑손모빌" }, { term: "셰브론" }, { term: "월마트" }, { term: "코스트코" },
  { term: "홈디포" }, { term: "맥도날드" }, { term: "스타벅스" }, { term: "나이키" },
  { term: "코카콜라" }, { term: "펩시코" }, { term: "존슨앤드존슨" }, { term: "존슨앤존슨" },
  { term: "일라이릴리" }, { term: "노보노디스크" }, { term: "유나이티드헬스" }, { term: "화이자" },
  { term: "모더나" }, { term: "아스트라제네카" }, { term: "노바티스" },
  // 모빌리티
  { term: "리비안" }, { term: "루시드" }, { term: "우버" }, { term: "에어비앤비" },
  { term: "쇼피파이" },
  // 아시아
  { term: "알리바바" }, { term: "텐센트" }, { term: "바이두" }, { term: "징둥" },
  { term: "핀둬둬" }, { term: "니오" }, { term: "샤오펑" }, { term: "리오토" },
  { term: "비야디" }, { term: "BYD" }, { term: "SMIC" }, { term: "소니" },
  { term: "닌텐도" }, { term: "소프트뱅크" }, { term: "도요타" }, { term: "토요타" },
  { term: "패스트리테일링" }, { term: "어드반테스트" }, { term: "도쿄일렉트론" },
  { term: "웨스팅하우스" }, { term: "Westinghouse" },
  // AI 인프라, 신규 상장 (2026-11 원고에 자주 나온다)
  { term: "네비우스" }, { term: "슈퍼마이크로" }, { term: "코어위브" }, { term: "아이렌" },
  { term: "앤트로픽" }, { term: "루멘텀" }, { term: "스페이스X" }, { term: "HPE" },
  { term: "델 테크놀로지스" }, { term: "Arm", exclude: /^[a-z]/ },
];

/**
 * 종목명 없이도 "지금부터 개별 종목을 나열한다"고 선언하는 라벨.
 * 원본이 `**주도 종목**: …`, `**대표 종목**: …` 꼴로 쓰기 때문에, 이 줄은 뒤에 어떤 이름이
 * 오든 통째로 버린다. 사전에 없는 해외 종목이 와도 여기서 걸린다.
 */
const EQUITY_LABEL_RES: RegExp[] = [
  /(주도|주요|대표|개별|추천|관심|편입|보유|상위|핵심)\s*종목/g,
  /종목\s*(별|추천|선정|리스트)/g,
  /최선호주|차선호주/g,
  /(탑|톱)\s*픽|top\s*pick/gi,
];

/**
 * 해외 기업명 뒤 같은 구절 안의 등락률. "엔비디아 +2.54%", "엔비디아(+2.5%)",
 * "엔비디아가 3% 급등", "인텔 하루 -28.58%", "알파벳 실적 쇼크 12~13% 급락".
 * 구절은 쉼표, 줄표(—), 줄바꿈에서 끊는다. 이름 뒤 `PRICE_WINDOW`자만 본다.
 *
 * "엔비디아 3분기 매출 1,158억달러(+103%)"처럼 실적 숫자의 증감률은 시세가 아니다.
 * 숫자 앞에 `METRIC_RE` 말이 있으면 그 숫자는 실적으로 본다.
 */
const PRICE_WINDOW = 24;
const SIGNED_PCT_RE = /[+\-−▲▼△▽]\s?\d+(?:\.\d+)?\s?%/;
const MOVE_PCT_RE =
  /\d+(?:\.\d+)?\s?%\s*(?:상승|하락|급등|급락|올랐|오른|내렸|내린|떨어|뛰었|뛴|밀렸|빠졌|폭등|폭락|강세|약세)/;
const METRIC_RE = /매출|이익|영업|가이던스|성장률|증가율|수출|점유율|마진|EPS/;
const CLAUSE_END_RE = /[,，。;\n—–]|\s-\s/;

function pricedAfter(text: string, end: number): boolean {
  const clause = text.slice(end, end + PRICE_WINDOW).split(CLAUSE_END_RE)[0];
  for (const re of [SIGNED_PCT_RE, MOVE_PCT_RE]) {
    const m = clause.match(re);
    if (m && !METRIC_RE.test(clause.slice(0, m.index))) return true;
  }
  return false;
}

/**
 * 등락률이 이름과 떨어져 있어도 같은 문장이면 시세다.
 * "젠슨 황, 엔비디아 CEO 사임 — 주가 장중 -14% → 종가 -4.34%",
 * "AMD 3분기 매출 … — 시간외 +6~8%", "방어주 강세 — 헬스케어 +1.84%, 나이키, 홈디포".
 * 문장 = 줄바꿈 또는 "다. " 사이. 해외 기업명 + 부호 붙은 % + 시세 낱말이 다 있으면 막는다.
 * 실적 증감률("매출 …(+12%)")은 시세 낱말이 없어 통과한다.
 */
const PRICE_WORD_RE =
  /주가|시간외|장중|종가|정규장|낙폭|신저가|신고가|급등|급락|폭등|폭락|강세|약세|상승|하락|올랐|내렸|시총|시가총액/;
const SENTENCE_SPLIT_RE = /\n|(?<=[다요])\.(?=\s|$)/;

function sentenceOf(text: string, i: number): string {
  let from = 0;
  for (const part of text.split(SENTENCE_SPLIT_RE)) {
    const start = text.indexOf(part, from);
    const end = start + part.length;
    if (i >= start && i < end) return part;
    from = end;
  }
  return "";
}

/** "종가 165.05달러", "주가는 3,000원" — 등락률이 없어도 주가 수준이다. */
const PRICE_LEVEL_RE = /(?:주가|종가|장중|시간외|정규장)[은는이가도]?\s*(?:최고\s*|최저\s*)?[\d,.]+\s*(?:달러|원|엔|위안)/;

function pricedSentence(text: string, i: number): boolean {
  const s = sentenceOf(text, i);
  if (PRICE_LEVEL_RE.test(s)) return true;
  return /[+\-−▲▼△▽]\s?\d+(?:\.\d+)?(?:~\d+(?:\.\d+)?)?\s?%/.test(s) && PRICE_WORD_RE.test(s);
}

const GLOBAL_PRICE_NOTE = "해외 기업 시세";
const GLOBAL_LIST_NOTE = "해외 기업 나열";

/** 한 줄에 해외 기업이 이만큼 나오면 시세 나열로 본다. */
const GLOBAL_LIST_MIN = 3;

/** 앞뒤가 숫자가 아닌 6자리 숫자만 종목코드로 본다. */
const CODE_RE = /(?<![0-9])[0-9]{6}(?![0-9])/g;

/** 종목명 뒤에 올 수 있는 조사·접미사 */
const PARTICLE =
  "이|가|은|는|을|를|의|에|와|과|도|만|로|으로|에서|부터|까지|보다|처럼|및|등|들|사|주|측|그룹";
const TAIL_OK_RE = new RegExp(`^(?:${PARTICLE})?(?![가-힣])`);

const HANGUL_RE = /[가-힣]/;

interface Term {
  term: string;
  lower: string;
  rule: "name" | "phrase";
  /** 해외 기업. 이름만으로는 막지 않는다 */
  global?: boolean;
  /** 뒤에 이 패턴이 붙으면 종목이 아니다 (애플리케이션, 인텔리전스 …) */
  exclude?: RegExp;
}

let TERMS: Term[] | null = null;

const isHangul = (ch?: string) => !!ch && HANGUL_RE.test(ch);
const isAsciiWord = (ch?: string) => !!ch && /[A-Za-z0-9]/.test(ch);

export function buildTerms(): Term[] {
  if (TERMS) return TERMS;
  const seen = new Set<string>();
  const out: Term[] = [];

  for (const raw of Object.values(NAME_MAP)) {
    const term = raw.trim();
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push({ term, lower: term.toLowerCase(), rule: "name" });
  }
  for (const a of HANGUL_ALIASES) {
    if (seen.has(a)) continue;
    seen.add(a);
    out.push({ term: a, lower: a.toLowerCase(), rule: "name" });
  }

  for (const g of GLOBAL_EQUITIES) {
    if (seen.has(g.term)) continue;
    seen.add(g.term);
    out.push({
      term: g.term, lower: g.term.toLowerCase(), rule: "name", exclude: g.exclude, global: true,
    });
  }

  for (const p of EQUITY_PHRASES) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push({ term: p, lower: p.toLowerCase(), rule: "phrase" });
  }

  // 긴 것부터 검사해 "삼성전자우"가 "삼성전자"로 잘리지 않게 한다.
  out.sort((a, b) => b.term.length - a.term.length);
  TERMS = out;
  return out;
}

function contextOf(text: string, start: number, end: number): string {
  const from = Math.max(0, start - 30);
  const to = Math.min(text.length, end + 30);
  return (
    (from > 0 ? "…" : "") +
    text.slice(from, to).replace(/\s+/g, " ") +
    (to < text.length ? "…" : "")
  );
}

/**
 * 경계 판정.
 * 놓치는 쪽(false negative)이 훨씬 위험하므로, 경계가 애매하면 버리지 않고 review로 남긴다.
 */
function classify(text: string, start: number, end: number, term: Term): {
  severity: Severity;
  note?: string;
} | null {
  if (term.rule === "phrase") return { severity: "block" };

  // 보통명사의 일부다 (애플리케이션, 인텔리전스 …). 종목이 아니므로 아예 세지 않는다.
  if (term.exclude?.test(text.slice(end, end + 8))) return null;

  const before = text[start - 1];
  const after = text[end];
  const hasAscii = /[A-Za-z]/.test(term.term);

  if (hasAscii) {
    if (isAsciiWord(before) || isAsciiWord(after)) {
      return { severity: "review", note: "영숫자에 이어붙어 있어 다른 단어의 일부일 수 있음" };
    }
    return { severity: "block" };
  }

  if (isHangul(before)) {
    return { severity: "review", note: "앞에 한글이 붙어 더 긴 단어의 일부일 수 있음" };
  }
  if (after && /[0-9]/.test(after)) {
    return { severity: "review", note: "뒤에 숫자가 붙어 지수·상품명일 수 있음 (예: 러셀2000)" };
  }
  if (!TAIL_OK_RE.test(text.slice(end, end + 6))) {
    return { severity: "review", note: "뒤에 조사가 아닌 한글이 붙어 다른 단어일 수 있음 (예: 아스트라)" };
  }
  return { severity: "block" };
}

/** 텍스트를 훑어 종목 언급을 찾는다. 겹치는 구간은 가장 긴 것만 남긴다. */
export function scan(text: string): ScanResult {
  const violations: Violation[] = [];
  if (!text) return { ok: true, violations, blocking: [], review: [] };

  const lower = text.toLowerCase();
  const taken: Array<[number, number]> = [];
  const overlaps = (s: number, e: number) => taken.some(([ts, te]) => s < te && e > ts);

  for (const m of text.matchAll(CODE_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    taken.push([start, end]);
    violations.push({
      match: m[0], rule: "code", severity: "block",
      start, end, context: contextOf(text, start, end),
    });
  }

  /*
   * "주도 종목", "대표 종목" 같은 나열 선언 라벨.
   * 뒤에 오는 이름이 사전에 없는 해외 종목이어도 이 줄 자체가 개별 종목 나열이라 버린다.
   */
  for (const re of EQUITY_LABEL_RES) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      taken.push([start, end]);
      violations.push({
        match: m[0], rule: "phrase", severity: "block",
        start, end, context: contextOf(text, start, end),
      });
    }
  }

  const globals: Array<{ start: number; end: number; verdict: { severity: Severity; note?: string } }> = [];

  for (const term of buildTerms()) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(term.lower, from);
      if (idx === -1) break;
      const end = idx + term.term.length;
      from = idx + 1;
      if (overlaps(idx, end)) continue;
      const verdict = classify(text, idx, end, term);
      if (!verdict) continue;
      if (term.global) {
        // 자리는 잡아 둔다. 안 그러면 이름 안의 짧은 국내 종목명이 대신 걸린다.
        taken.push([idx, end]);
        globals.push({ start: idx, end, verdict });
        continue;
      }
      const { severity, note } = verdict;
      taken.push([idx, end]);
      violations.push({
        match: text.slice(idx, end), rule: term.rule, severity,
        start: idx, end, context: contextOf(text, idx, end), note,
      });
    }
  }

  /*
   * 해외 기업: 이름 자체는 통과. 등락률이 붙었거나 한 줄에 셋 이상 나열됐을 때만 막는다.
   * 경계가 애매한 것(review)은 이름만 나온 경우라 따로 세지 않는다.
   */
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;
  const perLine = new Map<number, Set<string>>();
  for (const g of globals) {
    if (g.verdict.severity !== "block") continue;
    const line = lineOf(g.start);
    const set = perLine.get(line) ?? new Set<string>();
    set.add(text.slice(g.start, g.end).toLowerCase());
    perLine.set(line, set);
  }
  for (const g of globals) {
    if (g.verdict.severity !== "block") continue;
    const priced = pricedAfter(text, g.end) || pricedSentence(text, g.start);
    const listed = (perLine.get(lineOf(g.start))?.size ?? 0) >= GLOBAL_LIST_MIN;
    if (!priced && !listed) continue;
    violations.push({
      match: text.slice(g.start, g.end), rule: "name", severity: "block",
      start: g.start, end: g.end, context: contextOf(text, g.start, g.end),
      note: priced ? GLOBAL_PRICE_NOTE : GLOBAL_LIST_NOTE,
    });
  }

  violations.sort((a, b) => a.start - b.start);
  const blocking = violations.filter((v) => v.severity === "block");
  const review = violations.filter((v) => v.severity === "review");
  return { ok: blocking.length === 0, violations, blocking, review };
}

/**
 * 해외 기업 시세 때문에만 걸린 문장을 빼고 나머지를 돌려준다.
 *
 * "엔비디아 CEO 복귀" 카드의 본문에 "엔비디아 종가 165.05달러는 …" 한 문장이 섞이면
 * 카드나 문단을 통째로 버리는 대신 그 문장만 뺀다. 국내 종목, 코드, 지목 표현이
 * 하나라도 섞인 문장은 손대지 않고 남겨 두므로 호출부의 검사에서 그대로 걸린다.
 */
export function stripGlobalPriceSentences(text: string): string {
  if (!text) return text;
  const isGlobalOnly = (v: Violation) =>
    v.note === GLOBAL_PRICE_NOTE || v.note === GLOBAL_LIST_NOTE;
  const parts = text.split(/(\n|(?<=[다요])\.(?=\s|$))/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sentence = parts[i];
    const sep = parts[i + 1] ?? "";
    const v = scan(sentence).violations;
    if (v.length && v.every(isGlobalOnly)) {
      // 문장과 그 끝의 마침표를 같이 뺀다. 줄바꿈은 남긴다.
      if (sep === "\n") out.push(sep);
      continue;
    }
    out.push(sentence + sep);
  }
  return out.join("").replace(/^\s+/, "").replace(/[ \t]{2,}/g, " ").trim();
}

export class EquityMentionError extends Error {
  readonly violations: Violation[];
  constructor(where: string, violations: Violation[]) {
    const head = violations
      .slice(0, 8)
      .map((v) => `  [${v.rule}] "${v.match}" @${v.start} :: ${v.context}`)
      .join("\n");
    super(
      `종목 언급 ${violations.length}건 검출 (${where}). 발행 차단.\n${head}` +
        (violations.length > 8 ? `\n  … 외 ${violations.length - 8}건` : "")
    );
    this.name = "EquityMentionError";
    this.violations = violations;
  }
}

/**
 * fail-closed 관문. 부분 통과 없음.
 * @param strict true면 review 등급도 차단한다 (발행·렌더 직전에 사용).
 */
export function assertNoEquityMention(text: string, where = "unknown", strict = true): void {
  const r = scan(text);
  const bad = strict ? r.violations : r.blocking;
  if (bad.length) throw new EquityMentionError(where, bad);
}

/** 객체의 모든 문자열 값을 재귀 검사한다. */
export function assertObjectClean(obj: unknown, where = "unknown", strict = true): void {
  const all: Violation[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      const r = scan(v);
      all.push(...(strict ? r.violations : r.blocking));
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(obj);
  if (all.length) throw new EquityMentionError(where, all);
}
