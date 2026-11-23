/**
 * 사이트 메뉴. 상단 바(데스크톱), 하단 탭 바(휴대폰), 푸터가 같이 읽는다.
 *
 * 2026-11-23 개편: 지면이 둘(뉴스, 종목)이고 나머지는 그 둘의 지난 호다.
 * 그래서 메뉴는 "오늘 읽을 것 둘 + 지난 것 하나" 세 칸이다. 텔레그램은 메뉴가 아니라
 * 구독 버튼이라 따로 그린다(상단 바 오른쪽, 탭 바 네 번째 칸).
 */
export const NAV = [
  { href: "/", label: "오늘의 브리핑", short: "오늘" },
  // 뉴스 브리핑과 별개의 지면이다. 종목은 여기에만 실린다 (src/lib/stocks.ts 머리말)
  { href: "/stocks", label: "종목 브리핑", short: "종목" },
  { href: "/archive", label: "지난 브리핑", short: "지난 호" },
] as const;

/** 지금 경로가 그 메뉴에 속하나. 날짜 페이지(`/brief/…`)는 "오늘" 칸이 아니라 지난 호다. */
export function navActive(href: string, path: string): boolean {
  if (href === "/") return path === "/";
  if (href === "/archive") return path.startsWith("/archive") || path.startsWith("/brief/");
  return path.startsWith(href);
}
