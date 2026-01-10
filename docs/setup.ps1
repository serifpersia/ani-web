# =============================================================================
#                        ani-web Setup Script (Windows)
# =============================================================================
# This script handles the initial installation and self-updating of ani-web.

# --- Configuration ---
$InstallDir = "$env:APPDATA\ani-web"
$ScriptsDir = "$InstallDir\scripts"
$LauncherBatPath = "$ScriptsDir\ani-web.bat"
$LauncherPs1Path = "$ScriptsDir\ani-web-launcher.ps1"
$VersionFile = "$InstallDir\.version"
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
    # Step 1: Stop any running instances to prevent file lock errors
    Print-Step "Checking for running instances of ani-web..."
    try {
        $existingProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like "*$InstallDir*" -and $_.Name -eq "node.exe" }
        if ($existingProcesses) {
            Print-Info "Found running ani-web process(es). Stopping them..."
            $existingProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
            # Add a small delay to allow file handles to be released
            Start-Sleep -Seconds 2
            Print-Success "Stopped running instances."
        } else {
            Print-Info "No running instances found."
        }
    } catch {
        Print-Info "Could not check for running processes, but will proceed. This might cause issues if a server is running."
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
    }

    try {
        # Unzip to a temporary location first
        $tempUnzipDir = Join-Path $env:TEMP "ani-web-update"
        if (Test-Path $tempUnzipDir) {
            Remove-Item -Recurse -Force $tempUnzipDir
        }
        Expand-Archive -Path $tempZipPath -DestinationPath $tempUnzipDir -Force
        Remove-Item -Path $tempZipPath # Cleanup zip

        if ($isUpdate) {
            # Smart Update: Use Robocopy for a more robust merge/overwrite.
            Print-Info "Copying new application files using Robocopy..."
            # /E copies subdirectories, including empty ones. This will merge the new files
            # over the old ones, leaving untouched files (like node_modules) alone.
            robocopy "$tempUnzipDir" "$InstallDir" /E /NFL /NDL /NJH /NJS
        } else {
            # First-time Install: Move the entire unzipped folder to the destination
            Move-Item -Path "$tempUnzipDir\*" -Destination $InstallDir -Force
        }

        # Clean up the temporary unzip directory
        Remove-Item -Recurse -Force $tempUnzipDir

        # Sync dependencies based on the new package-lock.json and record version
        Print-Info "Ensuring dependencies are up to date..."
        Push-Location $InstallDir
        npm install --omit=dev --silent
        npm install --prefix server --omit=dev --silent
        Pop-Location
        
        $installedVersion = (Get-Content "$InstallDir\package.json" | ConvertFrom-Json).version
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

        # Create PowerShell launcher with update and uninstall logic
        $ps1LauncherContent = @"
# This is the ani-web launcher. It checks for updates before running the app.
param(`$arg)

# --- Configuration (self-contained) ---
`$InstallDir = "$InstallDir"
`$ScriptsDir = "$ScriptsDir"
`$VersionFile = "$InstallDir\.version"
`$RemoteVersionUrl = "https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
`$SetupScriptUrl = "https://raw.githubusercontent.com/serifpersia/ani-web/main/docs/setup.ps1"
# ---

# --- Uninstall Logic ---
if (`$arg -eq "uninstall") {
    Write-Host "Uninstalling ani-web..."
    # Stop any running processes before trying to delete
    Get-CimInstance Win32_Process | Where-Object { `$_.CommandLine -like "*`$InstallDir*" -and `$_.Name -eq "node.exe" } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2

    # Remove from PATH
    `$currentUserPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    `$newPath = (`$currentUserPath.Split(';') | Where-Object { `$_ -ne "`$ScriptsDir" }) -join ';'
    [System.Environment]::SetEnvironmentVariable("Path", `$newPath, "User")
    
    # Remove installation directory
    Remove-Item -Recurse -Force "`$InstallDir"
    
    Write-Host "ani-web has been uninstalled. Please restart your terminal." -ForegroundColor Green
    exit 0
}

# --- Update Check ---
try {
    `$LocalVersionStr = Get-Content "`$VersionFile" -ErrorAction SilentlyContinue
    `$RemotePackageJson = Invoke-WebRequest -Uri "`$RemoteVersionUrl" -UseBasicParsing -ErrorAction SilentlyContinue
    `$RemoteVersionStr = if (`$RemotePackageJson -and `$RemotePackageJson.Content -match '"version":\s*"([^"]+)"') { `$matches[1] } else { `$null }

    if (`$LocalVersionStr -and `$RemoteVersionStr) {
        if ([System.Version]`$RemoteVersionStr -gt [System.Version]`$LocalVersionStr) {
            Write-Host "A new version of ani-web is available (`$LocalVersionStr -> `$RemoteVersionStr). Updating..."
            
            # Download the new setup script to a temporary file
            `$tempSetupPath = Join-Path `$env:TEMP "ani-web-setup-update.ps1"
            (Invoke-WebRequest -Uri "`$SetupScriptUrl" -UseBasicParsing).Content | Set-Content -Path `$tempSetupPath

            # Launch the updater in a new, completely detached process and exit this one.
            Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "`$tempSetupPath"
            
            Write-Host "Update process started in a new window. This launcher will now exit."
            Start-Sleep -Seconds 4 # Give user time to read the message
            exit 0
        }
    }
} catch {
    # This catch block is a fallback. The logic above is designed to prevent it.
    Write-Host "Could not check for updates. Starting application anyway..." -ForegroundColor Yellow
}

# --- Run Application ---
pushd "`$InstallDir"
cmd.exe /c "run.bat 2"
popd
"@
        Set-Content -Path $LauncherPs1Path -Value $ps1LauncherContent

        # Create a simple Batch file to call the PowerShell launcher
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