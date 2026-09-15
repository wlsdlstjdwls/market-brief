# market-brief 작업 인계

한국 증시 시황 브리핑 웹. **개별 종목을 일절 다루지 않는다.**

## 절대 규칙

1. **종목 금지.** 종목명·종목코드·관련주/수혜주/대장주 같은 지목 표현·매수매도 추천·목표주가를
   DB·API·화면·메타태그 어디에도 넣지 않는다. 지금은 무료지만 유료 전환이 목표이고,
   유료로 종목을 언급하면 자본시장법상 유사투자자문업 신고 대상이 된다.
2. **종목을 담을 컬럼을 만들지 않는다.** `ticker`, `stock_name`, `symbol`, `isin` 같은 컬럼은
   어떤 테이블에도 없고, 추가해서도 안 된다.
3. **상위 저장소를 수정하지 않는다.** `../` 의 텔레그램 파이프라인(`send_news_telegram.py`,
   리포트 생성기, `pick_today.py`)은 이 프로젝트와 무관하다. 그쪽은 종목을 그대로 내보낸다.
   원본 리포트는 **읽기 전용**으로만 연다.
4. **시장 수치를 리포트 산문에서 파싱하지 않는다.** 그렇게 하면 틀린다
   (실제로 코스피 종가가 4.61로 나온 적 있음). `scripts/fetch_market.py`가 실제 시세에서 받는다.
5. **구조화 라벨은 레지스트리 표준 명칭만 쓴다.** 원문 문자열을 쓰면 "러셀2000" 같은
   종목명 충돌이 DB에 들어간다. `assertRegistryOnly`가 막는다.

## 구조

| 파일 | 역할 |
|---|---|
| `src/lib/guard.ts` | 종목 탐지. KRX 2,875종목 사전 + 6자리 코드 + 지목 표현 |
| `src/lib/extract.ts` | 원본 마크다운 → 페이로드. 파일·섹션·문단 3단 필터 |
| `src/lib/registry.ts` | 지수·매크로·업종 표준 명칭 화이트리스트 |
| `src/lib/render.ts` | 렌더 직전 최종 방어 + 마크다운 변환 |
| `src/lib/persist.ts` | Neon 적재. 적재 직전 재검사 + 감사 로그 |
| `src/db/schema.ts` | Drizzle 스키마 9테이블 |
| `scripts/fetch_market.py` | 실제 시세 수집 → `data/market/{날짜}.json` |
| `scripts/ingest.ts` | 적재 CLI |
| `scripts/verify.ts` | 발행 결과 검증 (DB / 저장한 HTML) |
| `scripts/update_web.bat` | 일일 갱신 (수집 → 적재 → 검증). 작업 스케줄러가 부른다 |
| `scripts/install_update_web_task.bat` | 위 작업을 평일 16:10에 등록 |
| `scripts/backfill.py` | 과거 회차 일괄 적재 |

배치 파일은 ASCII로만 쓴다. cmd.exe가 한글 배치 텍스트를 깨뜨려 실행 자체가 실패한다
(기존 `../*.bat`들도 전부 영문인 이유다). 설명은 이 문서에 쓴다.

### 시세 데이터 소스 (2026-09-15 교체)

KRX(data.krx.co.kr)가 이 PC의 IP를 차단한다. 응답이 JSON이 아니라 ip-block-page HTML이라
`Expecting value: line 13 column 1`로 죽는다. pykrx도 같은 엔드포인트를 쓰므로 같이 실패한다.
그래서 pykrx 경로를 걷어내고 아래로 갈아탔다. KRX가 다시 열리면 수급·업종은 KRX가 더 정확하다.

| 항목 | 소스 | 과거 조회 |
|---|---|---|
| 지수 8종, 환율·유가·금·달러인덱스·VIX | FinanceDataReader | 가능 |
| 미 국채 10년·2년물 | FinanceDataReader `FRED:DGS10` / `DGS2` | 가능 |
| 국고채 3년물 | 네이버 시장지표 `IRR_GOVT03Y` | 가능 |
| 투자주체별 순매수 | 네이버 `investorDealTrendDay` (억원) | 가능 |
| 업종 등락률 | 네이버 `m.stock.naver.com/api/stocks/industry` | **불가** |

업종 API에는 날짜 파라미터가 없다. 언제 불러도 "지금" 값이다. 그래서 ① 요청일이 오늘이고
② 15:40을 넘겼고 ③ 그날 수급이 집계됐을 때만 그날 값으로 인정하고, 아니면 통째로 비운다.
장중에 돌리면 장중 등락률이 그날 종가로 둔갑하기 때문이다. 과거 회차에 업종이 비어 있는 건
이 이유이고, 정상이다.

네이버 업종(79개 GICS 분류)을 `registry.ts`의 `SECTORS` 코드로 묶을 때는 소속 종목 수로
가중평균한다. 시총 가중이 맞지만 API가 시총을 주지 않는다. 근사치다.
`SEMI_EQP`·`ROBOT`·`SOLAR`는 대응하는 네이버 분류가 없어 항상 빈다.
`SOX`(필라델피아 반도체)도 어느 소스에서도 안 받아진다.

### 차단 4중 방어

1. 파일 — `종목뉴스.md` 투입 거부 (`assertAllowedSource`)
2. 섹션 — 종목·관심·갭·투자아이디어·예측검증 섹션 통째 제외 (`SECTION_DENY`)
3. 문단 — 남은 문단도 한 건 걸리면 폐기 (`scan`)
4. 렌더 — DB가 오염돼도 화면 차단 (`renderMarkdown`)

`block`은 확실한 종목. `review`는 문맥상 아닐 수 있는 것(러셀2000의 러셀, 아스트라의 아스트).
발행 경로에서는 review도 차단한다. 버리지 않고 남기는 이유는 놓치는 쪽이 더 위험해서다.

## 명령

```bash
npm test                     # 회귀 테스트 18건
npm run typecheck
npm run guard -- <파일|폴더>  # 원본에 어떤 종목 표기가 있는지
npm run ingest -- --dry-run  # DB 없이 적재 결과 미리보기
npm run verify               # DB의 published 브리핑 검사

python scripts/fetch_market.py 2026-09-14   # 시세 수집 (장 마감 후)
python scripts/backfill.py --dry-run        # 과거 회차 대상 날짜만 확인
python scripts/backfill.py --publish --skip-existing
scripts\update_web.bat 2026-09-14           # 일일 갱신 전체를 손으로 한 번
```

DB를 쓰는 스크립트는 `.env.local`을 먼저 로드해야 한다.

```bash
npx tsx --env-file=.env.local scripts/ingest.ts --date 2026-09-08 --publish
```

## 일일 자동 실행

작업 스케줄러 `MarketBrief-Update` — 평일 16:10 → `scripts/update_web.bat`.
등록: `scripts\install_update_web_task.bat` (다시 돌리면 덮어쓴다).
로그: `data/logs/update_web.log`.

16:10인 이유는 장 마감 15:30 + 업종 스냅샷 인정 시각 15:40 이후이고,
상위 저장소의 `SimpleStock-Report-PM`(16:00)과 겹치지 않아서다. 더 앞으로 당기지 말 것.

**배포는 하지 않는다.** 페이지가 `revalidate = 300`이라 적재만 하면 5분 안에 사이트에 뜬다.

## 배포

**푸시해도 자동 배포되지 않는다.** `vercel.json`의 `git.deploymentEnabled: false`.
저장소 연결은 살아 있고 배포만 수동이다. 검증 완료 후:

```bash
vercel deploy --prod
```

자동 배포로 되돌리려면 `vercel.json`에서 `git` 블록을 지운다.

## 현재 상태 (2026-09-15 기준)

- 배포됨: https://market-brief-xi.vercel.app (공개, 배포 보호 해제)
- 저장소: https://github.com/wlsdlstjdwls/market-brief (private)
- Neon: Vercel Marketplace 연동, 무료 플랜, sin1 리전. `DATABASE_URL` 자동 주입
- 스키마 적용 완료, 금칙어 5,765건 시드 완료
- 발행된 브리핑: 2026-06-22 ~ 2026-09-08 거래일 44회차 (backfill.py로 일괄 적재)
- 수급·금리 채워짐. 업종은 과거 회차에서 빈다(위 "시세 데이터 소스" 참고)
- 자동 실행: 작업 스케줄러 `MarketBrief-Update` 평일 16:10

### 배포 대기 (2026-09-15 갱신 — 이어받는 세션이 먼저 읽을 것)

**main에 푸시됐지만 아직 배포되지 않은 커밋이 두 개다.** 자동 배포가 꺼져 있어서다
(`vercel.json`의 `git.deploymentEnabled: false`). 푸시는 배포가 아니다.

| 커밋 | 내용 | 배포 |
|---|---|---|
| `8ab8974` | 업종 섹션 제목에서 "(KRX 업종지수)" 표기 제거 + 면책 고지 문구. 소스가 KRX가 아니라 사실과 달라 고침 | 대기 |
| `6b32a06` | 이메일 구독 폼(`/api/subscribe` + 홈 하단 폼) + `docs/유료전환_법적요건.md` + 업종 소스 재탐색 결과 | 대기 |

사이트에 뜨는 데이터(수급·금리·44회차)는 DB를 읽으므로 배포와 무관하게 이미 반영돼 있다.
배포가 필요한 건 **코드 변경분뿐**이다.

**이어받는 세션이 할 일:** 사용자에게 확인받은 뒤 `vercel deploy --prod` 한 번.
배포하면 구독 폼이 공개되므로, 그 전에 아래를 같이 판단한다.

- 확인 메일을 못 보내는 상태로 폼을 먼저 열 것인가. 열면 `pending` 접수만 쌓인다.
  (메일 발송 사업자 연동 전에는 발송 금지 — 정보통신망법 제50조, `docs/유료전환_법적요건.md` 6절)
- 개인정보 처리방침이 아직 없다. 이메일을 받는 화면을 공개하면 처리방침 공개 의무가 걸린다
  (개인정보 보호법 제30조). **처리방침 게시 전 배포는 권하지 않는다** — 같은 문서 3절.

검증 상태: `npm test` 23건(구독 검증 5건 포함) · `npm run typecheck` · `npm run build` 전부 통과.

## 막힌 것

**원본 리포트가 2026-09-08에서 끊겨 있다.** `../요약/뉴스/`에 09-09 이후 폴더가 없다.
상위 저장소의 아침 뉴스 파이프라인 쪽 문제이고 여기서 고칠 일이 아니다(상위 저장소 수정 금지).
그게 안 돌면 16:10 자동 실행은 매일 "원본 없음"으로 exit 2가 난다.

**업종 과거값을 받을 방법이 없다.** 네이버 업종 API에 날짜가 없고 KRX는 IP가 막혔다.
KRX가 풀리거나 다른 소스를 찾기 전까지 과거 회차의 업종은 비워 둔다. 추정값 금지.

**`SOX`(필라델피아 반도체)** 가 FinanceDataReader·야후 어디서도 안 받아진다.

## 이메일 구독 (2026-09-15 추가)

| 파일 | 역할 |
|---|---|
| `src/lib/subscribe.ts` | 이메일 정규화·형식 검증·확인 토큰 생성·`subscriber` 적재 |
| `src/app/api/subscribe/route.ts` | `POST /api/subscribe` — zod 검증, 인스턴스 단위 레이트리밋(10분 5회) |
| `src/components/SubscribeForm.tsx` | 홈 하단 신청 폼 (클라이언트 컴포넌트) |
| `tests/subscribe.test.ts` | 형식 검증·정규화·토큰 회귀 5건 |

- **응답이 결과를 구분하지 않는다.** 이미 등록된 주소인지 알려 주면 남의 주소가 구독 중인지
  확인하는 용도로 쓰인다. 신규·중복 모두 "신청이 접수됐습니다"로 같게 답한다.
- **확인 메일은 아직 보내지 않는다.** 메일 발송 사업자를 안 붙였다. 접수 건은
  `status="pending"` 으로 쌓이고 `confirm_token` 만 미리 만들어 둔다.
  발송을 붙일 때 더블 옵트인(토큰 링크 → `confirmed`)으로 완성하면 된다 —
  정보통신망법 제50조 때문에 사전 동의 없이 보내면 안 된다(`docs/유료전환_법적요건.md` 6절).
- 레이트리밋은 인스턴스 메모리라 서버리스에서 완벽하지 않다. 단순 반복 투입만 막는 완충이다.
- 기존 컬럼만 쓴다. `subscriber` 스키마는 건드리지 않았다.

## 업종 과거값 재탐색 결과 (2026-09-15)

| 소스 | 결과 |
|---|---|
| `data.krx.co.kr` (기존 경로·pykrx) | **여전히 차단.** 응답이 `ip-block-page` HTML |
| `openapi.krx.co.kr` (OPEN API 포털) | HTTP 200 — **차단 아님** |
| `data-dbg.krx.co.kr` (OPEN API 엔드포인트) | 키 없이 401 Unauthorized — **도달함**. 차단이면 401이 아니라 차단 HTML이 온다 |
| FinanceDataReader `KRX:1003` | 실패 (내부적으로 `data.krx.co.kr` 호출) |
| FinanceDataReader `StockListing("KRX-INDEX")` | `NotImplementedError` |
| 네이버 업종 API | 살아 있음. 여전히 날짜 파라미터 없음 → 과거 조회 불가 |

**가장 유망한 경로는 KRX OPEN API다.** 웹 스크래핑 호스트만 막혔고 공식 API 호스트는 열려 있다.
무료 회원가입 후 `AUTH_KEY`를 발급받아 헤더에 실으면 `basDd`(기준일자) 파라미터로 과거 조회가 된다.
지수 일별 시세 서비스에 KOSPI·KOSDAQ 업종지수가 포함되는지는 **키를 받아 실제로 찍어봐야 확정된다**
(서비스 목록 페이지가 로그인 뒤에 있다). 확인 전까지 추정으로 코드를 바꾸지 않는다.

착수 순서: ① 포털 가입·키 발급 → ② 업종지수 응답 확인 → ③ `SECTORS` 매핑 재작성
(네이버 79개 GICS 가중평균 근사 → KRX 업종지수 실측으로 교체) → ④ `backfill.py` 재실행으로 과거 회차 채움.
**③까지는 코드 변경이 없다.** 지금은 네이버 근사값을 유지하고 과거 회차 업종은 계속 비워 둔다.

## 다음 할 일

1. 메일 발송 사업자 연동 → 확인 메일(더블 옵트인) + 수신거부 링크. 그 전까지 발송 금지
2. KRX OPEN API 키 발급 → 업종지수 과거 조회 가능 여부 확정 (위 절차 ①②)
3. 유료 전환 준비는 `docs/유료전환_법적요건.md` 참고 — 사업자등록 → 구매안전서비스 확인증
   → 통신판매업 신고 → 처리방침·약관 게시 → 푸터 표시 항목 추가 → PG 연동 → 해지·환불 화면 순서.
   종목을 안 넣는 한 유사투자자문업 신고는 해당 없음

## 하지 말 것

- 상위 저장소 파일 수정
- 종목 관련 컬럼·필드 추가
- 리포트 산문에서 숫자 파싱
- 수집 실패한 수치를 추정값으로 채우기
- 푸시로 배포 트리거하기
