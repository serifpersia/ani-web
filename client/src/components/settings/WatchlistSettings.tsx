import React, { useState, useEffect } from 'react'
import ToggleSwitch from '../common/ToggleSwitch'
import styles from './WatchlistSettings.module.css'

const WatchlistSettings: React.FC = () => {
  const [skipConfirmation, setSkipConfirmation] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const response = await fetch('/api/settings?key=skipRemoveConfirmation')
        const data = await response.json()
        if (String(data.value) === 'true' || String(data.value) === '1') {
          setSkipConfirmation(true)
        } else {
          setSkipConfirmation(false)
        }
      } catch (error) {
        console.error('Failed to fetch setting', error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchSetting()
  }, [])

  const handleToggle = async () => {
    if (isUpdating) return
    setIsUpdating(true)

    const newValue = !skipConfirmation
    setSkipConfirmation(newValue)

    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'skipRemoveConfirmation', value: newValue }),
      })
    } catch (err) {
      console.error('Error saving setting:', err)
      setSkipConfirmation(!newValue)
    } finally {
      setIsUpdating(false)
    }
  }

  if (isLoading) {
    return <div>Loading settings...</div>
  }

  return (
    <div className={styles.sectionCard}>
      <h3>Watchlist Preferences</h3>
      <p>Customize your experience when managing your watchlist and series entries.</p>
      <div className={styles.settingItem}>
        <div className={styles.settingRow}>
          <label htmlFor="skip-confirmation-toggle">
            Skip confirmation when removing from watchlist
          </label>
          <ToggleSwitch
            isChecked={skipConfirmation}
            onChange={handleToggle}
            id="skip-confirmation-toggle"
            disabled={isUpdating}
          />
        </div>
      </div>
    </div>
  )
}

export default WatchlistSettings
