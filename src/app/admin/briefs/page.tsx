/**
 * 회차 목록. **무엇이 비었는지를 보는 표다.**
 *
 * 한 줄이 한 회차(날짜 × am/pm)다. 빈 칸에 의미가 있다 —
 *   원고 시각 없음  → 2026-08-26 이전 회차. 원고에 그 줄이 자체가 없다
 *   발송 없음       → 채널에 안 나갔다. 48시간 안이면 아직 나갈 수 있다
 *   링크 0          → 2026-09-18 이전 회차. 원고에 카드별 출처가 없었다
 *   산문 없음       → 국내·해외 본문이 통째로 필터에 걸렸거나 원고에 없었다
 */
import Link from "next/link";
import { isAdmin } from "../../../lib/admin-auth";
import { briefCount, briefList, SESSION_LABEL, stamp } from "../../../lib/admin";

export const dynamic = "force-dynamic";

const PER_PAGE = 60;

export default async function AdminBriefs({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  if (!(await isAdmin())) return null;

  const { p } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const [list, total] = await Promise.all([
    briefList(PER_PAGE, (page - 1) * PER_PAGE),
    briefCount(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1>회차</h1>
        <p className="adm-sub">
          전체 {total.toLocaleString("ko-KR")}회차 | {page} / {pages} 쪽. 빈 칸에 의미가 있다 —
          아래 설명을 본다
        </p>
      </header>

      <div className="adm-table">
        <table>
          <thead>
            <tr>
              <th>거래일</th>
              <th>회차</th>
              <th>상태</th>
              <th>헤드라인</th>
              <th className="num">카드</th>
              <th className="num">링크</th>
              <th>원고</th>
              <th>게시</th>
              <th>발송</th>
            </tr>
          </thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className={b.status === "published" ? "" : "bad"}>
                <td>{b.tradeDate}</td>
                <td>{SESSION_LABEL[b.session] ?? b.session}</td>
                <td>{b.status === "published" ? "발행" : b.status === "draft" ? "초안" : "차단"}</td>
                <td className="adm-cell-wide">
                  <Link
                    href={`/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`}
                    target="_blank"
                  >
                    {b.headline}
                  </Link>
                  {b.proseLen === 0 && <i className="adm-flag">산문 없음</i>}
                </td>
                <td className="num">{b.topics}</td>
                <td className="num">
                  {/* 카드 링크 + 문서 말미 목록. 둘 다 0인 회차가 대부분이라 합쳐서 한 칸에 둔다 */}
                  {b.topicSources + b.docSources || "—"}
                </td>
                <td>{stamp(b.writtenAt, b.tradeDate)}</td>
                <td>{stamp(b.publishedAt, b.tradeDate)}</td>
                <td className={b.notifiedAt ? "" : "bad"}>{stamp(b.notifiedAt, b.tradeDate)}</td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={9}>이 쪽에는 회차가 없다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="adm-chips" role="group" aria-label="쪽">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={n === 1 ? "/admin/briefs" : `/admin/briefs?p=${n}`}
              className={n === page ? "on" : ""}
            >
              {n}
            </Link>
          ))}
        </div>
      )}

      <p className="adm-note">
        <b>원고</b>는 글머리의 작성 기준시각이고 <b>게시</b>는 DB에 처음 들어간 시각이다. 둘이
        벌어진 날이 슬롯이 밀린 날이다. 2026-08-26 이전 회차에는 원고에 그 줄이 없어 비어 있고,
        <b> 링크</b>는 2026-09-18 회차부터 붙기 시작했다 — 그 전이 비는 건 정상이다.
      </p>
    </div>
  );
}
