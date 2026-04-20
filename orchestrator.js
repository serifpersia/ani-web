#!/usr/bin/env node
const { spawn } = require('child_process')
const readline = require('readline')
const http = require('http')
const os = require('os')
const path = require('path')

const mode = process.argv[2] || 'prod'
const isWin = os.platform() === 'win32'

const colors = {
  reset: '\x1b[0m',
  server: '\x1b[36m', // Cyan
  client: '\x1b[32m', // Green
  system: '\x1b[33m', // Yellow
}

const SERVER_DIR = path.join(__dirname, 'server')
const CLIENT_DIR = path.join(__dirname, 'client')

let syncSpinner = null
let syncMessage = ''
let syncDots = 0

// Dot animation logic
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

  // Hook into sync logs to trigger the animation
  if (str.includes('[SYNC_START]')) {
    const parts = str.split('[SYNC_START]')
    if (parts[1]) startSpinner(parts[1].split('\n')[0].trim())
    return
  }
  if (str.includes('[SYNC_END]')) {
    stopSpinner()
    return
  }

  // Server is fully done shutting down and has synced
  if (str.includes('[SERVER_EXIT]')) {
    stopSpinner()
    console.log(
      `${colors.system}[System]${colors.reset} Server sync complete. Shutting down cleanly.`
    )

    // Terminate the full process tree to prevent lingering Dev servers on Windows
    if (isWin) {
      if (serverProcess) spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
      if (clientProcess) spawn('taskkill', ['/pid', clientProcess.pid, '/f', '/t'], { shell: true })
    } else {
      if (serverProcess) serverProcess.kill('SIGKILL')
      if (clientProcess) clientProcess.kill('SIGKILL')
    }
    process.exit(0)
    return
  }

  const lines = str.split('\n').filter((line) => line.trim() !== '')
  if (lines.length === 0) return

  // Handle incoming logs during an active spinner cleanly
  if (syncSpinner) {
    process.stdout.write('\r\x1b[K') // clear the current line
    for (const line of lines) {
      console.log(`${color}[${prefix}]${colors.reset} ${line}`)
    }
    // redraw the spinner
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
  // Directly run the compiled server to avoid runtime NPM dependency and handle paths better
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

  // Instantly kill client process, it has no data to sync
  if (clientProcess) {
    if (isWin) spawn('taskkill', ['/pid', clientProcess.pid, '/f', '/t'], { shell: true })
    else clientProcess.kill('SIGKILL')
  }

  // Ping the server gracefully to run its shutdown sequence and sync
  const req = http.request({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/internal/shutdown',
    method: 'POST',
  })

  req.on('error', () => {
    // If server is not reachable, just force close everything
    console.log(`${colors.system}[System]${colors.reset} Server unreachable, forcing exit.`)
    if (isWin && serverProcess)
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
    else if (serverProcess) serverProcess.kill('SIGKILL')
    process.exit(0)
  })

  req.end()

  // 15 seconds hard timeout safety net
  setTimeout(() => {
    console.log(`${colors.system}[System]${colors.reset} Force exiting after timeout.`)
    if (isWin && serverProcess)
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { shell: true })
    else if (serverProcess) serverProcess.kill('SIGKILL')
    process.exit(1)
  }, 15000)
}

// Listen for keys 'q' and 'ctrl+c' directly instead of letting terminal process them
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
