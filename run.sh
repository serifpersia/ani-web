#!/bin/bash

clear

echo -e "\033[1;33m-----------------------------------------------\033[0m"
echo -e "                    \033[1;36mani-web\033[0m"
echo -e "\033[1;33m-----------------------------------------------\033[0m"
echo -e "    \033[1;34mhttps://github.com/serifpersia/ani-web\033[0m"
echo -e "\033[1;33m-----------------------------------------------\033[0m"
echo
echo -e "\033[1;32mStarting ani-web...\033[0m"
echo

if [ ! -d "node_modules" ]; then
    echo -e "\033[1;33mServer dependencies not found. Installing with npm install...\033[0m"
    npm install
    if [ $? -ne 0 ]; then
        echo -e "\033[1;31mError: npm install failed!\033[0m"
        read -p "Press Enter to exit..."
        exit $?
    else
        echo -e "\033[1;32mSuccess: npm install completed!\033[0m"
    fi
else
    echo -e "\033[1;36mFound existing dependencies (node_modules). Skipping install.\033[0m"
fi
echo

echo -e "\033[1;33mRunning npm start...\033[0m"
npm start