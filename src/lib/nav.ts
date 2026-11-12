/** 상단과 하단 공용 네비 항목. 첫 항목(오늘)은 푸터에서 제외한다. */
export const NAV = [
  { href: "/", label: "오늘" },
  { href: "/archive", label: "지난 브리핑" },
  // 뉴스 브리핑과 별개의 지면이다. 종목은 여기에만 실린다 (src/lib/stocks.ts 머리말)
  { href: "/stocks", label: "종목 브리핑" },
] as const;
