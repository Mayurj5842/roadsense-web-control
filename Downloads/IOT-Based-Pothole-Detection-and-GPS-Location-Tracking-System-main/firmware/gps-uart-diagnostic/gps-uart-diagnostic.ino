#include <Arduino.h>

HardwareSerial GpsSerial(2);
uint32_t bytesThisSecond = 0;
uint32_t lastReport = 0;

void setup() {
  Serial.begin(115200);
  GpsSerial.begin(9600, SERIAL_8N1, 16, 17);
  Serial.println("GPS UART raw diagnostic started");
  Serial.println("UART2 RX=GPIO16, TX=GPIO17, baud=9600");
  Serial.println("Expect NMEA text such as $G...; no GPS fix is required to see raw bytes.");
}

void loop() {
  while (GpsSerial.available() > 0) {
    const uint8_t value = static_cast<uint8_t>(GpsSerial.read());
    ++bytesThisSecond;

    Serial.print("GPS RX 0x");
    if (value < 0x10) Serial.print('0');
    Serial.print(value, HEX);
    Serial.print(" ");
    if (value >= 0x20 && value <= 0x7E) {
      Serial.write(value);
    } else {
      Serial.print('.');
    }
    Serial.println();
  }

  const uint32_t now = millis();
  if (now - lastReport >= 1000) {
    Serial.print("GPS raw bytes in last second: ");
    Serial.println(bytesThisSecond);
    bytesThisSecond = 0;
    lastReport = now;
  }
}
