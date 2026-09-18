/**
 * 회차 목록. **무엇이 비었는지를 보는 표다.**
 *
 * 한 줄이 한 회차(날짜 × am/pm)다. 빈 칸에 의미가 있다 —
 *   원고 시각 없음  → 2026-08-26 이전 회차. 원고에 그 줄이 자체가 없다
 *   발송 없음       → 채널에 안 나갔다. 48시간 안이면 아직 나갈 수 있다
 *   링크 0          → 2026-09-18 이전 회차. 원고에 카드별 출처가 없었다
 *   산문 없음       → 국내·해외 본문이 통째로 필터에 걸렸거나 원고에 없었다
 *
 * **첫 묶음만 서버가 그린다.** 나머지는 바닥에 닿을 때 `BriefTable`이 이어 붙인다.
 * 쪽 번호는 없앴다 — 회차가 늘수록 번호만 줄줄이 늘고, 쪽을 넘길 때마다 화면이 통째로
 * 다시 그려져 보던 자리를 잃었다.
 */
import { isAdmin } from "../../../lib/admin-auth";
import { briefCount, briefList } from "../../../lib/admin";
import BriefTable from "./brief-table";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;

export default async function AdminBriefs() {
  if (!(await isAdmin())) return null;

  const [list, total] = await Promise.all([briefList(PER_PAGE, 0), briefCount()]);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1>회차</h1>
        <p className="adm-sub">
          전체 {total.toLocaleString("ko-KR")}회차. 빈 칸에 의미가 있다 — 아래 설명을 본다
        </p>
      </header>

      <BriefTable initial={list} total={total} perPage={PER_PAGE} />

      <p className="adm-note">
        <b>원고</b>는 글머리의 작성 기준시각이고 <b>게시</b>는 DB에 처음 들어간 시각이다. 둘이
        벌어진 날이 슬롯이 밀린 날이다. 2026-08-26 이전 회차에는 원고에 그 줄이 없어 비어 있고,
        <b> 링크</b>는 2026-09-18 회차부터 붙기 시작했다 — 그 전이 비는 건 정상이다.
      </p>
    </div>
  );
}
