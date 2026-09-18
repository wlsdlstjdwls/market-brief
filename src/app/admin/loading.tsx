/**
 * 콘솔은 매 요청 DB를 읽는다(`dynamic = "force-dynamic"`). 그 사이를 **뼈대**로 메운다.
 *
 * 「불러오는 중」 한 줄이었는데, 글자만 떠 있으면 화면이 비어 보이고 내용이 들어올 때
 * 레이아웃이 통째로 뛴다. 실제 화면과 같은 자리에 같은 높이의 회색 막대를 깔아 두면
 * 들어올 자리가 미리 잡혀 그 점프가 없다.
 *
 * 모서리를 굴리지 않고 테두리도 없다 — `design/design-spec.md`의 「카드·박스·둥근 모서리
 * 없음」과 같은 선이다. 채우는 색은 구분선과 같은 `--line`이다.
 */

/** 뼈대 막대 한 장. `w`는 폭(%), `h`는 높이(px) */
function Bar({ w, h = 12 }: { w: string; h?: number }) {
  return <span className="sk" style={{ width: w, height: h }} />;
}

export default function Loading() {
  return (
    <div className="adm-page" aria-busy="true" aria-live="polite">
      <span className="sr-only">불러오는 중</span>

      <header className="adm-head">
        <Bar w="120px" h={26} />
        <Bar w="min(420px, 80%)" />
      </header>

      {/* 숫자 칸 넷. 실제 화면의 `.adm-stats`와 같은 격자에 얹는다 */}
      <div className="adm-stats">
        {[0, 1, 2, 3].map((i) => (
          <div className="adm-stat" key={i}>
            <Bar w="56px" h={11} />
            <Bar w="72px" h={22} />
            <Bar w="44px" h={10} />
          </div>
        ))}
      </div>

      {/* 표 여덟 줄. 폭을 조금씩 달리해야 진짜 목록처럼 읽힌다 */}
      <div className="sk-rows">
        {[92, 78, 85, 70, 88, 74, 81, 66].map((w, i) => (
          <Bar key={i} w={`${w}%`} />
        ))}
      </div>
    </div>
  );
}
