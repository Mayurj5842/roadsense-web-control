import type { DetectionEvent, DeviceStatus } from './types'

const now = Date.now()
const records: Array<Omit<DetectionEvent, 'timestamp' | 'source' | 'deviceId'>> = [
  { id: 'RS-DEMO-1042', latitude: 18.5208, longitude: 73.8567, impactValue: 8.6, severity: 'severe', gpsValid: true, uploadStatus: 'uploaded', roadName: 'FC Road test corridor', accuracyMeters: 7 },
  { id: 'RS-DEMO-1041', latitude: 18.5197, longitude: 73.8582, impactValue: 5.2, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: 'FC Road test corridor', accuracyMeters: 9 },
  { id: 'RS-DEMO-1040', latitude: 18.5186, longitude: 73.8549, impactValue: 2.1, severity: 'minor', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 6 },
  { id: 'RS-DEMO-1039', latitude: 18.5231, longitude: 73.8518, impactValue: 7.7, severity: 'severe', gpsValid: true, uploadStatus: 'uploaded', roadName: 'JM Road test corridor', accuracyMeters: 8 },
  { id: 'RS-DEMO-1038', latitude: 18.5246, longitude: 73.8531, impactValue: 4.8, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: 'JM Road test corridor', accuracyMeters: 11 },
  { id: 'RS-DEMO-1037', latitude: 18.5163, longitude: 73.8624, impactValue: 1.7, severity: 'minor', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 10 },
  { id: 'RS-DEMO-1036', latitude: 18.5178, longitude: 73.8495, impactValue: 6.3, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 13 },
  { id: 'RS-DEMO-1035', latitude: 18.5217, longitude: 73.8628, impactValue: 9.1, severity: 'severe', gpsValid: true, uploadStatus: 'uploaded', roadName: 'Deccan test corridor', accuracyMeters: 5 },
  { id: 'RS-DEMO-1034', latitude: 18.5262, longitude: 73.8576, impactValue: 3.5, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 12 },
  { id: 'RS-DEMO-1033', latitude: 18.5149, longitude: 73.8557, impactValue: 2.4, severity: 'minor', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 8 },
  { id: 'RS-DEMO-1032', latitude: 18.5229, longitude: 73.8663, impactValue: 7.2, severity: 'severe', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 14 },
  { id: 'RS-DEMO-1031', latitude: 18.5281, longitude: 73.8502, impactValue: 4.2, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 9 },
  { id: 'RS-DEMO-1030', latitude: 18.5128, longitude: 73.8608, impactValue: 1.5, severity: 'minor', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 8 },
  { id: 'RS-DEMO-1029', latitude: 18.5192, longitude: 73.8469, impactValue: 6.7, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 15 },
  { id: 'RS-DEMO-1028', latitude: 18.5255, longitude: 73.8634, impactValue: 8.3, severity: 'severe', gpsValid: true, uploadStatus: 'uploaded', roadName: 'FC Road test corridor', accuracyMeters: 7 },
  { id: 'RS-DEMO-1027', latitude: 18.5158, longitude: 73.8511, impactValue: 2.8, severity: 'minor', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 9 },
  { id: 'RS-DEMO-1026', latitude: 18.5271, longitude: 73.8612, impactValue: 4.5, severity: 'moderate', gpsValid: true, uploadStatus: 'uploaded', roadName: null, accuracyMeters: 11 },
  { id: 'RS-DEMO-1025', latitude: null, longitude: null, impactValue: 0.9, severity: 'unclassified', gpsValid: false, uploadStatus: 'pending', roadName: null, accuracyMeters: null },
]

export const demoEvents: DetectionEvent[] = records.map((record, index) => ({
  ...record,
  timestamp: new Date(now - index * (index < 4 ? 44 : 245) * 60_000).toISOString(),
  source: 'demo',
  deviceId: 'ESP32-ROVER-DEMO-01',
}))

export const demoDeviceStatus: DeviceStatus = {
  deviceId: 'ESP32-ROVER-DEMO-01',
  lastReceived: demoEvents[0].timestamp,
  latitude: demoEvents[0].latitude,
  longitude: demoEvents[0].longitude,
  gpsValid: true,
  impactValue: demoEvents[0].impactValue,
  wifiConnected: null,
  cloudConnected: null,
  uploadedEvents: demoEvents.length - 1,
  source: 'demo',
  heartbeatMessage: 'Simulated heartbeat — not hardware telemetry',
}
