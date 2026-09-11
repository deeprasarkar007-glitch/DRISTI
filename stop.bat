@echo off
echo ===================================================
echo Stopping DRISTI Autonomous Mining Services
echo ===================================================

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    echo Stopping backend on port 8000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8080 ^| findstr LISTENING') do (
    echo Stopping Mission Control on port 8080 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do (
    echo Stopping frontend on port 3000 (PID %%a)...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo All DRISTI services stopped cleanly.
