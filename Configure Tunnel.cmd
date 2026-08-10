@echo off
setlocal
set "PSModulePath="
if exist "%~dp0.workforge-release.json" (
  call "%~dp0scripts\Portable-Dispatch.cmd" Configure-Tunnel %*
  set "EXIT_CODE=%ERRORLEVEL%"
) else (
  "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Configure-Tunnel.ps1" %*
  set "EXIT_CODE=%ERRORLEVEL%"
)
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WorkForge tunnel configuration failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
