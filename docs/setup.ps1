# =============================================================================
#                              ani-web Setup Script
# =============================================================================

# --- Configuration ---
$InstallDir = "$env:APPDATA\ani-web"
$ScriptsDir = "$InstallDir\scripts"
$LauncherBatPath = "$ScriptsDir\ani-web.bat"
$LauncherPs1Path = "$ScriptsDir\ani-web-launcher.ps1"
$VersionFile = "$InstallDir\.version"
$RepoUrl = "https://api.github.com/repos/serifpersia/ani-web/releases/latest"
$RemoteVersionUrl = "https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
$SetupScriptUrl = "https://serifpersia.github.io/ani-web/setup.ps1"
# ---

# --- UI Functions ---
function Print-Header {
    Clear-Host
    Write-Host "---------------------------------------------" -ForegroundColor Yellow
    Write-Host "            ani-web Setup Script" -ForegroundColor Cyan
    Write-Host "---------------------------------------------" -ForegroundColor Yellow
    Write-Host
}

function Print-Step ($Message) {
    Write-Host "--> " -NoNewline
    Write-Host $Message -ForegroundColor White
}

function Print-Success ($Message) {
    Write-Host "    Success: " -NoNewline -ForegroundColor Green
    Write-Host $Message
}

function Print-Error ($Message) {
    Write-Host "Error: " -NoNewline -ForegroundColor Red
    Write-Host $Message
    Read-Host "Press Enter to exit"
    exit 1
}

function Print-Info ($Message) {
    Write-Host "    Info: " -NoNewline -ForegroundColor Blue
    Write-Host $Message
}
# ---

function Main {
    Print-Header

    # Step 1: Find and download latest release
    Print-Step "Finding and downloading latest release from GitHub..."
    $zipFileName = "ani-web.zip"
    $tempZipPath = "$env:TEMP\$zipFileName"
    try {
        $ErrorActionPreference = 'Stop'
        $release = Invoke-RestMethod -Uri $RepoUrl
        $downloadUrl = $release.assets | Where-Object { $_.name -eq $zipFileName } | Select-Object -ExpandProperty browser_download_url
        if (-not $downloadUrl) {
            throw "Could not find '$zipFileName' asset in the latest release on GitHub."
        }
        Invoke-WebRequest -Uri $downloadUrl -OutFile $tempZipPath
        Print-Success "Download complete."
    } catch {
        Print-Error "Failed to download the release. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 2: Install and record version
    Print-Step "Installing application..."
    try {
        if (Test-Path $InstallDir) {
            Remove-Item -Recurse -Force $InstallDir
        }
        New-Item -ItemType Directory -Path $InstallDir | Out-Null
        Expand-Archive -Path $tempZipPath -DestinationPath $InstallDir -Force
        Remove-Item -Path $tempZipPath # Cleanup zip file

        $installedVersion = (Get-Content "$InstallDir\package.json" | ConvertFrom-Json).version
        if (-not $installedVersion) {
            throw "Could not determine installed version from package.json."
        }
        Set-Content -Path $VersionFile -Value $installedVersion

        Print-Success "Application version $installedVersion installed to $InstallDir"
    } catch {
        Print-Error "Failed to extract '$zipFileName'. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 3: Create launcher scripts
    Print-Step "Creating 'ani-web' command..."
    try {
        New-Item -ItemType Directory -Path $ScriptsDir -Force | Out-Null

        # Create PowerShell launcher with update and uninstall logic
        $ps1LauncherContent = @"
# ani-web PowerShell launcher with auto-update and uninstall

param(`$arg)

# --- Configuration ---
`$InstallDir = "$InstallDir"
`$ScriptsDir = "$ScriptsDir"
`$VersionFile = "$VersionFile"
`$RemoteVersionUrl = "$RemoteVersionUrl"
`$SetupScriptUrl = "$SetupScriptUrl"
# ---

# --- Uninstall Logic ---
function Uninstall-AniWeb {
    Write-Host "Uninstalling ani-web..."
    try {
        `$currentUserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
        `$newPath = (`$currentUserPath.Split(';') | Where-Object { `$_ -ne "`$ScriptsDir" }) -join ';'
        [System.Environment]::SetEnvironmentVariable("Path", `$newPath, "User")
        
        Remove-Item -Recurse -Force "`$InstallDir"
        
        Write-Host "ani-web has been uninstalled." -ForegroundColor Green
        Write-Host "Please restart your terminal for the PATH changes to take effect."
    } catch {
        Write-Host "An error occurred during uninstallation: `$($_.Exception.Message)" -ForegroundColor Red
    }
    exit 0
}
# ---

# --- Main Logic ---
if (`$arg -eq "uninstall") {
    Uninstall-AniWeb
}
# ---

# --- Update Check ---
try {
    `$LocalVersion = Get-Content "`$VersionFile"
    `$RemoteVersion = (Invoke-RestMethod -Uri "`$RemoteVersionUrl").version

    if ("`$LocalVersion" -ne "`$RemoteVersion" -and `$RemoteVersion) {
        Write-Host "A new version of ani-web is available (`$LocalVersion -> `$RemoteVersion). Updating..."
        irm "`$SetupScriptUrl" | iex
        Write-Host "Update complete. Please run 'ani-web' again."
        exit 0
    }
} catch {
    Write-Host "Could not check for updates. Starting application anyway..." -ForegroundColor Yellow
}
# ---

# --- Run Application ---
pushd "`$InstallDir"
cmd.exe /c "run.bat 2"
popd
"@
        Set-Content -Path $LauncherPs1Path -Value $ps1LauncherContent

        # Create Batch file to call the PowerShell launcher and pass arguments
        $batLauncherContent = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$LauncherPs1Path`" %*"
        Set-Content -Path $LauncherBatPath -Value $batLauncherContent

        Print-Success "Command created at $LauncherBatPath"
    } catch {
        Print-Error "Failed to create launcher script. Reason: $($_.Exception.Message)"
    }
    Write-Host

    # Step 4: Add to PATH
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

Main
Read-Host "Press Enter to exit"
exit 0
