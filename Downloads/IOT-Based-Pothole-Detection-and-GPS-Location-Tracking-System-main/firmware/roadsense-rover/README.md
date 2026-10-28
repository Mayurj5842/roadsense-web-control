# RoadSense ESP32 Rover Firmware

ESP32 DevKit v1 firmware: motor control (L298N) + mobile web control + MPU6050 impact detection + NEO-6M GPS + telemetry POST to the Express backend.

## Wiring

```
ESP32 DevKit v1       L298N              MPU6050           NEO-6M GPS
───────────────       ────               ───────           ──────────
GPIO25 (IN1)  ─────── IN1
GPIO26 (IN2)  ─────── IN2
GPIO27 (IN3)  ─────── IN3
GPIO14 (IN4)  ─────── IN4
GPIO21 (SDA)  ───────────────────────── SDA
GPIO22 (SCL)  ───────────────────────── SCL
3V3           ───────────────────────── VCC
GND           ───────── GND ────────── GND ─────────────── GND
                                                        TX ── GPIO16 (UART2 RX)
                                                        RX ── GPIO17 (UART2 TX)
                                                        VCC ─ 5V/3V3 (check board)
```

## Arduino IDE setup

1. **Boards Manager** → install "esp32" by Espressif → select **ESP32 Dev Module**.
2. **Library Manager** → install **TinyGPSPlus** (Mikal Hart).
3. Edit the top of `roadsense-rover.ino`:
   - `WIFI_SSID` / `WIFI_PASSWORD` — network BOTH the ESP32 and the PC share (e.g. phone hotspot).
   - `SERVER_URL` — `http://<PC-LAN-IP>:4000/api/telemetry` (find PC IP with `ipconfig`; **never** `localhost`).
   - `DEVICE_API_KEY` — must exactly match `DEVICE_API_KEY` in `backend/.env`.
   - `DEVICE_ID` — must match `VITE_DEVICE_ID` in the frontend `.env` (default `ESP32-CAR-01`).
4. Upload, open **Serial Monitor @ 115200**.

## Behavior

- **Motors:** phone browser → `http://<ESP32-IP>/` control pad; 1.5s failsafe auto-stops.
- **Impact detection:** MPU6050 magnitude deviation from EMA baseline; >1.5g minor, >3g moderate, >5g severe (m/s² thresholds in sketch); 2s debounce; impact sends telemetry **immediately**.
- **Telemetry:** heartbeat every 30s + immediate on impact → `POST /api/telemetry` with `X-Device-API-Key`. `impactDetected:true` events create dashboard detection rows.
- **GPS:** NMEA on UART2; NTP-synced timestamps; if no fresh fix sends `gpsValid:false` (no coordinates).
- Serial prints full payload + HTTP status. Never print the API key.

## Network checklist (both sides same network)

1. Connect the **PC to the same hotspot/router** as the ESP32.
2. Run `ipconfig` → confirm PC IPv4 matches `SERVER_URL` (update if the router reassigned it).
3. Firewall rule (elevated PowerShell, once):
   ```powershell
   New-NetFirewallRule -DisplayName "RoadSense API TCP 4000" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 4000 -Profile Private -RemoteAddress LocalSubnet
   ```
   For a hotspot network profile, drop `-Profile` / `-RemoteAddress` restrictions if needed.

## Verify end-to-end

1. Backend: `Invoke-RestMethod http://127.0.0.1:4000/api/health` → `status: ok`.
2. Serial shows `[HTTP] POST ... -> 201` / "Backend accepted the HTTP request."
3. `Invoke-RestMethod "http://localhost:4000/api/devices/ESP32-CAR-01/status"` → real `lastReceived`, `source: "esp32"`.
4. Dashboard: restart `npm run dev` → **Settings → Live PostgreSQL** → Device Monitoring shows the live heartbeat; pothole impacts appear on Overview/Map/Events pages.
