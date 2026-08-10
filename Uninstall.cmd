@echo off
setlocal
set "PSModulePath="
set "UNINSTALL_SCRIPT=%~dp0scripts\Uninstall.ps1"
cd /d "%TEMP%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
set "NON_INTERACTIVE="
:scan_args
if "%~1"=="" goto args_scanned
if /I "%~1"=="-NonInteractive" set "NON_INTERACTIVE=1"
shift
goto scan_args
:args_scanned
echo.
if not "%EXIT_CODE%"=="0" echo WorkForge uninstall failed with exit code %EXIT_CODE%.
if not defined NON_INTERACTIVE pause
exit /b %EXIT_CODE%
