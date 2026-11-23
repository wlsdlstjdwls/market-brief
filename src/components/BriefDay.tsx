import BriefView from "./BriefView";
import type { BriefDayItem } from "../lib/queries";

/*
 * 그날 회차를 전부 한 문서에 굽고 브라우저가 고른다. 홈과 날짜 페이지가 같이 쓴다.
 *
 * 홈도 두 회차를 다 굽는다(2026-11-23 사용자 지시 "마감, 아침 브리핑 페이지 이동 안 되게").
 * 예전에는 홈에 마감판만 있어 아침 탭을 누르면 /brief/{날짜}?s=am으로 이동했다.
 * 서버는 여전히 searchParams를 읽지 않는다 — 인라인 스크립트가 그리기 전에 `<html data-session>`을
 * 맞추고 CSS가 뒤집는다(SessionTabs 주석). 그래서 ISR이 산다.
 */
const INIT_SESSION =
  '(function(){try{var s=new URLSearchParams(location.search).get("s");' +
  'document.documentElement.dataset.session=s==="am"?"am":"pm"}catch(e){}})()';

export default function BriefDay({
  items,
  basePath,
  recent,
}: {
  items: BriefDayItem[];
  /** 탭 링크의 뿌리. 홈은 `/`, 날짜 페이지는 `/brief/{날짜}` */
  basePath: string;
  recent?: Array<{ tradeDate: string; headline: string }>;
}) {
  const sessions = items.map((i) => i.brief.session);

  // 회차가 하나뿐인 날은 탭도 스크립트도 필요 없다. 감싸는 div도 두지 않는다
  if (items.length === 1) {
    const only = items[0];
    return (
      <BriefView brief={only.brief} sessions={sessions} topics={only.topics} basePath={basePath} recent={recent} />
    );
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: INIT_SESSION }} />
      {items.map((it) => (
        <div key={it.brief.session} className={`ses ses--${it.brief.session}`}>
          <BriefView
            brief={it.brief}
            sessions={sessions}
            topics={it.topics}
            basePath={basePath}
            recent={recent}
            // 두 회차가 이 문서에 다 구워져 있다. 탭이 주소만 바꾸고 CSS가 뒤집는다
            inlineSessions
            // 두 회차가 한 문서에 있다. 접두어가 없으면 `#news`가 둘이 된다
            idPrefix={it.brief.session === "pm" ? "" : `${it.brief.session}-`}
          />
        </div>
      ))}
    </>
  );
}
