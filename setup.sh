#!/bin/bash

clear

echo -e "\033[1;33m-----------------------------------------------\033[0m"
echo -e "            \033[1;36mani-web Setup Script\033[0m"
echo -e "\033[1;33m-----------------------------------------------\033[0m"
echo

echo "--> Finding latest release from GitHub..."
LATEST_URL=$(curl -s https://api.github.com/repos/serifpersia/ani-web/releases/latest | grep "browser_download_url.*ani-web\.zip" | cut -d '"' -f 4)

if [ -z "$LATEST_URL" ]; then
    echo -e "\033[1;31mError: Could not find the latest release URL. Please check the repository.\033[0m"
    exit 1
fi
echo -e "\033[1;32m    Success: Found release URL.\033[0m"
echo

echo "--> Downloading ani-web.zip..."
curl -L -o ani-web.zip "$LATEST_URL"
if [ $? -ne 0 ]; then
    echo -e "\033[1;31mError: Download failed!\033[0m"
    exit 1
fi
echo -e "\033[1;32m    Success: Download complete.\033[0m"
echo

echo "--> Extracting files..."
mkdir -p ani-web-release
unzip -q ani-web.zip -d ani-web-release
if [ $? -ne 0 ]; then
    echo -e "\033[1;31mError: Failed to extract zip file. Is 'unzip' installed?\033[0m"
    exit 1
fi
cd ani-web-release
echo -e "\033[1;32m    Success: Files extracted.\033[0m"
echo

echo "--> Preparing to start the application..."
chmod +x run.sh
echo
echo "--> Handing over to the run script (auto-selecting Production mode)..."
echo

# Execute run.sh and pass '2' as an argument to auto-select production mode
./run.sh 2

exit 0