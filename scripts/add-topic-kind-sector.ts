/**
 * topic_kind enum에 'sector'를 더한다. 값 추가만 하고 아무것도 지우지 않는다.
 *   npx tsx --env-file=.env.local scripts/add-topic-kind-sector.ts
 */
import { sql } from "drizzle-orm";
import { db } from "../src/db/index";

await db.execute(
  sql.raw("ALTER TYPE topic_kind ADD VALUE IF NOT EXISTS 'sector'"),
);
console.log("✓ topic_kind에 sector 추가");
