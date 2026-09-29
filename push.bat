@echo off
REM ── PRABAS one-click push ────────────────────────────────────
REM Double-click after editing files. It shows the changes, asks for
REM a commit message, commits, and pushes to GitHub (Pages redeploys).

cd /d "%~dp0"

echo.
echo === Changes to be committed ===
git status --short
echo.

set /p msg="Commit message (describe what you changed): "
if "%msg%"=="" set msg=Update PRABAS

git add -A
git commit -m "%msg%"
git push

echo.
echo Done. GitHub Pages will redeploy in about 1-2 minutes.
pause
