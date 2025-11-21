@echo off
chcp 65001 >nul
echo ========================================
echo Discord 코인 대행 봇 시작
echo ========================================
echo.

REM Python 설치 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo install.bat를 먼저 실행해주세요.
    pause
    exit /b 1
)

REM 필수 파일 확인
if not exist "bot.py" (
    echo [오류] bot.py 파일을 찾을 수 없습니다.
    pause
    exit /b 1
)

REM 봇 실행
echo 봇을 시작합니다...
echo 종료하려면 Ctrl+C를 누르세요.
echo.
python bot.py

if errorlevel 1 (
    echo.
    echo [오류] 봇 실행 중 오류가 발생했습니다.
    echo bot.log 파일을 확인하세요.
    pause
)

