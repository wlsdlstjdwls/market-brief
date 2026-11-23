/**
 * Next 개발 서버 버그 우회. `npm run dev`가 켜기 전에 부른다. 운영 빌드와 배포에는 영향이 없다.
 *
 * Next 16.3.5 ~ 16.4.6의 `setup-dev-bundler.js`가 다시 컴파일할 때마다 가로채기 규칙을
 * 지우지 않고 `rewrites.beforeFiles`에 또 넣는다. 같은 규칙이 겹겹이 쌓이면 `/stocks/000660`이
 * `/stocks/(.)000660` → `/stocks/(.)(.)000660`으로 거듭 바뀌어 "Invalid interception route"로 500이
 * 나고 종목 팝업이 안 뜬다(2026-11-23). 켠 직후에는 되고 파일을 고칠수록 깨지는 이유다.
 *
 * 이미 들어 있는 규칙(source + destination이 같은 것)은 다시 넣지 않게 한 줄을 바꾼다.
 * 이미 고친 파일이거나 Next가 그 줄을 바꿨으면 아무것도 안 한다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const file = require.resolve("next/dist/server/lib/router-utils/setup-dev-bundler.js");
const src = readFileSync(file, "utf8");

const BUG = "opts.fsChecker.rewrites.beforeFiles.push(...interceptionRoutes);";
const FIX =
  "{ const __seen = new Set(opts.fsChecker.rewrites.beforeFiles.map((r)=>r.source + '|' + r.destination)); " +
  "opts.fsChecker.rewrites.beforeFiles.push(...interceptionRoutes.filter((r)=>!__seen.has(r.source + '|' + r.destination))); } /* market-brief patch */";

if (src.includes("market-brief patch")) {
  console.log("patch-next-dev: 이미 적용됨");
} else if (src.includes(BUG)) {
  writeFileSync(file, src.replace(BUG, FIX));
  console.log("patch-next-dev: 가로채기 규칙 중복 방지 적용");
} else {
  console.warn("patch-next-dev: 고칠 줄을 못 찾았다. Next가 바뀌었으면 이 스크립트를 지워도 된다");
}
