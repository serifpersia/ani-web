<div align="center">

<img src="client/public/favicon.svg" alt="ani-web logo" width="150"/>

# ani-web

*A fast, lightweight local anime streaming web-app.*

[![License: MIT](https://img.shields.io/badge/License-MIT-8b5cf6?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/serifpersia/ani-web.svg?style=for-the-badge&color=8b5cf6)](https://github.com/serifpersia/ani-web/stargazers)
[![Node version](https://img.shields.io/badge/Node.js-%3E%3D_20-8b5cf6?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

---

**ani-web** is an easy-to-use, local Node-based anime streaming web application. Modern anime streaming sites are often bloated with heavy scripts, ads, and trackers, making them frustrating to use on low-end hardware. **ani-web** was built to solve this by providing a clean, fast, and completely local interface.

<div align="center">
  <img 
    width="800" 
    alt="ani-web user interface" 
    src="https://github.com/user-attachments/assets/0390b634-38ac-485b-aa96-6dc03b44683f"
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

- **Node.js**: Version 20 or higher ([Download here](https://nodejs.org/)).

### ⚡ Quick Install

We provide automated installation scripts to get you up and running in seconds.

#### Windows
Open a **PowerShell** terminal and run:
```powershell
irm serifpersia.github.io/ani-web/win | iex
```

#### Linux & macOS
Open a **Terminal** and run:
```bash
curl -sL serifpersia.github.io/ani-web/install | bash
```

> **Note:** After the one-time setup, you can start the application anytime, from any directory, by simply opening a terminal and typing `ani-web`.

---

## Uninstalling

If you need to remove the application from your system, simply open a terminal and run:

```bash
ani-web uninstall
```
*This safely deletes the application files and removes the `ani-web` command from your system's PATH.*

---

## Manual Installation (For Developers)

Want to poke around the source code or contribute? You can build the project manually.

**1. Clone the repository:**
```bash
git clone https://github.com/serifpersia/ani-web.git
cd ani-web
```

**2. Install, Build, and Run:**
Use provided run scripts that offer a menu to choose between a **Development** or **Production** setup. To run a development environment (which installs all dependencies and builds the source code), run the script below and choose "Development".

*To build run `npm install` followed by `npm run build`.*

**On Linux / macOS:**
```bash
chmod +x run.sh
./run.sh
```

**On Windows:**
```bat
run.bat
```

---

## Disclaimer

**ani-web does not host, upload, or manage any video content.** 

The core aim of this project is to provide a streamlined, automated interface to extract publicly accessible content from the internet. All media served through this application is hosted by external, non-affiliated third-party sources.

<details>
<summary><b>⚖️ Click to read the full Legal Disclaimer & DMCA info</b></summary>
<br>

* **The Browser Analogy:** Think of `ani-web` as a specialized web browser. While a standard web browser makes hundreds of requests to download a site's HTML, CSS, ads, and trackers, this project simply makes requests specifically targeted at the media content served by those sites.
* **User Responsibility:** A browser is merely a tool, and the legality of its use depends entirely on the user. This software is provided "as-is", and it is to be used at the user's own risk, in accordance with their local laws and government regulations. The developer is not responsible for what users choose to access.
* **DMCA & Copyright:** Because `ani-web` operates entirely via client-side access mechanisms and hosts absolutely zero content, any DMCA takedown notices or copyright infringement claims must be directed to the external, third-party services that actually host the files. 

## License

This project is open-source and licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

<div align="center">
  <i>If you find this project helpful, please consider giving it a ⭐ on GitHub!</i>
</div>
