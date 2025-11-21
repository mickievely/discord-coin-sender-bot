@echo off
chcp 65001 >nul
echo ========================================
echo Discord 코인 대행 봇 설치 스크립트
echo ========================================
echo.

REM Python 설치 확인
echo [1/5] Python 설치 확인 중...
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않습니다.
    echo Python 3.8 이상을 설치해주세요: https://www.python.org/downloads/
    pause
    exit /b 1
)
python --version
echo [완료] Python이 설치되어 있습니다.
echo.

REM pip 업그레이드
echo [2/5] pip 업그레이드 중...
python -m pip install --upgrade pip
echo [완료] pip 업그레이드 완료
echo.

REM 필요한 패키지 설치
echo [3/5] 필요한 패키지 설치 중...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [오류] 패키지 설치에 실패했습니다.
    pause
    exit /b 1
)
echo [완료] 패키지 설치 완료
echo.

REM DB 디렉토리 생성
echo [4/5] 데이터베이스 디렉토리 생성 중...
if not exist "DB" mkdir DB
if not exist "captcha" mkdir captcha
echo [완료] 디렉토리 생성 완료
echo.

REM 데이터베이스 초기화
echo [5/5] 데이터베이스 초기화 중...
if exist "init_db.py" (
    python init_db.py
    echo [완료] 데이터베이스 초기화 완료
) else (
    echo [경고] init_db.py 파일을 찾을 수 없습니다.
)
echo.

echo ========================================
echo 설치가 완료되었습니다!
echo ========================================
echo.
echo 다음 단계:
echo 1. bot.py 파일에서 봇 토큰 및 설정을 수정하세요
echo 2. start.bat를 실행하여 봇을 시작하세요
echo.
pause

