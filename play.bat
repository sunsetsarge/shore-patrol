@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
    echo Starting no-cache local server on http://localhost:8123 ...
    start "" http://localhost:8123
    python serve_nocache.py 8123
    goto :eof
)

where python3 >nul 2>nul
if %errorlevel%==0 (
    echo Starting no-cache local server on http://localhost:8123 ...
    start "" http://localhost:8123
    python3 serve_nocache.py 8123
    goto :eof
)

echo Python not found -- falling back to "npx serve".
start "" http://localhost:8123
npx serve -l 8123 .
