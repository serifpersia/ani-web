const log = (message: string) =>
  console.log(`[Sync Config] ${new Date().toISOString()} - ${message}`)

let activeRemote: 'mega' | 'gdrive' | undefined

export function setActiveRemote(remote: 'mega' | 'gdrive') {
  log(`Setting active sync remote to: ${remote}`)
  activeRemote = remote
}

export function getActiveRemote(): 'mega' | 'gdrive' | undefined {
  return activeRemote
}

export async function initialize(): Promise<void> {
  if (activeRemote !== 'gdrive') {
    log('Active remote is not gdrive, skipping gdrive-specific initialization.')
    return
  }
  log('gdrive is the active remote.')
}

export function getRemoteString(remoteDir: string): string {
  if (!activeRemote) {
    throw new Error('Cannot get remote string: active remote is not set.')
  }
  return `${activeRemote}:${remoteDir}`
}
