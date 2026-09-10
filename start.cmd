@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "PORT=5173"
set "URL=http://localhost:%PORT%/"

echo.
echo   FHh - Fantasy Hobbyhorse
echo   ----------------------------------------------
echo   Сайт откроется здесь:  %URL%
echo   Панель управления:     точка в правом нижнем углу
echo                          или Ctrl+Shift+A
echo.
echo   Чтобы остановить - закройте это окно или Ctrl+C.
echo.

rem браузер открываем с задержкой, чтобы сервер успел подняться
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

where python >nul 2>nul
if %errorlevel%==0 (
  python -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 -m http.server %PORT% --bind 127.0.0.1
  goto :eof
)

where npx >nul 2>nul
if %errorlevel%==0 (
  npx --yes serve --listen %PORT% .
  goto :eof
)

echo.
echo   Не найден ни Python, ни Node.js.
echo   Открываю index.html напрямую: сайт работает, но некоторые
echo   браузеры в таком режиме ограничивают хранилище фотографий.
echo   Надёжнее поставить Python: https://www.python.org/downloads/
echo.
start "" "index.html"
pause
