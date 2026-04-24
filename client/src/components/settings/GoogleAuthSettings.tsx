import React, { useState, useEffect } from 'react'
import { Button } from '../common/Button'
import { FaEye, FaEyeSlash } from 'react-icons/fa'
import StatusModal from '../common/StatusModal'
import styles from './GoogleAuthSettings.module.css'

interface User {
  name: string
  email: string
}

const GoogleAuthSettings: React.FC = () => {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [showClientId, setShowClientId] = useState(false)
  const [showClientSecret, setShowClientSecret] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [authUrl, setAuthUrl] = useState('')
  const [hasAuthConfig, setHasAuthConfig] = useState(false)

  const [statusModal, setStatusModal] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'info'
    showConfirmButton?: boolean
    onConfirm?: () => void
    confirmButtonText?: string
    cancelButtonText?: string
  }>({
    show: false,
    message: '',
    type: 'info',
  })

  const fetchUser = async () => {
    try {
      const res = await fetch('/api/auth/user')
      const userData = await res.json()
      setUser(userData)
    } catch {
      setUser(null)
    }
  }

  const fetchAuthUrl = async () => {
    try {
      const res = await fetch('/api/auth/google')
      const data = await res.json()
      setAuthUrl(data.url)
    } catch (error) {
      console.error('Failed to fetch auth URL', error)
    }
  }

  const fetchConfigStatus = async () => {
    try {
      const res = await fetch('/api/auth/config-status')
      const data = await res.json()
      setHasAuthConfig(data.hasConfig)
    } catch (error) {
      console.error('Failed to fetch config status', error)
    }
  }

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true)
      await Promise.all([
        fetchUser(),
        fetchConfigStatus(),
        fetch('/api/auth/google-auth')
          .then((res) => res.json())
          .then((data) => {
            setClientId(data.clientId || '')
            setClientSecret(data.clientSecret || '')
            if (data.clientId) {
              fetchAuthUrl()
            }
          })
          .catch((err) => console.error('Failed to fetch auth config', err)),
      ])
      setLoading(false)
    }

    fetchInitialData()

    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
        setUser(event.data.user)
        window.location.reload()
      }
    }

    window.addEventListener('message', handleAuthMessage)
    return () => window.removeEventListener('message', handleAuthMessage)
  }, [])

  const handleSave = async () => {
    if (!clientId && !clientSecret) {
      setStatusModal({
        show: true,
        message: 'Please enter a Client ID and Client Secret to save.',
        type: 'info',
      })
      return
    }
    try {
      const res = await fetch('/api/auth/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })

      if (res.ok) {
        setStatusModal({
          show: true,
          message:
            'Configuration saved successfully. You must restart the server for these changes to take effect.',
          type: 'success',
        })
        fetchConfigStatus()
        if (clientId) fetchAuthUrl()
      } else {
        const data = await res.json().catch(() => ({}))
        setStatusModal({
          show: true,
          message: data.error || 'Failed to save configuration.',
          type: 'error',
        })
      }
    } catch (error) {
      setStatusModal({
        show: true,
        message: 'Failed to save configuration.',
        type: 'error',
      })
    }
  }

  const handleClear = () => {
    setStatusModal({
      show: true,
      message:
        'Are you sure you want to clear your Google authentication configuration? This will sign you out and remove all stored credentials.',
      type: 'info',
      showConfirmButton: true,
      onConfirm: () => {
        setStatusModal({ show: false, message: '', type: 'info' })
        clearConfig()
      },
      confirmButtonText: 'Clear',
      cancelButtonText: 'Cancel',
    })
  }

  const clearConfig = async () => {
    setClientId('')
    setClientSecret('')
    try {
      const res = await fetch('/api/auth/google-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: '', clientSecret: '' }),
      })

      if (res.ok) {
        setStatusModal({
          show: true,
          message:
            'Configuration cleared successfully. You must restart the server for these changes to take effect.',
          type: 'success',
        })
        fetchConfigStatus()
      } else {
        throw new Error('Failed to clear')
      }
    } catch (error) {
      setStatusModal({
        show: true,
        message: 'Failed to clear configuration.',
        type: 'error',
      })
    }
  }

  const handleSignIn = () => {
    if (authUrl) {
      const width = 600
      const height = 700
      const left = window.innerWidth / 2 - width / 2
      const top = window.innerHeight / 2 - height / 2
      window.open(authUrl, 'GoogleAuth', `width=${width},height=${height},top=${top},left=${left}`)
    } else {
      setStatusModal({
        show: true,
        message: 'Authentication URL not available. Ensure server is configured correctly.',
        type: 'error',
      })
    }
  }

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      setUser(null)
      setStatusModal({ show: true, message: 'Successfully signed out.', type: 'success' })
      window.location.reload()
    } catch (error) {
      console.error('Sign out failed', error)
      setStatusModal({ show: true, message: 'Failed to sign out.', type: 'error' })
    }
  }

  if (loading)
    return <div style={{ color: 'var(--text-secondary)', padding: '1.5rem' }}>Loading...</div>

  return (
    <div className={styles.sectionCard}>
      <h3 className={styles.title}>Google Authentication</h3>

      {user ? (
        <div className={styles.userInfo}>
          <p>
            Signed in as: <strong>{user.name}</strong> ({user.email})
          </p>
          <Button variant="danger" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      ) : (
        <div className={styles.signIn}>
          <p>Sign in with your Google account to enable synchronization features.</p>
          <Button onClick={handleSignIn} disabled={!hasAuthConfig}>
            Sign in with Google
          </Button>
          {!hasAuthConfig && (
            <p className={styles.warning}>
              Google authentication is not configured. Please set up Client ID and Secret below.
            </p>
          )}
        </div>
      )}

      <hr className={styles.hr} />

      <div className={styles.formGroup}>
        <label className={styles.label}>Client ID</label>
        <div className={styles.inputWrapper}>
          <input
            type={showClientId ? 'text' : 'password'}
            className={styles.input}
            value={clientId}
            onChange={(e) => setClientId(e.currentTarget.value)}
            placeholder="Enter Google Client ID"
          />
          <button className={styles.iconButton} onClick={() => setShowClientId(!showClientId)}>
            {showClientId ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Client Secret</label>
        <div className={styles.inputWrapper}>
          <input
            type={showClientSecret ? 'text' : 'password'}
            className={styles.input}
            value={clientSecret}
            onChange={(e) => setClientSecret(e.currentTarget.value)}
            placeholder="Enter Google Client Secret"
          />
          <button
            className={styles.iconButton}
            onClick={() => setShowClientSecret(!showClientSecret)}
          >
            {showClientSecret ? <FaEyeSlash /> : <FaEye />}
          </button>
        </div>
      </div>

      <div className={styles.actions}>
        <Button onClick={handleSave}>Save Config</Button>
        <Button variant="secondary" onClick={handleClear}>
          Clear Config
        </Button>
      </div>

      <StatusModal
        show={statusModal.show}
        message={statusModal.message}
        type={statusModal.type}
        onClose={() => setStatusModal((prev) => ({ ...prev, show: false }))}
        showConfirmButton={statusModal.showConfirmButton}
        onConfirm={statusModal.onConfirm}
        confirmButtonText={statusModal.confirmButtonText}
        cancelButtonText={statusModal.cancelButtonText}
      />
    </div>
  )
}

export default GoogleAuthSettings
