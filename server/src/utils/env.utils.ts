import fs from 'fs'
import { CONFIG } from '../config'

const lockPath = `${CONFIG.ENV_PATH}.lock`

async function acquireLock(): Promise<fs.promises.FileHandle> {
  let handle: fs.promises.FileHandle | undefined
  let attempts = 0
  while (!handle) {
    try {
      handle = await fs.promises.open(lockPath, 'wx')
    } catch {
      if (++attempts >= 50) {
        throw new Error('Failed to acquire lock on .env file')
      }
      await new Promise((r) => setTimeout(r, 50))
    }
  }
  return handle
}

function releaseLock(handle: fs.promises.FileHandle) {
  handle.close().catch(() => {})
  fs.unlink(lockPath, () => {})
}

export async function updateEnvFile(updates: Record<string, string>) {
  const lockHandle = await acquireLock()
  try {
    const envPath = CONFIG.ENV_PATH

    let envContent = ''
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8')
    }

    const lines = envContent.split('\n')
    const newLines = [...lines]

    Object.entries(updates).forEach(([key, value]) => {
      let found = false
      const i = 0
      while (i < newLines.length) {
        const line = newLines[i]
        if (line && line.startsWith(`${key}=`)) {
          if (value === '') {
            newLines.splice(i, 1)
            continue
          } else {
            newLines[i] = `${key}=${value}`
          }
          found = true
          break
        }
      }
      if (!found && value !== '') {
        newLines.push(`${key}=${value}`)
      }
    })

    const finalContent =
      newLines
        .join('\n')
        .replace(/\n{2,}/g, '\n')
        .trim() + '\n'
    fs.writeFileSync(envPath, finalContent)
  } finally {
    releaseLock(lockHandle)
  }
}
