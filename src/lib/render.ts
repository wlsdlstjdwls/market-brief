/**
 * 렌더 직전 최종 방어.
 * DB가 오염되더라도 화면에는 한 글자도 나가지 않게 한다.
 */
import { marked } from "marked";
import { scan } from "./guard";

marked.setOptions({ gfm: true, breaks: false });

const BLOCKED_NOTICE =
  "<p class=\"blocked\">이 블록은 개별 종목 표기가 감지되어 표시하지 않습니다.</p>";

/** 마크다운 → HTML. 위반이 있으면 본문 대신 차단 안내를 반환한다. */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  if (scan(md).violations.length) return BLOCKED_NOTICE;
  // 원문에 든 HTML은 신뢰하지 않는다.
  const escaped = md.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = marked.parse(escaped) as string;

  /*
   * 남은 `**…**` 되살리기.
   * CommonMark는 닫는 `**` 앞이 구두점이고 뒤가 글자면 강조로 보지 않는다
   * (`되돌림(약세 전환)**으로` 가 그 경우다). 한국어 원문에서 흔한 형태라
   * 화면에 별표가 그대로 남는다. 이미 이스케이프된 문자열이라 여기서 태그를
   * 붙여도 새 HTML이 주입되지 않는다.
   */
  return html.replace(/\*\*(?!\s)([^*\n]+?)\*\*/g, "<strong>$1</strong>");
}

/** 짧은 텍스트용. 위반 시 안내 문구로 대체한다. */
export function renderText(s: string | null | undefined): string {
  if (!s) return "";
  return scan(s).violations.length ? "표시할 수 없는 내용" : s;
}
