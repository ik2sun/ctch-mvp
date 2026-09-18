@echo off
REM CTCH 숏폼 렌더 워커 — 최초 1회 설치 확인. 패키지 설치 + ffmpeg/환경변수 점검.
chcp 65001 > nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
title CTCH 숏폼 렌더 워커 설치

echo [1/3] Python 패키지 설치
python -m pip install -r requirements.txt
if errorlevel 1 goto fail

echo.
echo [2/3] ffmpeg / ffprobe 확인
where ffmpeg >nul 2>&1 || (echo   [X] ffmpeg 이 PATH 에 없습니다. "winget install Gyan.FFmpeg" 실행 후 새 창에서 다시 시도하세요. & goto fail)
where ffprobe >nul 2>&1 || (echo   [X] ffprobe 이 PATH 에 없습니다. & goto fail)
echo   [O] ffmpeg / ffprobe 확인됨

echo.
echo [3/3] 환경 점검 (키 값은 출력하지 않습니다)
python check_env.py
if errorlevel 1 goto fail

echo.
echo 설치 완료. start_worker.bat 으로 워커를 실행하세요.
pause
exit /b 0

:fail
echo.
echo 설치 중 문제가 발생했습니다. 위 메시지를 확인하세요.
pause
exit /b 1
