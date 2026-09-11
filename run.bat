@echo off
echo ===================================================
echo Starting DRISTI Autonomous Mining System
echo ===================================================

echo [1/3] Launching Backend (FastAPI on http://127.0.0.1:8000)...
start "DRISTI Backend" cmd /k "cd /d %~dp0backend && .\venv\Scripts\uvicorn.exe app.main:app --reload --host 127.0.0.1 --port 8000"

echo [2/3] Launching Mission Control Dashboard (http://localhost:8080)...
start "DRISTI Vantage Mission Control" cmd /k "cd /d %~dp0 && python -m http.server 8080 --directory vantage"

echo [3/3] Launching Next.js Control Panel (http://localhost:3000)...
start "DRISTI Next.js Control Panel" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo All DRISTI services started successfully!
echo - Mission Control HUD: http://localhost:8080
echo - Backend API:         http://127.0.0.1:8000 (Docs: http://127.0.0.1:8000/docs)
echo - Control Panel:       http://localhost:3000
echo.
