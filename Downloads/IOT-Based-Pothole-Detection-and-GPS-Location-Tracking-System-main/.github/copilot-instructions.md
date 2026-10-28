# RoadSense IoT workspace notes

- Use React, TypeScript, Vite and the repository's existing dependency set.
- Keep demo records isolated from live ESP32/PostgreSQL data.
- Validate incoming coordinates, timestamps and status before rendering.
- Never describe demo device status as hardware telemetry.
- Keep road-condition calculations labelled as estimates.
- Do not put PostgreSQL credentials or device API keys in browser code or firmware.
