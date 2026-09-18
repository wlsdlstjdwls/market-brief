/**
 * 사이트 전역 상수.
 *
 * 절대 URL이 필요한 자리가 셋이다 — `metadataBase`(OG·canonical), `sitemap`, `rss`.
 * 세 곳이 어긋나면 카카오톡 미리보기와 색인이 조용히 깨지므로 한 군데서 읽는다.
 */

/**
 * 배포 주소. Vercel이 넣어 주는 값을 먼저 보고, 없으면 프로덕션 도메인으로 떨어진다.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL`은 프리뷰 배포에서도 **프로덕션** 도메인을 준다.
 * 프리뷰마다 바뀌는 `VERCEL_URL`을 쓰면 프리뷰가 뿌린 링크가 사라진 배포를 가리킨다.
 */
export const SITE_URL = (() => {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  return (fromEnv ?? "https://thebriefing.kr").replace(/\/+$/, "");
})();

export const SITE_NAME = "더 브리핑";
export const SITE_TITLE = "더 브리핑 — 매일 두 번, 오늘의 뉴스";
export const SITE_DESCRIPTION =
  "그날 시장을 움직인 뉴스와 테마를 정리하는 매일의 브리핑. 개별 종목은 다루지 않습니다.";

/**
 * 텔레그램 채널. 발행 알림이 여기로 나가고, 화면의 "텔레그램으로 받기"가 여기로 보낸다.
 *
 * **신청 폼이 아니라 링크다.** 이메일을 받으면 개인정보 처리방침이 다시 필수가 되고
 * (개인정보 보호법 제30조) 발송에도 더블 옵트인·수신거부가 붙는다(정보통신망법 제50조).
 * 공개 채널은 독자가 알아서 들어오고 나가므로 이쪽이 쥐는 개인정보가 0이다.
 */
export const TELEGRAM_URL = "https://t.me/thebriefing_kr";

/**
 * 검색엔진 소유 확인 코드. **값이 없으면 메타태그를 아예 그리지 않는다.**
 *
 * 구글은 DNS TXT로도 확인되지만 **네이버 서치어드바이저는 HTML 메타태그나 파일만 받는다.**
 * 그래서 값을 코드에 박지 않고 환경변수로 받는 자리를 만들어 뒀다.
 *
 *   vercel env add NEXT_PUBLIC_NAVER_SITE_VERIFICATION production
 *   vercel deploy --prod
 *
 * `NEXT_PUBLIC_` 값은 빌드 시점에 번들로 박힌다 — 넣기만 하고 배포하지 않으면 안 뜬다.
 * 확인이 끝난 뒤에도 태그는 남겨 둔다. 지우면 소유 확인이 풀린다.
 */
export const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION ?? "";
export const NAVER_VERIFICATION = process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION ?? "";

/**
 * 문의 주소. **설정하지 않으면 화면에 아무것도 그리지 않는다.**
 *
 * 개인 메일 주소를 공개 사이트에 박는 건 되돌리기 어려운 결정이라 코드에 넣지 않았다.
 * 쓰려면 Vercel 환경변수에 넣는다 (`vercel env add NEXT_PUBLIC_CONTACT_EMAIL production`).
 * 유료 전환 시에는 전자상거래법 제13조상 표시 의무 항목이라 그때는 반드시 채워야 한다.
 */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
