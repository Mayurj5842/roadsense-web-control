export type Severity = 'minor' | 'moderate' | 'severe' | 'unclassified'
export type EventSource = 'demo' | 'esp32'
export type UploadStatus = 'uploaded' | 'pending' | 'failed'

export interface DetectionEvent {
  id: string
  timestamp: string
  latitude: number | null
  longitude: number | null
  impactValue: number | null
  severity: Severity
  gpsValid: boolean
  source: EventSource
  uploadStatus: UploadStatus
  deviceId: string
  roadName: string | null
  accuracyMeters: number | null
}

export interface DeviceStatus {
  deviceId: string
  lastReceived: string | null
  latitude: number | null
  longitude: number | null
  gpsValid: boolean
  impactValue: number | null
  wifiConnected: boolean | null
  cloudConnected: boolean | null
  uploadedEvents: number
  source: EventSource
  heartbeatMessage: string | null
}

export interface EventRepository {
  subscribeEvents(onData: (events: DetectionEvent[]) => void, onError?: (error: Error) => void): () => void
  subscribeStatus(onData: (status: DeviceStatus | null) => void, onError?: (error: Error) => void): () => void
}

export type AppPage = 'Overview' | 'Live Map' | 'Detection Events' | 'Road Analytics' | 'Device Monitoring' | 'Settings'
