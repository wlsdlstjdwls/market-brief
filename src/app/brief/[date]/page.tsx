import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BriefView from "../../../components/BriefView";
import { getBriefDay, listBriefs } from "../../../lib/queries";
import { SITE_DESCRIPTION } from "../../../lib/site";

export const revalidate = 300;

type Params = { params: Promise<{ date: string }> };

/**
 * `generateMetadata`와 페이지 본문이 같은 날짜를 읽는다. 감싸 두지 않으면 DB를 두 번 친다.
 */
const load = cache(getBriefDay);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 그날 회차를 **전부** 구워 놓고 브라우저가 고르게 한다. 그리기 전에 도는 한 줄이다.
 *
 * `<html data-session>`만 정하고 끝난다 — 보이고 감추는 일은 CSS가 한다(`globals.css`의 `.ses`).
 * `useEffect`로 하면 첫 화면이 마감판으로 한 번 그려졌다가 아침판으로 바뀌어 깜빡인다.
 * **텔레그램 아침 알림이 `?s=am`으로 바로 보내므로** 그 깜빡임은 주 진입 경로에서 난다.
 */
const INIT_SESSION =
  '(function(){try{var s=new URLSearchParams(location.search).get("s");' +
  'document.documentElement.dataset.session=s==="am"?"am":"pm"}catch(e){}})()';

/**
 * 발행된 날짜를 빌드 때 미리 굽는다. 78회차에 질의 한 번이라 빌드 시간이 거의 안 는다.
 *
 * **여기 없는 날짜도 열린다.** 새 회차는 배포 뒤에 생기므로 목록에 없고, 그때는 첫 요청이
 * 서버에서 한 번 돌고 그 결과가 `revalidate`만큼 캐시된다(`dynamicParams` 기본값이 true다).
 * 미리 굽는 이유는 그 첫 한 번마저 없애려는 것이다.
 */
export async function generateStaticParams() {
  const dates = await listBriefs(500);
  return dates.map((b) => ({ date: b.tradeDate }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  const items = DATE_RE.test(date) ? await load(date) : [];

  /*
   * 공유 카드에 찍히는 문장이다. 그날 헤드라인이 있으면 그걸 쓴다 — 카카오톡·슬랙에서
   * 눈에 들어오는 건 사이트 설명이 아니라 그날 무슨 일이 있었나다.
   *
   * **회차별로 갈리지 않는다.** `?s=am`으로 들어와도 마감판(없으면 그날 있는 것) 헤드라인이
   * 나간다 — 회차를 가리려면 서버가 `searchParams`를 읽어야 하고, 그러면 ISR이 죽는다.
   * 그쪽이 훨씬 비싸서 이걸 택했다.
   */
  const description = items[0]?.brief.headline || SITE_DESCRIPTION;
  const title = `${date} 브리핑`;
  // canonical은 날짜 하나다. `?s=am`은 같은 문서의 다른 탭이지 다른 문서가 아니다
  const url = `/brief/${date}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BriefPage({ params }: Params) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  const items = await load(date);
  if (!items.length) notFound();

  const sessions = items.map((i) => i.brief.session);

  // 회차가 하나뿐인 날은 탭도 스크립트도 필요 없다. 감싸는 div도 두지 않는다
  if (items.length === 1) {
    const only = items[0];
    return <BriefView brief={only.brief} sessions={sessions} topics={only.topics} />;
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
            // 두 회차가 한 문서에 있다. 접두어가 없으면 `#news`가 둘이 된다
            idPrefix={it.brief.session === "pm" ? "" : `${it.brief.session}-`}
          />
        </div>
      ))}
    </>
  );
}
