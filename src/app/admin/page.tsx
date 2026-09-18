/**
 * 대시보드 — 「오늘 회차가 나갔나」와 「무엇이 빠졌나」 두 가지를 본다.
 *
 * 이 사이트에서 하루에 어긋날 수 있는 자리는 넷이다. 순서대로 위에서 아래로 놓았다.
 *   ① 원고가 늦어 슬롯이 전부 헛돌았다      → 「오늘」 칸이 빈다
 *   ② 적재는 됐는데 채널 발송이 실패했다    → 「발송 대기」가 뜬다
 *   ③ guard가 걸어 카드가 통째로 버려졌다   → 「차단」 숫자가 오른다
 *   ④ 사람이 안 들어온다                    → 「방문」 타일
 */
import Link from "next/link";
import { isAdmin } from "../../lib/admin-auth";
import { ago, dashboardData, SESSION_LABEL, stamp, type BriefRow } from "../../lib/admin";
import { analyticsOn, ANALYTICS_START, ONLINE_MIN } from "../../lib/analytics";

export const dynamic = "force-dynamic";

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: number | string;
  note?: string;
}) {
  return (
    <div className="adm-stat">
      <span>{label}</span>
      <b>{typeof value === "number" ? value.toLocaleString("ko-KR") : value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

/** 회차 한 줄. 무엇이 비었는지가 한눈에 들어와야 한다 */
function BriefLine({ b }: { b: BriefRow }) {
  const tone = b.status === "published" ? "ok" : b.status === "blocked" ? "bad" : "late";
  return (
    <li className={`adm-brief ${tone}`}>
      <span className="adm-brief-date">
        {b.tradeDate}
        <i>{SESSION_LABEL[b.session] ?? b.session}</i>
      </span>
      <span className="adm-brief-head">
        <Link href={`/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`} target="_blank">
          {b.headline}
        </Link>
      </span>
      <span className="adm-brief-meta">
        {/* 원고 작성 시각과 게시 시각은 다르다. 둘이 벌어진 날이 슬롯이 밀린 날이다 */}
        원고 {stamp(b.writtenAt, b.tradeDate)} | 게시 {stamp(b.publishedAt, b.tradeDate)} |{" "}
        {b.notifiedAt ? `발송 ${stamp(b.notifiedAt, b.tradeDate)}` : <strong>미발송</strong>}
      </span>
      <span className="adm-brief-num">
        카드 {b.topics}
        {b.topicSources > 0 && <em>링크 {b.topicSources}</em>}
        {b.proseLen === 0 && <i title="국내·해외 산문이 비었다">산문 없음</i>}
      </span>
    </li>
  );
}

export default async function AdminDashboard() {
  // 레이아웃이 이미 걸렀지만 한 번 더 본다 — 자식 세그먼트는 레이아웃과 나란히 렌더될 수 있다
  if (!(await isAdmin())) return null;

  const { today, todayBriefs, recent, mix, stats, pendingNotify, auditFails, visits } =
    await dashboardData();

  const hasAm = todayBriefs.some((b) => b.session === "am");
  const hasPm = todayBriefs.some((b) => b.session === "pm");
  const last = recent[0];

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1>대시보드</h1>
        <p className="adm-sub">
          {todayBriefs.length === 2 ? (
            <>오늘({today}) 두 회차 모두 발행됐다</>
          ) : todayBriefs.length === 1 ? (
            <>
              오늘({today}) <b>{hasAm ? "아침" : "마감"} 브리핑</b>만 있다.{" "}
              {hasAm ? "마감" : "아침"} 회차는 아직이다
            </>
          ) : (
            <>
              <strong>오늘({today}) 발행된 회차가 없다.</strong> 주말·공휴일이면 정상이고,
              평일이면 원고가 늦었거나 슬롯이 헛돈 것이다 — 마지막 회차는{" "}
              {last ? `${last.tradeDate} ${SESSION_LABEL[last.session]} (${ago(last.publishedAt)})` : "없다"}
            </>
          )}
        </p>
      </header>

      {/* 아직 채널에 안 나간 회차. 48시간이 지나면 notify가 어차피 건너뛰므로 여기서도 사라진다 */}
      {pendingNotify.length > 0 && (
        <section className="adm-sec">
          <h2>발송 대기</h2>
          <ul className="adm-pending">
            {pendingNotify.map((p) => (
              <li key={`${p.tradeDate}|${p.session}`}>
                <b>
                  {p.tradeDate} {SESSION_LABEL[p.session]}
                </b>{" "}
                — {p.publishedAt} 게시, 텔레그램 미발송
              </li>
            ))}
          </ul>
          <p className="adm-note">
            워크플로의 발송 step이 다음 슬롯에서 다시 시도한다. 계속 남아 있으면 손으로
            <code>npm run notify</code>를 돌린다. 48시간이 지난 회차는 목록에서 빠지고 발송도 안 된다.
          </p>
        </section>
      )}

      <section className="adm-sec">
        <h2>
          방문
          <Link href="/admin/visitors">기간별로 보기</Link>
        </h2>
        {!analyticsOn() && (
          <p className="adm-note">
            <strong>집계가 아직 안 켜졌다.</strong> {ANALYTICS_START}부터 적는다 — 그때까지는
            무엇을 해도 0이다(env <code>ANALYTICS_START</code>로 당길 수 있고, 개인정보 처리방침
            시행일도 같이 옮겨야 한다).
          </p>
        )}
        <div className="adm-stats">
          <Stat label="동시접속" value={visits.online} note={`최근 ${ONLINE_MIN}분`} />
          <Stat
            label="오늘 방문"
            value={visits.todayVisitors}
            note={`${visits.todayViews.toLocaleString("ko-KR")}뷰`}
          />
          <Stat
            label="누적 방문"
            value={visits.totalVisitors}
            note={`${visits.totalViews.toLocaleString("ko-KR")}뷰`}
          />
        </div>
      </section>

      <section className="adm-sec">
        <h2>
          발행
          <Link href="/admin/briefs">전체 보기</Link>
        </h2>
        <div className="adm-stats">
          <Stat
            label="발행 회차"
            value={stats.published}
            note={`${stats.days}일 | 전체 ${stats.total}`}
          />
          <Stat
            label="초안 / 차단"
            value={`${stats.draft} / ${stats.blocked}`}
            note={stats.blocked > 0 ? "차단된 회차가 있다" : "차단 없음"}
          />
          <Stat
            label="카드"
            value={stats.topics}
            note={`뉴스 ${mix.news} | 테마 ${mix.theme} | 업종 ${mix.sector}`}
          />
          <Stat
            label="기사 링크 붙은 카드"
            value={stats.topicsWithSources}
            note="2026-09-18 회차부터 붙는다"
          />
        </div>
        <p className="adm-note">
          기간 {stats.firstDate ?? "—"} ~ {stats.lastDate ?? "—"}. 회차가 하나뿐인 날이 있어
          날짜 수와 회차 수가 다르다.
        </p>
      </section>

      <section className="adm-sec">
        <h2>최근 회차</h2>
        <ul className="adm-briefs">
          {recent.map((b) => (
            <BriefLine key={b.id} b={b} />
          ))}
          {recent.length === 0 && <li className="adm-brief">적재된 회차가 없다.</li>}
        </ul>
      </section>

      <section className="adm-sec">
        <h2>
          차단 필터
          <Link href="/admin/audit">로그 보기</Link>
        </h2>
        <div className="adm-stats">
          <Stat
            label="최근 30일 실패"
            value={auditFails}
            note={auditFails > 0 ? "걸린 회차가 있다" : "전부 통과"}
          />
        </div>
        <p className="adm-note">
          실패는 사고가 아니라 <b>필터가 제 일을 한 것</b>이다. 카드 한 장이 버려졌을 뿐
          회차는 그대로 나간다. 같은 단어가 계속 걸리면 오탐일 수 있으니 로그에서 본다.
        </p>
      </section>

      {/* 이 콘솔은 DB를 읽기만 한다. 고치는 일은 여전히 파이프라인 몫이다 */}
      <p className="adm-note adm-note--foot">
        이 콘솔은 DB를 읽기만 한다. 회차를 다시 넣어야 하면
        <code>npm run ingest</code>, 발송은 <code>npm run notify</code>다.
      </p>
    </div>
  );
}
