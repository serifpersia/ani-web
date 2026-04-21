#!/usr/bin/env node
const { spawn } = require('child_process')
const readline = require('readline')
const http = require('http')
const os = require('os')
const path = require('path')

const mode = process.argv[2] || 'prod'
const isWin = os.platform() === 'win32'

if (mode === '--version' || mode === '-v') {
  const pkg = require('./package.json')
  console.log(`ani-web version ${pkg.version}`)
  process.exit(0)
}

const colors = {
  reset: '\x1b[0m',
  server: '\x1b[36m',
  client: '\x1b[32m',
  system: '\x1b[33m',
}

const SERVER_DIR = path.join(__dirname, 'server')
const CLIENT_DIR = path.join(__dirname, 'client')

let syncSpinner = null
let syncMessage = ''
let syncDots = 0

const startSpinner = (msg) => {
  syncMessage = msg
  syncDots = 0
  process.stdout.write(`${colors.system}[System]${colors.reset} ${msg}`)
  syncSpinner = setInterval(() => {
    syncDots = (syncDots + 1) % 4
    process.stdout.write(
      `\r${colors.system}[System]${colors.reset} ${msg}${'.'.repeat(syncDots)}${' '.repeat(3 - syncDots)}`
    )
  }, 400)
}

const stopSpinner = () => {
  if (syncSpinner) {
    clearInterval(syncSpinner)
    syncSpinner = null
    process.stdout.write('\n')
  }
}

const log = (prefix, color, data) => {
  const str = data.toString()

  if (str.includes('[SYNC_START]')) {
    const parts = str.split('[SYNC_START]')
    if (parts[1]) startSpinner(parts[1].split('\n')[0].trim())
    return
  }
  if (str.includes('[SYNC_END]')) {
    stopSpinner()
    return
  }

  if (str.includes('[SERVER_EXIT]')) {
    stopSpinner()
    console.log(
      `${colors.system}[System]${colors.reset} Server sync complete. Shutting down cleanly.`
    )

    if (isWin) {
      if (serverProcess) spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
      if (clientProcess) spawn('taskkill', ['/pid', clientProcess.pid, '/f', '/t'], { shell: true })
    } else {
      if (serverProcess) {
        serverProcess.kill('SIGTERM')
        setTimeout(() => {
          if (serverProcess.connected || !serverProcess.killed) serverProcess.kill('SIGKILL')
        }, 5000)
      }
      if (clientProcess) {
        clientProcess.kill('SIGTERM')
        setTimeout(() => {
          if (clientProcess.connected || !clientProcess.killed) clientProcess.kill('SIGKILL')
        }, 5000)
      }
    }
    setTimeout(() => process.exit(0), 5500)
    return
  }

  const lines = str.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return

  if (syncSpinner) {
    process.stdout.write('\r\x1b[K')
    for (const line of lines) {
      console.log(`${color}[${prefix}]${colors.reset} ${line}`)
    }

    process.stdout.write(
      `${colors.system}[System]${colors.reset} ${syncMessage}${'.'.repeat(syncDots)}${' '.repeat(3 - syncDots)}`
    )
  } else {
    for (const line of lines) {
      console.log(`${color}[${prefix}]${colors.reset} ${line}`)
    }
  }
}

const npmCmd = isWin ? 'npm.cmd' : 'npm'
const spawnOpts = (cwd) => ({ stdio: 'pipe', shell: isWin, cwd })
let serverProcess, clientProcess
let isShuttingDown = false

console.log(
  `${colors.system}[System]${colors.reset} Starting ani-web in ${mode.toUpperCase()} mode...`
)
console.log(
  `${colors.system}[System]${colors.reset} Press 'q' or 'Ctrl+C' to cleanly exit and sync data.\n`
)

if (mode === 'dev') {
  serverProcess = spawn(npmCmd, ['run', 'dev'], spawnOpts(SERVER_DIR))
  clientProcess = spawn(npmCmd, ['run', 'dev'], spawnOpts(CLIENT_DIR))
} else {
  const serverPath = path.join(SERVER_DIR, 'dist', 'server.js')
  serverProcess = spawn('node', ['--max-old-space-size=256', serverPath], spawnOpts(SERVER_DIR))
}

if (serverProcess) {
  serverProcess.stdout.on('data', (data) => log('Server', colors.server, data))
  serverProcess.stderr.on('data', (data) => log('Server', colors.server, data))
  serverProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      log('System', colors.system, `Server crashed or exited prematurely.`)
      process.exit(code || 0)
    }
  })
}

if (clientProcess) {
  clientProcess.stdout.on('data', (data) => log('Client', colors.client, data))
  clientProcess.stderr.on('data', (data) => log('Client', colors.client, data))
}

const shutdown = () => {
  if (isShuttingDown) return
  isShuttingDown = true
  console.log(`\n${colors.system}[System]${colors.reset} Initiating clean shutdown...`)

  if (clientProcess) {
    if (isWin) spawn('taskkill', ['/pid', clientProcess.pid, '/f', '/t'], { shell: true })
    else {
      clientProcess.kill('SIGTERM')
      setTimeout(() => {
        if (clientProcess.connected || !clientProcess.killed) clientProcess.kill('SIGKILL')
      }, 5000)
    }
  }

  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/internal/shutdown',
    method: 'POST',
  })

  req.on('error', () => {
    console.log(`${colors.system}[System]${colors.reset} Server unreachable, forcing exit.`)
    if (isWin && serverProcess)
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
    else if (serverProcess) {
      serverProcess.kill('SIGTERM')
      setTimeout(() => {
        if (serverProcess.connected || !serverProcess.killed) serverProcess.kill('SIGKILL')
        process.exit(0)
      }, 5000)
      return
    }
    process.exit(0)
  })

  req.end()

  setTimeout(() => {
    console.log(`${colors.system}[System]${colors.reset} Force exiting after timeout.`)
    if (isWin && serverProcess)
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
    else if (serverProcess) {
      serverProcess.kill('SIGTERM')
      setTimeout(() => {
        if (serverProcess.connected || !serverProcess.killed) serverProcess.kill('SIGKILL')
        process.exit(1)
      }, 5000)
      return
    }
    process.exit(1)
  }, 15000)
}

readline.emitKeypressEvents(process.stdin)
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true)
}

process.stdin.on('keypress', (str, key) => {
  if (key && (key.name === 'q' || (key.ctrl && key.name === 'c'))) {
    shutdown()
  }
})

process.on('SIGINT', () => {
  shutdown()
})
