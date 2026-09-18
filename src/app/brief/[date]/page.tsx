import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BriefView from "../../../components/BriefView";
import { getBrief, isSession, SESSION_LABEL } from "../../../lib/queries";
import { SITE_DESCRIPTION } from "../../../lib/site";

export const revalidate = 300;

type Params = {
  params: Promise<{ date: string }>;
  /** ?s=am 이면 아침 브리핑. 없으면 마감 브리핑이 기본이다. */
  searchParams: Promise<{ s?: string }>;
};

/**
 * `generateMetadata`와 페이지 본문이 같은 회차를 읽는다. 감싸 두지 않으면 DB를 두 번 친다.
 */
const load = cache(getBrief);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { date } = await params;
  const { s } = await searchParams;
  const session = isSession(s) ? s : undefined;

  // 라벨 자체가 "… 브리핑"이라 뒤에 또 붙이면 겹친다.
  const title = session ? `${date} ${SESSION_LABEL[session]}` : `${date} 브리핑`;

  const data = DATE_RE.test(date) ? await load(date, session) : null;
  /*
   * 공유 카드에 찍히는 문장이다. 그날 헤드라인이 있으면 그걸 쓴다 — 카카오톡·슬랙에서
   * 눈에 들어오는 건 사이트 설명이 아니라 그날 무슨 일이 있었나다.
   */
  const description = data?.brief.headline || SITE_DESCRIPTION;
  const url = session ? `/brief/${date}?s=${session}` : `/brief/${date}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", title, description, url },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BriefPage({ params, searchParams }: Params) {
  const { date } = await params;
  if (!DATE_RE.test(date)) notFound();

  const { s } = await searchParams;
  const data = await load(date, isSession(s) ? s : undefined);
  if (!data) notFound();

  return (
    <BriefView
      brief={data.brief}
      sessions={data.sessions}
      topics={data.topics}
    />
  );
}
