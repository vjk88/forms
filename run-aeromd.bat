@echo off
title AeroMD Server Launcher
echo =========================================
echo  Starting AeroMD Server at http://localhost:3000
echo =========================================
echo.
cd docs-viewer
start http://localhost:3000
npm start
