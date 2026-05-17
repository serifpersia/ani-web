import React, { useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../components/common/Button'
import TitlePreferenceToggle from '../components/common/TitlePreferenceToggle'
import styles from './Settings.module.css'
import GitHubSyncSettings from '../components/settings/GitHubSyncSettings'
import GoogleAuthSettings from '../components/settings/GoogleAuthSettings'
import WatchlistSettings from '../components/settings/WatchlistSettings'
import RcloneSettings from '../components/settings/RcloneSettings'
import SyncProviderSelector from '../components/settings/SyncProviderSelector'
import { FaCog, FaCloud, FaDatabase, FaList } from 'react-icons/fa'
import { useLowEndMode } from '../contexts/LowEndModeContext'
import ToggleSwitch from '../components/common/ToggleSwitch'

type SettingsTab = 'general' | 'sync' | 'watchlist' | 'database'

const Settings: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') as SettingsTab | null
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    initialTab && ['general', 'sync', 'watchlist', 'database'].includes(initialTab)
      ? initialTab
      : 'general'
  )
  const [statusMessage, setStatusMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { lowEndMode, setLowEndMode } = useLowEndMode()

  React.useEffect(() => {
    document.title = 'Settings - ani-web'
  }, [])

  React.useEffect(() => {
    const tab = searchParams.get('tab') as SettingsTab | null
    if (tab && ['general', 'sync', 'watchlist', 'database'].includes(tab)) {
      setActiveTab(tab)
    }
  }, [searchParams])

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab)
    setSearchParams(tab === 'general' ? {} : { tab })
  }

  const handleBackup = async () => {
    setStatusMessage('Backing up database...')
    try {
      const response = await fetch('/api/backup-db')
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'ani-web-backup.db'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
        setStatusMessage('Database backup successful!')
      } else {
        const errorData = await response.json()
        setStatusMessage(`Backup failed: ${errorData.error}`)
      }
    } catch (_error) {
      setStatusMessage('Backup failed: An unexpected error occurred.')
    }
  }

  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setStatusMessage('Restoring database...')
    const formData = new FormData()
    formData.append('dbfile', file)

    try {
      const response = await fetch('/api/restore-db', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (response.ok) {
        setStatusMessage(result.message || 'Database restored successfully!')
        setTimeout(() => window.location.reload(), 2000)
      } else {
        setStatusMessage(`Restore failed: ${result.error}`)
      }
    } catch (_error) {
      setStatusMessage('Restore failed: An unexpected error occurred.')
    }
  }

  const triggerFileSelect = () => {
    fileInputRef.current?.click()
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Appearance & Preferences</h3>
              <p>Configure how titles are displayed and other general preferences.</p>
              <div className={styles.settingItem}>
                <TitlePreferenceToggle />
              </div>
              <div className={styles.settingItem} style={{ marginTop: '1.5rem' }}>
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>Low End Mode</h4>
                    <p
                      style={{
                        margin: '0.25rem 0 0',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      Disables animations and heavy visual effects for better performance on older
                      hardware.
                    </p>
                  </div>
                  <ToggleSwitch
                    isChecked={lowEndMode}
                    onChange={(e) => setLowEndMode(e.target.checked)}
                    id="low-end-mode"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      case 'sync':
        return (
          <div className={styles.tabContent}>
            <SyncProviderSelector />
            <GitHubSyncSettings />
            <GoogleAuthSettings />
            <RcloneSettings />
          </div>
        )
      case 'watchlist':
        return (
          <div className={styles.tabContent}>
            <WatchlistSettings />
          </div>
        )
      case 'database':
        return (
          <div className={styles.tabContent}>
            <div className={styles.sectionCard}>
              <h3>Database Management</h3>
              <p>Download a backup of your current database or restore from an existing file.</p>
              <div className={styles.controls}>
                <Button onClick={handleBackup}>Backup Database</Button>
                <Button variant="secondary" onClick={triggerFileSelect}>
                  Restore Database
                </Button>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleRestore}
                style={{ display: 'none' }}
                accept=".db"
              />
              {statusMessage && <p className={styles.status}>{statusMessage}</p>}
            </div>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="page-container">
      <div className={styles.settingsHeader}>
        <h1 className={styles.pageTitle}>Settings</h1>
        <p className={styles.pageSubtitle}>Manage your preferences and data synchronization</p>
      </div>

      <div className={styles.settingsLayout}>
        <aside className={styles.sidebar}>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'general' ? styles.active : ''}`}
            onClick={() => selectTab('general')}
          >
            <FaCog /> <span>General</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'sync' ? styles.active : ''}`}
            onClick={() => selectTab('sync')}
          >
            <FaCloud /> <span>Synchronization</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'watchlist' ? styles.active : ''}`}
            onClick={() => selectTab('watchlist')}
          >
            <FaList /> <span>Watchlist</span>
          </button>
          <button
            className={`${styles.sidebarItem} ${activeTab === 'database' ? styles.active : ''}`}
            onClick={() => selectTab('database')}
          >
            <FaDatabase /> <span>Database</span>
          </button>
        </aside>

        <main className={styles.mainContent}>{renderTabContent()}</main>
      </div>
    </div>
  )
}

export default Settings
