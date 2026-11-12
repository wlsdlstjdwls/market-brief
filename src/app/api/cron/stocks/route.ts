/**
 * Vercel Cron → GitHub Actions 트리거 (종목 브리핑, 주 1회).
 *
 * `/api/cron/dispatch`와 같은 구조다. 원본(`요약/재무/`)이 private인 stock-analysis에 있어
 * 여기서는 `weekly-stocks.yml`을 workflow_dispatch로 깨우기만 한다. 적재는 GitHub에서 돈다.
 *
 * 원본은 토요일 오전 9~10시에 올라온다. 09:30부터 11:00까지 10분마다 두드리고,
 * 그날 회차가 이미 들어와 있으면 러너를 깨우지 않는다.
 * 토요일은 휴장일이라 `trading-day.ts`를 보지 않는다.
 *
 * 환경변수는 `/api/cron/dispatch`와 같다 (CRON_SECRET, GH_DISPATCH_TOKEN, GH_REPO).
 */
import { eq } from "drizzle-orm";
import { db, hasDb } from "../../../../db/index";
import { finRun } from "../../../../db/schema";

export const dynamic = "force-dynamic";

const WORKFLOW = "weekly-stocks.yml";
const REPO = process.env.GH_REPO ?? "wlsdlstjdwls/market-brief";

function kstToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function alreadyLoaded(date: string): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const rows = await db
      .select({ runDate: finRun.runDate })
      .from(finRun)
      .where(eq(finRun.runDate, date))
      .limit(1);
    return rows.length > 0;
  } catch (e) {
    // DB를 못 읽었다고 멈추면 그 주를 통째로 놓친다. 그냥 부른다
    console.error("alreadyLoaded 실패:", e);
    return false;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("date");
  const date = q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : kstToday();

  if (await alreadyLoaded(date)) {
    return Response.json({ ok: true, skipped: "already-loaded", date });
  }

  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    return Response.json({ ok: false, error: "GH_DISPATCH_TOKEN 없음" }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      body: JSON.stringify({ ref: "main", inputs: { run_date: date } }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`workflow_dispatch 실패 ${res.status}: ${body}`);
    return Response.json(
      { ok: false, status: res.status, error: body.slice(0, 500), date },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, dispatched: WORKFLOW, date });
}
