/**
 * 적재 직후 페이지 캐시를 바로 버린다 (2026-11-27 추가).
 *
 * 날짜 페이지, 홈, 지난 브리핑은 `revalidate = 300`(ISR)이다. ISR은 낡은 판을 먼저 내주고
 * 뒤에서 다시 만든다. 그래서 아침판만 있던 `/brief/{날짜}`에 마감판을 넣어도 **그 뒤 첫 방문자는
 * 아침판만 있는 옛 판을 받는다.** 방문자가 적은 사이트라 그 첫 방문자가 운영자 자신이었다
 * (2026-11-26 마감판, "지난 브리핑에서 눌러도 안 나온다").
 *
 * 워크플로가 적재를 마치면 이 라우트를 부르고, 여기서 그 날짜와 목록 페이지를 무효화한다.
 * 무효화된 페이지는 다음 방문 때 새로 그려진다(옛 판을 내주지 않는다).
 *
 *   POST /api/revalidate?date=YYYY-MM-DD
 *   Authorization: Bearer $REVALIDATE_SECRET
 *
 * 읽기도 쓰기도 DB에 하지 않는다. 캐시만 버린다.
 */
import { revalidatePath } from "next/cache";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function authorized(req: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });

  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (date && !DATE_RE.test(date)) return Response.json({ error: "bad date" }, { status: 400 });

  const paths = ["/", "/archive", "/rss.xml", "/sitemap.xml"];
  if (date) paths.push(`/brief/${date}`);
  for (const p of paths) revalidatePath(p);

  return Response.json({ revalidated: paths });
}
