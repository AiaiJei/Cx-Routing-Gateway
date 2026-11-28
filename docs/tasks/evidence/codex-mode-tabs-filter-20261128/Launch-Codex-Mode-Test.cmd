@echo off
setlocal
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Launch-Codex-Mode-Test.ps1"
if errorlevel 1 pause
