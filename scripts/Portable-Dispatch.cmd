@echo off
setlocal
set "PSModulePath="
set "ACTION=%~1"
shift
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0Portable-Dispatch.ps1" -Action "%ACTION%" %*
exit /b %ERRORLEVEL%
