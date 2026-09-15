import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: NeonHttpDatabase<typeof schema> | null = null;

/** DATABASE_URL이 없으면 throw. import 시점이 아니라 실제 사용 시점에 던진다. */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL이 없습니다. Neon 연결 문자열을 .env.local 또는 Vercel 환경변수에 넣으세요.",
    );
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export const hasDb = () => Boolean(process.env.DATABASE_URL);

/**
 * 기존 호출부를 바꾸지 않으려고 프록시로 감싼다.
 * 속성에 처음 접근할 때 getDb()가 실행되므로, 빌드 중 프리렌더처럼
 * DB가 없는 환경에서도 import만으로는 터지지 않는다.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const v = real[prop];
    return typeof v === "function" ? v.bind(real) : v;
  },
});

export { schema };
