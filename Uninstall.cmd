@echo off
setlocal
set "UNINSTALL_SCRIPT=%~dp0scripts\Uninstall.ps1"
cd /d "%TEMP%"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
echo.
if not "%EXIT_CODE%"=="0" echo WorkForge uninstall failed with exit code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
