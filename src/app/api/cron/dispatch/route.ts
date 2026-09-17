/**
 * Vercel Cron → GitHub Actions 트리거.
 *
 * 적재 자체는 여기서 하지 않는다. 원고(`일일리포트.md`)가 private인 stock-analysis에 있고
 * 시세 수집은 파이썬이라, 이 함수는 `daily-update.yml`을 workflow_dispatch로 깨우기만 한다.
 *
 * 이렇게 하는 이유는 GitHub의 `schedule` 이벤트가 보장이 아니라 최선 노력이어서다.
 * 실측(2026-09-16~17) 지연: 13분 / 42분 / 2시간 10분 / 2시간 32분 / 3시간 07분.
 * 같은 워크플로를 `workflow_dispatch`로 부르면 대기열 없이 즉시 뜬다.
 * Vercel Cron은 Pro에서 분 단위로 돈다(Hobby는 하루 1회 + ±59분이라 쓸 수 없다).
 *
 * 필요한 환경변수 (Vercel → Settings → Environment Variables, Production)
 *   CRON_SECRET       Vercel이 `Authorization: Bearer ...`로 실어 보낸다. 없으면 이 라우트는 거부만 한다.
 *   GH_DISPATCH_TOKEN 이 저장소 Actions: read/write 권한만 가진 fine-grained PAT
 *   GH_REPO           선택. 기본 wlsdlstjdwls/market-brief
 */
import { and, eq } from "drizzle-orm";
import { db, hasDb } from "../../../../db/index";
import { dailyBrief } from "../../../../db/schema";

/** 적재는 GitHub에서 돌고 여기서는 호출만 한다. 캐시가 붙으면 안 된다. */
export const dynamic = "force-dynamic";

const WORKFLOW = "daily-update.yml";
const REPO = process.env.GH_REPO ?? "wlsdlstjdwls/market-brief";

type Session = "am" | "pm";

/** 서버는 UTC로 돈다. 거래일·회차 판정은 전부 KST 기준이어야 한다. */
const KST = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function kstNow(): { date: string; hour: number } {
  const parts = Object.fromEntries(
    KST.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

/** 오전 슬롯(08:10, 09:40)이면 프리마켓판, 오후 슬롯(16:40, 18:40)이면 마감 종합판. */
function sessionOf(hour: number): Session {
  return hour < 12 ? "am" : "pm";
}

/**
 * 이미 published면 부르지 않는다.
 * 재시도 슬롯이 회차마다 도는데, 첫 슬롯이 받아 갔으면 러너를 깨울 이유가 없다
 * (워크플로 안에도 같은 검사가 있지만 그건 체크아웃까지 다 한 뒤다).
 */
async function alreadyPublished(date: string, session: Session): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const rows = await db
      .select({ id: dailyBrief.id })
      .from(dailyBrief)
      .where(
        and(
          eq(dailyBrief.tradeDate, date),
          eq(dailyBrief.session, session),
          eq(dailyBrief.status, "published"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (e) {
    // DB를 못 읽었다고 트리거를 멈추면 그날 회차를 통째로 놓친다. 그냥 부른다.
    console.error("alreadyPublished 실패:", e);
    return false;
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const now = kstNow();
  const q = url.searchParams.get("s");
  const session: Session = q === "am" || q === "pm" ? q : sessionOf(now.hour);
  const date = url.searchParams.get("date") ?? now.date;

  if (await alreadyPublished(date, session)) {
    return Response.json({ ok: true, skipped: "already-published", date, session });
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
      body: JSON.stringify({
        ref: "main",
        inputs: { trade_date: date, session },
      }),
    },
  );

  // 성공이면 204 No Content다. 본문이 없으므로 실패일 때만 읽는다.
  if (!res.ok) {
    const body = await res.text();
    console.error(`workflow_dispatch 실패 ${res.status}: ${body}`);
    return Response.json(
      { ok: false, status: res.status, error: body.slice(0, 500), date, session },
      { status: 502 },
    );
  }

  return Response.json({ ok: true, dispatched: WORKFLOW, date, session });
}
