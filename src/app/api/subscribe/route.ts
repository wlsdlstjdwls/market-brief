/**
 * POST /api/subscribe  { email: string }
 *
 * 응답은 접수 결과를 구분하지 않는다(이미 구독 중인 주소인지 알려주지 않는다).
 * 실패를 알려 주는 경우는 형식 오류와 과도한 요청뿐이다.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { addSubscriber, isValidEmail } from "../../../lib/subscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().max(400),
  locale: z.string().max(8).optional(),
});

/** 인스턴스 단위 완충. 서버리스라 완벽한 제한은 아니고, 단순 반복 투입만 막는다. */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, number[]>();

function tooManyRequests(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // 메모리 누수 방지
  return recent.length > MAX_PER_WINDOW;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip"))?.trim() || "unknown";
}

export async function POST(req: Request) {
  if (tooManyRequests(clientIp(req))) {
    return NextResponse.json(
      { ok: false, message: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429 },
    );
  }

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, message: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!parsed.success || !isValidEmail(parsed.data.email)) {
    return NextResponse.json(
      { ok: false, message: "이메일 주소를 다시 확인해 주세요." },
      { status: 400 },
    );
  }

  try {
    const outcome = await addSubscriber(parsed.data.email, parsed.data.locale ?? "ko");
    if (outcome === "unavailable") {
      return NextResponse.json(
        { ok: false, message: "지금은 접수할 수 없습니다. 잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: true, message: "신청이 접수됐습니다." });
  } catch (e) {
    console.error("subscribe 실패:", e);
    return NextResponse.json(
      { ok: false, message: "지금은 접수할 수 없습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
