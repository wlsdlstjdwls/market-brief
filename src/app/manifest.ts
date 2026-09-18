import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE } from "../lib/site";

/**
 * 웹 앱 매니페스트. 안드로이드 "홈 화면에 추가"가 읽는다.
 *
 * 이게 없으면 런처 아이콘 이름이 `<title>` 전체로 들어가고 스플래시 색이 흰색으로 떨어진다.
 * iOS는 매니페스트를 거의 안 보고 `apple-icon.png`를 본다 — 그쪽은 파일 규약으로 따로 챙긴다.
 *
 * **`display: "browser"`다.** 이 사이트는 읽고 나가는 글이지 앱이 아니다. `standalone`으로
 * 두면 주소창이 사라져 기사 링크를 눌렀을 때 어디로 나가는지 알 수 없고 뒤로 가기도 잃는다.
 * 나가는 링크가 본문의 핵심이라(`sources.ts`) 여기서는 손해가 크다.
 *
 * 아이콘은 `public/`에 둔다. `src/app/` 에 두면 Next가 파일 규약으로 집어
 * `<link rel="icon">` 이 중복으로 달린다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_TITLE,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "browser",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      // 런처가 제 모양대로 잘라 낸다. 가장자리가 잘려도 되는 판이 따로 필요하다.
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
