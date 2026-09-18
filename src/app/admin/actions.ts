"use server";

/**
 * 콘솔이 하는 유일한 「쓰기」 둘 — 로그인 쿠키, 로그아웃.
 *
 * **DB에는 한 글자도 안 쓴다.** 브리핑을 고쳐야 하면 `ingest.ts`를 돌린다.
 * 이 콘솔은 결과를 보는 자리지 고치는 자리가 아니다.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_COOKIE_MAX_AGE,
  ADMIN_PATH,
  adminCreds,
  makeSession,
  verifyPassword,
} from "../../lib/admin-auth";

export type ActionState = { ok: boolean; message: string } | null;

/*
 * 무차별 대입 억제. 계정이 하나뿐이라 시도 횟수를 막아 둔다.
 * 함수 인스턴스마다 따로라 완벽한 방벽은 아니지만(그래서 비밀번호를 길게 잡아야 한다),
 * 한 인스턴스에 붙어 반복해 찌르는 흔한 경우는 이걸로 끊긴다.
 */
const WINDOW_MS = 10 * 60_000;
const MAX_FAILS = 10;
const g = globalThis as unknown as { __mbAdminFails?: number[] };
const fails = (g.__mbAdminFails ??= []);

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const creds = adminCreds();
  if (!creds) {
    return { ok: false, message: "ADMIN_EMAIL 과 ADMIN_PASSWORD_HASH 가 설정돼 있지 않다" };
  }

  const now = Date.now();
  while (fails.length > 0 && now - fails[0] > WINDOW_MS) fails.shift();
  if (fails.length >= MAX_FAILS) return { ok: false, message: "시도가 너무 잦다. 10분 뒤에 다시" };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  // 이메일이 틀렸어도 비밀번호 검증까지 돌린다 — 먼저 끊으면 응답 시간이 「이 이메일은 있다」를
  // 알려준다. 답도 한 가지로 준다(어느 칸이 틀렸는지 말하지 않는다)
  const passOk = verifyPassword(password, creds.hash);
  if (email !== creds.email || !passOk) {
    fails.push(now);
    return { ok: false, message: "이메일이나 비밀번호가 다르다" };
  }

  fails.length = 0;
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, makeSession(creds), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ADMIN_PATH,
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  revalidatePath(ADMIN_PATH, "layout");
  return { ok: true, message: "들어왔다" };
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  jar.delete({ name: ADMIN_COOKIE, path: ADMIN_PATH });
  revalidatePath(ADMIN_PATH, "layout");
}
