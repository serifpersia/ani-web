<div align="center">

<img src="public/favicon.svg" alt="ani-web logo" width="200"/>

# ani-web

[![](https://img.shields.io/travis/serifpersia/ani-web.svg?style=flat-square)](https://travis-ci.org/serifpersia/ani-web)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/serifpersia/ani-web.svg?style=flat-square)](https://github.com/serifpersia/ani-web/stargazers)

</div align="center">

**ani-web** is easy to use local node based anime streaming web app. Most sites are too heavy for low end hardware which is why this project came to be.

## Prerequisites

*   **Node.js**: Version 16 or higher ([Download](https://nodejs.org/)).

## Quick Start

This is the recommended method for most users. It will automatically download the latest pre-built version of ani-web and start the application.

### For Linux & macOS

Open a terminal and run this single command:

```bash
curl -sSL https://raw.githubusercontent.com/serifpersia/ani-web/main/setup.sh | bash
```

*(Prerequisites: Node.js, npm, curl, and unzip)*

### For Windows

Open a **PowerShell** terminal and run this single command:

```powershell
powershell -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/serifpersia/ani-web/main/setup.ps1'))"
```

*(Prerequisites: Node.js, npm, and PowerShell)*

After the setup is complete, the script will start the application, and you can access it at `http://localhost:3000`.

## Manual Installation (for Developers)

If you want to work with the source code, you can clone the repository and build the project manually.

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/serifpersia/ani-web.git
    cd ani-web
    ```

2.  **Install, Build, and Run:**
    The `run.sh` and `run.bat` scripts provide a menu to choose between a development or production setup. To run a development environment (which will install all dependencies and build the source code), simply run the script and choose "Development".

    **On Linux/macOS:**
    ```bash
    chmod +x run.sh
    ./run.sh
    ```

    **On Windows:**
    ```bat
    run.bat
    ```

## License
This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
