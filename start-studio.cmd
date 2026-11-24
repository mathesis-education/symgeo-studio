@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting SymGeo Studio Giac(WASM) CAS Studio on http://127.0.0.1:8787 ...
start "" "http://127.0.0.1:8787"
node server.js
