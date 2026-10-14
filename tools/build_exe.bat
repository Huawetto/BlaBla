@echo off
REM Crea BlaBla.exe: doppio clic su questo file (serve Python e connessione a
REM internet SOLO per questa operazione, una tantum — l'exe risultante non
REM ne avra' piu' bisogno). Vedi build_exe.py per i dettagli.
where python >nul 2>nul
if errorlevel 1 (
  echo Python non trovato nel PATH. Installalo da https://www.python.org/downloads/
  echo e assicurati di spuntare "Add Python to PATH" durante l'installazione.
  pause
  exit /b 1
)
python "%~dp0build_exe.py" %*
pause
