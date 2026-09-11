@echo off
title Dumper Truck Detector
setlocal

echo ============================================
echo   Dumper Truck Detector - Launcher
echo ============================================
echo.

:: ---- Check prerequisites ----
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not on PATH.
    echo         Download it from https://www.python.org/downloads/
    pause
    exit /b 1
)

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not on PATH.
    echo         Download it from https://nodejs.org/
    pause
    exit /b 1
)

:: ---- Check that the trained model exists ----
if not exist "%~dp0backend\saved_model\dumper_truck_model.keras" (
    echo [WARNING] Trained model not found at backend\saved_model\dumper_truck_model.keras
    echo           The backend will start but /health will show model_loaded: false.
    echo           Run the training notebook first ^(see README step 2^).
    echo.
)

:: ---- Backend setup ----
echo [1/4] Setting up backend virtual environment...
if not exist "%~dp0backend\.venv\Scripts\activate.bat" (
    python -m venv "%~dp0backend\.venv"
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create backend virtual environment.
        pause
        exit /b 1
    )
)

echo [2/4] Installing backend dependencies...
call "%~dp0backend\.venv\Scripts\activate.bat"
pip install -q -r "%~dp0backend\requirements.txt"
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies.
    pause
    exit /b 1
)
call deactivate

:: ---- Frontend setup ----
echo [3/4] Installing frontend dependencies...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install frontend dependencies.
        pause
        exit /b 1
    )
) else (
    echo         node_modules already exists, skipping npm install.
)

:: ---- Launch backend in a separate window ----
echo [4/4] Starting services...
echo.
echo   Backend  : http://localhost:8000  ^(health: http://localhost:8000/health^)
echo   Frontend : http://localhost:3000
echo.
echo   Close the "Backend" window or press Ctrl+C here to stop.
echo ============================================
echo.

start "Dumper Truck Detector - Backend" cmd /k "cd /d "%~dp0backend" && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"

:: ---- Launch frontend in this window ----
cd /d "%~dp0frontend"
call npm run dev

:: ---- Cleanup: kill the backend when frontend exits ----
echo.
echo Shutting down backend...
taskkill /FI "WINDOWTITLE eq Dumper Truck Detector - Backend*" /F >nul 2>&1

echo Done. Goodbye!
endlocal
