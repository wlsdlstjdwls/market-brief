import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BriefView from "../../../components/BriefView";
import { getBrief, isSession, SESSION_LABEL } from "../../../lib/queries";

export const revalidate = 300;

type Params = {
  params: Promise<{ date: string }>;
  /** ?s=am 이면 프리마켓판. 없으면 마감 종합이 기본이다. */
  searchParams: Promise<{ s?: string }>;
};

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { date } = await params;
  const { s } = await searchParams;
  const label = isSession(s) ? ` ${SESSION_LABEL[s]}` : "";
  return { title: `${date}${label} 브리핑` };
}

export default async function BriefPage({ params, searchParams }: Params) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const { s } = await searchParams;
  const data = await getBrief(date, isSession(s) ? s : undefined);
  if (!data) notFound();

  return (
    <BriefView
      brief={data.brief}
      sessions={data.sessions}
      topics={data.topics}
    />
  );
}
