@echo off
rem OpenVolleyScout - portable start.
rem If a "webview2" folder (Microsoft WebView2 Fixed Version, unpacked from the .cab)
rem sits next to this file, the app uses it; otherwise it uses the WebView2 of Windows.
setlocal
set "HERE=%~dp0"
set "WV="
if exist "%HERE%webview2\msedgewebview2.exe" set "WV=%HERE%webview2"
if not defined WV (
  for /d %%D in ("%HERE%webview2\*") do (
    if exist "%%D\msedgewebview2.exe" set "WV=%%D"
  )
)
if defined WV set "WEBVIEW2_BROWSER_EXECUTABLE_FOLDER=%WV%"
if not exist "%HERE%OpenVolleyScout.exe" (
  echo OpenVolleyScout.exe not found next to this file.
  pause
  exit /b 1
)
start "" "%HERE%OpenVolleyScout.exe"
