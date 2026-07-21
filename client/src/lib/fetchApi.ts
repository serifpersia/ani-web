export const fetchApi = async (url: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  const animepaheUa = localStorage.getItem('animepahe_ua')
  const animepaheCookie = localStorage.getItem('animepahe_cookie')

  if (animepaheUa) headers['x-animepahe-ua'] = animepaheUa
  if (animepaheCookie) headers['x-animepahe-cookie'] = animepaheCookie

  const response = await fetch(url, { headers })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let data: Record<string, unknown> = {}
    try {
      data = JSON.parse(text)
    } catch {
      /* ignore parse errors */
    }

    const errorMsg = typeof data.error === 'string' ? data.error : ''

    if (response.status === 403 && errorMsg === 'AUTH_REQUIRED' && data.provider === 'animepahe') {
      window.dispatchEvent(new CustomEvent('ANIMEPAHE_AUTH_REQUIRED'))
    }

    if (
      errorMsg.includes('AA_CRYPTO_STALE') ||
      errorMsg.includes('AA_CRYPTO_EXPIRED') ||
      errorMsg.includes('AA_CRYPTO_BUILD_MISMATCH')
    ) {
      window.dispatchEvent(new CustomEvent('ALLANIME_RECOVERY_NEEDED'))
    }

    throw new Error(errorMsg || `Failed to fetch from ${url}`)
  }
  return response.json()
}
