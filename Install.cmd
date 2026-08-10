@echo off
setlocal
set "PSModulePath="
if exist "%~dp0.workforge-release.json" (
  call "%~dp0scripts\Portable-Dispatch.cmd" Install %*
  set "EXIT_CODE=%ERRORLEVEL%"
) else (
  "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install.ps1" -Mode Install %*
  set "EXIT_CODE=%ERRORLEVEL%"
)
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WorkForge install failed with exit code %EXIT_CODE%.
  echo For an existing profile, run Setup.cmd or Install.ps1 -Mode Repair.
  pause
)
exit /b %EXIT_CODE%
