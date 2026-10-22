/**
 * 원고가 자기 작성 과정을 적은 말을 걷어낸다 (2026-10-22 사용자 지시).
 *
 * 루틴이 검색에 실패하면 원고 곳곳에 이런 말을 남긴다.
 *
 *   > **작성 환경 제약:** 기사 본문 열람(WebFetch)이 DNS 실패로 막혀 …
 *   - 환율, 원자재: 미확인.
 *   10/1 종가는 이번 검색에서 확인하지 못했다.
 *   연준 의사록 — 연말 추가 인상 가능성 시사(검색 요약)
 *
 * 독자에게는 뉴스가 아니라 소음이다. 세 단계로 지운다.
 *   1. 그런 말만 담은 괄호를 지운다 — `(검색 요약)`, `(14:52 기준, 종가 미확인)`
 *   2. 그런 말이 든 문장을 지운다 — 앞뒤의 뉴스 문장은 남긴다
 *   3. 지우고 나서 내용이 비면 그 줄을 지운다
 *
 * **`확인 필요`는 표지가 아니다.** 업종 카드의 체크 포인트가 `실적 뉴스 확인 필요`처럼
 * 쓴다. 앞으로 볼 것을 적은 분석이지 수집 실패가 아니다.
 *
 * **`(추정)`은 숫자에 붙었는지로 가른다.** `가능성이 있다(추정)`는 판단에 붙은 꼬리표라
 * 꼬리표만 떼면 되지만, `코스피 6,803.90(-1.98%, 추정)`에서 꼬리표만 떼면 추정치가
 * 확정치처럼 읽힌다. 그런 문장은 통째로 버린다.
 */

/** 작성 과정을 말하는 표지. 이게 든 문장은 뉴스가 아니다. */
const MARKER =
  /미확인|확인하지\s*못|확인\s*못|확인되지\s*않|확인할\s*수\s*없|확인\s*불가|재검증|이번\s*검색|검색\s*(?:결과|요약|에서|엔진)|스니펫|열람하지\s*못|본문\s*미|WebFetch|ENOTFOUND|DNS|세션\s*권한|색인되지|krx-holidays|요건\s*미달|미달분|판단(?:을|은)?\s*보류|데이터\s*없음|신규\s*데이터/;

/** 원고 머리의 작성 메모 인용문. 줄째 버린다. */
const META_QUOTE = /^\s*>\s*\**\s*(작성\s*환경|거래일\s*확인|수치\s*주의|회차\s*안내|작성\s*시각)/;

/** 괄호 안에 이게 있으면 그 괄호는 작성 메모다. */
const PAREN_META =
  /미확인|확인|검색|스니펫|열람|인용|제목\s*기준|장전판|재검증|기준\s*차이|표기\s*차이|URL/;

/** 숫자에 붙은 추정. 꼬리표만 떼면 추정치가 확정치로 둔갑한다. */
const NUMERIC_GUESS = /\([^()]*\d[^()]*추정[^()]*\)|\([^()]*추정[^()]*\d[^()]*\)|\d[%p]?\s*,\s*추정\)/;

function stripParens(s: string): string {
  return s
    .replace(/\s*\(([^()]*)\)/g, (all, inner: string) => {
      if (PAREN_META.test(inner)) return "";
      if (/^\s*(?:[^()]*\s)?추정\s*$/.test(inner) && !/\d/.test(inner)) return "";
      return all;
    })
    .replace(/\s*\[(?:추정|미확인)\]/g, "");
}

/** 내용 없이 목록 기호, 굵은 글씨, 체크박스, 라벨만 남았나. */
function isHollow(line: string): boolean {
  const rest = line
    .replace(/^\s*(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?/, "")
    .replace(/[*_]/g, "")
    .replace(/^[^:：]{0,30}[:：]\s*$/, "")
    .trim();
  return rest === "" || /^[.,;:·—–-]+$/.test(rest);
}

/** 문장 하나에서 작성 메모를 걷어낸다. 남길 게 없으면 빈 문자열. */
function cleanSentence(s: string): string {
  if (NUMERIC_GUESS.test(s)) return "";
  const t = stripParens(s);
  return MARKER.test(t) ? "" : t;
}

/**
 * 한 줄을 문장으로 쪼개 메모 문장만 뺀다. 목록 기호와 `라벨:` 머리는 첫 문장에 붙어
 * 있으므로, 첫 문장이 지워져도 머리는 살려 뒤 문장에 붙인다.
 */
function cleanLine(line: string): string {
  if (META_QUOTE.test(line)) return "";
  if (!MARKER.test(line) && !/\(|\[/.test(line)) return line;

  const head = /^(\s*(?:>\s*)?(?:[-*•]|\d+[.)])?\s*(?:\[[ xX]?\]\s*)?(?:\*\*[^*\n]{1,30}?[:：]\*\*|[^:：.\n]{1,30}[:：])?\s*)/.exec(line)?.[1] ?? "";
  const body = line.slice(head.length);
  // 마침표 뒤에 닫는 굵은 글씨가 붙는 일이 흔하다 (`약보합.** 종가는`).
  const kept = body
    .split(/(?<=[.!?。](?:\*\*)?)\s+/)
    .map(cleanSentence)
    .filter((s) => s.trim());
  const headClean = MARKER.test(head) ? "" : head;
  const out = (headClean + kept.join(" ")).replace(/\s+$/, "");
  return isHollow(out) ? "" : out;
}

/** 여러 줄 글에서 작성 메모를 걷어낸다. 줄 구조(목록, 빈 줄)는 그대로 둔다. */
export function stripMeta(text: string): string {
  return text
    .split(/\r?\n/)
    // 지워진 줄은 null로 표시해 빼고, 원래 빈 줄(문단 경계)은 남긴다.
    .map((l) => (l.trim() ? cleanLine(l) || null : l))
    .filter((l): l is string => l !== null)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 카드 제목처럼 한 줄짜리. 괄호 메모만 떼고, 그래도 메모가 남으면 빈 문자열. */
export function stripMetaTitle(title: string): string {
  const t = stripParens(title).trim();
  return MARKER.test(t) ? "" : t;
}

/** 작성 메모가 남아 있나 (검증용). */
export function hasMeta(text: string): boolean {
  return MARKER.test(text) || META_QUOTE.test(text);
}
