@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install.ps1" -Mode Install
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WorkForge install failed with exit code %EXIT_CODE%.
  echo For an existing profile, run Setup.cmd or Install.ps1 -Mode Repair.
  pause
)
exit /b %EXIT_CODE%
