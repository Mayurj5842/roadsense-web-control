# RoadSense backend

This backend stores ESP32 telemetry in PostgreSQL and exposes API endpoints for the dashboard.

## Setup

1. Create a PostgreSQL database named `roadsense_db`.
2. Copy `.env.example` to `.env` and set a real PostgreSQL URL and a private device key.
3. Install dependencies:

```bash
npm install
```

4. Start the API server:

```bash
npm run dev
```

The API listens on port 4000 by default.
It binds to `0.0.0.0` so a device on the same reachable LAN can connect; the Windows firewall and network must still allow TCP port 4000.

Generate a random key locally, for example:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Put that value in `backend/.env` as `DEVICE_API_KEY`. Do not put it in `.env.example`, browser configuration, source control, Serial output, or screenshots. Startup fails if the key is missing, a placeholder, or shorter than 32 characters. Keep a separate copy in an ignored, local-only firmware secrets header when building the ESP32 firmware; a key compiled into a physical device can potentially be extracted, so use and rotate a device-scoped key.

## Required headers

All telemetry writes require the `X-Device-API-Key` header to match the backend secret in `.env`.

## API endpoints

- `GET /api/health` — checks the server and PostgreSQL connection.
- `POST /api/telemetry` — validates and stores a telemetry payload from the ESP32.
- `GET /api/telemetry/latest?deviceId=ESP32-PUNE-01` — returns the most recent reading for a device.
- `GET /api/detections?deviceId=ESP32-PUNE-01&severity=moderate&limit=25` — lists detections with pagination.
- `GET /api/devices/:deviceId/status` — returns the latest device heartbeat and upload state.

## PostgreSQL schema

Schema initialization is run automatically on start. It creates `sensor_readings` and `detections` tables with indexes.

## Notes

- GPS latitude must be in [-90, 90]. Longitude must be in [-180, 180].
- Coordinates are rejected if the payload contains the null-island placeholder `(0, 0)`.
- Duplicate device timestamps are intentionally ignored to prevent repeated detection events.
- Do not expose raw database credentials or private device secrets in browser code.
- `REQUEST_LIMIT_BYTES` is interpreted as bytes (default 65,536).

## HTTP 401 troubleshooting

1. Confirm the backend is started with `backend/.env` or process environment variables containing `DATABASE_URL` and `DEVICE_API_KEY`. The backend loads the backend-local `.env` regardless of the launch working directory, then loads the project-root `.env` without overriding values already set.
2. Use the *same* secret on both sides. ESP32 requests must send an HTTP header named `X-Device-API-Key`; HTTP header names are case-insensitive. Do not add quotes or a `Bearer ` prefix to the header value.
3. Restart the backend after editing `.env` and rebuild/reflash firmware after changing its local secret. Never print the key to Serial Monitor or include it in diagnostic logs.
4. Do not send the key from the dashboard/browser. Only the authenticated device telemetry write uses it.
5. Verify the listener locally with `Invoke-RestMethod http://127.0.0.1:4000/api/health`. A 401 from `POST /api/telemetry` means the key is absent or does not match; it does not confirm whether PostgreSQL persisted anything.

## LAN address, port, firewall, and persistence checks

The ESP32 must send telemetry to `http://<HOST-PC-LAN-IP>:4000/api/telemetry`—never `localhost` or `127.0.0.1`, which refer to the ESP32 itself. Find the host IPv4 address with `ipconfig`. Put the host and port in the firmware's non-secret configuration and ensure the ESP32 and computer have routes between them. A phone-connected ESP32 access point, guest Wi-Fi, VLAN separation, or client isolation can prevent access even when the local API works.

From the ESP32 network, check reachability to the PC on TCP port 4000. On Windows, `Test-NetConnection <HOST-PC-LAN-IP> -Port 4000` checks from the PC itself; it does not prove a second device can reach it. If Windows Firewall blocks it, an administrator can add a narrowly scoped inbound TCP 4000 rule for the trusted private network and restrict `RemoteAddress` to the device's subnet. Do not disable the firewall.

Example for a trusted Private network only (run in an elevated PowerShell; omit or further restrict `-RemoteAddress` if the device is on a different subnet):

```powershell
New-NetFirewallRule -DisplayName "RoadSense API TCP 4000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private -RemoteAddress LocalSubnet
```

`GET /api/health` reports database connectivity, not device connectivity. Verify the POST response is HTTP 201, then use `GET /api/telemetry/latest?deviceId=<DEVICE_ID>` and query PostgreSQL `sensor_readings` for that device and timestamp. Detection rows are stored separately in `detections`. Do not use fabricated sample readings as proof; perform this check with an actual ESP32 payload and record its device timestamp and returned reading ID.

## NEO-6M raw UART diagnostics

The repository did not contain the rover's original ESP32 sketch, so its UART assignment, GPS library use, and pin conflicts could not be inspected or safely changed. The separate `../firmware/gps-uart-diagnostic/gps-uart-diagnostic.ino` is a bench diagnostic only; it does not replace or modify motor-control firmware.

1. Save a copy of the working rover firmware. For a standalone diagnostic, disconnect/disable the motor drivers and flash only the diagnostic sketch. Restore the saved rover firmware before operating the vehicle; this diagnostic sketch has no motor-control code.
2. With power removed, wire GPS TX to ESP32 GPIO16 (UART2 RX), ESP32 GPIO17 (UART2 TX) to GPS RX, and connect grounds. Check the exact breakout board's supply-voltage specification before powering it; do not feed a signal above the ESP32's 3.3 V GPIO tolerance into the ESP32.
3. Open Serial Monitor at 115200 baud. The GPS UART diagnostic listens at 9600 baud and prints received bytes in hex/printable form plus a one-second byte count. A fix is not required for NMEA characters to arrive.
4. Zero raw bytes points to power, ground, crossed/missing TX/RX wiring, a different UART pin assignment, a pin conflict, or a different configured GPS baud. Read the module/board markings and verify each with power off before changing wiring.
5. Readable `$G...` NMEA sentences mean UART data is arriving; no valid fix then points to antenna/sky view or no-fix NMEA fields rather than the UART. Random-looking text suggests a baud/format mismatch; binary bytes may mean the receiver is configured for UBX instead of NMEA.
6. Do not change pin mappings or motor wiring in production firmware until its original sketch proves the need. The diagnostic is not evidence that the rover firmware, GPS fix, backend route, or telemetry persistence works.
