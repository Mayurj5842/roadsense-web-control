import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDeviceApiKeyAuth } from './deviceAuth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const backendEnvPath = path.resolve(__dirname, '..', '.env')
const rootEnvPath = path.resolve(__dirname, '..', '..', '.env')
if (fs.existsSync(backendEnvPath)) dotenv.config({ path: backendEnvPath })
if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath })

const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  deviceApiKey: process.env.DEVICE_API_KEY?.trim(),
  requestLimitBytes: Number(process.env.REQUEST_LIMIT_BYTES || 65536),
  telemetryFrequencyMs: Number(process.env.TELEMETRY_INTERVAL_MS || 30000),
}

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is required. Configure it in backend/.env or the process environment.')
}
if (!config.deviceApiKey || config.deviceApiKey.length < 32 || /^(replace|change|your|example)/i.test(config.deviceApiKey)) {
  throw new Error('DEVICE_API_KEY must be a non-placeholder secret of at least 32 characters.')
}
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.')
}
if (!Number.isInteger(config.requestLimitBytes) || config.requestLimitBytes < 1) {
  throw new Error('REQUEST_LIMIT_BYTES must be a positive integer.')
}

const { Pool } = pg
const pool = new Pool({ connectionString: config.databaseUrl, max: 10 })
const schemaSql = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8')

const severities = new Set(['minor', 'moderate', 'severe', 'unclassified'])

function normalizeSeverity(value) {
  if (typeof value !== 'string') return 'unclassified'
  const normalized = value.trim().toLowerCase()
  return severities.has(normalized) ? normalized : 'unclassified'
}

function parseTimestamp(input) {
  const value = typeof input === 'string' ? input.trim() : ''
  if (!value || !Number.isFinite(Date.parse(value))) {
    return null
  }
  return new Date(value).toISOString()
}

function parseCoordinate(rawValue, label) {
  if ((typeof rawValue !== 'number' && typeof rawValue !== 'string') || (typeof rawValue === 'string' && rawValue.trim() === '')) {
    return null
  }
  const value = Number(rawValue)
  if (!Number.isFinite(value)) return null
  if (label === 'latitude' && (value < -90 || value > 90)) return null
  if (label === 'longitude' && (value < -180 || value > 180)) return null
  return value
}

function toCamelCase(rows) {
  return rows.map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    eventType: row.event_type,
    impactMetric: row.impact_metric,
    severity: row.severity,
    gpsValid: row.gps_valid,
    latitude: row.latitude,
    longitude: row.longitude,
    timestamp: row.timestamp,
    createdAt: row.created_at,
  }))
}

const requireDeviceApiKey = createDeviceApiKeyAuth(config.deviceApiKey)

async function ensureSchema() {
  await pool.query(schemaSql)
}

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: config.requestLimitBytes }))

app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`)
  })
  next()
})

app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS server_time, version() AS postgres_version')
    res.json({
      status: 'ok',
      database: 'connected',
      databaseName: 'roadsense_db',
      timestamp: result.rows[0].server_time,
      postgresVersion: result.rows[0].postgres_version,
      telemetryFrequencyMs: config.telemetryFrequencyMs,
    })
  } catch (error) {
    res.status(503).json({ status: 'error', database: 'unavailable', message: error instanceof Error ? error.message : 'Database unavailable' })
  }
})

app.get('/api/telemetry/latest', async (req, res, next) => {
  try {
    const deviceId = String(req.query.deviceId || req.query.device_id || '').trim()
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required' })
    }

    const query = `
      SELECT device_id, timestamp, acceleration_x, acceleration_y, acceleration_z,
             acceleration_magnitude, impact_detected, severity,
             gps_valid, latitude, longitude, satellites, hdop,
             wifi_connected, cloud_connected, heartbeat_message
      FROM sensor_readings
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `
    const { rows } = await pool.query(query, [deviceId])
    if (!rows[0]) {
      return res.status(404).json({ error: `No telemetry found for device ${deviceId}` })
    }

    const row = rows[0]
    return res.json({
      deviceId: row.device_id,
      timestamp: row.timestamp,
      accelerationX: row.acceleration_x,
      accelerationY: row.acceleration_y,
      accelerationZ: row.acceleration_z,
      accelerationMagnitude: row.acceleration_magnitude,
      impactDetected: row.impact_detected,
      severity: row.severity,
      gpsValid: row.gps_valid,
      latitude: row.latitude,
      longitude: row.longitude,
      satellites: row.satellites,
      hdop: row.hdop,
      wifiConnected: row.wifi_connected,
      cloudConnected: row.cloud_connected,
      heartbeatMessage: row.heartbeat_message,
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/telemetry', requireDeviceApiKey, async (req, res, next) => {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {}
    const deviceId = String(payload.deviceId || payload.device_id || '').trim()
    if (!deviceId || !/^[A-Za-z0-9._:-]{3,64}$/.test(deviceId)) {
      return res.status(400).json({ error: 'deviceId must be a valid string between 3 and 64 characters.' })
    }

    const timestamp = parseTimestamp(payload.timestamp || payload.deviceTimestamp || payload.device_time)
    if (!timestamp) {
      return res.status(400).json({ error: 'timestamp must be a valid ISO 8601 date string.' })
    }

    const gpsValidInput = payload.gpsValid ?? payload.gps_valid
    if (gpsValidInput !== undefined && typeof gpsValidInput !== 'boolean') {
      return res.status(400).json({ error: 'gpsValid must be a boolean.' })
    }
    const gpsValid = gpsValidInput ?? (payload.latitude !== undefined && payload.latitude !== null && payload.longitude !== undefined && payload.longitude !== null)
    const latitude = payload.latitude === undefined || payload.latitude === null ? null : parseCoordinate(payload.latitude, 'latitude')
    const longitude = payload.longitude === undefined || payload.longitude === null ? null : parseCoordinate(payload.longitude, 'longitude')

    if ((payload.latitude !== undefined && payload.latitude !== null && latitude === null)
      || (payload.longitude !== undefined && payload.longitude !== null && longitude === null)) {
      return res.status(400).json({ error: 'Coordinates must be finite numbers within the latitude/longitude ranges.' })
    }

    if (gpsValid && (latitude === null || longitude === null)) {
      return res.status(400).json({ error: 'latitude and longitude are required when gpsValid is true.' })
    }

    if (!gpsValid && (latitude !== null || longitude !== null)) {
      return res.status(400).json({ error: 'Coordinates must be null when gpsValid is false.' })
    }

    if (gpsValid && latitude === 0 && longitude === 0) {
      return res.status(400).json({ error: 'Coordinates cannot be the null island placeholder.' })
    }

    function readOptionalNumber(keys) {
      const key = keys.find((item) => payload[item] !== undefined)
      if (!key || payload[key] === null) return { value: null, valid: true }
      const raw = payload[key]
      if ((typeof raw !== 'number' && typeof raw !== 'string') || (typeof raw === 'string' && raw.trim() === '')) {
        return { value: null, valid: false }
      }
      const value = Number(raw)
      return { value: Number.isFinite(value) ? value : null, valid: Number.isFinite(value) }
    }

    const accelerationXField = readOptionalNumber(['accelerationX', 'accelX'])
    const accelerationYField = readOptionalNumber(['accelerationY', 'accelY'])
    const accelerationZField = readOptionalNumber(['accelerationZ', 'accelZ'])
    const accelerationMagnitudeField = readOptionalNumber(['accelerationMagnitude', 'acceleration_magnitude', 'accelMagnitude'])
    if (![accelerationXField, accelerationYField, accelerationZField, accelerationMagnitudeField].every((field) => field.valid)) {
      return res.status(400).json({ error: 'Acceleration values must be finite numbers or null.' })
    }
    const accelerationX = accelerationXField.value
    const accelerationY = accelerationYField.value
    const accelerationZ = accelerationZField.value
    const accelerationMagnitude = accelerationMagnitudeField.value

    const impactDetected = Boolean(payload.impactDetected ?? payload.impact_detected ?? payload.detected ?? false)
    if ((payload.impactDetected !== undefined && typeof payload.impactDetected !== 'boolean')
      || (payload.impact_detected !== undefined && typeof payload.impact_detected !== 'boolean')
      || (payload.detected !== undefined && typeof payload.detected !== 'boolean')) {
      return res.status(400).json({ error: 'impactDetected must be a boolean.' })
    }
    if (payload.severity !== undefined && !severities.has(payload.severity)) {
      return res.status(400).json({ error: 'severity must be minor, moderate, severe, or unclassified.' })
    }
    const severity = normalizeSeverity(payload.severity)
    const satellitesField = readOptionalNumber(['satellites'])
    const hdopField = readOptionalNumber(['hdop'])
    if (!satellitesField.valid || (satellitesField.value !== null && (!Number.isInteger(satellitesField.value) || satellitesField.value < 0))) {
      return res.status(400).json({ error: 'satellites must be a non-negative integer or null.' })
    }
    if (!hdopField.valid || (hdopField.value !== null && hdopField.value < 0)) {
      return res.status(400).json({ error: 'hdop must be a non-negative finite number or null.' })
    }
    const satellites = satellitesField.value
    const hdop = hdopField.value
    const wifiConnected = typeof payload.wifiConnected === 'boolean' ? payload.wifiConnected : typeof payload.wifi_connected === 'boolean' ? payload.wifi_connected : null
    const cloudConnected = typeof payload.cloudConnected === 'boolean' ? payload.cloudConnected : typeof payload.cloud_connected === 'boolean' ? payload.cloud_connected : true
    const heartbeatMessage = typeof payload.heartbeatMessage === 'string' ? payload.heartbeatMessage : typeof payload.heartbeat_message === 'string' ? payload.heartbeat_message : null
    const rawPayload = JSON.stringify(payload)

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const insertReading = `
        INSERT INTO sensor_readings (
          device_id, timestamp, acceleration_x, acceleration_y, acceleration_z,
          acceleration_magnitude, impact_detected, severity, gps_valid,
          latitude, longitude, satellites, hdop, wifi_connected, cloud_connected,
          heartbeat_message, raw_payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id
      `

      const readingResult = await client.query(insertReading, [
        deviceId,
        timestamp,
        accelerationX,
        accelerationY,
        accelerationZ,
        accelerationMagnitude,
        impactDetected,
        severity,
        gpsValid,
        latitude,
        longitude,
        satellites,
        hdop,
        wifiConnected,
        cloudConnected,
        heartbeatMessage,
        rawPayload,
      ])

      if (impactDetected || severity !== 'unclassified') {
        const detectionInsert = `
          INSERT INTO detections (
            device_id, event_type, impact_metric, severity,
            gps_valid, latitude, longitude, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (device_id, timestamp) DO NOTHING
        `
        await client.query(detectionInsert, [
          deviceId,
          'pothole',
          accelerationMagnitude,
          severity,
          gpsValid,
          latitude,
          longitude,
          timestamp,
        ])
      }

      await client.query('COMMIT')
      return res.status(201).json({
        ok: true,
        message: 'Telemetry stored successfully',
        readingId: readingResult.rows[0]?.id,
      })
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    return next(error)
  }
})

app.get('/api/detections', async (req, res, next) => {
  try {
    const deviceId = typeof req.query.deviceId === 'string' ? req.query.deviceId.trim() : ''
    const severity = typeof req.query.severity === 'string' ? normalizeSeverity(req.query.severity) : null
    const from = typeof req.query.from === 'string' ? req.query.from : null
    const to = typeof req.query.to === 'string' ? req.query.to : null
    const page = Number(req.query.page || 1)
    const limit = Math.min(Number(req.query.limit || 50), 200)
    const offset = (Number.isFinite(page) && page > 0 ? page : 1) - 1

    const filters = []
    const values = []

    if (deviceId) {
      filters.push('device_id = $' + (values.length + 1))
      values.push(deviceId)
    }

    if (severity && severity !== 'unclassified') {
      filters.push('severity = $' + (values.length + 1))
      values.push(severity)
    }

    if (from) {
      filters.push('timestamp >= $' + (values.length + 1))
      values.push(new Date(from).toISOString())
    }

    if (to) {
      filters.push('timestamp <= $' + (values.length + 1))
      values.push(new Date(to).toISOString())
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
    const totalSql = `SELECT COUNT(*)::int AS total FROM detections ${whereClause}`
    const totalResult = await pool.query(totalSql, values)

    const listSql = `
      SELECT id, device_id, event_type, impact_metric, severity,
             gps_valid, latitude, longitude, timestamp, created_at
      FROM detections
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `
    const listResult = await pool.query(listSql, [...values, limit, Math.max(0, offset) * limit])

    res.json({
      total: Number(totalResult.rows[0]?.total ?? 0),
      page: Math.max(1, page),
      limit,
      detections: toCamelCase(listResult.rows),
    })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/devices/:deviceId/status', async (req, res, next) => {
  try {
    const { deviceId } = req.params
    if (!deviceId) {
      return res.status(400).json({ error: 'deviceId is required.' })
    }

    const latestReading = await pool.query(`
      SELECT device_id, timestamp, acceleration_x, acceleration_y, acceleration_z,
             acceleration_magnitude, impact_detected, severity, gps_valid, latitude, longitude,
             satellites, hdop, wifi_connected, cloud_connected, heartbeat_message
      FROM sensor_readings
      WHERE device_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `, [deviceId])

    const eventCount = await pool.query(`
      SELECT COUNT(*)::int AS uploaded_events
      FROM detections
      WHERE device_id = $1
    `, [deviceId])

    const row = latestReading.rows[0]
    const status = {
      deviceId,
      lastReceived: row ? row.timestamp : null,
      latitude: row && row.gps_valid ? row.latitude : null,
      longitude: row && row.gps_valid ? row.longitude : null,
      gpsValid: Boolean(row && row.gps_valid && row.latitude !== null && row.longitude !== null),
      impactValue: row?.acceleration_magnitude ?? null,
      accelerationX: row?.acceleration_x ?? null,
      accelerationY: row?.acceleration_y ?? null,
      accelerationZ: row?.acceleration_z ?? null,
      accelerationMagnitude: row?.acceleration_magnitude ?? null,
      impactDetected: Boolean(row?.impact_detected),
      severity: row?.severity ?? 'unclassified',
      satellites: row?.satellites ?? null,
      hdop: row?.hdop ?? null,
      wifiConnected: row ? row.wifi_connected : null,
      cloudConnected: row ? row.cloud_connected : null,
      uploadedEvents: Number(eventCount.rows[0]?.uploaded_events ?? 0),
      heartbeatMessage: row ? row.heartbeat_message : null,
      source: 'esp32',
    }

    return res.json(status)
  } catch (error) {
    return next(error)
  }
})

app.use((error, req, res, next) => {
  console.error(error)
  if (res.headersSent) return next(error)
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request payload exceeds REQUEST_LIMIT_BYTES.' })
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' })
  }
  return res.status(500).json({ error: 'Internal server error', detail: error instanceof Error ? error.message : 'Unknown error' })
})

async function startServer() {
  try {
    await ensureSchema()
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`RoadSense backend listening on port ${config.port}`)
    })
  } catch (error) {
    console.error('Failed to initialise PostgreSQL schema:', error)
    process.exit(1)
  }
}

startServer()

export { app, config, pool }
