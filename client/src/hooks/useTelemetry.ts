import { useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import packageJson from '../../package.json'

const TELEMETRY_URL =
  'https://script.google.com/macros/s/AKfycby22WnleAQdi4NP-s_PMrKCVoQdCEgydOqITiNhlCIpVG1zSoBo9dlh2iXpMcfpyf-7/exec'

export const useTelemetry = () => {
  useEffect(() => {
    const isTelemetryEnabled = localStorage.getItem('telemetry_enabled') !== 'false'
    if (!isTelemetryEnabled) return

    const lastPing = localStorage.getItem('last_telemetry_ping')
    const now = Date.now()
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

    if (lastPing && now - parseInt(lastPing) < TWENTY_FOUR_HOURS) {
      return
    }

    let installationId = localStorage.getItem('installation_id')
    if (!installationId) {
      installationId = uuidv4()
      localStorage.setItem('installation_id', installationId)
    }

    const sendPing = async () => {
      try {
        await fetch(TELEMETRY_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id: installationId,
            version: packageJson.version,
            userAgent: navigator.userAgent,
          }),
        })
        localStorage.setItem('last_telemetry_ping', now.toString())
      } catch (err) {
        console.error('Telemetry ping failed:', err)
      }
    }

    sendPing()
  }, [])
}
