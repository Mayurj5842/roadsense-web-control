import { timingSafeEqual } from 'node:crypto'

export function deviceApiKeyMatches(providedKey, expectedKey) {
  if (typeof providedKey !== 'string' || !expectedKey) return false
  const provided = Buffer.from(providedKey.trim(), 'utf8')
  const expected = Buffer.from(expectedKey, 'utf8')
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

export function createDeviceApiKeyAuth(expectedKey) {
  return function requireDeviceApiKey(req, res, next) {
    if (!deviceApiKeyMatches(req.get('X-Device-API-Key'), expectedKey)) {
      return res.status(401).json({ error: 'Unauthorized: valid X-Device-API-Key header required.' })
    }
    return next()
  }
}
