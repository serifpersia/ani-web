#!/bin/bash
set -e

# =============================================================================
#                         ani-web Setup Script (Linux/macOS)
# =============================================================================
# This script handles the initial installation and self-updating of ani-web.

# --- Configuration ---
INSTALL_DIR="$HOME/.ani-web"
BIN_DIR="$HOME/.local/bin"
LAUNCHER_PATH="$BIN_DIR/ani-web"
VERSION_FILE="$INSTALL_DIR/.version"
REPO_URL="https://api.github.com/repos/serifpersia/ani-web/releases/latest"
REMOTE_VERSION_URL="https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
SETUP_SCRIPT_URL="https://raw.githubusercontent.com/serifpersia/ani-web/main/docs/setup.sh"
# ---

# --- UI Functions ---
print_header() {
    clear
    echo -e "\033[1;33m-----------------------------------------------\033[0m"
    echo -e "            \033[1;36mani-web Setup Script\033[0m"
    echo -e "\033[1;33m-----------------------------------------------\033[0m"
    echo
}

print_step() { echo -e "--> \033[1m$1\033[0m"; }
print_success() { echo -e "    \033[1;32mSuccess:\033[0m $1"; }
print_error() { echo -e "    \033[1;31mError:\033[0m $1" >&2; exit 1; }
print_info() { echo -e "    \033[1;34mInfo:\033[0m $1"; }
# ---

# --- Main Installation Logic ---
run_installation() {
    # Step 1: Stop any running instances
    print_step "Checking for running instances of ani-web..."
    # Silently try to kill any node process running from the install directory
    pkill -f "$INSTALL_DIR/server/dist/server.js" &>/dev/null || true
    print_info "Any running instances have been stopped."
    echo

    # Step 2: Find and download the latest release
    print_step "Finding latest release from GitHub..."
    LATEST_URL=$(curl -s "$REPO_URL" | grep "browser_download_url.*ani-web.zip" | cut -d '"' -f 4)
    [ -n "$LATEST_URL" ] || print_error "Could not find the latest release URL."
    print_success "Found release URL."
    
    TEMP_ZIP=$(mktemp)
    curl -L -o "$TEMP_ZIP" "$LATEST_URL" || print_error "Download failed!"
    print_success "Download complete."
    echo

    # Step 3: Install or Update application
    IS_UPDATE=false
    if [ -d "$INSTALL_DIR" ]; then
        IS_UPDATE=true
        print_step "Updating application..."
    else
        print_step "Installing application for the first time..."
    fi

    # Unzip to a temporary location
    TEMP_UNZIP_DIR=$(mktemp -d)
    unzip -q "$TEMP_ZIP" -d "$TEMP_UNZIP_DIR" || print_error "Failed to extract zip file. Is 'unzip' installed?"
    rm "$TEMP_ZIP" # Cleanup zip

    if [ "$IS_UPDATE" = true ]; then
        print_info "Copying new application files..."
        # Copy over new files, which will overwrite old ones but leave node_modules alone.
        # The -a flag preserves attributes, and the . at the end handles dotfiles.
        cp -R "$TEMP_UNZIP_DIR"/.* "$INSTALL_DIR"/ 2>/dev/null || true
        cp -R "$TEMP_UNZIP_DIR"/* "$INSTALL_DIR"/
    else
        # First-time install, just move the whole directory
        mkdir -p "$INSTALL_DIR"
        mv "$TEMP_UNZIP_DIR"/* "$INSTALL_DIR"/
    fi

    # Clean up temp unzip dir
    rm -rf "$TEMP_UNZIP_DIR"

    # Sync dependencies based on the new package-lock.json
    print_info "Ensuring dependencies are up to date..."
    (cd "$INSTALL_DIR" && npm install --omit=dev --silent)
    (cd "$INSTALL_DIR/server" && npm install --omit=dev --silent)

    # Record the installed version
    INSTALLED_VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | cut -d '"' -f 4)
    [ -n "$INSTALLED_VERSION" ] || print_error "Could not determine installed version."
    echo "$INSTALLED_VERSION" > "$VERSION_FILE"
    
    print_success "Application version $INSTALLED_VERSION is now installed."
    echo

    # Step 4: Create the launcher script
    print_step "Creating 'ani-web' command..."
    mkdir -p "$BIN_DIR"
    
    # This 'here document' creates the script file that will be run by the 'ani-web' command
    cat > "$LAUNCHER_PATH" << EOF
#!/bin/bash
# This is the ani-web launcher. It checks for updates before running the app.

# --- Configuration (self-contained) ---
INSTALL_DIR="\$HOME/.ani-web"
VERSION_FILE="\$INSTALL_DIR/.version"
REMOTE_VERSION_URL="https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
SETUP_SCRIPT_URL="https://raw.githubusercontent.com/serifpersia/ani-web/main/docs/setup.sh"

# --- Uninstall Logic ---
if [ "\$1" == "uninstall" ]; then
    echo "Uninstalling ani-web..."
    pkill -f "\$INSTALL_DIR/server/dist/server.js" &>/dev/null || true
    rm -rf "\$INSTALL_DIR"
    rm -f "\$HOME/.local/bin/ani-web"
    echo "ani-web has been uninstalled."
    exit 0
fi

# --- Update Check ---
LOCAL_VERSION=\$(cat "\$VERSION_FILE" 2>/dev/null || echo "0.0.0")
REMOTE_VERSION=\$(curl -s "\$REMOTE_VERSION_URL" | grep '"version"' | cut -d '"' -f 4 || echo "0.0.0")

# Compare versions using sort -V (version sort)
if [ "\$(printf '%s\n' "\$REMOTE_VERSION" "\$LOCAL_VERSION" | sort -V | head -n 1)" != "\$REMOTE_VERSION" ]; then
    echo "A new version of ani-web is available (\$LOCAL_VERSION -> \$REMOTE_VERSION). Updating..."
    # Safer update: download to temp file then execute
    TEMP_SETUP_SCRIPT=\$(mktemp)
    if curl -sSL "\$SETUP_SCRIPT_URL" -o "\$TEMP_SETUP_SCRIPT"; then
        bash "\$TEMP_SETUP_SCRIPT"
        rm "\$TEMP_SETUP_SCRIPT"
        echo "Update complete. Please run 'ani-web' again."
    else
        echo "Update download failed. Starting application anyway..."
        cd "\$INSTALL_DIR" && ./run.sh 2
    fi
    exit 0
fi

# --- Run Application ---
cd "\$INSTALL_DIR"
./run.sh 2
EOF

    chmod +x "$LAUNCHER_PATH"
    print_success "Command created at $LAUNCHER_PATH"
    echo

    # Step 5: Check if BIN_DIR is in PATH and provide instructions if not
    print_step "Finalizing setup..."
    if [[ ":\$PATH:" != *":\$BIN_DIR:"* ]]; then
        print_info "Your PATH does not seem to include $BIN_DIR."
        print_info "Please add the following line to your shell profile (e.g., ~/.bashrc or ~/.zshrc):"
        echo -e "\n    \033[1;33mexport PATH=\"$BIN_DIR:\$PATH\"\033[0m\n"
        print_info "After adding it, restart your terminal to use the 'ani-web' command."
    else
        print_success "Installation Complete!"
        print_info "You can now run 'ani-web' from a new terminal."
    fi
    echo
}

# --- Script Entry Point ---
main() {
    print_header
    run_installation
}

main
exit 0
