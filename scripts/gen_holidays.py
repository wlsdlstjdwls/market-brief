# -*- coding: utf-8 -*-
"""
KRX 휴장일 목록을 구워 data/krx-holidays.json 에 쓴다.

왜 파일로 굽나
  휴장일 판정이 필요한 자리가 셋인데 런타임이 다 다르다 —
  Vercel 함수(`/api/cron/dispatch`), 적재 CLI(`ingest.ts`), GitHub 워크플로(bash).
  파이썬 캘린더를 세 군데서 부를 수 없으므로 판정 결과만 JSON으로 남기고 셋이 같은 파일을 읽는다.

  KRX 휴장일은 연초에 확정 공시되므로 미리 구워 두는 것이 정확도를 해치지 않는다.
  반대로 실시간 조회는 할 방법이 없다 — data.krx.co.kr은 이 환경의 IP를 차단하고
  (`fetch_market.py` 머리말 참고) 네이버 업종 API처럼 날짜 파라미터가 없는 소스도 많다.

왜 exchange_calendars 인가
  XKRX(한국거래소) 캘린더가 음력 연휴(설·추석)와 대체공휴일까지 반영한다.
  공공데이터포털 특일정보 API는 키가 필요하고, 그쪽 "공휴일"은 KRX 휴장일과 정확히
  같지도 않다(연말 마지막 영업일 휴장이 공휴일이 아닌 것이 대표적이다).

  이 패키지는 이 스크립트에서만 쓴다. scripts/requirements.txt 에 넣지 않는다 —
  워크플로는 구워 둔 JSON만 읽으므로 러너에 설치할 이유가 없다.

    pip install exchange_calendars
    python scripts/gen_holidays.py

갱신 시기
  캘린더가 대략 1년 앞까지만 들고 있다. 만들어진 JSON의 `range` 끝이 90일 안으로
  들어오면 워크플로가 `::warning::`을, dispatch 라우트가 함수 로그에 경고를 남긴다
  (`src/lib/trading-day.ts`의 `holidayRangeWarning`). 그때 다시 돌려서 커밋한다.
  범위 밖 날짜는 판정 불가라 **거래일로 본다** — 사이트가 조용히 멈추는 쪽이 더 나쁘다.
"""
import json
import os
import sys
from datetime import date

try:
    import exchange_calendars as xc
except ImportError:
    print("exchange_calendars 가 없습니다:  pip install exchange_calendars", file=sys.stderr)
    raise SystemExit(2)

import pandas as pd

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "krx-holidays.json")

# 과거를 넉넉히 담는 이유는 backfill.py가 옛 회차를 훑을 때도 같은 기준을 쓰게 하려는 것이다.
START = "2026-01-01"


def main() -> int:
    cal = xc.get_calendar("XKRX")
    end = pd.Timestamp(cal.last_session).strftime("%Y-%m-%d")

    sessions = {d.strftime("%Y-%m-%d") for d in cal.sessions_in_range(START, end)}

    # 주말은 담지 않는다. 판정 함수가 요일로 먼저 거르므로 목록에 넣으면 중복이고,
    # 평일 휴장만 남겨야 "올해 휴장일이 며칠인가"를 눈으로 셀 수 있다.
    holidays = [
        d.strftime("%Y-%m-%d")
        for d in pd.date_range(START, end)
        if d.weekday() < 5 and d.strftime("%Y-%m-%d") not in sessions
    ]

    payload = {
        "_comment": "KRX 휴장일(평일만). scripts/gen_holidays.py 가 굽는다. 손으로 고치지 말 것.",
        "source": f"exchange_calendars XKRX {xc.__version__}",
        "generated_at": date.today().isoformat(),
        "range": [START, end],
        "holidays": holidays,
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print(f"{os.path.relpath(OUT)}: {START} ~ {end}, 평일 휴장 {len(holidays)}일")
    upcoming = [d for d in holidays if d >= date.today().isoformat()][:8]
    if upcoming:
        print("다가오는 휴장일:", ", ".join(upcoming))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
