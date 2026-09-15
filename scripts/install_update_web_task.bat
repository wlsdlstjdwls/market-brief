@echo off
setlocal
set "SCRIPT=%~dp0update_web.bat"

rem Keep this file ASCII only. cmd.exe garbles non-ASCII batch text.

schtasks /Query /TN "MarketBrief-Update" >nul 2>nul
if %ERRORLEVEL% EQU 0 schtasks /Delete /TN "MarketBrief-Update" /F >nul 2>nul

rem Weekday 16:10 - after the close (15:30) and after SimpleStock-Report-PM (16:00).
rem Sector numbers are only kept when the run happens after 15:40, so do not move
rem this earlier without reading scripts/fetch_market.py.
schtasks /Create /TN "MarketBrief-Update" /SC WEEKLY /D MON,TUE,WED,THU,FRI /ST 16:10 /TR "\"%SCRIPT%\"" /F
if %ERRORLEVEL% NEQ 0 ( echo [ERROR] failed to create task & exit /b 1 )

echo Done. Registered weekday 16:10 market-brief update task.
echo Log:  market-brief\data\logs\update_web.log
echo Test: scripts\update_web.bat 2026-09-08
