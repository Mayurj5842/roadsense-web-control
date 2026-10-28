import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Crosshair, LocateFixed, Search, WifiOff } from 'lucide-react'
import type { DetectionEvent, Severity } from '../data/types'

type Props = { events: DetectionEvent[]; focusedEventId?: string | null; onOpenEvent?: (event: DetectionEvent) => void; compact?: boolean; mapCenter?: [number, number]; enabledSeverities?: Severity[] }
const defaultCenter: [number, number] = [18.5204, 73.8567]
const colors: Record<Severity, string> = { minor: '#35a879', moderate: '#e4a33b', severe: '#dd5a54', unclassified: '#8b98a9' }

function markerIcon(severity: Severity) {
  return L.divIcon({ className: 'marker-shell', html: `<span class="map-marker ${severity}" style="--marker-color:${colors[severity]}"></span>`, iconSize: [20, 20], iconAnchor: [10, 10], popupAnchor: [0, -10] })
}

function MapActions({ events, focusedEventId, markers, mapCenter }: { events: DetectionEvent[]; focusedEventId?: string | null; markers: React.RefObject<Map<string, L.Marker>>; mapCenter: [number, number] }) {
  const map = useMap()
  useEffect(() => { map.setView(mapCenter, map.getZoom(), { animate: true }) }, [map, mapCenter])
  useEffect(() => {
    const target = events.find((event) => event.id === focusedEventId && event.latitude !== null && event.longitude !== null)
    if (target && target.latitude !== null && target.longitude !== null) {
      map.flyTo([target.latitude, target.longitude], Math.max(map.getZoom(), 16), { duration: 0.5 })
      window.setTimeout(() => markers.current.get(target.id)?.openPopup(), 550)
    }
  }, [events, focusedEventId, map, markers])
  const fit = () => {
    const points = events.filter((event) => event.gpsValid && event.latitude !== null && event.longitude !== null).map((event) => [event.latitude!, event.longitude!] as [number, number])
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 })
    else map.setView(defaultCenter, 13)
  }
  return <button className="map-fab" type="button" onClick={fit} title="Fit all visible events" aria-label="Fit all visible events"><LocateFixed size={16} /> <span>Fit events</span></button>
}

export default function EventMap({ events, focusedEventId, onOpenEvent, compact = false, mapCenter = defaultCenter, enabledSeverities }: Props) {
  const [severity, setSeverity] = useState<Severity | 'all'>('all')
  const [search, setSearch] = useState('')
  const [tileError, setTileError] = useState(false)
  const markerRefs = useRef(new Map<string, L.Marker>())
  const validEvents = useMemo(() => events.filter((event) => event.gpsValid && event.latitude !== null && event.longitude !== null), [events])
  const shownEvents = useMemo(() => validEvents.filter((event) => (!enabledSeverities || enabledSeverities.includes(event.severity)) && (severity === 'all' || event.severity === severity) && (!search || `${event.id} ${event.roadName ?? ''} ${event.latitude} ${event.longitude}`.toLowerCase().includes(search.toLowerCase()))), [validEvents, enabledSeverities, severity, search])

  return <div className={`map-frame ${compact ? 'map-compact' : ''}`}>
    <div className="map-toolbar">
      <label className="map-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ID or location" aria-label="Search map events" /></label>
      <select aria-label="Filter map by severity" value={severity} onChange={(event) => setSeverity(event.target.value as Severity | 'all')}>
        <option value="all">All severity</option><option value="severe">Severe</option><option value="moderate">Moderate</option><option value="minor">Minor</option><option value="unclassified">Unclassified</option>
      </select>
      <span className="map-count"><Crosshair size={14} /> {shownEvents.length} mapped</span>
    </div>
    <MapContainer center={mapCenter} zoom={14} scrollWheelZoom className="leaflet-map" zoomControl={!compact}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={{ tileerror: () => setTileError(true), tileload: () => setTileError(false) }} />
      {shownEvents.map((event) => <Marker key={event.id} position={[event.latitude!, event.longitude!]} icon={markerIcon(event.severity)} ref={(marker) => { if (marker) markerRefs.current.set(event.id, marker); else markerRefs.current.delete(event.id) }}>
        <Popup><div className="map-popup"><strong>{event.id}</strong><span className={`severity-pill ${event.severity}`}>{event.severity}</span><div>{new Date(event.timestamp).toLocaleString()}</div><div>Impact <b>{event.impactValue?.toFixed(1) ?? '—'}</b></div><div>{event.latitude?.toFixed(5)}, {event.longitude?.toFixed(5)}</div><div>Source: ESP32{event.accuracyMeters !== null ? ` · ±${event.accuracyMeters} m` : ''}</div>{onOpenEvent && <button type="button" className="text-button" onClick={() => onOpenEvent(event)}>View event details</button>}</div></Popup>
      </Marker>)}
      <MapActions events={shownEvents} focusedEventId={focusedEventId} markers={markerRefs} mapCenter={mapCenter} />
    </MapContainer>
    {tileError && <div className="map-network-note"><WifiOff size={14} /> Map tiles could not load. Check your network connection.</div>}
    {!shownEvents.length && <div className="map-empty"><LocateFixed size={22} /><strong>No mappable events</strong><span>Valid GPS coordinates will appear here.</span></div>}
    <div className="map-footnote">Markers show reported GPS positions; accuracy depends on device GPS data. Map tiles © OpenStreetMap.</div>
  </div>
}
