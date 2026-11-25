@echo off
REM Refresh all Pep Capital signals, then open the dashboard.
cd /d "%~dp0"
if not exist .venv\Scripts\python.exe (
  echo Setting up Python environment...
  py -m venv .venv || exit /b 1
  .venv\Scripts\python -m pip install -q -r requirements.txt || exit /b 1
)
.venv\Scripts\python update.py || exit /b 1
start "" "site\index.html"
