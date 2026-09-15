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
} {
  if (term.rule === "phrase") return { severity: "block" };

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

  for (const term of buildTerms()) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(term.lower, from);
      if (idx === -1) break;
      const end = idx + term.term.length;
      from = idx + 1;
      if (overlaps(idx, end)) continue;
      const { severity, note } = classify(text, idx, end, term);
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
