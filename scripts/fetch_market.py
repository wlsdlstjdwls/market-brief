# -*- coding: utf-8 -*-
"""
시장 수치 수집기 (개별 종목 없음).

리포트 산문에서 숫자를 긁으면 틀린다. 지수·수급·업종지수·환율은 여기서 직접 받는다.
출력: data/market/{YYYY-MM-DD}.json

수집 항목
  indices  국내외 지수 종가·등락률
  flows    투자주체별 순매수 (시장 전체 집계. 종목별 수급은 수집하지 않는다)
  sectors  KRX 업종지수 등락률
  macros   환율·유가·금리

사용:  python scripts/fetch_market.py [YYYY-MM-DD]
"""
import json
import os
import sys
from datetime import datetime, timedelta

import pandas as pd

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "market")
# 원본 저장소 루트. krx_config.json을 읽기만 한다 (수정하지 않음).
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def load_krx_credentials():  # noqa: D401
    """krx_config.json -> KRX_ID/KRX_PW. pykrx 수급·업종지수 API는 로그인이 필요하다."""
    if os.environ.get("KRX_ID") and os.environ.get("KRX_PW"):
        return True
    path = os.path.join(REPO_ROOT, "krx_config.json")
    try:
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
        if cfg.get("id") and cfg.get("pw"):
            os.environ["KRX_ID"] = str(cfg["id"])
            os.environ["KRX_PW"] = str(cfg["pw"])
            return True
    except Exception as e:
        print(f"  ! KRX 인증정보 로드 실패: {e}", file=sys.stderr)
    return False

# registry.ts의 SECTORS 코드와 맞춘다.
SECTOR_KEYWORDS = [
    ("SEMI", ["반도체"]), ("IT_HW", ["전기전자", "전기·전자"]),
    ("BATTERY", ["2차전지", "이차전지"]), ("AUTO", ["운수장비", "자동차"]),
    ("BIO", ["의약품", "제약", "바이오"]), ("FIN", ["금융", "은행", "증권", "보험"]),
    ("CHEM", ["화학"]), ("STEEL", ["철강", "금속"]),
    ("SHIP", ["운수창고", "조선"]), ("CONST", ["건설"]),
    ("POWER", ["전기가스", "전기·가스"]), ("INTERNET", ["서비스업", "소프트웨어"]),
    ("CONSUMER", ["음식료", "유통", "섬유"]), ("TELCO", ["통신"]),
    ("DEFENSE", ["기계"]),
]

INVESTOR_MAP = {"외국인": "foreign", "기관합계": "institution", "개인": "retail"}


def _pct(cur, prev):
    if prev in (None, 0) or cur is None:
        return None
    return round((float(cur) / float(prev) - 1) * 100, 2)


def _sector_code(name):
    for code, keys in SECTOR_KEYWORDS:
        if any(k in name for k in keys):
            return code
    return None


def fetch_domestic(date):
    """코스피·코스닥 지수, 투자주체별 순매수, KRX 업종지수.

    pykrx는 KRX 로그인이 필요하고 import 시점에 로그인을 시도하다 죽을 수 있어
    지수 수집(FinanceDataReader)을 먼저 끝낸 뒤 별도 try 안에서만 건드린다.
    """
    import FinanceDataReader as fdr

    ymd = date.replace("-", "")
    fdr_start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=12)).strftime("%Y-%m-%d")
    krx_start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=10)).strftime("%Y%m%d")
    indices, flows, sectors = [], [], []

    for symbol, code in (("KS11", "KOSPI"), ("KQ11", "KOSDAQ")):
        try:
            df = fdr.DataReader(symbol, fdr_start, date)
            if len(df) < 2:
                continue
            indices.append({
                "indexCode": code,
                "close": round(float(df["Close"].iloc[-1]), 2),
                "changePct": _pct(df["Close"].iloc[-1], df["Close"].iloc[-2]),
                "sortOrder": 1 if code == "KOSPI" else 2,
            })
        except Exception as e:
            print(f"  ! 지수 {code} 실패: {e}", file=sys.stderr)

    if not load_krx_credentials():
        print("  ! KRX 인증정보 없음 — 수급·업종지수 생략", file=sys.stderr)
        return indices, flows, sectors

    try:
        from pykrx import stock
    except Exception as e:
        print(f"  ! pykrx 로그인/로딩 실패 — 수급·업종지수 생략: {e}", file=sys.stderr)
        return indices, flows, sectors

    for market in ("KOSPI", "KOSDAQ"):
        try:
            df = stock.get_market_trading_value_by_investor(ymd, ymd, market)
            if df is None or df.empty:
                continue
            for label, investor in INVESTOR_MAP.items():
                if label in df.index:
                    flows.append({
                        "market": market,
                        "investor": investor,
                        "netAmount": round(float(df.loc[label, "순매수"]) / 1e8, 2),  # 억원
                    })
        except Exception as e:
            print(f"  ! 수급 {market} 실패: {e}", file=sys.stderr)

    seen = set()
    try:
        for ticker in stock.get_index_ticker_list(ymd, "KOSPI"):
            name = stock.get_index_ticker_name(ticker)
            code = _sector_code(name)
            if not code or code in seen:
                continue
            df = stock.get_index_ohlcv(krx_start, ymd, ticker)
            if df is None or len(df) < 2:
                continue
            seen.add(code)
            sectors.append({
                "krxSectorCode": code,
                "changePct": _pct(df.iloc[-1]["종가"], df.iloc[-2]["종가"]),
            })
    except Exception as e:
        print(f"  ! 업종지수 실패: {e}", file=sys.stderr)

    sectors.sort(key=lambda x: (x["changePct"] is None, -(x["changePct"] or 0)))
    for i, x in enumerate(sectors, 1):
        x["rank"] = i
    return indices, flows, sectors


def fetch_global(date):
    """해외 지수와 환율·유가. FinanceDataReader 사용."""
    import FinanceDataReader as fdr

    start = (datetime.strptime(date, "%Y-%m-%d") - timedelta(days=12)).strftime("%Y-%m-%d")
    indices, macros = [], []

    for symbol, code, order in (
        ("US500", "SPX", 3), ("IXIC", "IXIC", 4), ("DJI", "DJI", 5), ("RUT", "RUT", 6),
    ):
        try:
            df = fdr.DataReader(symbol, start, date)
            if len(df) < 2:
                continue
            indices.append({
                "indexCode": code,
                "close": round(float(df["Close"].iloc[-1]), 2),
                "changePct": _pct(df["Close"].iloc[-1], df["Close"].iloc[-2]),
                "sortOrder": order,
            })
        except Exception as e:
            print(f"  ! 해외지수 {symbol} 실패: {e}", file=sys.stderr)

    for symbol, key, order in (
        ("USD/KRW", "USDKRW", 5), ("USD/JPY", "USDJPY", 6),
        ("CL=F", "WTI", 7), ("BZ=F", "BRENT", 8), ("GC=F", "GOLD", 9),
    ):
        try:
            df = fdr.DataReader(symbol, start, date)
            if len(df) < 2:
                continue
            macros.append({
                "key": key,
                "value": round(float(df["Close"].iloc[-1]), 2),
                "changePct": _pct(df["Close"].iloc[-1], df["Close"].iloc[-2]),
                "sortOrder": order,
            })
        except Exception as e:
            print(f"  ! 매크로 {symbol} 실패: {e}", file=sys.stderr)

    return indices, macros


def main():
    date = sys.argv[1] if len(sys.argv) > 1 else datetime.now().strftime("%Y-%m-%d")
    print(f"수집 시작 {date}")
    d_idx, flows, sectors = fetch_domestic(date)
    g_idx, macros = fetch_global(date)

    payload = {
        "tradeDate": date,
        "fetchedAt": datetime.now().isoformat(timespec="seconds"),
        "indices": sorted(d_idx + g_idx, key=lambda x: x["sortOrder"]),
        "flows": flows,
        "sectors": sectors,
        "macros": macros,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f"{date}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print(f"저장 {path}")
    print(f"  지수 {len(payload['indices'])} · 수급 {len(flows)} · 업종 {len(sectors)} · 지표 {len(macros)}")


if __name__ == "__main__":
    main()
