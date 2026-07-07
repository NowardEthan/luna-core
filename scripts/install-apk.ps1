# Instala o APK beta no telemovel via adb (PATH nao inclui platform-tools por defeito).
$ErrorActionPreference = 'Stop'

$root = Split-Path $PSScriptRoot -Parent
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'

if (-not (Test-Path $adb)) {
  Write-Error "adb nao encontrado em $adb. Instala Android SDK Platform-Tools."
}

$apk = if ($args[0]) { $args[0] } else { Join-Path $root 'dist\orbit-mobile-2.0.1.apk' }
if (-not (Test-Path $apk)) {
  Write-Error "APK nao encontrado: $apk`nCorre primeiro: npm run android:apk"
}

Write-Host "Dispositivos:"
& $adb devices
Write-Host "A instalar $apk ..."
& $adb install -r $apk
