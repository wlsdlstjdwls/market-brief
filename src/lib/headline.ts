/**
 * 헤드라인 다듬기.
 *
 * 원본 Executive Summary의 첫 항목 제목을 그대로 쓰면 "코스피 +4.61%, 코스닥 +1.07% —
 * 외국인 쌍끌이 매수"처럼 지수 시세가 앞에 붙는다. 이 사이트는 지수 값을 싣지 않으므로
 * (사용자 지시) 시세 부분을 떼고 그 뒤의 뉴스만 남긴다. 뗐을 때 남는 게 없으면 원문을 둔다.
 */

/** 제목 앞에 붙은 "1. " 같은 원본 번호 */
const LEADING_NUMBER = /^\s*\d+\s*[.)]\s*/;

/**
 * 지수 이름과 등락률만으로 이뤄진 조각인가.
 * "코스피 +1.64%, 코스닥 +2.95% 동반 급등"처럼 뒤에 붙는 짧은 서술어까지 한 덩어리로 본다.
 */
const QUOTE_ONLY = new RegExp(
  "^[\\s,]*(?:(?:코스피|코스닥|나스닥|다우|S&P\\s*500|러셀\\s*\\d*|닛케이\\s*\\d*|상하이)" +
    "\\s*(?:종합|지수)?\\s*[+\\-−]?[\\d,.]+\\s*(?:%|pt|포인트)?[\\s,]*)+" +
    "(?:동반\\s*)?(?:급등|급락|상승|하락|반등|조정|강세|약세|폭등|폭락)?\\s*(?:마감)?[\\s,]*$",
);

/** 제목을 나누는 구분자 (양쪽에 공백이 있는 대시류) */
const SPLIT = /\s+[—–\-]\s+/;

export function cleanHeadline(raw: string): string {
  const title = raw.replace(LEADING_NUMBER, "").trim();
  if (!title) return raw.trim();

  const parts = title.split(SPLIT);
  if (parts.length < 2) return title;

  // 앞에서부터 시세 조각만 걷어낸다. 뒤쪽은 건드리지 않는다.
  let i = 0;
  while (i < parts.length - 1 && QUOTE_ONLY.test(parts[i])) i++;
  const rest = parts.slice(i).join(" — ").trim();
  return rest || title;
}
