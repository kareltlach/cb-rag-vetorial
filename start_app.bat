@echo off
TITLE Casas Bahia RAG - Inicialização Automática
COLOR 0B

echo ======================================================
echo    CASAS BAHIA RAG - AGENTE MULTIMODAL (V2.0)
echo ======================================================
echo.

:: Garante que o script roda a partir da sua propria pasta
cd /d %~dp0

echo [1/2] Iniciando Backend FastAPI (Porta 8001)...
start powershell -NoExit -Command "python api.py"

echo [2/2] Iniciando Frontend Vite...
cd frontend
start powershell -NoExit -Command "npm run dev"

timeout /t 5 >nul
echo.
echo [3/3] Abrindo o navegador...
start http://localhost:5173

echo.
echo ======================================================
echo    TUDO PRONTO! 
echo    O app abrira em: http://localhost:5173
echo    Mantenha as janelas do PowerShell abertas.
echo ======================================================
pause
