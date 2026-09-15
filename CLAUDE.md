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
```

DB를 쓰는 스크립트는 `.env.local`을 먼저 로드해야 한다.

```bash
set -a && . ./.env.local && set +a && npx tsx scripts/ingest.ts --date 2026-09-08 --publish
```

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
- 발행된 브리핑 1건: 2026-09-08
- 검증: 공개 페이지 본문 0건, DB 0건, 구조화 라벨 11개 전부 레지스트리 소속

## 막힌 것

**투자주체별 수급과 KRX 업종지수를 못 가져온다.** pykrx의 KRX 로그인이 JSON이 아닌 응답을
받아 실패한다(`Expecting value: line 13 column 1`). 화면에는 "아직 수집되지 않았습니다"로
뜬다. 틀린 숫자를 채우지 말 것.

대체 소스 후보: 네이버 금융 스크래핑, KRX 정보데이터시스템 OpenAPI, 한국투자증권 API.
업종지수는 `registry.ts`의 `SECTORS` 코드에 매핑해야 한다.

미 국채 10년물·2년물 금리도 비어 있다. FinanceDataReader에서 안 받아진다.

## 다음 할 일

1. 수급·업종지수 대체 소스 연결
2. 일일 자동 실행 등록 (`scripts/update_web.bat`, 작업 스케줄러, 장마감 후 16:10 권장)
3. 과거 회차 일괄 적재 (`--date`를 돌면서)
4. 이메일 구독 폼. `subscriber` 테이블은 이미 있고 화면·API는 없음
5. 유료 전환 시 사업자등록 + 통신판매업 신고 + 개인정보처리방침 필요.
   종목을 안 넣는 한 유사투자자문업 신고는 해당 없음

## 하지 말 것

- 상위 저장소 파일 수정
- 종목 관련 컬럼·필드 추가
- 리포트 산문에서 숫자 파싱
- 수집 실패한 수치를 추정값으로 채우기
- 푸시로 배포 트리거하기
