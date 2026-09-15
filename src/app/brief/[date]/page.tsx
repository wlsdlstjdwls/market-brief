import { notFound } from "next/navigation";
import type { Metadata } from "next";
import BriefView from "../../../components/BriefView";
import { getBrief } from "../../../lib/queries";

export const revalidate = 300;

type Params = { params: Promise<{ date: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  return { title: `${date} 브리핑` };
}

export default async function BriefPage({ params }: Params) {
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const data = await getBrief(date);
  if (!data) notFound();

  return (
    <BriefView
      brief={data.brief}
      topics={data.topics}
    />
  );
}
