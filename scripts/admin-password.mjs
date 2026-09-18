/**
 * 관리자 비밀번호 해시를 찍는다. **평문은 어디에도 저장하지 않는다.**
 *
 *   node scripts/admin-password.mjs "고를 비밀번호"
 *
 * 나온 줄을 그대로 환경변수에 넣는다.
 *
 *   ADMIN_EMAIL=you@example.com
 *   ADMIN_PASSWORD_HASH=scrypt:16384:8:1:...:...
 *
 * 프로덕션에는 `vercel env add ADMIN_PASSWORD_HASH production`으로 넣고
 * `vercel deploy --prod`를 해야 반영된다(빌드 시점 값은 아니지만 배포 없이는 함수가 안 바뀐다).
 * 비밀번호를 바꾸면 발급해 둔 로그인 쿠키가 전부 한꺼번에 무효가 된다 — 서명 열쇠가 해시라서다.
 */
import { randomBytes, scryptSync } from "node:crypto";

const args = process.argv.slice(2);
const force = args.includes("--force");
const password = args.find((a) => a !== "--force");

if (!password) {
  console.error('사용법: node scripts/admin-password.mjs "비밀번호" [--force]');
  process.exit(1);
}

/*
 * 계정이 하나뿐이라 공격자가 아이디를 맞힐 필요가 없다 — **길이가 사실상 유일한 방벽이다.**
 * 시도 제한(actions.ts, 10회/10분)은 함수 인스턴스마다 따로 세므로 여러 인스턴스를 동시에
 * 두드리면 그만큼 배로 뚫린다. 짧은 비밀번호를 쓰려면 그 사실을 알고 쓰라고 `--force`를 둔다.
 */
if (password.length < 12) {
  if (!force) {
    console.error("12자 미만이다. 그래도 쓰려면 --force 를 붙인다.");
    console.error("계정이 하나뿐이라 아이디를 맞힐 필요가 없고, 길이가 유일한 방벽이다.");
    process.exit(1);
  }
  const space = /^\d+$/.test(password)
    ? `10^${password.length} = ${(10 ** password.length).toLocaleString("ko-KR")}`
    : `${password.length}자`;
  console.error(`경고: 짧은 비밀번호다(경우의 수 ${space}). 콘솔은 회차와 방문 기록이 다 보이는 자리다.`);
}

const N = 16384;
const R = 8;
const P = 1;
const salt = randomBytes(16);
const key = scryptSync(password, salt, 64, { N, r: R, p: P });

// 구분자가 `$`면 안 된다 — Next의 env 로더가 `$16384`를 변수 참조로 읽어 값을 통째로 비운다
console.log(`ADMIN_PASSWORD_HASH=scrypt:${N}:${R}:${P}:${salt.toString("base64")}:${key.toString("base64")}`);
