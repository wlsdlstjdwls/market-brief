/**
 * 차단 로그 — guard가 무엇을 몇 건 걸렀나.
 *
 * **실패는 사고가 아니다.** 필터가 제 일을 한 것이고, 걸린 카드 한 장이 버려질 뿐
 * 회차는 그대로 나간다. 이 화면을 보는 이유는 둘이다.
 *   ① 같은 단어가 계속 걸린다  → 오탐일 수 있다(`배럴`당, ~를 `대상`으로, `레이`)
 *   ② 새 표기가 걸리기 시작했다 → `guard.ts`의 목록에 없던 종목명이다. 목록에 더한다
 *
 * **오탐이라고 기준을 느슨하게 풀지 않는다.** 놓치는 쪽이 훨씬 위험하다 — 유료 전환 시
 * 종목을 언급하면 자본시장법상 유사투자자문업 신고 대상이 된다.
 */
import { isAdmin } from "../../../lib/admin-auth";
import { auditList, auditSummary } from "../../../lib/admin";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  ingest: "적재",
  publish: "발행",
  render: "렌더",
};

/** 걸린 항목을 사람이 읽을 줄로. 모양이 회차마다 조금씩 달라 넓게 받는다 */
function violationText(v: unknown): string[] {
  if (!v) return [];
  const list = Array.isArray(v) ? v : [v];
  return list
    .map((x) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        const term = o.term ?? o.match ?? o.value ?? "";
        const level = o.level ?? o.severity ?? "";
        const where = o.where ?? o.field ?? o.section ?? "";
        return [term, level && `(${level})`, where && `— ${where}`]
          .filter(Boolean)
          .join(" ");
      }
      return String(x);
    })
    .filter(Boolean);
}

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>;
}) {
  if (!(await isAdmin())) return null;

  const { all } = await searchParams;
  const onlyFail = all !== "1";
  const [list, summary] = await Promise.all([auditList(onlyFail), auditSummary()]);

  return (
    <div className="adm-page">
      <header className="adm-head">
        <h1>차단 로그</h1>
        <p className="adm-sub">
          {onlyFail ? "걸린 것만 본다" : "통과까지 전부 본다"} | 최근 {list.length}건
        </p>
      </header>

      <section className="adm-sec">
        <h2>단계별</h2>
        <div className="adm-stats">
          {summary.map((s) => (
            <div className="adm-stat" key={s.stage}>
              <span>{STAGE_LABEL[s.stage] ?? s.stage}</span>
              <b>{s.fail.toLocaleString("ko-KR")}</b>
              <small>실패 | 통과 {s.pass.toLocaleString("ko-KR")}</small>
            </div>
          ))}
          {summary.length === 0 && <p className="adm-note">기록이 없다.</p>}
        </div>
        <p className="adm-note">
          <b>적재</b>는 DB에 넣기 직전, <b>발행</b>은 회차를 published로 올릴 때,
          <b> 렌더</b>는 화면에 그리기 직전이다. 네 겹 방어 가운데 DB에 기록을 남기는 셋이다
          — 파일·섹션·문단 필터는 여기 오기 전에 이미 걸러 낸다.
        </p>
      </section>

      <div className="adm-chips" role="group" aria-label="보기">
        <a href="/admin/audit" className={onlyFail ? "on" : ""}>
          걸린 것만
        </a>
        <a href="/admin/audit?all=1" className={onlyFail ? "" : "on"}>
          전부
        </a>
      </div>

      <div className="adm-table">
        <table>
          <thead>
            <tr>
              <th>검사 시각</th>
              <th>거래일</th>
              <th>단계</th>
              <th>결과</th>
              <th className="num">건수</th>
              <th>걸린 것</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const items = violationText(a.violations);
              return (
                <tr key={a.id} className={a.result === "fail" ? "bad" : ""}>
                  <td>{a.checkedAt}</td>
                  <td>{a.tradeDate}</td>
                  <td>{STAGE_LABEL[a.stage] ?? a.stage}</td>
                  <td>{a.result === "fail" ? "실패" : "통과"}</td>
                  <td className="num">{a.violationCount || "—"}</td>
                  <td className="adm-cell-wide">
                    {items.length === 0 ? (
                      "—"
                    ) : (
                      <span className="adm-viol">
                        {items.slice(0, 8).map((t, i) => (
                          <em key={i}>{t}</em>
                        ))}
                        {items.length > 8 && <i>외 {items.length - 8}건</i>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6}>
                  {onlyFail ? "걸린 기록이 없다. 전부 통과했다." : "기록이 없다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
