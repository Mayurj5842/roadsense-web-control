
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <TinyGPSPlus.h>
#include <time.h>
#include <math.h>

// =====================================================
// 1. WIFI CONFIGURATION
// =====================================================

const char* WIFI_SSID =   "Redmi Note 9 Pro Max";
const char* WIFI_PASSWORD = "12345678";

const char* SERVER_URL =
    "http://172.29.179.66:4000/api/telemetry";

// Enter a NEW valid key matching backend/.env
const char* DEVICE_API_KEY =
    "8a575c47e5a806345ba4fa9171210f740749757118c74b464a8e45ab9ec17e36";

const char* DEVICE_ID = "ESP32-CAR-01";

// ESP32 mobile-control hotspot
const char* AP_SSID = "RoadSense-Car";
const char* AP_PASSWORD = "RoadSense123";

WebServer server(80);

// =====================================================
// 2. MOTOR PINS — YOUR ACTUAL WIRING
// =====================================================

// L298N channel A: left motors
#define IN1 2
#define IN2 4

// L298N channel B: right motors
#define IN3 25
#define IN4 26

enum Motion {
  STOPPED,
  FORWARD,
  BACKWARD,
  LEFT,
  RIGHT
};

Motion currentMotion = STOPPED;

unsigned long lastCommandMs = 0;
const unsigned long COMMAND_TIMEOUT_MS = 800;

// =====================================================
// 3. MPU6050
// =====================================================

#define MPU_ADDR 0x68

const int SDA_PIN = 21;
const int SCL_PIN = 22;

bool mpuDetected = false;

// =====================================================
// 4. GPS
// =====================================================

TinyGPSPlus gps;

const int GPS_RX_PIN = 16; // GPS TX -> ESP32 GPIO16
const int GPS_TX_PIN = 17; // GPS RX -> ESP32 GPIO17

const uint32_t GPS_BAUD = 9600;

// =====================================================
// 5. TIMERS
// =====================================================

const unsigned long SEND_INTERVAL_MS = 30000;
const unsigned long GPS_DIAGNOSTIC_MS = 5000;

unsigned long lastSendMs = 0;
unsigned long lastGpsDiagnosticMs = 0;
unsigned long lastWifiAttemptMs = 0;

bool ntpStarted = false;

// Track STA connection attempts so WiFi.begin() is never called while a
// previous attempt is still in progress (causes "wifi:sta is connecting,
// cannot set config").
bool wifiConnecting = false;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;

// =====================================================
// 5b. IMPACT DETECTION
// =====================================================

float impactBaseline = 9.80665f;
bool impactBaselineReady = false;
bool impactPending = false;
const char* pendingSeverity = "unclassified";
float pendingMagnitude = 0.0f;
float pendingAx = 0.0f;
float pendingAy = 0.0f;
float pendingAz = 0.0f;
unsigned long lastImpactMs = 0;
unsigned long lastImpactSampleMs = 0;
const unsigned long IMPACT_DEBOUNCE_MS = 2000;
const unsigned long IMPACT_SAMPLE_MS = 20;
const float IMPACT_THRESHOLD_MINOR = 14.71f;
const float IMPACT_THRESHOLD_MODERATE = 29.42f;
const float IMPACT_THRESHOLD_SEVERE = 49.03f;

// =====================================================
// 6. MOTOR CONTROL
// =====================================================

void stopMotors() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, LOW);
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, LOW);

  currentMotion = STOPPED;
}

void leftForward() {
  digitalWrite(IN1, HIGH);
  digitalWrite(IN2, LOW);
}

void leftBackward() {
  digitalWrite(IN1, LOW);
  digitalWrite(IN2, HIGH);
}

void rightForward() {
  digitalWrite(IN3, HIGH);
  digitalWrite(IN4, LOW);
}

void rightBackward() {
  digitalWrite(IN3, LOW);
  digitalWrite(IN4, HIGH);
}

void drive(Motion command) {
  // Stop before changing direction
  stopMotors();

  switch (command) {
   case FORWARD:
  leftBackward();
  rightBackward();
  break;

case BACKWARD:
  leftForward();
  rightForward();
  break;

    case LEFT:
      // Left side backward, right side forward
      leftBackward();
      rightForward();
      break;

    case RIGHT:
      // Left side forward, right side backward
      leftForward();
      rightBackward();
      break;

    case STOPPED:
    default:
      stopMotors();
      return;
  }

  currentMotion = command;
  lastCommandMs = millis();

  Serial.print("Car command: ");

  switch (command) {
    case FORWARD:  Serial.println("FORWARD"); break;
    case BACKWARD: Serial.println("BACKWARD"); break;
    case LEFT:     Serial.println("LEFT"); break;
    case RIGHT:    Serial.println("RIGHT"); break;
    default:       Serial.println("STOP"); break;
  }
}

// =====================================================
// 7. MOBILE CONTROL PAGE
// =====================================================

const char controlPage[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<title>RoadSense Rover</title>

<style>
:root {
  --bg: #0b1120;
  --panel: #131d30;
  --border: #25344b;
  --text: #f1f5f9;
  --muted: #91a3bb;
  --accent: #38bdf8;
  --green: #22c55e;
  --red: #fb7185;
}

* {
  box-sizing: border-box;
  -webkit-tap-highlight-color: transparent;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(ellipse at top, #172b45 0%, var(--bg) 58%);
  color: var(--text);
  font-family: Arial, Helvetica, sans-serif;
  display: flex;
  justify-content: center;
  padding: 22px 15px;
}

.app {
  width: 100%;
  max-width: 430px;
}

.header {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 25px;
}

.logo {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  border: 1px solid #286184;
  border-radius: 15px;
  background: #102d43;
  font-size: 25px;
}

h1 {
  margin: 0;
  font-size: 22px;
  letter-spacing: .3px;
}

.subtitle {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.status-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  margin-bottom: 18px;
  background: rgba(19, 29, 48, .9);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.status-label {
  font-size: 13px;
  color: var(--muted);
}

.status-value {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
  font-size: 14px;
  font-weight: bold;
}

.dot {
  width: 9px;
  height: 9px;
  background: var(--green);
  border-radius: 50%;
  box-shadow: 0 0 10px #22c55e66;
}

.pill {
  padding: 7px 10px;
  border: 1px solid var(--border);
  border-radius: 20px;
  color: var(--muted);
  font-size: 11px;
}

.section-title {
  margin: 23px 0 7px;
  font-size: 15px;
  font-weight: bold;
}

.hint {
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 20px;
  line-height: 1.5;
}

.controller {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 94px);
  gap: 12px;
  max-width: 350px;
  margin: 0 auto;
  touch-action: none;
  user-select: none;
}

.control {
  border: 1px solid #30445e;
  border-radius: 22px;
  background: linear-gradient(145deg, #1a2940, #111b2c);
  color: var(--text);
  font-size: 30px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  box-shadow: 0 5px 0 #080e19;
  transition: transform .08s, background .08s, border-color .08s;
  touch-action: none;
}

.control span {
  font-size: 10px;
  font-weight: bold;
  letter-spacing: 1px;
  color: #b6c7dc;
}

.control:active,
.control.active {
  transform: translateY(4px);
  box-shadow: 0 1px 0 #080e19;
  background: #12415b;
  border-color: var(--accent);
}

.forward { grid-column: 2; grid-row: 1; }
.left    { grid-column: 1; grid-row: 2; }
.stop    { grid-column: 2; grid-row: 2; }
.right   { grid-column: 3; grid-row: 2; }
.backward{ grid-column: 2; grid-row: 3; }

.control.stop {
  background: #3a1927;
  border-color: #713047;
  color: var(--red);
  font-size: 25px;
  box-shadow: 0 5px 0 #210e17;
}

.control.stop span {
  color: #fda4af;
}

.control.stop:active,
.control.stop.active {
  background: #6b1e35;
  border-color: var(--red);
  box-shadow: 0 1px 0 #210e17;
}

.action-card {
  margin-top: 25px;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--panel);
}

.action-heading {
  font-size: 13px;
  font-weight: bold;
  margin-bottom: 7px;
}

.action-text {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.stop-button {
  width: 100%;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid #713047;
  border-radius: 13px;
  background: #3a1927;
  color: #fda4af;
  font-weight: bold;
  font-size: 14px;
  cursor: pointer;
}

.footer {
  text-align: center;
  margin-top: 22px;
  color: #71839b;
  font-size: 11px;
  line-height: 1.7;
}

button {
  font-family: inherit;
  outline: none;
}

@media (max-height: 650px) {
  .controller {
    grid-template-rows: repeat(3, 76px);
    gap: 9px;
  }
  .header { margin-bottom: 16px; }
  .section-title { margin-top: 16px; }
}
</style>
</head>

<body>
<main class="app">

  <header class="header">
    <div class="logo">🚙</div>
    <div>
      <h1>RoadSense Rover</h1>
      <div class="subtitle">IoT Pothole Detection System</div>
    </div>
  </header>

  <section class="status-card">
    <div>
      <div class="status-label">ESP32 Connection</div>
      <div class="status-value">
        <span class="dot" id="statusDot"></span>
        <span id="connectionText">Checking connection...</span>
      </div>
    </div>
    <div class="pill">MOBILE CONTROL</div>
  </section>

  <div class="section-title">Rover Controls</div>
  <div class="hint">
    Press and hold a direction to move. Release the button to stop.
  </div>

  <section class="controller" aria-label="Rover direction controls">
    <button class="control forward" data-command="forward"
      aria-label="Move forward">
      ▲<span>FORWARD</span>
    </button>

    <button class="control left" data-command="left"
      aria-label="Turn left">
      ◀<span>LEFT</span>
    </button>

    <button class="control stop" data-command="stop"
      aria-label="Stop rover">
      ■<span>STOP</span>
    </button>

    <button class="control right" data-command="right"
      aria-label="Turn right">
      ▶<span>RIGHT</span>
    </button>

    <button class="control backward" data-command="backward"
      aria-label="Move backward">
      ▼<span>BACKWARD</span>
    </button>
  </section>

  <section class="action-card">
    <div class="action-heading">Safety Control</div>
    <div class="action-text">
      Use the STOP button to send a stop command to the rover.
      Keep the rover within your line of sight while operating it.
    </div>
    <button class="stop-button" id="emergencyStop">
      ■ &nbsp; STOP ROVER
    </button>
  </section>

  <footer class="footer">
    RoadSense • ESP32 Rover Control<br>
    Stay safe. Operate on a clear surface.
  </footer>

</main>

<script>
const connectionText = document.getElementById("connectionText");
const statusDot = document.getElementById("statusDot");
const controls = document.querySelectorAll("[data-command]");

let activeCommand = null;
let requestInProgress = false;

async function sendCommand(command) {
  try {
    const response = await fetch(
      "/cmd?m=" + encodeURIComponent(command),
      { method: "GET", cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Command request failed");
    }

    connectionText.textContent = "Connected";
    statusDot.style.background = "#22c55e";
    return true;
  } catch (error) {
    connectionText.textContent = "Connection error";
    statusDot.style.background = "#fb7185";
    return false;
  }
}

function clearActiveButtons() {
  controls.forEach(button => button.classList.remove("active"));
}

async function startMovement(command, button) {
  if (command === "stop") {
    await stopRover();
    return;
  }

  if (activeCommand === command) return;

  activeCommand = command;
  clearActiveButtons();
  button.classList.add("active");

  await sendCommand(command);
}

async function stopRover() {
  activeCommand = null;
  clearActiveButtons();
  await sendCommand("stop");
}

controls.forEach(button => {
  const command = button.dataset.command;

  button.addEventListener("pointerdown", event => {
    event.preventDefault();

    if (command === "stop") {
      stopRover();
    } else {
      startMovement(command, button);
    }
  });

  button.addEventListener("contextmenu", event => {
    event.preventDefault();
  });
});

document.addEventListener("pointerup", () => {
  if (activeCommand !== null) {
    stopRover();
  }
});

document.addEventListener("pointercancel", () => {
  if (activeCommand !== null) {
    stopRover();
  }
});

document.getElementById("emergencyStop")
  .addEventListener("click", stopRover);

async function checkConnection() {
  try {
    const response = await fetch("/status", {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) throw new Error("Offline");

    connectionText.textContent = "Connected";
    statusDot.style.background = "#22c55e";
  } catch (error) {
    connectionText.textContent = "Not connected";
    statusDot.style.background = "#fb7185";
  }
}

checkConnection();
setInterval(checkConnection, 5000);
</script>

</body>
</html>
)rawliteral";

// =====================================================
// 8. WEB SERVER ROUTES
// =====================================================

void handleRoot() {
  server.send_P(200, "text/html", controlPage);
}

void handleCommand() {
  if (!server.hasArg("m")) {
    server.send(400, "text/plain", "Missing command");
    return;
  }

  String cmd = server.arg("m");
  cmd.toLowerCase();

  if (cmd == "stop") {
    stopMotors();
    server.send(200, "text/plain", "STOPPED");
  }
  else if (cmd == "forward") {
    drive(FORWARD);
    server.send(200, "text/plain", "FORWARD");
  }
  else if (cmd == "backward") {
    drive(BACKWARD);
    server.send(200, "text/plain", "BACKWARD");
  }
  else if (cmd == "left") {
    drive(LEFT);
    server.send(200, "text/plain", "LEFT");
  }
  else if (cmd == "right") {
    drive(RIGHT);
    server.send(200, "text/plain", "RIGHT");
  }
  else {
    stopMotors();
    server.send(400, "text/plain", "Invalid command");
  }
}

void setupWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/cmd", HTTP_GET, handleCommand);

  server.on("/status", HTTP_GET, []() {
    String result = "{\"motion\":\"";

    switch (currentMotion) {
      case FORWARD:  result += "forward"; break;
      case BACKWARD: result += "backward"; break;
      case LEFT:     result += "left"; break;
      case RIGHT:    result += "right"; break;
      default:       result += "stop"; break;
    }

    result += "\",\"gpsValid\":";
    result += (gps.location.isValid() &&
               gps.location.age() < 10000)
                  ? "true" : "false";

    result += "}";

    server.send(200, "application/json", result);
  });

  server.begin();
  Serial.println("Mobile control server started.");
}

// =====================================================
// 9. MPU6050 FUNCTIONS
// =====================================================

bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool detectMPU6050() {
  Wire.beginTransmission(MPU_ADDR);

  if (Wire.endTransmission() != 0) {
    return false;
  }

  if (!writeRegister(0x6B, 0x00)) return false;
  delay(100);

  if (!writeRegister(0x1C, 0x10)) return false;
  delay(50);

  return true;
}

bool readAcceleration(float &ax, float &ay, float &az) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);

  if (Wire.endTransmission(false) != 0) return false;

  if (Wire.requestFrom((uint8_t)MPU_ADDR,
                       (uint8_t)6) != 6) {
    return false;
  }

  uint16_t xh = Wire.read();
  uint16_t xl = Wire.read();
  uint16_t yh = Wire.read();
  uint16_t yl = Wire.read();
  uint16_t zh = Wire.read();
  uint16_t zl = Wire.read();

  int16_t rawX = (int16_t)((xh << 8) | xl);
  int16_t rawY = (int16_t)((yh << 8) | yl);
  int16_t rawZ = (int16_t)((zh << 8) | zl);

  ax = ((float)rawX / 4096.0f) * 9.80665f;
  ay = ((float)rawY / 4096.0f) * 9.80665f;
  az = ((float)rawZ / 4096.0f) * 9.80665f;

  return true;
}

// =====================================================
// 10. GPS FUNCTIONS
// =====================================================

void readGPS() {
  while (Serial2.available()) {
    gps.encode((char)Serial2.read());
  }
}

bool hasValidGPSFix() {
  return gps.location.isValid() &&
         gps.location.age() < 10000;
}

void printGPSDiagnostics() {
  Serial.println("\n========== GPS STATUS ==========");

  Serial.print("Characters: ");
  Serial.println(gps.charsProcessed());

  Serial.print("Valid checksums: ");
  Serial.println(gps.passedChecksum());

  Serial.print("GPS fix: ");
  Serial.println(hasValidGPSFix() ? "VALID" : "NOT AVAILABLE");

  if (hasValidGPSFix()) {
    Serial.print("Latitude: ");
    Serial.println(gps.location.lat(), 6);

    Serial.print("Longitude: ");
    Serial.println(gps.location.lng(), 6);
  }

  Serial.print("Satellites: ");
  if (gps.satellites.isValid()) {
    Serial.println(gps.satellites.value());
  } else {
    Serial.println("NOT AVAILABLE");
  }

  Serial.print("HDOP: ");
  if (gps.hdop.isValid()) {
    Serial.println(gps.hdop.hdop(), 2);
  } else if (gps.hdop.age() < 5000) {
    Serial.println(gps.hdop.hdop(), 2);
  } else {
    Serial.println("NOT AVAILABLE");
  }

  Serial.println("================================");
}

// =====================================================
// 11. TIME SYNC
// =====================================================

void startTimeSync() {
  if (!ntpStarted && WiFi.status() == WL_CONNECTED) {
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    ntpStarted = true;
  }
}

bool getTimestamp(char* buffer, size_t size) {
  time_t now = time(nullptr);

  if (now < 1700000000) return false;

  struct tm timeInfo;

  if (gmtime_r(&now, &timeInfo) == nullptr) {
    return false;
  }

  return strftime(buffer, size,
                  "%Y-%m-%dT%H:%M:%SZ",
                  &timeInfo) > 0;
}

// =====================================================
// 11b. IMPACT DETECTION
// =====================================================

void detectImpact(unsigned long now) {
  if (!mpuDetected) return;
  if (now - lastImpactSampleMs < IMPACT_SAMPLE_MS) return;
  lastImpactSampleMs = now;

  float ax, ay, az;
  if (!readAcceleration(ax, ay, az)) return;

  float magnitude = sqrtf(ax * ax + ay * ay + az * az);

  if (!impactBaselineReady) {
    impactBaseline = magnitude;
    impactBaselineReady = true;
    return;
  }

  bool inDebounce = (now - lastImpactMs) < IMPACT_DEBOUNCE_MS;
  float deviation = fabsf(magnitude - impactBaseline);

  if (!inDebounce && deviation >= IMPACT_THRESHOLD_SEVERE) {
    pendingSeverity = "severe";
  } else if (!inDebounce && deviation >= IMPACT_THRESHOLD_MODERATE) {
    pendingSeverity = "moderate";
  } else if (!inDebounce && deviation >= IMPACT_THRESHOLD_MINOR) {
    pendingSeverity = "minor";
  } else {
    if (!inDebounce) {
      float alpha = 0.02f;
      impactBaseline += alpha * (magnitude - impactBaseline);
    }
    return;
  }

  impactPending = true;
  pendingMagnitude = magnitude;
  pendingAx = ax;
  pendingAy = ay;
  pendingAz = az;
  lastImpactMs = now;
  impactBaseline = magnitude;

  Serial.print("Impact detected: ");
  Serial.print(pendingSeverity);
  Serial.print(" deviation=");
  Serial.print(deviation, 2);
  Serial.println(" m/s2");

  lastSendMs = now;
  sendTelemetry();
}

// =====================================================
// 12. BACKEND TELEMETRY
// =====================================================

void sendTelemetry() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Backend telemetry skipped: Wi-Fi offline.");
    return;
  }

  if (strlen(DEVICE_API_KEY) < 32 ||
      strcmp(DEVICE_API_KEY,
             "PASTE_YOUR_NEW_DEVICE_API_KEY_HERE") == 0) {
    Serial.println("Configure DEVICE_API_KEY first.");
    return;
  }

  if (!mpuDetected) {
    Serial.println("Telemetry skipped: MPU6050 unavailable.");
    return;
  }

  float ax, ay, az;

  if (!readAcceleration(ax, ay, az)) {
    Serial.println("MPU6050 read failed.");
    return;
  }

  char timestamp[25];

  if (!getTimestamp(timestamp, sizeof(timestamp))) {
    Serial.println("Telemetry skipped: NTP time not ready.");
    return;
  }

  bool gpsValid = hasValidGPSFix();

  float ax2 = impactPending ? pendingAx : ax;
  float ay2 = impactPending ? pendingAy : ay;
  float az2 = impactPending ? pendingAz : az;
  float magnitude = impactPending ? pendingMagnitude : sqrtf(ax * ax + ay * ay + az * az);

  String payload = "{";

  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"timestamp\":\"" + String(timestamp) + "\",";
  payload += "\"accelerationX\":" + String(ax2, 3) + ",";
  payload += "\"accelerationY\":" + String(ay2, 3) + ",";
  payload += "\"accelerationZ\":" + String(az2, 3) + ",";
  payload += "\"accelerationMagnitude\":" + String(magnitude, 3) + ",";
  payload += "\"gpsValid\":";
  payload += gpsValid ? "true" : "false";

  if (gpsValid) {
    payload += ",\"latitude\":" + String(gps.location.lat(), 6);
    payload += ",\"longitude\":" + String(gps.location.lng(), 6);
  }

  payload += ",\"satellites\":";
  payload += gps.satellites.isValid()
                 ? String(gps.satellites.value()) : "0";

  payload += ",\"hdop\":";
  payload += gps.hdop.isValid()
                 ? String(gps.hdop.hdop(), 2) : "99.9";

  payload += ",\"wifiConnected\":true";
  payload += ",\"cloudConnected\":true";
  payload += ",\"impactDetected\":";
  payload += impactPending ? "true" : "false";
  payload += ",\"severity\":\"" + String(pendingSeverity) + "\"";
  payload += ",\"heartbeatMessage\":\"ESP32 telemetry\"";
  payload += "}";

  HTTPClient http;
  http.setTimeout(5000);

  if (!http.begin(SERVER_URL)) {
    Serial.println("HTTP initialization failed.");
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-API-Key", DEVICE_API_KEY);

  int statusCode = http.POST(payload);

  Serial.print("Backend HTTP status: ");
  Serial.println(statusCode);

  if (statusCode >= 200 && statusCode < 300) {
    Serial.println(http.getString());
    impactPending = false;
    pendingSeverity = "unclassified";
  } else if (statusCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.println(http.errorToString(statusCode));
  }

  http.end();
}

// =====================================================
// 13. WIFI SETUP AND RECONNECT
// =====================================================

void setupWiFi() {
  WiFi.disconnect(true);
  delay(200);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  // Mobile control access point
  bool apStarted = WiFi.softAP(AP_SSID, AP_PASSWORD);

  if (apStarted) {
    Serial.println("Mobile hotspot started.");
    Serial.print("Connect phone to: ");
    Serial.println(AP_SSID);
    Serial.print("Open: http://");
    Serial.println(WiFi.softAPIP());
  } else {
    Serial.println("Failed to start mobile hotspot.");
  }

  // Separate Wi-Fi connection for backend telemetry
  Serial.print("Connecting to backend Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  wifiConnecting = true;

  unsigned long startMs = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startMs < 25000) {
    readGPS();
    Serial.print(".");
    delay(250);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    wifiConnecting = false;
    Serial.println("Backend Wi-Fi connected.");
    Serial.print("ESP32 local IP: ");
    Serial.println(WiFi.localIP());
    startTimeSync();
  } else {
    wifiConnecting = false;
    Serial.print("Backend Wi-Fi not connected. Status: ");
    Serial.println(WiFi.status());
    Serial.println("Mobile control can still work.");
  }

  lastWifiAttemptMs = millis();
}


void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\nRoadSense 4WD Starting...");

  // Motor pins
  pinMode(IN1, OUTPUT);
  pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT);
  pinMode(IN4, OUTPUT);

  stopMotors();

  // MPU6050
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  mpuDetected = detectMPU6050();

  Serial.println(
    mpuDetected ? "MPU6050 detected." : "MPU6050 not detected."
  );

  // GPS
  Serial2.begin(GPS_BAUD, SERIAL_8N1,
                GPS_RX_PIN, GPS_TX_PIN);

  Serial.println("GPS UART initialized.");

  // Wi-Fi + mobile access point
  setupWiFi();

  // Mobile web server
  setupWebServer();

  lastSendMs = millis();
  lastGpsDiagnosticMs = millis();

  Serial.println("Setup complete.");
}

// =====================================================
// 15. MAIN LOOP
// =====================================================

void loop() {
  server.handleClient();

  // Always process incoming GPS bytes
  readGPS();

  unsigned long now = millis();

  detectImpact(now);

  // Emergency failsafe if commands stop arriving
  if (currentMotion != STOPPED &&
      now - lastCommandMs > COMMAND_TIMEOUT_MS) {
    stopMotors();
    Serial.println("Command timeout: motors stopped.");
  }

  // Retry backend Wi-Fi connection — never call WiFi.begin() while a
  // previous attempt is still connecting, and always disconnect first
  // so the STA config can be applied cleanly.
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnecting = false;
  } else if (wifiConnecting &&
             now - lastWifiAttemptMs >= WIFI_CONNECT_TIMEOUT_MS) {
    // Attempt timed out; force idle so a fresh begin() is allowed.
    WiFi.disconnect();
    wifiConnecting = false;
  }

  if (!wifiConnecting && WiFi.status() != WL_CONNECTED &&
      now - lastWifiAttemptMs >= 15000) {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    wifiConnecting = true;
    lastWifiAttemptMs = now;
  }

  if (WiFi.status() == WL_CONNECTED) {
    startTimeSync();
  }

  if (now - lastGpsDiagnosticMs >= GPS_DIAGNOSTIC_MS) {
    lastGpsDiagnosticMs = now;
    printGPSDiagnostics();
  }

  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;
    sendTelemetry();
  }

  delay(2);
}
