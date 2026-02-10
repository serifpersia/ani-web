import React, { useState, useEffect } from 'react'
import ToggleSwitch from '../common/ToggleSwitch'
import styles from '../../pages/Settings.module.css'

const WatchlistSettings: React.FC = () => {
  const [skipConfirmation, setSkipConfirmation] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const response = await fetch('/api/settings?key=skipRemoveConfirmation')
        const data = await response.json()
        if (data.value == true) {
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
    <div className={styles['settings-section']}>
      <h3>Watchlist</h3>
      <div className={styles.setting}>
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
  )
}

export default WatchlistSettings
