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
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}))
      if (data.error === 'AUTH_REQUIRED' && data.provider === 'animepahe') {
        window.dispatchEvent(new CustomEvent('ANIMEPAHE_AUTH_REQUIRED'))
      }
    }
    throw new Error(`Failed to fetch from ${url}`)
  }
  return response.json()
}
