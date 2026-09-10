@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo.
echo   FHh - выкладка сайта
echo   ----------------------------------------------
echo.

rem bash идёт вместе с Git для Windows — ищем его в обычных местах
set "BASH="
if exist "%ProgramFiles%\Git\bin\bash.exe" set "BASH=%ProgramFiles%\Git\bin\bash.exe"
if not defined BASH if exist "%ProgramFiles(x86)%\Git\bin\bash.exe" set "BASH=%ProgramFiles(x86)%\Git\bin\bash.exe"
if not defined BASH if exist "%LocalAppData%\Programs\Git\bin\bash.exe" set "BASH=%LocalAppData%\Programs\Git\bin\bash.exe"
if not defined BASH for /f "delims=" %%B in ('where bash 2^>nul') do if not defined BASH set "BASH=%%B"

if not defined BASH goto nobash

"%BASH%" ./deploy.sh %*
set "CODE=%ERRORLEVEL%"
echo.
if "%CODE%"=="0" (echo   Готово.) else (echo   Выкладка прервалась, код %CODE%. Текст ошибки — выше.)
echo.
pause
exit /b %CODE%

:nobash
echo   Не нашёл bash. Он ставится вместе с Git для Windows:
echo   https://git-scm.com/download/win
echo.
pause
exit /b 1
