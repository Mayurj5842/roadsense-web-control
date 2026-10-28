CREATE TABLE IF NOT EXISTS sensor_readings (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  acceleration_x DOUBLE PRECISION,
  acceleration_y DOUBLE PRECISION,
  acceleration_z DOUBLE PRECISION,
  acceleration_magnitude DOUBLE PRECISION,
  impact_detected BOOLEAN NOT NULL DEFAULT FALSE,
  severity TEXT CHECK (severity IN ('minor', 'moderate', 'severe', 'unclassified')),
  gps_valid BOOLEAN NOT NULL DEFAULT FALSE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  satellites INTEGER,
  hdop DOUBLE PRECISION,
  wifi_connected BOOLEAN,
  cloud_connected BOOLEAN,
  heartbeat_message TEXT,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS detections (
  id SERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'pothole',
  impact_metric DOUBLE PRECISION,
  severity TEXT CHECK (severity IN ('minor', 'moderate', 'severe', 'unclassified')),
  gps_valid BOOLEAN NOT NULL DEFAULT FALSE,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (device_id, timestamp)
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time ON sensor_readings(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_device_time ON detections(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_detections_severity ON detections(severity);
