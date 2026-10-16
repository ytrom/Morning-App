@echo off
rem Runs the Morning App on http://localhost:8090 (this PC only), using the Postgres database on the NAS.
rem Needs Python and "pip install pg8000", plus port 5433 opened in the NAS docker-compose.yml. Close this window to stop.
cd /d "%~dp0"
if "%DATABASE_URL%"=="" set /p DATABASE_URL=Database address (postgres://morning:PASSWORD@DS225_Morty:5433/morning): 
python -I "%~dp0_kit\serve.py"
