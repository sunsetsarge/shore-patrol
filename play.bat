@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
    echo Starting local server on http://localhost:8123 ...
    start "" http://localhost:8123
    python -m http.server 8123
    goto :eof
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    echo Starting local server on http://localhost:8123 ...
    start "" http://localhost:8123
    python3 -m http.server 8123
    goto :eof
)

echo Python not found -- falling back to "npx serve".
start "" http://localhost:8123
npx serve -l 8123 .
