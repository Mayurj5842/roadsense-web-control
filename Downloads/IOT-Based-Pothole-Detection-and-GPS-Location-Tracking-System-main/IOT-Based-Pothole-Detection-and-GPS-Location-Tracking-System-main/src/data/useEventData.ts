import { useEffect, useState } from 'react'
import { DemoEventRepository } from './demoRepository'
import { firebaseConfigured, FirebaseEventRepository } from './firebaseRepository'
import type { DetectionEvent, DeviceStatus } from './types'

export function useEventData(live: boolean, refreshKey: number) {
  const [events, setEvents] = useState<DetectionEvent[]>([])
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [eventsMode, setEventsMode] = useState<'demo' | 'live' | null>(null)
  const [statusMode, setStatusMode] = useState<'demo' | 'live' | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const requestKey = `${live ? 'live' : 'demo'}:${refreshKey}`

  useEffect(() => {
    if (!live) {
      const repository = new DemoEventRepository()
      const stopEvents = repository.subscribeEvents((next) => { setEvents(next); setEventsMode('demo') }, () => setError({ key: requestKey, message: 'Unable to load demo events' }))
      const stopStatus = repository.subscribeStatus((next) => { setDeviceStatus(next); setStatusMode('demo') }, () => setError({ key: requestKey, message: 'Unable to load demo device status' }))
      return () => { stopEvents(); stopStatus() }
    }
    if (!firebaseConfigured) {
      return
    }
    // Firebase subscriptions transition the live view into its loading state.
    // oxlint-disable-next-line react(set-state-in-effect)
    setLoading(true)
    const deviceId = import.meta.env.VITE_DEVICE_ID || 'ESP32-PUNE-01'
    const repository = new FirebaseEventRepository(deviceId, import.meta.env.VITE_FIREBASE_EVENTS_PATH || 'devices', import.meta.env.VITE_FIREBASE_STATUS_PATH || 'devices')
    let eventsLoaded = false
    const stopEvents = repository.subscribeEvents((next) => { setEvents(next); setEventsMode('live'); eventsLoaded = true; setLoading(false) }, (reason) => { setError({ key: requestKey, message: reason.message }); setLoading(false) })
    const stopStatus = repository.subscribeStatus((next) => { setDeviceStatus(next); setStatusMode('live') }, (reason) => { setError({ key: requestKey, message: reason.message }); setLoading(false) })
    const timeout = window.setTimeout(() => { if (!eventsLoaded) setLoading(false) }, 8000)
    return () => { stopEvents(); stopStatus(); window.clearTimeout(timeout) }
  }, [requestKey, live, refreshKey])

  return {
    events: eventsMode === (live ? 'live' : 'demo') ? events : [],
    deviceStatus: statusMode === (live ? 'live' : 'demo') ? deviceStatus : null,
    loading: live && loading,
    error: live ? firebaseConfigured ? error?.key === requestKey ? error.message : null : 'Live mode is selected, but Firebase is not configured. No demo records are shown in live mode.' : null,
    firebaseConfigured,
  }
}
