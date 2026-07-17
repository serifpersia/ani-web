export function sanitizeCfClearance(raw: string | undefined | null): string {
  if (!raw) return ''
  let s = String(raw).trim()
  s = s.replace(/^cf_clearance/i, '')
  s = s.replace(/^[:=]\s*/, '')
  s = s.replace(/["']/g, '').trim()
  return s
}

export function buildCfClearanceCookie(raw: string | undefined | null): string {
  const c = sanitizeCfClearance(raw)
  return c ? `cf_clearance=${c}` : ''
}
