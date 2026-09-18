@echo off
REM CTCH 숏폼 렌더 워커 — 더블클릭으로 실행. 창을 닫으면 워커가 멈춘다.
REM 최초 1회: setup.bat 으로 패키지를 설치한다.
chcp 65001 > nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
title CTCH 숏폼 렌더 워커
echo ============================================
echo   CTCH 숏폼 렌더 워커
echo   대기 중인 작업을 10초마다 확인합니다.
echo   멈추려면 Ctrl+C 또는 이 창을 닫으세요.
echo ============================================
echo.
python render_worker.py
echo.
echo 워커가 종료됐습니다.
pause
