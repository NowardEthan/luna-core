# Build APK release local - beta / sideload (sem Play Store).
# Saida: dist/orbit-mobile-beta.apk
$ErrorActionPreference = 'Stop'

$jdk21 = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
if (Test-Path $jdk21) {
  $env:JAVA_HOME = $jdk21
} elseif ($env:JAVA_HOME -match 'jdk-25') {
  Write-Error 'JAVA_HOME aponta para JDK 25. Instala JDK 21 e define JAVA_HOME.'
}

$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
$env:Path = "$env:ProgramFiles\nodejs;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$variant = if ($args -contains '--debug') { 'Debug' } else { 'Release' }
$gradleTask = if ($variant -eq 'Debug') { 'assembleDebug' } else { 'assembleRelease' }

Write-Host "=== Orbit Mobile - build APK ($variant) ===" -ForegroundColor Cyan
Write-Host "JAVA_HOME=$env:JAVA_HOME"

$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
  $match = Select-String -Path $envFile -Pattern '^EXPO_PUBLIC_LUNA_API_URL=(.+)$' -ErrorAction SilentlyContinue
  if ($match) { Write-Host "API Luna: $($match.Matches.Groups[1].Value)" }
} else {
  Write-Warning 'orbit-mobile/.env ausente - confirma EXPO_PUBLIC_LUNA_API_URL antes do build.'
}

$gradlew = Join-Path $root 'android\gradlew.bat'
if (-not (Test-Path $gradlew)) {
  Write-Host 'Pasta android/ ausente - expo prebuild...'
  & npx expo prebuild --platform android --no-install
}

Write-Host 'A parar Gradle daemons...'
& $gradlew --stop | Out-Null

# arm64-v8a evita path >260 chars no Windows (CMake/ninja). Cobre telemoveis recentes.
$arch = 'arm64-v8a'
Write-Host "A compilar ($gradleTask, $arch) - pode demorar alguns minutos..." -ForegroundColor Yellow
Push-Location (Join-Path $root 'android')
try {
  & .\gradlew.bat $gradleTask "-PreactNativeArchitectures=$arch" --no-daemon
  if ($LASTEXITCODE -ne 0) { throw "Gradle exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$apkFolder = if ($variant -eq 'Debug') { 'debug' } else { 'release' }
$apkName = if ($variant -eq 'Debug') { 'app-debug.apk' } else { 'app-release.apk' }
$builtApk = Join-Path $root "android\app\build\outputs\apk\$apkFolder\$apkName"

if (-not (Test-Path $builtApk)) {
  Write-Error "APK nao encontrado em $builtApk"
}

$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$version = (Get-Content (Join-Path $root 'app.json') -Raw | ConvertFrom-Json).expo.version
$outName = if ($variant -eq 'Debug') { "orbit-mobile-$version-debug.apk" } else { "orbit-mobile-$version.apk" }
$outApk = Join-Path $dist $outName

Copy-Item -Force $builtApk $outApk
$sizeMb = [math]::Round((Get-Item $outApk).Length / 1MB, 1)

Write-Host ''
Write-Host "APK pronto: $outApk" -ForegroundColor Green
Write-Host "Tamanho: $sizeMb MB"
Write-Host ''
Write-Host 'Instalar via USB:' -ForegroundColor Cyan
Write-Host ('  adb install -r ' + $outApk)
Write-Host ''
Write-Host 'Partilhar: envia o ficheiro .apk e activa instalar apps desconhecidas no Android.'
