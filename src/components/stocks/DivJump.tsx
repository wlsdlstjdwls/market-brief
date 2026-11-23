"use client";

/**
 * "배당" 칸에서 아래 "배당 내역" 절로 바로 가는 단추.
 * `<a href="#sd-div">`로 두면 팝업 안에서 방문 기록이 하나 더 쌓여 닫기(`router.back()`)가 한 번 헛돈다.
 * 주소를 건드리지 않고 그 절까지 스크롤만 한다(팝업이면 시트 안, 전체 페이지면 창).
 */
export default function DivJump() {
  return (
    <button
      type="button"
      className="sd-div-jump"
      onClick={() => document.getElementById("sd-div")?.scrollIntoView({ behavior: "smooth", block: "start" })}
    >
      분기별, 특별배당 내역 보기
    </button>
  );
}
