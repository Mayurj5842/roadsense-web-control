import type { DetectionEvent, Severity } from './types'

export const severityOrder: Severity[] = ['severe', 'moderate', 'minor', 'unclassified']

export function summarizeEvents(events: DetectionEvent[]) {
  const located = events.filter((event) => event.gpsValid && event.latitude !== null && event.longitude !== null)
  const counts = Object.fromEntries(severityOrder.map((severity) => [severity, events.filter((event) => event.severity === severity).length])) as Record<Severity, number>
  const locationKeys = new Set(located.map((event) => `${event.latitude!.toFixed(4)},${event.longitude!.toFixed(4)}`))
  return {
    total: events.length,
    severe: counts.severe,
    moderate: counts.moderate,
    minor: counts.minor,
    unclassified: counts.unclassified,
    uniqueLocations: locationKeys.size,
    latest: [...events].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0] ?? null,
    located: located.length,
    counts,
  }
}

export function filterEvents(events: DetectionEvent[], options: { search?: string; severity?: Severity | 'all'; from?: string; to?: string }) {
  const search = options.search?.trim().toLowerCase() ?? ''
  return events.filter((event) => {
    const matchesSearch = !search || [event.id, event.roadName ?? '', event.latitude?.toString() ?? '', event.longitude?.toString() ?? ''].some((value) => value.toLowerCase().includes(search))
    const date = event.timestamp.slice(0, 10)
    return matchesSearch && (options.severity === undefined || options.severity === 'all' || event.severity === options.severity) && (!options.from || date >= options.from) && (!options.to || date <= options.to)
  })
}

export function buildTimeline(events: DetectionEvent[], days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date()
    date.setDate(date.getDate() - (days - 1 - index))
    const key = date.toLocaleDateString('en-CA')
    const todays = events.filter((event) => new Date(event.timestamp).toLocaleDateString('en-CA') === key)
    return { date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }), events: todays.length, severe: todays.filter((event) => event.severity === 'severe').length }
  })
}

export function buildRoadGroups(events: DetectionEvent[]) {
  const groups = new Map<string, DetectionEvent[]>()
  for (const event of events) {
    if (!event.gpsValid) continue
    const label = event.roadName ?? `Unmapped · ${event.latitude!.toFixed(3)}, ${event.longitude!.toFixed(3)}`
    groups.set(label, [...(groups.get(label) ?? []), event])
  }
  return [...groups.entries()].map(([name, records]) => {
    const weighted = records.reduce((score, event) => score + (event.severity === 'severe' ? 3 : event.severity === 'moderate' ? 2 : event.severity === 'minor' ? 1 : 0), 0)
    const estimate = Math.max(0, Math.round(100 - Math.min(100, (weighted / records.length) * 18)))
    return { name, reports: records.length, estimate }
  }).sort((a, b) => b.reports - a.reports)
}
