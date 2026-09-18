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
 *   3) 개별 종목 지목 표현        관련주 · 수혜주 · 목표주가 ...
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
 * 해외 종목.
 *
 * 사전(`data/ticker_names.json`)은 KRX 상장 종목만 담는다. 그래서 "마이크로소프트 +1.52%,
 * 애플 +1.38%, 엔비디아 +2.54%" 같은 미국 종목 줄이 그대로 통과했다(2026-09-18 아침판에서
 * 실제로 새어 나갔다). 개별 종목을 안 쓴다는 약속에 국적은 상관이 없으므로 여기서 막는다.
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
    out.push({ term: g.term, lower: g.term.toLowerCase(), rule: "name", exclude: g.exclude });
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
      const { severity, note } = verdict;
      taken.push([idx, end]);
      violations.push({
        match: text.slice(idx, end), rule: term.rule, severity,
        start: idx, end, context: contextOf(text, idx, end), note,
      });
    }
  }

  violations.sort((a, b) => a.start - b.start);
  const blocking = violations.filter((v) => v.severity === "block");
  const review = violations.filter((v) => v.severity === "review");
  return { ok: blocking.length === 0, violations, blocking, review };
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
