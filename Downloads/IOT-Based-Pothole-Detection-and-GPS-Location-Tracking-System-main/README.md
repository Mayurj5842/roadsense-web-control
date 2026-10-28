# RoadSense IoT

A responsive React + TypeScript dashboard for an IoT pothole-detection and GPS-tracking project. The app starts in **Demo Mode** with fictional Pune-area samples; it does not require hardware or PostgreSQL to explore the dashboard.

## Requirements and commands

- Node.js 20.19+ (or 22.12+), npm
- `npm install` — install frontend dependencies
- `npm run dev` — start the Vite development server
- `npm run build` — type-check and build
- `npm test` — run dashboard tests
- `npm run backend:dev` — start the Express API in watch mode
- `npm --prefix backend test` — run API authentication tests

## Dashboard features

- Overview metrics, severity distribution, daily activity, estimated road-condition index, and recent events.
- Leaflet/OpenStreetMap event map with coordinate validation, severity filters, popups, fit-to-events, and event navigation.
- Event search, severity/date filters, sorting, pagination, details, and filtered CSV download.
- Road analytics, repeat coordinate groups, and explicitly estimated condition scores.
- Device monitoring that separates demo values from actual records received from the API.
- Session-only map and display settings plus optional demo-only event simulation.

Demo records remain isolated from live API records. Selecting Live PostgreSQL without API configuration or connectivity shows an error and no demo fallback.

## PostgreSQL live data

The only live data provider is the Express API backed by PostgreSQL. Firebase has been removed from the dashboard and frontend dependencies.

1. Create a PostgreSQL database named `roadsense_db`.
2. Copy `backend/.env.example` to `backend/.env`; set `DATABASE_URL` and a private `DEVICE_API_KEY` (at least 32 characters).
3. Start the backend from the project root: `npm run backend:dev`.
4. Copy `.env.example` to `.env.local`. Set `VITE_API_BASE_URL` to the backend URL reachable from the browser (for example `http://localhost:4000`) and set `VITE_DEVICE_ID` to the device ID to monitor.
5. Restart Vite and select **Settings → Live PostgreSQL**.
6. Configure the ESP32 to POST actual readings to `http://<HOST-PC-LAN-IP>:4000/api/telemetry` with the matching `X-Device-API-Key` header.

Never put the PostgreSQL connection string or device key in frontend environment variables, browser code, or firmware diagnostics. Backend setup, API routes, GPS UART diagnostic steps, LAN/firewall guidance, and persistence verification are in [backend/README.md](./backend/README.md).

The API provides:

- `GET /api/health` — server and PostgreSQL health.
- `POST /api/telemetry` — authenticated ESP32 telemetry ingestion.
- `GET /api/telemetry/latest?deviceId=...` — last actual reading.
- `GET /api/detections` — persisted events with filters and pagination.
- `GET /api/devices/:deviceId/status` — status derived from received readings.

The dashboard's live API provider polls detections and status every 30 seconds. Firmware integration and physical hardware behavior are not claimed until tested on the device.

## Data and tests

- Shared event and device types: `src/data/types.ts`
- Input validation: `src/data/validation.ts`
- Demo records and provider: `src/data/demoData.ts`, `src/data/demoRepository.ts`
- Express/PostgreSQL API provider: `src/data/apiRepository.ts`
- Analytics: `src/data/analytics.ts`
- Backend schema: `backend/sql/schema.sql`
- Dashboard tests cover normalization, coordinate validation, summaries, and filters.

Settings persist for the current page session. Static hosting needs SPA fallback to `index.html`. Review OpenStreetMap tile usage policies before high-volume/public deployment.
