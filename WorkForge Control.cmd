@echo off
setlocal
set "PSModulePath="
if /I "%~1"=="--cli" goto CLI

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Launch-Control.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WorkForge Control dashboard failed with exit code %EXIT_CODE%.
  echo CLI fallback: WorkForge Control.cmd --cli
  pause
)
exit /b %EXIT_CODE%

:CLI
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Control.ps1"
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo WorkForge CLI Control failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%
