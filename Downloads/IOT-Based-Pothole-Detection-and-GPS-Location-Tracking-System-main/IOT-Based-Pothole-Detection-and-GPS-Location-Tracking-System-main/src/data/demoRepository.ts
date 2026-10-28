import { demoDeviceStatus, demoEvents } from './demoData'
import type { DeviceStatus, EventRepository } from './types'

export class DemoEventRepository implements EventRepository {
  subscribeEvents(onData: Parameters<EventRepository['subscribeEvents']>[0], _onError?: Parameters<EventRepository['subscribeEvents']>[1]) {
    let active = true
    queueMicrotask(() => { if (active) onData(demoEvents) })
    return () => { active = false }
  }

  subscribeStatus(onData: (status: DeviceStatus | null) => void, _onError?: Parameters<EventRepository['subscribeStatus']>[1]) {
    let active = true
    queueMicrotask(() => { if (active) onData(demoDeviceStatus) })
    return () => { active = false }
  }
}
