@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo   FHh - выкладка сайта
echo   ----------------------------------------------
echo.

rem Скрипт написан для bash — он идёт вместе с Git для Windows.
set "BASH="
for %%P in (
  "%ProgramFiles%\Git\bin\bash.exe"
  "%ProgramFiles(x86)%\Git\bin\bash.exe"
  "%LocalAppData%\Programs\Git\bin\bash.exe"
) do if not defined BASH if exist %%P set "BASH=%%~P"

if not defined BASH (
  for /f "delims=" %%B in ('where bash 2^>nul') do if not defined BASH set "BASH=%%B"
)

if not defined BASH (
  echo   Не нашёл bash. Он ставится вместе с Git для Windows:
  echo   https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

"%BASH%" ./deploy.sh %*
set "CODE=%ERRORLEVEL%"

echo.
if "%CODE%"=="0" (
  echo   Готово.
) else (
  echo   Выкладка прервалась, код %CODE%. Текст ошибки — выше.
)
echo.
pause
exit /b %CODE%
