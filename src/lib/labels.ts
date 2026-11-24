/**
 * 카드 항목의 표시 이름. 화면(BriefView)과 텔레그램(notify.ts)이 같이 쓴다. 순수 함수만 둔다.
 *
 * DB(`brief_topic.lines[].label`)에는 적재 때 붙인 이름(`topics.ts`)이 그대로 있다.
 * "무슨 일인가", "왜 중요한가"가 말투가 어색하다는 지적을 받아(2026-11-23) 보여 줄 때만 바꾼다.
 * DB를 고치지 않으니 되돌릴 때는 이 표만 지우면 된다.
 */
const DISPLAY: Record<string, string> = {
  "무슨 일인가": "요약",
  "왜 중요한가": "시장 의미",
  "발생 원인": "배경",
  "시장 관심도": "관심도",
  "지속 가능성": "지속성",
  "논리와 리스크": "쟁점",
  "체크 포인트": "확인할 점",
};

export function displayLabel(label: string): string {
  return DISPLAY[label] ?? label;
}

/** 빈 자리 표시(`—`, `-`, `없음`)는 값이 아니다. */
export const PLACEHOLDER = /^\s*(?:[—–-]+|없음|해당\s*없음|n\/?a)\s*$/i;

/** `A / B`를 [A, B]로. 공백 없는 `/`(`D램/HBM`)는 값 안의 글자라 자르지 않는다. */
export function splitPair(text: string): [string, string] | null {
  const i = text.indexOf(" / ");
  if (i < 0) return null;
  const clean = (s: string) => (PLACEHOLDER.test(s) ? "" : s.trim());
  return [clean(text.slice(0, i)), clean(text.slice(i + 3))];
}

/**
 * 2026-11-24 이전 회차는 DB에 `논리와 리스크: A / B` 한 줄로 들어 있다. 적재(topics.ts)는 이제
 * 둘로 갈라 넣지만, 재적재하지 않은 회차도 같은 모양으로 보이게 화면과 텔레그램이 여기서 한 번 더 가른다.
 * 빈 값은 버린다.
 */
export function expandLines<T extends { label: string; text: string }>(
  lines: T[],
): Array<{ label: string; text: string }> {
  return lines.flatMap((l) => {
    if (l.label !== "논리와 리스크") return [l];
    const pair = splitPair(l.text);
    if (!pair) return [l];
    return [
      { label: "논리", text: pair[0] },
      { label: "리스크", text: pair[1] },
    ];
  }).filter((l) => l.text && !PLACEHOLDER.test(l.text));
}

/**
 * 시장 영향 등급의 표시 말. DB(`brief_topic.impact`)에는 원고에서 읽은 `매우 큼/큼/보통/작음`이 그대로 있고
 * 보여 줄 때만 바꾼다(2026-11-24 사용자 선택, 문구 시안 5차 M2). "매우 큼"과 "큼"이 한 글자 차이라
 * 등급이 덜 갈린다는 이유였다. 되돌릴 때는 이 표만 지운다. 화면과 텔레그램이 같이 쓴다.
 */
const IMPACT_DISPLAY: Record<string, string> = {
  "매우 큼": "매우 높음",
  "큼": "높음",
  "보통": "중간",
  "작음": "낮음",
  "매우 작음": "낮음",
};

export function impactWord(level: string): string {
  return IMPACT_DISPLAY[level] ?? level;
}
