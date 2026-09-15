@echo off
setlocal
chcp 65001 >nul

rem ============================================================
rem  market-brief daily update
rem    1) fetch market numbers   scripts/fetch_market.py
rem    2) ingest into Neon       scripts/ingest.ts --publish
rem    3) verify published rows  scripts/verify.ts
rem
rem  This does NOT deploy. vercel.json disables git deploys and
rem  deployment is manual only. Pages use revalidate=300, so an
rem  ingest alone shows up on the site within 5 minutes.
rem
rem  Run AFTER the close (15:30 KST). Before that, fetch_market.py
rem  drops the sector block because the numbers are intraday.
rem
rem  Keep this file ASCII only. cmd.exe garbles non-ASCII batch text.
rem
rem  usage:  update_web.bat [YYYY-MM-DD]
rem ============================================================

pushd "%~dp0.."

if "%~1"=="" (
  for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set "TRADE_DATE=%%i"
) else (
  set "TRADE_DATE=%~1"
)

if not exist "data\logs" mkdir "data\logs"
set "LOG=%CD%\data\logs\update_web.log"

call :log "==== %TRADE_DATE% start ===="

call :log "[1/3] fetch market"
python scripts\fetch_market.py %TRADE_DATE% >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "[FAIL] fetch_market.py - stopping"
  popd
  exit /b 1
)

rem Days with no source report yet (holiday, or morning run not done)
rem make ingest exit non-zero. That is expected, not a bug.
call :log "[2/3] ingest"
call npx tsx --env-file=.env.local scripts\ingest.ts --date %TRADE_DATE% --publish >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "[FAIL] ingest - no source report, or blocked by the equity filter. See log."
  popd
  exit /b 2
)

call :log "[3/3] verify"
call npx tsx --env-file=.env.local scripts\verify.ts >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "[FAIL] verify - check what got published right away"
  popd
  exit /b 3
)

call :log "==== %TRADE_DATE% done ===="
popd
exit /b 0

:log
rem No spaces in the format string: for /f would split it into tokens.
for /f "delims=" %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-ddTHH:mm:ss"') do set "TS=%%t"
echo [%TS%] %~1
>>"%LOG%" echo [%TS%] %~1
exit /b 0
