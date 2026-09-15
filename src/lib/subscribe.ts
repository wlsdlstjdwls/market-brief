/**
 * 이메일 구독 접수.
 *
 * 종목 금지 규칙과는 무관한 경로지만, 여기서도 사용자가 보낸 문자열을
 * 화면에 되돌려 주지 않는다(에러 메시지에 입력값을 싣지 않는다).
 *
 * 확인 메일은 아직 보내지 않는다. 메일 발송 사업자를 붙이기 전까지
 * 접수 건은 status="pending" 으로 쌓이고, confirmToken 만 미리 만들어 둔다.
 */

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, hasDb } from "../db/index";
import { subscriber } from "../db/schema";

/** 스키마 상한 (varchar 320). 로컬파트는 RFC 상한 64자. */
const MAX_EMAIL = 320;
const MAX_LOCAL = 64;

const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** 앞뒤 공백 제거 + 소문자화. 중복 판정(unique index)이 대소문자에 흔들리지 않게 한다. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > MAX_EMAIL) return false;
  if (!EMAIL_RE.test(email)) return false;
  const [local, domain] = email.split("@");
  if (local.length > MAX_LOCAL) return false;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (domain.length > 253) return false;
  return true;
}

export function makeConfirmToken(): string {
  return randomBytes(32).toString("hex"); // 64자 = confirm_token 컬럼 길이
}

export type SubscribeOutcome = "created" | "already" | "unavailable";

/**
 * 접수 결과를 굳이 구분해 주지 않는 이유: 이미 등록된 주소인지 알려주면
 * 남의 주소가 구독 중인지 확인하는 용도로 쓰인다. 호출부는 결과와 무관하게
 * 같은 문구를 보여 준다.
 */
export async function addSubscriber(
  rawEmail: string,
  locale = "ko",
): Promise<SubscribeOutcome> {
  if (!hasDb()) return "unavailable";
  const email = normalizeEmail(rawEmail);

  const existing = await db
    .select({ id: subscriber.id })
    .from(subscriber)
    .where(eq(subscriber.email, email))
    .limit(1);
  if (existing.length) return "already";

  const inserted = await db
    .insert(subscriber)
    .values({ email, locale, status: "pending", confirmToken: makeConfirmToken() })
    .onConflictDoNothing({ target: subscriber.email })
    .returning({ id: subscriber.id });

  return inserted.length ? "created" : "already";
}
