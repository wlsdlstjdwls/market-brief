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
