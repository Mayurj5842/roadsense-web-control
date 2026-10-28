import { describe, expect, it } from 'vitest'
import { filterEvents, summarizeEvents } from '../analytics'
import { demoEvents } from '../demoData'
import { normalizeEvent } from '../validation'

describe('event validation', () => {
  it('normalizes valid records and assigns the database key as the ID', () => {
    const event = normalizeEvent({ timestamp: '2026-01-01T12:00:00Z', latitude: 18.52, longitude: 73.85, gpsValid: true, severity: 'severe', impactValue: 8 }, 'record-1')
    expect(event?.id).toBe('record-1')
    expect(event?.source).toBe('esp32')
    expect(event?.gpsValid).toBe(true)
  })

  it('rejects malformed records and does not plot the null island coordinate', () => {
    expect(normalizeEvent({ timestamp: 'not-a-date' }, 'bad')).toBeNull()
    const event = normalizeEvent({ timestamp: '2026-01-01T12:00:00Z', latitude: 0, longitude: 0, gpsValid: true }, 'null-island')
    expect(event?.gpsValid).toBe(false)
    expect(event?.latitude).toBeNull()
  })

  it('rejects out-of-range coordinates without rejecting the event', () => {
    const event = normalizeEvent({ timestamp: '2026-01-01T12:00:00Z', latitude: 95, longitude: 181, gpsValid: true }, 'bad-gps')
    expect(event).not.toBeNull()
    expect(event?.gpsValid).toBe(false)
  })
})

describe('event summaries and filtering', () => {
  it('derives severity counts and unique locations from the supplied dataset', () => {
    const summary = summarizeEvents(demoEvents)
    expect(summary.total).toBe(demoEvents.length)
    expect(summary.severe).toBe(demoEvents.filter((event) => event.severity === 'severe').length)
    expect(summary.uniqueLocations).toBeGreaterThan(0)
  })

  it('filters by severity, ID, and inclusive date range', () => {
    const event = demoEvents[0]
    const day = event.timestamp.slice(0, 10)
    expect(filterEvents(demoEvents, { severity: event.severity }).every((item) => item.severity === event.severity)).toBe(true)
    expect(filterEvents(demoEvents, { search: event.id })).toEqual([event])
    expect(filterEvents(demoEvents, { from: day, to: day })).toContain(event)
  })
})
