import { get, getDatabase, onValue, ref } from 'firebase/database'
import { initializeApp, getApps } from 'firebase/app'
import { normalizeDeviceStatus, normalizeEvent } from './validation'
import type { DetectionEvent, DeviceStatus, EventRepository } from './types'

const env = import.meta.env
export const firebaseConfigured = Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_DATABASE_URL && env.VITE_FIREBASE_PROJECT_ID)
export const firebaseConfigMessage = firebaseConfigured
  ? 'Firebase configuration detected. Live reads require a valid database URL, permissions and a device ID.'
  : 'Firebase is not configured. Add the VITE_FIREBASE_* values in .env.local to enable live data.'

function getDatabaseInstance() {
  if (!firebaseConfigured) throw new Error(firebaseConfigMessage)
  const app = getApps()[0] ?? initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  })
  return getDatabase(app)
}

export class FirebaseEventRepository implements EventRepository {
  private readonly deviceId: string
  private readonly eventsPath: string
  private readonly statusPath: string

  constructor(deviceId: string, eventsPath = 'devices', statusPath = 'devices') {
    this.deviceId = deviceId
    this.eventsPath = eventsPath
    this.statusPath = statusPath
  }

  subscribeEvents(onData: (events: DetectionEvent[]) => void, onError: (error: Error) => void) {
    try {
      const eventsRef = ref(getDatabaseInstance(), `${this.eventsPath}/${this.deviceId}/events`)
      return onValue(eventsRef, (snapshot) => {
        const raw = snapshot.val() as Record<string, unknown> | null
        const events = raw ? Object.entries(raw).map(([key, value]) => normalizeEvent(value, key, 'esp32')).filter((event): event is DetectionEvent => event !== null) : []
        onData(events.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)))
      }, (error) => onError(new Error(error.message)))
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unable to connect to Firebase'))
      return () => undefined
    }
  }

  subscribeStatus(onData: (status: DeviceStatus | null) => void, onError: (error: Error) => void) {
    try {
      const statusRef = ref(getDatabaseInstance(), `${this.statusPath}/${this.deviceId}/status`)
      return onValue(statusRef, (snapshot) => onData(normalizeDeviceStatus(snapshot.val(), this.deviceId)), (error) => onError(new Error(error.message)))
    } catch (error) {
      onError(error instanceof Error ? error : new Error('Unable to connect to Firebase'))
      return () => undefined
    }
  }
}

export async function checkFirebaseConnection() {
  if (!firebaseConfigured) return false
  try {
    await get(ref(getDatabaseInstance(), '.info/connected'))
    return true
  } catch {
    return false
  }
}
