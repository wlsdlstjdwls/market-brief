/** 브라우저 저장소 열쇠. 클라이언트 컴포넌트와 서버 양쪽이 같은 이름을 봐야 해서 한곳에 둔다. */

/** 방문자 식별자. 브라우저가 만든 난수 UUID를 여기 쥔다 */
export const VISITOR_STORAGE_KEY = "mb_vid";
/** 이 브라우저를 방문 집계에서 뺀다는 표식. 콘솔에 들어오면 켜진다 */
export const VISIT_OPT_OUT_KEY = "mb_no_track";
/** 방문 한 줄을 받는 라우트 */
export const TRACK_PATH = "/api/track";
