import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const p = path.join(__dirname, '..', 'firmware', 'roadsense-rover', 'roadsense-rover.ino');
let s = fs.readFileSync(p, 'utf8');

const start = s.indexOf('void setupWiFi()');
const end = s.indexOf('\nvoid setup()', start);

if (start === -1 || end === -1) {
  console.log('NOT_FOUND');
  process.exit(1);
}

const block = `void setupWiFi() {
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

`;

s = s.slice(0, start) + block + s.slice(end);
fs.writeFileSync(p, s);
console.log('OK');
