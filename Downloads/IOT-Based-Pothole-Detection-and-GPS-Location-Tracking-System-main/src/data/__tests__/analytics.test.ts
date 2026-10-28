import { describe, expect, it } from 'vitest'
import { filterEvents, summarizeEvents } from '../analytics'
import { normalizeEvent } from '../validation'
import type { DetectionEvent } from '../types'

const fixtureEvents: DetectionEvent[] = [
  { id: 'RS-T-1001', timestamp: '2026-01-01T08:00:00Z', latitude: 18.5208, longitude: 73.8567, impactValue: 8.6, severity: 'severe', gpsValid: true, source: 'esp32', uploadStatus: 'uploaded', deviceId: 'ESP32-CAR-01', roadName: null, accuracyMeters: null },
  { id: 'RS-T-1002', timestamp: '2026-01-01T09:00:00Z', latitude: 18.5197, longitude: 73.8582, impactValue: 5.2, severity: 'moderate', gpsValid: true, source: 'esp32', uploadStatus: 'uploaded', deviceId: 'ESP32-CAR-01', roadName: null, accuracyMeters: null },
  { id: 'RS-T-1003', timestamp: '2026-01-01T10:00:00Z', latitude: 18.5186, longitude: 73.8549, impactValue: 2.1, severity: 'minor', gpsValid: true, source: 'esp32', uploadStatus: 'uploaded', deviceId: 'ESP32-CAR-01', roadName: null, accuracyMeters: null },
  { id: 'RS-T-1004', timestamp: '2026-01-01T11:00:00Z', latitude: 18.5231, longitude: 73.8518, impactValue: 7.7, severity: 'severe', gpsValid: true, source: 'esp32', uploadStatus: 'uploaded', deviceId: 'ESP32-CAR-01', roadName: null, accuracyMeters: null },
]

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
    const summary = summarizeEvents(fixtureEvents)
    expect(summary.total).toBe(fixtureEvents.length)
    expect(summary.severe).toBe(fixtureEvents.filter((event) => event.severity === 'severe').length)
    expect(summary.uniqueLocations).toBeGreaterThan(0)
  })

  it('filters by severity, ID, and inclusive date range', () => {
    const event = fixtureEvents[0]
    const day = event.timestamp.slice(0, 10)
    expect(filterEvents(fixtureEvents, { severity: event.severity }).every((item) => item.severity === event.severity)).toBe(true)
    expect(filterEvents(fixtureEvents, { search: event.id })).toEqual([event])
    expect(filterEvents(fixtureEvents, { from: day, to: day })).toContain(event)
  })
})
