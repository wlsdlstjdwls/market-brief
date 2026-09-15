@echo off
REM 시황 브리핑 웹 일일 갱신.
REM 기존 텔레그램 파이프라인과 무관하며, 원본 리포트는 읽기만 한다.
REM 작업 스케줄러 등록 예: 평일 16:10

setlocal
cd /d "%~dp0.."

if "%~1"=="" (
  for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set TRADE_DATE=%%d
) else (
  set TRADE_DATE=%~1
)

echo [1/2] 시세 수집 %TRADE_DATE%
python scripts\fetch_market.py %TRADE_DATE%
if errorlevel 1 (
  echo 시세 수집 실패. 중단합니다.
  exit /b 1
)

echo [2/2] 적재 및 발행 %TRADE_DATE%
call npm run ingest -- --date %TRADE_DATE% --publish
if errorlevel 1 (
  echo 적재 실패. 종목 언급이 검출됐거나 DB 연결에 문제가 있습니다.
  exit /b 1
)

echo 완료
endlocal
