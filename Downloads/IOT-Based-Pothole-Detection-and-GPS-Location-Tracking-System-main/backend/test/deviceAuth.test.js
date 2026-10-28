import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deviceApiKeyMatches, createDeviceApiKeyAuth } from '../src/deviceAuth.js'

const expectedKey = 'test-only-device-secret-that-is-long-enough'

describe('device API key authentication', () => {
  it('accepts the configured secret and trims header whitespace', () => {
    assert.equal(deviceApiKeyMatches(` ${expectedKey} `, expectedKey), true)
  })

  it('rejects missing and incorrect secrets', () => {
    assert.equal(deviceApiKeyMatches(undefined, expectedKey), false)
    assert.equal(deviceApiKeyMatches('wrong-device-secret', expectedKey), false)
    assert.equal(deviceApiKeyMatches(expectedKey, ''), false)
  })

  it('returns 401 without calling next for an invalid request header', () => {
    let statusCode
    let body
    let nextCalled = false
    const middleware = createDeviceApiKeyAuth(expectedKey)
    middleware(
      { get: () => 'incorrect-key' },
      {
        status(code) {
          statusCode = code
          return this
        },
        json(value) {
          body = value
          return this
        },
      },
      () => { nextCalled = true },
    )

    assert.equal(statusCode, 401)
    assert.match(body.error, /X-Device-API-Key/)
    assert.equal(nextCalled, false)
  })

  it('continues only when the case-insensitive Express header lookup matches', () => {
    let nextCalled = false
    const middleware = createDeviceApiKeyAuth(expectedKey)
    middleware(
      { get: (header) => header.toLowerCase() === 'x-device-api-key' ? expectedKey : undefined },
      {},
      () => { nextCalled = true },
    )

    assert.equal(nextCalled, true)
  })
})
