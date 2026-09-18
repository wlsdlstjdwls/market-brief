"use server";

/**
 * 회차 목록의 다음 묶음. **읽기만 한다.**
 *
 * 라우트 핸들러(`/api/...`)로 두지 않은 이유는 쿠키다 — 로그인 쪽지는 `path=/admin`으로
 * 굽기 때문에 `/api` 로 가는 요청에는 실려 가지 않는다. 서버 액션은 이 페이지 주소로
 * POST 하므로 쿠키가 그대로 붙는다. 「예외 경로」를 새로 파지 않아도 된다.
 */
import { briefList, type BriefRow } from "../../../lib/admin";
import { isAdmin } from "../../../lib/admin-auth";

export async function moreBriefs(offset: number, limit: number): Promise<BriefRow[]> {
  // 들어온 사람만. 화면 밖에서 이 액션을 찔러도 목록이 새지 않는다
  if (!(await isAdmin())) throw new Error("unauthorized");
  // 음수 offset이 들어오면 OFFSET 절이 깨진다. 폭은 briefList가 300으로 자른다
  return briefList(limit, Math.max(0, Math.floor(offset)));
}
