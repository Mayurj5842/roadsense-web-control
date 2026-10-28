import { useEffect, useState } from 'react'
import { ApiEventRepository, apiConfigured } from './apiRepository'
import type { DetectionEvent, DeviceStatus } from './types'

export function useEventData(refreshKey: number) {
  const [events, setEvents] = useState<DetectionEvent[]>([])
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ key: string; message: string } | null>(null)
  const requestKey = `live:${refreshKey}`

  useEffect(() => {
    if (!apiConfigured) return

    // The live API subscription starts loading while the backend request is in flight.
    // oxlint-disable-next-line react(set-state-in-effect)
    setLoading(true)
    const deviceId = import.meta.env.VITE_DEVICE_ID || 'ESP32-CAR-01'
    const repository = new ApiEventRepository(deviceId)
    const stopEvents = repository.subscribeEvents(
      (next) => { setEvents(next); setLoaded(true); setLoading(false) },
      (reason) => { setError({ key: requestKey, message: reason.message }); setLoading(false) },
    )
    const stopStatus = repository.subscribeStatus(
      (next) => { setDeviceStatus(next) },
      (reason) => { setError({ key: requestKey, message: reason.message }); setLoading(false) },
    )
    return () => { stopEvents(); stopStatus() }
  }, [requestKey, refreshKey])

  return {
    events: loaded ? events : [],
    deviceStatus,
    loading,
    error: error?.key === requestKey
      ? error.message
      : apiConfigured
        ? null
        : 'VITE_API_BASE_URL is not configured. Set it to connect to the PostgreSQL backend.',
    apiConfigured,
  }
}
