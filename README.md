<div align="center">

<img src="client/public/logo.png" alt="ani-web logo" width="400"/>

_Stream anime locally with no ads, no tracking, and smooth performance._

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/serifpersia/ani-web.svg?style=for-the-badge&color=8b5cf6)](https://github.com/serifpersia/ani-web/stargazers)
[![Node version](https://img.shields.io/badge/Node.js-%3E%3D_22.5.0-8b5cf6?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

---

**ani-web** is a lightweight Node.js application that lets you browse and watch anime through a clean and responsive frontend running entirely on your machine.

<div align="center">
  <img 
    width="800" 
    alt="ani-web user interface" 
    src="https://github.com/user-attachments/assets/5a152f3b-ab8e-4303-b416-8fa2a67bb8d9"
    style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); margin: 20px 0;"
  />
</div>

## Features

Based on a lightweight architecture, ani-web includes:

- **Performance First:** Designed specifically to run smoothly on low-end hardware.
- **Built-in Search & Discovery:** Easily find top trending and popular shows.
- **Watchlist Management:** Keep track of what you're watching, completed, or planning to watch.
- **User Insights:** View your personal anime watching statistics.
- **MAL Integration:** Seamlessly import your lists from MyAnimeList.

---

## Getting Started

### Prerequisites

- **Node.js**: Version 22.5.0 or higher ([Download here](https://nodejs.org/)).

### ⚡ Quick Install

Open a terminal and run:

```bash
npm install -g ani-web
```

> **Note:** After the one-time setup, you can start the application anytime, from any directory, by simply opening a terminal and typing `ani-web`.

---

## Uninstalling

If you need to remove the application from your system, simply open a terminal and run:

```bash
npm uninstall -g ani-web
```

_This safely deletes the application files and removes the `ani-web` command from your system's PATH._

---

## Manual Installation (For Developers)

Want to poke around the source code or contribute? You can build the project manually.

**1. Clone the repository:**

```bash
git clone https://github.com/serifpersia/ani-web.git
cd ani-web
```

**2. Install, Build, and Run:**
Use provided run scripts that offer a menu to choose between a **Development** or **Production** setup. To run a development environment manually:

1. Run `npm install` to install core dependencies.
2. Run `npm run setup` to install development tools (Vite, TypeScript, etc).
3. Run `npm run build` to build the source code.

**On Linux / macOS:**

```bash
chmod +x run.sh
./run.sh
```

**On Windows:**

```bat
run.bat
```

### Commands

Once installed globally, you can use the following commands:

- `ani-web` - Start the application.
- `ani-web --version` (or `-v`) - Check your installed version.

### Data Location

ani-web stores your persistent files in your OS app-data folder instead of inside the globally installed npm package:

- **Windows:** `%APPDATA%\ani-web`
- **macOS:** `~/Library/Application Support/ani-web`
- **Linux:** `$XDG_DATA_HOME/ani-web` or `~/.local/share/ani-web`

This folder contains your `.env`, database files, sync manifests, and Google token file. Existing installs will automatically migrate legacy files from the old `server/` folder on first launch when those files are still present.

---

## Cloud Sync (Optional)

**ani-web** can automatically sync your watchlist and settings to the cloud. There are two ways to set this up:

### 1. Built-in Google Drive Sync

To use the native Google Drive integration, you need to provide your own Google Cloud credentials:

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Create a new project and enable the **Google Drive API**.
3.  Configure the **OAuth Consent Screen** (set it to "External" and add yourself as a test user).
4.  Create **OAuth 2.0 Client IDs** (Application type: "Web application").
5.  Add `http://localhost:3000/api/auth/google/callback` to the **Authorized redirect URIs**.
6.  Open **ani-web**, go to **Settings** -> **Google Drive**, and enter your **Client ID** and **Client Secret**.

**ani-web** will automatically handle the rest, including creating your configuration and syncing your data!

### 2. Rclone Integration

If you prefer using **Mega**, **Dropbox**, or other providers, you can use [Rclone](https://rclone.org/):

1.  Install Rclone on your system and ensure it's in your PATH.
2.  Configure a remote (any name) using `rclone config`.
3.  In **ani-web** Settings, select your remote name from the dropdown.

**Note:** If Google Drive Sync is active, it will always take priority over Rclone.

---

## Disclaimer

**ani-web does not host, upload, or manage any video content.**

The core aim of this project is to provide a streamlined, automated interface to extract publicly accessible content from the internet. All media served through this application is hosted by external, non-affiliated third-party sources.

<details>
<summary><b> Click to read the full Legal Disclaimer & DMCA info</b></summary>
<br>

- **The Browser Analogy:** Think of `ani-web` as a specialized web browser. While a standard web browser makes hundreds of requests to download a site's HTML, CSS, ads, and trackers, this project simply makes requests specifically targeted at the media content served by those sites.
- **User Responsibility:** A browser is merely a tool, and the legality of its use depends entirely on the user. This software is provided "as-is", and it is to be used at the user's own risk, in accordance with their local laws and government regulations. The developer is not responsible for what users choose to access.
- **DMCA & Copyright:** Because `ani-web` operates entirely via client-side access mechanisms and hosts absolutely zero content, any DMCA takedown notices or copyright infringement claims must be directed to the external, third-party services that actually host the files.
</details>

## License

This project is open-source and licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

<div align="center">
  <i>If you find this project helpful, please consider giving it a ⭐ on GitHub!</i>
</div>
