# RoadSense IoT

A responsive React + TypeScript dashboard for an IoT-based pothole detection and GPS location tracking project. The app starts in **Demo Mode** and includes fictional Pune-area sample records; it does not require hardware or Firebase to explore the dashboard.

## Requirements

- Node.js 20.19+ (or 22.12+), npm
- Network access for OpenStreetMap tiles; Google Fonts are optional and fall back to system fonts

## Install and run

1. Install packages: `npm install`
2. Start the local development server: `npm run dev`
3. Type-check and create a production build: `npm run build`
4. Run data validation and analytics tests: `npm test`

## Dashboard features

- Overview metrics, severity distribution, daily activity chart, estimated road-condition index and recent event list are computed from the active event collection.
- Leaflet / OpenStreetMap map with GPS validity checks, severity marker styles, event popups, search, severity filter, fit-to-events and event-to-map navigation. Map markers represent reported GPS positions; accuracy varies by record.
- Detection-event search, severity/date filters, sortable timestamps/impact, pagination, details modal and filtered CSV download.
- Analytics for severity and time, road labels when provided, unmapped coordinate groups, repeat coordinate cells, and transparently labelled estimated condition scores.
- Device page shows either clearly marked simulated demo values or data actually received from Firebase. Missing telemetry is not described as connected.
- Session-only settings for Demo / Live mode, map location, map severity visibility and optional demo-only event simulation. Reset Demo Data clears generated demo records and turns simulation off.

All demo records are isolated from the live provider. Selecting Live mode without Firebase configuration shows an explanatory error and an empty live dataset rather than fallback demo records.

## Firebase setup (Realtime Database, read-only client)

1. Create a Firebase project and Realtime Database. Register a Firebase Web App.
2. Copy `.env.example` to `.env.local` and enter the Web App configuration values. These are client configuration values, not service-account credentials. Never add a service-account key or admin credential to this frontend.
3. Set `VITE_DEVICE_ID` to the device key to monitor. Optional `VITE_FIREBASE_EVENTS_PATH` and `VITE_FIREBASE_STATUS_PATH` default to `devices`.
4. Restart Vite after environment changes, then choose Settings → Live Firebase.
5. The app subscribes to the following configurable paths and removes Firebase listeners when the page/provider unmounts:
   - `${VITE_FIREBASE_EVENTS_PATH}/{deviceId}/events/{eventId}`
   - `${VITE_FIREBASE_STATUS_PATH}/{deviceId}/status`

The Firebase Web API key is not a database authorization mechanism. Require authenticated reads in Realtime Database rules, scope users to their authorized device path, and do not deploy publicly writable rules. For firmware, prefer a trusted backend that validates and writes device messages. If the ESP32 must write directly, use a deliberate device-authentication design (for example, short-lived scoped credentials issued by a backend); do not embed administrator credentials or long-lived privileged secrets in firmware or the browser. The dashboard currently reads only; it does not write, edit, or delete device records.

Permission-denied and network failures are shown in the live-mode status area. No Firebase connection is claimed until the SDK is configured and listeners return data. Hardware integration is prepared but has not been tested with a physical ESP32.

## Proposed ESP32 event JSON

Store each record beneath the event path above. `eventId` is the stable Firebase child key; `id` can be omitted because the dashboard uses that key when normalizing the record.

```json
{
  "timestamp": "2026-10-16T08:35:20.000Z",
  "latitude": 18.5208,
  "longitude": 73.8567,
  "impactValue": 5.4,
  "severity": "moderate",
  "gpsValid": true,
  "uploadStatus": "uploaded",
  "deviceId": "ESP32-PUNE-01",
  "roadName": null,
  "accuracyMeters": 8
}
```

Use an ISO 8601 timestamp with timezone. Latitude must be in $[-90, 90]$, longitude in $[-180, 180]$. The dashboard requires `gpsValid: true` and finite valid coordinates before showing a marker; `(0, 0)` is rejected unless future configuration explicitly validates it. Invalid/missing GPS should be represented with `gpsValid: false` and null coordinates. `severity` must be `minor`, `moderate`, `severe` or `unclassified`; malformed records and invalid dates are ignored. Unknown/missing optional values are safely normalized.

## Proposed device status JSON

Store the current heartbeat at `${VITE_FIREBASE_STATUS_PATH}/{deviceId}/status`:

```json
{
  "lastReceived": "2026-10-16T08:35:20.000Z",
  "latitude": 18.5208,
  "longitude": 73.8567,
  "gpsValid": true,
  "impactValue": 5.4,
  "wifiConnected": true,
  "cloudConnected": true,
  "uploadedEvents": 42,
  "heartbeatMessage": "sensor-ready"
}
```

Only report Wi-Fi/cloud booleans when firmware has actually measured them. The UI reports status as unknown when omitted and considers a heartbeat recent only when its device timestamp is within two minutes. Use server/backend validation for trusted receipt timestamps when the dashboard is deployed.

## Data and tests

- Shared model: `src/data/types.ts`
- Defensive normalization: `src/data/validation.ts`
- Demo fixtures/provider: `src/data/demoData.ts`, `src/data/demoRepository.ts`
- Firebase realtime provider: `src/data/firebaseRepository.ts`
- Dataset-derived calculations: `src/data/analytics.ts`
- Unit tests cover malformed records, GPS ranges/null island, severity summaries and filtering.

Settings persist only for the current page session. A static hosting deployment needs SPA fallback to `index.html`. OpenStreetMap standard tiles have usage policies; review them before high-volume/public deployment and switch to an appropriate tile provider if needed.
