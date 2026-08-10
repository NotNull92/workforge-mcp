@echo off
setlocal
set "PSModulePath="
cd /d "%TEMP%"
if exist "%~dp0.workforge-release.json" goto RELEASE_ROOT

set "UNINSTALL_SCRIPT=%~dp0scripts\Uninstall.ps1"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%UNINSTALL_SCRIPT%" %*
set "EXIT_CODE=%ERRORLEVEL%"
goto AFTER_RUN

:RELEASE_ROOT
call "%~dp0scripts\Portable-Dispatch.cmd" Uninstall %*
set "EXIT_CODE=%ERRORLEVEL%"

:AFTER_RUN
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
