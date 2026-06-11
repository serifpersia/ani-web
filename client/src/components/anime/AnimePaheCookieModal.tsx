import React, { useState, useEffect } from 'react'
import GenericModal from '../common/GenericModal'
import styles from './AnimePaheCookieModal.module.css'
import toast from 'react-hot-toast'

interface AnimePaheCookieModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

const AnimePaheCookieModal: React.FC<AnimePaheCookieModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<1 | 2>(1)
  const [userAgent, setUserAgent] = useState(navigator.userAgent)
  const [cookie, setCookie] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setStep(1)
      setUserAgent(navigator.userAgent)
      setCookie('')
    }
  }, [isOpen])

  const handleStartVerification = async () => {
    localStorage.setItem('animepahe_ua', userAgent)
    window.open('https://animepahe.pw', '_blank')
    setStep(2)
  }

  const handleSubmitCookie = async () => {
    if (!cookie.trim()) {
      toast.error('Please enter the cf_clearance cookie')
      return
    }

    setIsSubmitting(true)
    try {
      localStorage.setItem('animepahe_cookie', cookie.trim())
      toast.success('Cookie updated successfully!')
      onSuccess()
      onClose()
    } catch (e) {
      toast.error('Failed to save cookie')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <GenericModal isOpen={isOpen} onClose={onClose} title="AnimePahe Verification Required">
      <div className={styles.container}>
        {step === 1 ? (
          <>
            <p>
              AnimePahe requires a manual verification to bypass Cloudflare/DDoS-Guard protection.
            </p>
            <div className={styles.field}>
              <label>Your User-Agent (will be used for requests):</label>
              <textarea
                value={userAgent}
                onChange={(e) => setUserAgent(e.target.value)}
                rows={3}
                className={styles.textarea}
              />
            </div>
            <button className={styles.button} onClick={handleStartVerification}>
              Start Verification (Opens AnimePahe)
            </button>
          </>
        ) : (
          <>
            <p>
              1. Solve the challenge on the <strong>AnimePahe tab</strong>.<br />
              2. While <strong>still on the AnimePahe tab</strong>, open DevTools (F12) &rarr;
              Application &rarr; Cookies &rarr; https://animepahe.pw
              <br />
              3. Find <strong>cf_clearance</strong>, double-click its <strong>Value</strong> to
              select it, and copy it.
              <br />
              4. Paste it below. Ensure you copy <strong>only the key</strong> (remove any{' '}
              <code>cf_clearance=</code> prefix or quotes if they were included).
            </p>
            <div className={styles.field}>
              <label>cf_clearance cookie value:</label>
              <input
                type="text"
                value={cookie}
                onChange={(e) => setCookie(e.target.value)}
                placeholder="e.g. xxxxxxxx.xxxxxxxx.xxxxxxx-xxxxxxx"
                className={styles.input}
              />
            </div>
            <div className={styles.actions}>
              <button className={styles.secondaryButton} onClick={() => setStep(1)}>
                Back
              </button>
              <button
                className={styles.button}
                onClick={handleSubmitCookie}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </div>
    </GenericModal>
  )
}

export default AnimePaheCookieModal
