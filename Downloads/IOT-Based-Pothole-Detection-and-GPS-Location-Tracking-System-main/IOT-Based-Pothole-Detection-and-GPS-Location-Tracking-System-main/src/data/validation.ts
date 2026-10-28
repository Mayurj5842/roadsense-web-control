import type { DetectionEvent, DeviceStatus, EventSource, Severity, UploadStatus } from './types'

const severities: Severity[] = ['minor', 'moderate', 'severe', 'unclassified']
const uploadStatuses: UploadStatus[] = ['uploaded', 'pending', 'failed']

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function validCoordinates(latitude: number | null, longitude: number | null): boolean {
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180 && !(latitude === 0 && longitude === 0)
}

export function normalizeEvent(value: unknown, key?: string, source: EventSource = 'esp32'): DetectionEvent | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : key
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : ''
  if (!id || !timestamp || !Number.isFinite(Date.parse(timestamp))) return null

  const latitude = finiteOrNull(record.latitude)
  const longitude = finiteOrNull(record.longitude)
  const gpsValid = record.gpsValid !== false && validCoordinates(latitude, longitude)
  const severity = severities.includes(record.severity as Severity) ? record.severity as Severity : 'unclassified'
  const uploadStatus = uploadStatuses.includes(record.uploadStatus as UploadStatus) ? record.uploadStatus as UploadStatus : 'uploaded'

  return {
    id,
    timestamp: new Date(timestamp).toISOString(),
    latitude: gpsValid ? latitude : null,
    longitude: gpsValid ? longitude : null,
    impactValue: finiteOrNull(record.impactValue),
    severity,
    gpsValid,
    source,
    uploadStatus,
    deviceId: typeof record.deviceId === 'string' ? record.deviceId : 'unknown-device',
    roadName: typeof record.roadName === 'string' && record.roadName.trim() ? record.roadName.trim() : null,
    accuracyMeters: finiteOrNull(record.accuracyMeters),
  }
}

export function normalizeDeviceStatus(value: unknown, deviceId: string): DeviceStatus | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const latitude = finiteOrNull(record.latitude)
  const longitude = finiteOrNull(record.longitude)
  const lastReceived = typeof record.lastReceived === 'string' && Number.isFinite(Date.parse(record.lastReceived)) ? new Date(record.lastReceived).toISOString() : null
  return {
    deviceId,
    lastReceived,
    latitude: record.gpsValid !== false && validCoordinates(latitude, longitude) ? latitude : null,
    longitude: record.gpsValid !== false && validCoordinates(latitude, longitude) ? longitude : null,
    gpsValid: record.gpsValid !== false && validCoordinates(latitude, longitude),
    impactValue: finiteOrNull(record.impactValue),
    wifiConnected: typeof record.wifiConnected === 'boolean' ? record.wifiConnected : null,
    cloudConnected: typeof record.cloudConnected === 'boolean' ? record.cloudConnected : null,
    uploadedEvents: typeof record.uploadedEvents === 'number' && Number.isFinite(record.uploadedEvents) ? Math.max(0, record.uploadedEvents) : 0,
    source: 'esp32',
    heartbeatMessage: typeof record.heartbeatMessage === 'string' ? record.heartbeatMessage : null,
  }
}
