# =============================================================================
#                        ani-web Setup Script (Windows)
# =============================================================================
# This script handles the initial installation and self-updating of ani-web.

# --- Configuration ---
$InstallDir = "$env:APPDATA\ani-web"
$ScriptsDir = Join-Path $InstallDir "scripts"
$LauncherBatPath = Join-Path $ScriptsDir "ani-web.bat"
$LauncherPs1Path = Join-Path $ScriptsDir "ani-web-launcher.ps1"
$VersionFile = Join-Path $InstallDir ".version"
$RepoUrl = "https://api.github.com/repos/serifpersia/ani-web/releases/latest"
$RemoteVersionUrl = "https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
$SetupScriptUrl = "https://raw.githubusercontent.com/serifpersia/ani-web/main/docs/setup.ps1"
# ---

# --- UI Functions ---
function Print-Header {
    Clear-Host
    Write-Host "---------------------------------------------" -ForegroundColor Yellow
    Write-Host "            ani-web Setup Script" -ForegroundColor Cyan
    Write-Host "---------------------------------------------" -ForegroundColor Yellow
    Write-Host
}

function Print-Step ($Message) { Write-Host "--> " -NoNewline; Write-Host $Message -ForegroundColor White }
function Print-Success ($Message) { Write-Host "    Success: " -NoNewline -ForegroundColor Green; Write-Host $Message }
function Print-Error ($Message) { Write-Host "Error: " -NoNewline -ForegroundColor Red; Write-Host $Message; Read-Host "Press Enter to exit"; exit 1 }
function Print-Info ($Message) { Write-Host "    Info: " -NoNewline -ForegroundColor Blue; Write-Host $Message }
# ---

# --- Main Installation Logic ---
function Start-Installation {
    # Step 1: Stop any running instances
    Print-Step "Checking for running instances of ani-web..."
    try {
        $existingProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$InstallDir*" -and $_.Name -eq "node.exe" }
        if ($existingProcesses) {
            Print-Info "Found running ani-web process(es). Stopping them..."
            $existingProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            Start-Sleep -Seconds 2
            Print-Success "Stopped running instances."
        } else {
            Print-Info "No running instances found."
        }
    } catch {
        Print-Info "Could not check for running processes, but will proceed."
    }
    Write-Host

    # Step 2: Find and download the latest release
    Print-Step "Finding and downloading latest release from GitHub..."
    $zipFileName = "ani-web.zip"
    $tempZipPath = Join-Path $env:TEMP $zipFileName
    try {
        $ErrorActionPreference = 'Stop'
        $release = Invoke-RestMethod -Uri $RepoUrl
        $downloadUrl = $release.assets | Where-Object { $_.name -eq $zipFileName } | Select-Object -ExpandProperty browser_download_url
        if (-not $downloadUrl) { throw "Could not find '$zipFileName' asset in the latest release." }
        
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZipPath
        Print-Success "Download complete."
    } catch {
        Print-Error "Failed to download the release. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 3: Install or Update application
    $isUpdate = Test-Path $InstallDir
    if ($isUpdate) {
        Print-Step "Updating application..."
    } else {
        Print-Step "Installing application for the first time..."
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    try {
        $tempUnzipDir = Join-Path $env:TEMP "ani-web-update"
        if (Test-Path $tempUnzipDir) {
            Remove-Item -Recurse -Force $tempUnzipDir
        }
        Expand-Archive -Path $tempZipPath -DestinationPath $tempUnzipDir -Force
        Remove-Item -Path $tempZipPath

        if ($isUpdate) {
            Print-Info "Copying new application files..."
            robocopy "$tempUnzipDir" "$InstallDir" /E /NFL /NDL /NJH /NJS
        } else {
            Move-Item -Path "$tempUnzipDir\*" -Destination $InstallDir -Force
        }
        Remove-Item -Recurse -Force $tempUnzipDir

        Print-Info "Ensuring client dependencies are up to date..."
        Push-Location (Join-Path $InstallDir "client")
        npm install --omit=dev --silent
        Pop-Location
        Print-Info "Ensuring server dependencies are up to date..."
        Push-Location (Join-Path $InstallDir "server")
        npm install --omit=dev --silent
        Pop-Location
        
        $installedVersion = (Get-Content (Join-Path $InstallDir "package.json") | ConvertFrom-Json).version
        if (-not $installedVersion) { throw "Could not determine installed version." }
        Set-Content -Path $VersionFile -Value $installedVersion

        Print-Success "Application version $installedVersion is now installed."
    } catch {
        Print-Error "Failed during file operations. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 4: Create launcher scripts
    Print-Step "Creating 'ani-web' command..."
    try {
        New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null

        $ps1LauncherContent = @"
# This is the ani-web launcher. It checks for updates before running the app.
param(`$arg)
`$InstallDir = "$InstallDir"
`$ScriptsDir = "$ScriptsDir"
`$VersionFile = "$VersionFile"
`$RemoteVersionUrl = "$RemoteVersionUrl"
`$SetupScriptUrl = "$SetupScriptUrl"

if (`$arg -eq "uninstall") {
    Write-Host "Uninstalling ani-web..."
    Get-CimInstance Win32_Process | Where-Object { `$_.CommandLine -like "*`$InstallDir*" -and `$_.Name -eq "node.exe" } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    `$currentUserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    `$newPath = (`$currentUserPath.Split(';') | Where-Object { `$_ -ne "`$ScriptsDir" }) -join ';'
    [System.Environment]::SetEnvironmentVariable("Path", `$newPath, "User")
    Remove-Item -Recurse -Force "`$InstallDir"
    Write-Host "ani-web has been uninstalled. Please restart your terminal." -ForegroundColor Green
    exit 0
}

try {
    `$LocalVersionStr = Get-Content "`$VersionFile" -ErrorAction SilentlyContinue
    `$RemotePackageJson = Invoke-WebRequest -Uri "`$RemoteVersionUrl" -UseBasicParsing -ErrorAction SilentlyContinue
    `$RemoteVersionStr = if (`$RemotePackageJson -and `$RemotePackageJson.Content -match '"version":\s*"([^"]+)"') { `$matches[1] } else { `$null }

    if (`$LocalVersionStr -and `$RemoteVersionStr) {
        if ([System.Version]`$RemoteVersionStr -gt [System.Version]`$LocalVersionStr) {
            Write-Host "A new version of ani-web is available (`$LocalVersionStr -> `$RemoteVersionStr). Updating..."
            `$tempSetupPath = Join-Path `$env:TEMP "ani-web-setup-update.ps1"
            (Invoke-WebRequest -Uri "`$SetupScriptUrl" -UseBasicParsing).Content | Set-Content -Path `$tempSetupPath
            Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`$tempSetupPath"
            Write-Host "Update process started in a new window. This launcher will now exit."
            Start-Sleep -Seconds 4
            exit 0
        }
    }
} catch {
    Write-Host "Could not check for updates. Starting application anyway..." -ForegroundColor Yellow
}

Push-Location "`$InstallDir"
cmd.exe /c "run.bat"
Pop-Location
"@
        Set-Content -Path $LauncherPs1Path -Value $ps1LauncherContent

        $batLauncherContent = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$LauncherPs1Path`" %*"
        Set-Content -Path $LauncherBatPath -Value $batLauncherContent

        Print-Success "Command created at $LauncherBatPath"
    } catch {
        Print-Error "Failed to create launcher script. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 5: Add to PATH
    Print-Step "Adding command to your user PATH..."
    try {
        $currentUserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        if ($currentUserPath -notlike "*$ScriptsDir*") {
            $newUserPath = "$currentUserPath;$ScriptsDir"
            [System.Environment]::SetEnvironmentVariable("Path", $newUserPath, "User")
            Print-Success "'ani-web' command will be available in new terminals."
        } else {
            Print-Success "'ani-web' command is already in your PATH."
        }
    } catch {
        Print-Error "Failed to add command to PATH. Reason: $($_.Exception.Message)"
    }
    Write-Host

    Print-Step "Installation Complete!"
    Print-Info "Please open a new terminal or restart your current one to use the 'ani-web' command."
    Write-Host
}

# --- Script Entry Point ---
Print-Header
Start-Installation
Read-Host "Press Enter to exit"
exit 0
