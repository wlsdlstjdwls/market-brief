"use client";

/**
 * 회차 표 + 스크롤 페이징.
 *
 * 쪽 번호를 눌러 넘기던 것을 **바닥에 닿으면 다음 묶음을 잇는** 방식으로 바꿨다.
 * 「무엇이 비었나」를 보는 표라서 쪽을 넘나들며 대조하는 일이 잦은데, 그때마다 화면 전체가
 * 다시 그려지면 보던 자리를 잃는다.
 *
 * - 첫 묶음은 **서버가 HTML로 실어 보낸다.** 스크롤을 안 내리면 요청이 한 번도 안 간다.
 * - 다음 묶음은 서버 액션이다. 라우트를 새로 파지 않는 이유는 `actions.ts`에 적어 뒀다.
 * - **관찰자(IntersectionObserver)가 없는 환경을 위해 「더 보기」 버튼을 같이 둔다.**
 *   버튼이 없으면 그런 브라우저에서 첫 60회차 뒤로는 갈 방법이 아예 사라진다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BriefRow } from "../../../lib/admin";
import { SESSION_LABEL, stamp } from "../../../lib/admin-format";
import { moreBriefs } from "./actions";

/** 바닥에 닿기 전에 미리 부른다. 닿고 나서 부르면 빈 화면을 한 번 보게 된다 */
const ROOT_MARGIN = "400px 0px";

function Row({ b }: { b: BriefRow }) {
  return (
    <tr className={b.status === "published" ? "" : "bad"}>
      <td>{b.tradeDate}</td>
      <td>{SESSION_LABEL[b.session] ?? b.session}</td>
      <td>{b.status === "published" ? "발행" : b.status === "draft" ? "초안" : "차단"}</td>
      <td className="adm-cell-wide">
        <Link href={`/brief/${b.tradeDate}${b.session === "am" ? "?s=am" : ""}`} target="_blank">
          {b.headline}
        </Link>
        {b.proseLen === 0 && <i className="adm-flag">산문 없음</i>}
      </td>
      <td className="num">{b.topics}</td>
      {/* 카드 링크 + 문서 말미 목록. 둘 다 0인 회차가 대부분이라 합쳐서 한 칸에 둔다 */}
      <td className="num">{b.topicSources + b.docSources || "—"}</td>
      <td>{stamp(b.writtenAt, b.tradeDate)}</td>
      <td>{stamp(b.publishedAt, b.tradeDate)}</td>
      <td className={b.notifiedAt ? "" : "bad"}>{stamp(b.notifiedAt, b.tradeDate)}</td>
    </tr>
  );
}

export default function BriefTable({
  initial,
  total,
  perPage,
}: {
  initial: BriefRow[];
  total: number;
  perPage: number;
}) {
  const [rows, setRows] = useState<BriefRow[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 더 받을 게 남았나. 서버가 빈 묶음을 주면 그때 닫는다 — 총계만 믿으면 그 사이에 회차가
  // 하나 들어왔을 때 끝나지 않는 스크롤이 된다
  const [done, setDone] = useState(initial.length >= total);

  // 응답을 기다리는 중에 관찰자가 또 불러 같은 묶음을 두 번 받는 걸 막는다
  const inFlight = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    if (inFlight.current || done) return;
    inFlight.current = true;
    setLoading(true);
    setError(false);
    try {
      const next = await moreBriefs(rows.length, perPage);
      setRows((prev) => {
        // 받는 사이 새 회차가 적재되면 같은 줄이 두 번 온다. id로 거른다
        const seen = new Set(prev.map((b) => b.id));
        const add = next.filter((b) => !seen.has(b.id));
        if (add.length === 0) setDone(true);
        return add.length === 0 ? prev : [...prev, ...add];
      });
      if (next.length < perPage) setDone(true);
    } catch {
      // 다시 시도할 수 있게 열어 둔다. 자동으로 재요청하지 않는다 — 실패가 계속되면
      // 바닥에 머무는 동안 같은 요청이 끝없이 나간다
      setError(true);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [done, perPage, rows.length]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || done || error) return;
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: ROOT_MARGIN },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [done, error, loadMore]);

  return (
    <>
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
            {rows.map((b) => (
              <Row key={b.id} b={b} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9}>적재된 회차가 없다.</td>
              </tr>
            )}
            {/* 들어올 자리를 미리 잡아 둔다. 줄이 갑자기 늘어도 화면이 뛰지 않는다 */}
            {loading &&
              [0, 1, 2].map((i) => (
                <tr key={`sk-${i}`} aria-hidden="true">
                  <td colSpan={9}>
                    <span className="sk" style={{ width: `${88 - i * 9}%`, height: 12 }} />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="adm-more" aria-live="polite">
        {error ? (
          <p className="adm-more-err">
            더 불러오지 못했다.{" "}
            <button type="button" onClick={() => void loadMore()}>
              다시 시도
            </button>
          </p>
        ) : done ? (
          <p className="adm-note">{rows.length.toLocaleString("ko-KR")}회차를 다 봤다.</p>
        ) : (
          <button type="button" onClick={() => void loadMore()} disabled={loading}>
            {loading ? "불러오는 중" : `더 보기 ${Math.min(perPage, total - rows.length)}회차`}
          </button>
        )}
        {!done && !error && <div ref={sentinel} className="adm-sentinel" aria-hidden="true" />}
      </div>
    </>
  );
}
