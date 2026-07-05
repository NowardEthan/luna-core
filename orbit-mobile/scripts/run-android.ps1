# Development build Android — usa JDK 21 (Gradle não suporta JDK 25).
$ErrorActionPreference = 'Stop'

$jdk21 = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
if (Test-Path $jdk21) {
  $env:JAVA_HOME = $jdk21
} elseif ($env:JAVA_HOME -match 'jdk-25') {
  Write-Error @'
JAVA_HOME aponta para JDK 25 — Gradle falha em ~2s com "class file major version 69".
Instala JDK 21 ou define:
  $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot"
'@
}

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
$env:Path = "$env:ProgramFiles\nodejs;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

Write-Host "JAVA_HOME=$env:JAVA_HOME"
Write-Host "ANDROID_HOME=$env:ANDROID_HOME"
& java -version

# Daemons antigos (JDK 25) causam BUILD FAILED instantâneo.
$gradlew = Join-Path $root 'android\gradlew.bat'
if (Test-Path $gradlew) {
  Write-Host 'A parar Gradle daemons antigos…'
  & $gradlew --stop | Out-Null
}

if (Test-Path $adb) {
  $devices = & $adb devices | Select-String 'device$'
  if (-not $devices) {
    Write-Host 'AVISO: nenhum telemóvel/emulador detectado. Liga USB debugging e aceita no telemóvel.' -ForegroundColor Yellow
  } else {
    Write-Host "Dispositivo(s): $($devices -join ', ')"
  }
}

& npx expo run:android @args
