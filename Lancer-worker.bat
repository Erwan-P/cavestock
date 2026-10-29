@echo off
setlocal
title CaveStock - Import automatique
cd /d "%~dp0"
if errorlevel 1 (
    echo Impossible d'ouvrir le dossier CaveStock.
    pause
    exit /b 1
)

echo CaveStock - Surveillance des imports toutes les 60 secondes.
echo Gardez cette fenetre ouverte pendant le traitement.
echo Pour arreter : Ctrl+C ou fermez cette fenetre.
echo.

where python >nul 2>&1
if not errorlevel 1 (
    python scripts\import_worker.py --poll 60
) else (
    where py >nul 2>&1
    if errorlevel 1 (
        echo Python est introuvable. Installez Python 3.11 ou plus recent.
        pause
        exit /b 1
    )
    py -3 scripts\import_worker.py --poll 60
)
set "worker_exit=%errorlevel%"
echo.
if not "%worker_exit%"=="0" echo Le worker s'est arrete avec une erreur. Consultez le message ci-dessus.
pause
exit /b %worker_exit%
