import { normalizeEvent } from './validation'
import type { DetectionEvent, DeviceStatus, EventRepository } from './types'

const env = import.meta.env
export const apiBaseUrl = (env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
export const apiConfigured = Boolean(apiBaseUrl)

function getDeviceId() {
  return env.VITE_DEVICE_ID || 'ESP32-PUNE-01'
}

function toEvent(record: Record<string, unknown>, fallbackId: string): DetectionEvent | null {
  const timestamp = typeof record.timestamp === 'string' ? record.timestamp : typeof record.eventTimestamp === 'string' ? record.eventTimestamp : ''
  const latentLatitude = typeof record.latitude === 'number' ? record.latitude : typeof record.latitude === 'string' ? Number(record.latitude) : typeof record.lat === 'number' ? record.lat : typeof record.lat === 'string' ? Number(record.lat) : null
  const latentLongitude = typeof record.longitude === 'number' ? record.longitude : typeof record.longitude === 'string' ? Number(record.longitude) : typeof record.lng === 'number' ? record.lng : typeof record.lng === 'string' ? Number(record.lng) : null
  const deviceId = typeof record.deviceId === 'string' ? record.deviceId : typeof record.device_id === 'string' ? record.device_id : getDeviceId()
  const eventPayload = {
    id: typeof record.id === 'string' ? record.id : typeof record.id === 'number' ? String(record.id) : typeof record.eventId === 'string' ? record.eventId : fallbackId,
    timestamp,
    latitude: latentLatitude,
    longitude: latentLongitude,
    impactValue: typeof record.impactValue === 'number' ? record.impactValue : typeof record.impactMetric === 'number' ? record.impactMetric : typeof record.impact_metric === 'number' ? record.impact_metric : null,
    severity: typeof record.severity === 'string' ? record.severity : 'unclassified',
    gpsValid: Boolean(record.gpsValid ?? record.gps_valid ?? (latentLatitude !== null && latentLongitude !== null)),
    deviceId,
    roadName: typeof record.roadName === 'string' ? record.roadName : typeof record.road_name === 'string' ? record.road_name : null,
    accuracyMeters: typeof record.accuracyMeters === 'number' ? record.accuracyMeters : typeof record.accuracy_meters === 'number' ? record.accuracy_meters : null,
    uploadStatus: typeof record.uploadStatus === 'string' ? record.uploadStatus : 'uploaded',
  }
  return normalizeEvent(eventPayload, String(eventPayload.id || fallbackId), 'esp32')
}

function toDeviceStatus(deviceId: string, record: Record<string, unknown>): DeviceStatus | null {
  const timestamp = typeof record.lastReceived === 'string' ? record.lastReceived : typeof record.timestamp === 'string' ? record.timestamp : null
  const latitude = typeof record.latitude === 'number' ? record.latitude : typeof record.lat === 'number' ? record.lat : null
  const longitude = typeof record.longitude === 'number' ? record.longitude : typeof record.lng === 'number' ? record.lng : null
  const severityValue = typeof record.severity === 'string' ? record.severity : 'unclassified'
  return {
    deviceId,
    lastReceived: timestamp,
    latitude,
    longitude,
    gpsValid: Boolean(record.gpsValid ?? record.gps_valid ?? (latitude !== null && longitude !== null)),
    impactValue: typeof record.impactValue === 'number' ? record.impactValue : typeof record.impact_metric === 'number' ? record.impact_metric : null,
    accelerationX: typeof record.accelerationX === 'number' ? record.accelerationX : null,
    accelerationY: typeof record.accelerationY === 'number' ? record.accelerationY : null,
    accelerationZ: typeof record.accelerationZ === 'number' ? record.accelerationZ : null,
    accelerationMagnitude: typeof record.accelerationMagnitude === 'number' ? record.accelerationMagnitude : typeof record.impactValue === 'number' ? record.impactValue : null,
    impactDetected: Boolean(record.impactDetected),
    severity: (['minor', 'moderate', 'severe', 'unclassified'] as const).includes(severityValue as 'minor') ? severityValue as DeviceStatus['severity'] : 'unclassified',
    satellites: typeof record.satellites === 'number' ? record.satellites : null,
    hdop: typeof record.hdop === 'number' ? record.hdop : null,
    wifiConnected: typeof record.wifiConnected === 'boolean' ? record.wifiConnected : typeof record.wifi_connected === 'boolean' ? record.wifi_connected : null,
    cloudConnected: typeof record.cloudConnected === 'boolean' ? record.cloudConnected : typeof record.cloud_connected === 'boolean' ? record.cloud_connected : null,
    uploadedEvents: typeof record.uploadedEvents === 'number' ? Math.max(0, record.uploadedEvents) : 0,
    source: 'esp32',
    heartbeatMessage: typeof record.heartbeatMessage === 'string' ? record.heartbeatMessage : typeof record.heartbeat_message === 'string' ? record.heartbeat_message : null,
  }
}

export class ApiEventRepository implements EventRepository {
  private readonly deviceId: string
  private readonly baseUrl: string

  constructor(deviceId = getDeviceId(), baseUrl = apiBaseUrl) {
    this.deviceId = deviceId
    this.baseUrl = baseUrl
  }

  subscribeEvents(onData: (events: DetectionEvent[]) => void, onError: (error: Error) => void) {
    const load = async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/detections?deviceId=${encodeURIComponent(this.deviceId)}&limit=200`)
        if (!response.ok) {
          throw new Error(`Unable to load detections (${response.status})`)
        }
        const payload = await response.json() as { detections?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>
        const entries = Array.isArray(payload) ? payload : Array.isArray(payload.detections) ? payload.detections : []
        const events = entries.map((item, index) => toEvent(item, `api-event-${index + 1}`)).filter((event): event is DetectionEvent => event !== null)
        onData(events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)))
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Unable to connect to the RoadSense API'))
      }
    }

    void load()
    const interval = window.setInterval(() => { void load() }, 30_000)
    return () => window.clearInterval(interval)
  }

  subscribeStatus(onData: (status: DeviceStatus | null) => void, onError: (error: Error) => void) {
    const load = async () => {
      try {
        const response = await fetch(`${this.baseUrl}/api/devices/${encodeURIComponent(this.deviceId)}/status`)
        if (!response.ok) {
          throw new Error(`Unable to load device status (${response.status})`)
        }
        const payload = await response.json() as Record<string, unknown>
        onData(toDeviceStatus(this.deviceId, payload))
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Unable to load device status'))
      }
    }

    void load()
    const interval = window.setInterval(() => { void load() }, 30_000)
    return () => window.clearInterval(interval)
  }
}
