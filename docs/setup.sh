#!/bin/bash

set -e

# --- Configuration ---
INSTALL_DIR="$HOME/.ani-web"
BIN_DIR="$HOME/.local/bin"
LAUNCHER_PATH="$BIN_DIR/ani-web"
VERSION_FILE="$INSTALL_DIR/.version"
REPO_URL="https://api.github.com/repos/serifpersia/ani-web/releases/latest"
REMOTE_VERSION_URL="https://raw.githubusercontent.com/serifpersia/ani-web/main/package.json"
SETUP_SCRIPT_URL="https://serifpersia.github.io/ani-web/setup.sh"
# ---

# --- UI Functions ---
print_header() {
    clear
    echo -e "\033[1;33m-----------------------------------------------\033[0m"
    echo -e "            \033[1;36mani-web Setup Script\033[0m"
    echo -e "\033[1;33m-----------------------------------------------\033[0m"
    echo
}

print_step() {
    echo -e "--> \033[1m$1\033[0m"
}

print_success() {
    echo -e "    \033[1;32mSuccess:\033[0m $1"
}

print_error() {
    echo -e "\033[1;31mError:\033[0m $1" >&2
    exit 1
}

print_info() {
    echo -e "    \033[1;34mInfo:\033[0m $1"
}
# ---

# --- Main Installation Logic ---
run_installation() {
    # Step 1: Find latest release
    print_step "Finding latest release from GitHub..."
    LATEST_URL=$(curl -s "$REPO_URL" | grep "browser_download_url.*ani-web.zip" | cut -d '"' -f 4)
    if [ -z "$LATEST_URL" ]; then
        print_error "Could not find the latest release URL."
    fi
    print_success "Found release URL."
    echo

    # Step 2: Download
    print_step "Downloading ani-web.zip..."
    TEMP_ZIP=$(mktemp)
    curl -L -o "$TEMP_ZIP" "$LATEST_URL"
    if [ $? -ne 0 ]; then
        print_error "Download failed!"
    fi
    print_success "Download complete."
    echo

    # Step 3: Install and record version
    print_step "Installing application..."
    rm -rf "$INSTALL_DIR"
    mkdir -p "$INSTALL_DIR"
    unzip -q "$TEMP_ZIP" -d "$INSTALL_DIR"
    if [ $? -ne 0 ]; then
        print_error "Failed to extract zip file. Is 'unzip' installed?"
    fi
    rm "$TEMP_ZIP" # Cleanup zip file
    
    INSTALLED_VERSION=$(grep '"version"' "$INSTALL_DIR/package.json" | cut -d '"' -f 4)
    if [ -z "$INSTALLED_VERSION" ]; then
        print_error "Could not determine installed version from package.json."
    fi
    echo "$INSTALLED_VERSION" > "$VERSION_FILE"
    
    print_success "Application version $INSTALLED_VERSION installed to $INSTALL_DIR"
    echo

    # Step 4: Create launcher
    print_step "Creating 'ani-web' command..."
    mkdir -p "$BIN_DIR"
    
    LAUNCHER_CONTENT="#!/bin/bash
# ani-web launcher with auto-update and uninstall

# --- Configuration ---
INSTALL_DIR=\"$INSTALL_DIR\"
BIN_DIR=\"$BIN_DIR\"
LAUNCHER_PATH=\"$LAUNCHER_PATH\"
VERSION_FILE=\"$VERSION_FILE\"
REMOTE_VERSION_URL=\"$REMOTE_VERSION_URL\"
SETUP_SCRIPT_URL=\"$SETUP_SCRIPT_URL\"
# ---

# --- Uninstall Logic ---
uninstall() {
    echo \"Uninstalling ani-web...\"
    rm -rf \"$INSTALL_DIR\"
    rm -f \"$LAUNCHER_PATH\"
    echo \"ani-web has been uninstalled.\"
    echo \"You may need to manually remove '$BIN_DIR' from your PATH if you no longer need it.\"
    exit 0
}

# --- Main Logic ---
if [ \"$1\" == \"uninstall\" ]; then
    uninstall
fi

# --- Update Check ---
LOCAL_VERSION=$(cat "$VERSION_FILE" 2>/dev/null || echo "")
REMOTE_VERSION=$(curl -s "$REMOTE_VERSION_URL" | grep '"version"' | cut -d '"' -f 4)

if [[ -n "$LOCAL_VERSION" && -n "$REMOTE_VERSION" && "$LOCAL_VERSION" != "$REMOTE_VERSION" ]]; then
    echo "A new version of ani-web is available ($LOCAL_VERSION -> $REMOTE_VERSION). Updating..."
    
    # Safer update: download to temp file then execute
    TEMP_SETUP_SCRIPT=$(mktemp)
    if curl -sSL "$SETUP_SCRIPT_URL" -o "$TEMP_SETUP_SCRIPT"; then
        bash "$TEMP_SETUP_SCRIPT"
        rm "$TEMP_SETUP_SCRIPT" # Clean up
        echo "Update complete. Please run 'ani-web' again."
    else
        echo "Update download failed. Please try again later."
    fi
    exit 0
fi
# --- Run Application ---
cd \"$INSTALL_DIR\"
./run.sh 2
"
    echo -e "$LAUNCHER_CONTENT" > "$LAUNCHER_PATH"
    chmod +x "$LAUNCHER_PATH"
    print_success "Command created at $LAUNCHER_PATH"
    echo

    # Step 5: Check if BIN_DIR is in PATH
    case ":$PATH:" in
        *":$BIN_DIR:"*) 
            print_step "Installation Complete!"
            print_info "You can now run 'ani-web' from a new terminal."
            ;;
        *)
            print_step "Action Required!"
            print_info "Your PATH does not seem to include $BIN_DIR."
            print_info "Please add the following line to your shell profile (e.g., ~/.bashrc, ~/.zshrc):"
            echo
            echo -e "    \033[1;33mexport PATH=\"$BIN_DIR:$PATH\"\033[0m"
            echo
            print_info "After adding it, restart your terminal and you can run 'ani-web'."
            ;;
    esac
    echo
}

main() {
    print_header
    run_installation
}

main
exit 0