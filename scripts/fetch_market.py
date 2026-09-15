# -*- coding: utf-8 -*-
"""
시장 수치 수집기 (개별 종목 없음).

리포트 산문에서 숫자를 긁으면 틀린다. 지수·수급·업종·환율·금리는 여기서 직접 받는다.
출력: data/market/{YYYY-MM-DD}.json

수집 항목
  indices  국내외 지수 종가·등락률
  flows    투자주체별 순매수 (시장 전체 집계. 종목별 수급은 수집하지 않는다)
  sectors  업종 등락률
  macros   금리·환율·유가·변동성

소스
  지수·환율·유가·미국 금리   FinanceDataReader
  투자주체별 순매수          네이버 금융 일별 투자자매매동향 (과거 날짜 조회 가능)
  업종 등락률               네이버 금융 업종 스냅샷 (최종 거래일 한정. 과거 조회 불가)
  국고채 3년물 금리          네이버 금융 시장지표 (과거 날짜 조회 가능)

KRX(data.krx.co.kr)는 이 환경의 IP를 차단한다. 응답이 JSON이 아니라 ip-block-page HTML이라
`Expecting value: line 13 column 1`로 죽는다. pykrx도 같은 엔드포인트를 쓰므로 같이 실패한다.
그래서 pykrx 경로는 걷어냈다. KRX가 다시 열리면 수급·업종을 KRX로 되돌리는 편이 정확하다.

수집 못 한 항목은 비운다. 추정값으로 채우지 않는다.

사용:  python scripts/fetch_market.py [YYYY-MM-DD]
"""
import io
import json
import os
import re
import sys
import time
import warnings
from datetime import datetime, timedelta

import pandas as pd
import requests

warnings.filterwarnings("ignore")

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "market")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
)

# ── 네이버 업종 → registry.ts SECTORS 코드 ────────────────────────────────
# 키는 네이버 업종 번호(no). 이름은 대조용 주석이다.
# registry의 SEMI_EQP·ROBOT·SOLAR는 네이버 분류에 대응 항목이 없어 비운다.
# 네이버 "기계"(299)는 로봇이 아니므로 ROBOT에 붙이지 않는다.
NAVER_INDUSTRY_TO_SECTOR = {
    278: "SEMI",                                                # 반도체와반도체장비
    282: "IT_HW", 307: "IT_HW", 293: "IT_HW",                    # 전자장비와기기·전자제품·컴퓨터와주변기기
    269: "IT_HW", 327: "IT_HW", 292: "IT_HW",                    # 디스플레이장비및부품·디스플레이패널·핸드셋
    283: "BATTERY",                                             # 전기제품
    273: "AUTO", 270: "AUTO",                                   # 자동차·자동차부품
    261: "BIO", 286: "BIO", 262: "BIO",                         # 제약·생물공학·생명과학도구및서비스
    281: "BIO", 316: "BIO", 288: "BIO",                         # 건강관리 장비·업체·기술
    301: "FIN", 321: "FIN", 315: "FIN", 330: "FIN",             # 은행·증권·손해보험·생명보험
    319: "FIN", 337: "FIN", 277: "FIN",                         # 기타금융·카드·창업투자
    272: "CHEM", 313: "CHEM",                                   # 화학·석유와가스
    304: "STEEL", 322: "STEEL",                                 # 철강·비철금속
    291: "SHIP", 323: "SHIP",                                   # 조선·해운사
    279: "CONST", 289: "CONST", 320: "CONST",                   # 건설·건축자재·건축제품
    325: "POWER", 312: "POWER", 331: "POWER", 306: "POWER",     # 전기·가스·복합 유틸리티, 전기장비
    287: "INTERNET", 267: "INTERNET",                           # 소프트웨어·IT서비스
    300: "INTERNET", 263: "INTERNET",                           # 양방향미디어와서비스·게임엔터테인먼트
    284: "DEFENSE",                                             # 우주항공과국방
    268: "CONSUMER", 309: "CONSUMER", 275: "CONSUMER",          # 식품·음료·담배
    302: "CONSUMER", 264: "CONSUMER",                           # 식품과기본식료품소매·백화점과일반상점
    266: "CONSUMER", 274: "CONSUMER",                           # 화장품·섬유,의류,신발,호화품
    333: "TELCO", 336: "TELCO", 294: "TELCO",                   # 무선통신·다각화된통신·통신장비
}

INVESTOR_COLUMNS = {"외국인": "foreign", "기관계": "institution", "개인": "retail"}

NAVER_MARKET_SOSOK = {"KOSPI": "01", "KOSDAQ": "02"}


def _session():
    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Referer": "https://finance.naver.com/"})
    return s


def _get(session, url, retries=3, encoding=None):
    last = None
    for i in range(retries):
        try:
            r = session.get(url, timeout=20)
            r.raise_for_status()
            if encoding:
                r.encoding = encoding
            return r
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def _pct(cur, prev):
    if prev in (None, 0) or cur is None:
        return None
    return round((float(cur) / float(prev) - 1) * 100, 2)


def _num(x):
    if x is None:
        return None
    try:
        v = float(str(x).replace(",", "").strip())
    except ValueError:
        return None
    return None if pd.isna(v) else v


def _series(df):
    """마지막 두 개의 유효값 (현재, 직전). 빈 칸이 섞여 있으면 건너뛴다.

    DX-Y.NYB처럼 특정 날짜가 통째로 NaN인 소스가 있다. 그대로 두면 json.dump가
    JSON 규격에 없는 NaN 리터럴을 써서 ingest.ts의 JSON.parse가 죽는다.
    """
    col = "Close" if "Close" in df.columns else df.columns[0]
    s = pd.to_numeric(df[col], errors="coerce").dropna()
    if len(s) < 2:
        return None, None
    return float(s.iloc[-1]), float(s.iloc[-2])


def _sanitize(obj):
    """NaN·inf를 None으로. JSON에는 그런 리터럴이 없다."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float) and (pd.isna(obj) or obj in (float("inf"), float("-inf"))):
        return None
    return obj


# ── 지수 ──────────────────────────────────────────────────────────────────
FDR_INDICES = (
    ("KS11", "KOSPI", 1),
    ("KQ11", "KOSDAQ", 2),
    ("US500", "SPX", 3),
    ("IXIC", "IXIC", 4),
    ("DJI", "DJI", 5),
    ("RUT", "RUT", 6),
    ("N225", "N225", 8),
    ("SSEC", "SHCOMP", 9),
)


def fetch_indices(date):
    """국내외 지수. registry.ts INDICES의 code를 그대로 쓴다.

    SOX(필라델피아 반도체)는 FinanceDataReader·야후 어느 쪽에서도 받아지지 않아 비운다.
    """
    import FinanceDataReader as fdr

    start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=14)).strftime("%Y-%m-%d")
    out = []
    for symbol, code, order in FDR_INDICES:
        try:
            df = fdr.DataReader(symbol, start, date)
            cur, prev = (None, None) if df is None else _series(df)
            if cur is None:
                print(f"  ! 지수 {code} 데이터 부족", file=sys.stderr)
                continue
            out.append({
                "indexCode": code,
                "close": round(cur, 2),
                "changePct": _pct(cur, prev),
                "sortOrder": order,
            })
        except Exception as e:  # noqa: BLE001
            print(f"  ! 지수 {code} 실패: {e}", file=sys.stderr)
    return sorted(out, key=lambda x: x["sortOrder"])


# 업종 스냅샷을 그날 종가로 인정하는 시각(로컬=KST 가정). 정규장 마감 15:30 + 여유.
SECTOR_SNAPSHOT_AFTER = (15, 40)


# ── 투자주체별 순매수 ─────────────────────────────────────────────────────
def fetch_flows(date, session):
    """네이버 일별 투자자매매동향. 단위 억원, 순매수 기준.

    표는 요청일 이전 최근 20영업일을 담고 있어 과거 날짜도 그대로 조회된다.
    요청한 날짜 행이 없으면(휴장·미집계) 그 시장은 건너뛴다.
    """
    ymd = date.replace("-", "")
    want = datetime.strptime(date, "%Y-%m-%d").strftime("%y.%m.%d")
    flows = []
    for market, sosok in NAVER_MARKET_SOSOK.items():
        try:
            url = (
                "https://finance.naver.com/sise/investorDealTrendDay.naver"
                f"?bizdate={ymd}&sosok={sosok}"
            )
            r = _get(session, url, encoding="euc-kr")
            tables = pd.read_html(io.StringIO(r.text))
            df = max(tables, key=len)
            df.columns = [c[-1] if isinstance(c, tuple) else c for c in df.columns]
            df = df.dropna(subset=["날짜"])
            row = df[df["날짜"].astype(str).str.strip() == want]
            if row.empty:
                print(f"  ! 수급 {market}: {date} 행 없음 (휴장이거나 아직 미집계)", file=sys.stderr)
                continue
            row = row.iloc[0]
            for label, investor in INVESTOR_COLUMNS.items():
                if label not in df.columns:
                    continue
                flows.append({
                    "market": market,
                    "investor": investor,
                    "netAmount": _num(row[label]),
                })
        except Exception as e:  # noqa: BLE001
            print(f"  ! 수급 {market} 실패: {e}", file=sys.stderr)
    return flows


# ── 업종 ──────────────────────────────────────────────────────────────────
def sector_snapshot_is(date, has_flows, now=None):
    """지금 받는 업종 스냅샷이 `date`의 종가 기준인지.

    네이버 업종 API에는 날짜 파라미터가 없다. 언제 불러도 "지금" 값이다.
    그래서 다음 세 가지가 모두 맞을 때만 그날 값으로 인정한다.

      1. 요청일이 오늘이다 — 과거 날짜는 애초에 받아올 방법이 없다
      2. 15:40을 넘겼다 — 그 전에는 장중 등락률이라 종가가 아니다
      3. 그날 수급이 집계됐다 — 그 날짜에 장이 실제로 섰고 마감했다는 증거

    하나라도 어긋나면 비운다. 틀린 날짜의 값을 채우느니 없는 편이 낫다.
    """
    now = now or datetime.now()
    if date != now.strftime("%Y-%m-%d"):
        return False, f"요청일 {date}이 오늘이 아님 — 네이버 업종은 과거 조회가 안 된다"
    if (now.hour, now.minute) < SECTOR_SNAPSHOT_AFTER:
        hh, mm = SECTOR_SNAPSHOT_AFTER
        return False, f"{hh:02d}:{mm:02d} 이전이라 장중 등락률"
    if not has_flows:
        return False, "그날 수급이 집계되지 않음 (휴장이거나 아직 미반영)"
    return True, ""


def fetch_sectors(date, session, has_flows):
    """네이버 업종 스냅샷을 registry SECTORS 코드로 묶는다.

    한 registry 코드에 네이버 업종이 여러 개 붙을 때는 소속 종목 수로 가중평균한다.
    시가총액 가중이 정확하지만 업종 API가 시총을 주지 않는다. 근사치임을 감안할 것.
    """
    ok, why = sector_snapshot_is(date, has_flows)
    if not ok:
        print(f"  ! 업종 생략: {why}", file=sys.stderr)
        return []

    try:
        r = _get(session, "https://m.stock.naver.com/api/stocks/industry?pageSize=100")
        groups = r.json().get("groups", [])
    except Exception as e:  # noqa: BLE001
        print(f"  ! 업종 실패: {e}", file=sys.stderr)
        return []

    acc = {}
    for g in groups:
        code = NAVER_INDUSTRY_TO_SECTOR.get(g.get("no"))
        rate = _num(g.get("changeRate"))
        weight = g.get("totalCount") or 0
        if not code or rate is None or weight <= 0:
            continue
        s, w = acc.get(code, (0.0, 0))
        acc[code] = (s + rate * weight, w + weight)

    sectors = [
        {"krxSectorCode": code, "changePct": round(s / w, 2)}
        for code, (s, w) in acc.items()
        if w > 0
    ]
    sectors.sort(key=lambda x: -x["changePct"])
    for i, x in enumerate(sectors, 1):
        x["rank"] = i
    return sectors


# ── 매크로 ────────────────────────────────────────────────────────────────
FDR_MACROS = (
    ("FRED:DGS10", "UST10Y", 1),
    ("FRED:DGS2", "UST2Y", 2),
    ("DX-Y.NYB", "DXY", 4),
    ("USD/KRW", "USDKRW", 5),
    ("USD/JPY", "USDJPY", 6),
    ("CL=F", "WTI", 7),
    ("BZ=F", "BRENT", 8),
    ("GC=F", "GOLD", 9),
    ("VIX", "VIX", 10),
)


def fetch_macros(date, session):
    """금리·환율·유가·변동성. registry.ts MACROS의 key를 그대로 쓴다."""
    import FinanceDataReader as fdr

    start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=21)).strftime("%Y-%m-%d")
    macros = []
    for symbol, key, order in FDR_MACROS:
        try:
            df = fdr.DataReader(symbol, start, date)
            cur, prev = (None, None) if df is None else _series(df)
            if cur is None:
                print(f"  ! 지표 {key} 데이터 부족", file=sys.stderr)
                continue
            macros.append({
                "key": key,
                "value": round(cur, 4),
                "changePct": _pct(cur, prev),
                "sortOrder": order,
            })
        except Exception as e:  # noqa: BLE001
            print(f"  ! 지표 {key} 실패: {e}", file=sys.stderr)

    ktb = fetch_ktb3y(date, session)
    if ktb:
        macros.append(ktb)
    return sorted(macros, key=lambda x: x["sortOrder"])


KTB3Y_CACHE = os.path.join(OUT_DIR, "_cache_ktb3y.json")
KTB3Y_MAX_PAGES = 40  # 한 페이지가 대략 1주일치다. 40장이면 9개월쯤 거슬러 올라간다.


def _load_ktb3y_cache():
    try:
        with open(KTB3Y_CACHE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:  # noqa: BLE001
        return {}


def _fetch_ktb3y_pages(session, until, cache):
    """`until`(YYYY.MM.DD)보다 과거 행이 나올 때까지 페이지를 넘기며 캐시를 채운다.

    한 페이지에 1주일치뿐이라 몇 달 전 날짜를 찾으려면 십수 장을 넘겨야 한다.
    과거 회차를 일괄 적재할 때 날짜마다 그걸 반복하면 네이버를 수백 번 두드리게 되므로
    받아 온 값을 파일에 쌓아 두고 다음 날짜부터는 그걸 쓴다.
    """
    for page in range(1, KTB3Y_MAX_PAGES + 1):
        url = (
            "https://finance.naver.com/marketindex/interestDailyQuote.naver"
            f"?marketindexCd=IRR_GOVT03Y&page={page}"
        )
        df = max(pd.read_html(io.StringIO(_get(session, url, encoding="euc-kr").text)), key=len)
        df = df.dropna(how="all")
        got = False
        for _, row in df.iterrows():
            d, v = str(row.iloc[0]).strip(), _num(row.iloc[1])
            if re.fullmatch(r"\d{4}\.\d{2}\.\d{2}", d) and v is not None:
                cache[d] = v
                got = True
        if not got:  # 마지막 페이지를 지나쳤다
            break
        if min(cache) < until:  # 원하는 날짜보다 과거까지 확보
            break
        time.sleep(0.3)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(KTB3Y_CACHE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1, sort_keys=True)
    return cache


def fetch_ktb3y(date, session):
    """국고채 3년물 금리. 네이버 시장지표 일별 시세.

    표는 날짜 / 금리 / 전일대비 / 등락률 순이고, 헤더 이름은 환율 화면 것을 그대로 쓴다
    ("파실 때"가 금리값이다). 이름이 아니라 위치로 읽는 이유다.

    등락률 칸은 "+ 0.25%"처럼 부호와 값이 떨어져 있고 하락일 표기를 확인할 수 없었다.
    부호를 추측하는 대신 직전 영업일 금리와 직접 비교해 계산한다.
    """
    want = datetime.strptime(date, "%Y-%m-%d").strftime("%Y.%m.%d")
    try:
        cache = _load_ktb3y_cache()
        # 캐시가 아직 그 날짜까지 거슬러 올라가지 못했을 때만 더 받는다.
        # 이미 더 과거까지 받아 뒀는데 그 날짜가 없으면 원래 없는 날이다(휴장 등).
        if not cache or min(cache) >= want:
            cache = _fetch_ktb3y_pages(session, want, cache)
        older = [d for d in cache if d < want]
        if want not in cache:
            print(f"  ! 지표 KTB3Y: {date} 행 없음", file=sys.stderr)
            return None
        prev = cache[max(older)] if older else None
        return {
            "key": "KTB3Y",
            "value": round(cache[want], 4),
            "changePct": _pct(cache[want], prev),
            "sortOrder": 3,
        }
    except Exception as e:  # noqa: BLE001
        print(f"  ! 지표 KTB3Y 실패: {e}", file=sys.stderr)
    return None


# ── 실행 ──────────────────────────────────────────────────────────────────
def main():
    date = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    print(f"수집 시작 {date}")
    session = _session()

    indices = fetch_indices(date)
    flows = fetch_flows(date, session)
    sectors = fetch_sectors(date, session, has_flows=bool(flows))
    macros = fetch_macros(date, session)

    payload = {
        "tradeDate": date,
        "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        "sources": {
            "indices": "FinanceDataReader",
            "flows": "naver:investorDealTrendDay",
            "sectors": "naver:stocks/industry" if sectors else None,
            "macros": "FinanceDataReader + naver:marketindex",
        },
        "indices": indices,
        "flows": flows,
        "sectors": sectors,
        "macros": macros,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_sanitize(payload), f, ensure_ascii=False, indent=2, allow_nan=False)
    print(f"저장 {path}")
    print(f"  지수 {len(indices)} · 수급 {len(flows)} · 업종 {len(sectors)} · 지표 {len(macros)}")


if __name__ == "__main__":
    main()
