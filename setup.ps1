# =============================================================================
#                              ani-web Setup Script
# =============================================================================

$Host.UI.RawUI.ForegroundColor = "Green"
Clear-Host

Write-Host "---------------------------------------------"
Write-Host "                ani-web Setup"
Write-Host "---------------------------------------------"
Write-Host

Write-Host "---> Finding and downloading latest release from GitHub..."

$apiUrl = "https://api.github.com/repos/serifpersia/ani-web/releases/latest"
$zipFileName = "ani-web.zip"
$extractPath = "ani-web-release"

try {
    $ErrorActionPreference = 'Stop'
    $release = Invoke-RestMethod -Uri $apiUrl
    $downloadUrl = $release.assets | Where-Object { $_.name -eq $zipFileName } | Select-Object -ExpandProperty browser_download_url
    if (-not $downloadUrl) {
        throw "Could not find '$zipFileName' asset in the latest release on GitHub."
    }
    Write-Host "     Downloading from URL: $downloadUrl"
    Invoke-WebRequest -Uri $downloadUrl -OutFile $zipFileName
    Write-Host "     Success: Download complete."
    Write-Host
}
catch {
    $Host.UI.RawUI.ForegroundColor = "Red"
    Write-Host "     Error: Failed to download the release."
    Write-Host "     Reason: $($_.Exception.Message)"
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "---> Extracting files..."

try {
    if (-not (Test-Path -Path $extractPath)) {
        New-Item -ItemType Directory -Path $extractPath | Out-Null
    }
    Expand-Archive -Path $zipFileName -DestinationPath $extractPath -Force
    Write-Host "     Success: Files extracted."
    Write-Host
}
catch {
    $Host.UI.RawUI.ForegroundColor = "Red"
    Write-Host "     Error: Failed to extract '$zipFileName'."
    Write-Host "     Reason: $($_.Exception.Message)"
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    Remove-Item -Path $zipFileName
}
catch {
    $Host.UI.RawUI.ForegroundColor = "Yellow"
    Write-Host "     Warning: Could not remove the temporary zip file '$zipFileName'."
}

Write-Host "---> Handing over to the run script (auto-selecting Production mode)..."
Write-Host

Set-Location -Path $extractPath

cmd.exe /c "run.bat 2"

$Host.UI.RawUI.ForegroundColor = "White"
