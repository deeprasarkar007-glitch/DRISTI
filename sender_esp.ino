#include <Wire.h>
#include <WiFi.h>
#include <esp_now.h>

#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_VL53L0X.h>
#include <DHT.h>
#include <BH1750.h>

// ==========================================================
// RECEIVER MAC
// ==========================================================

uint8_t receiverMAC[] = {
  0x04, 0xB2, 0x47,
  0x97, 0xBA, 0x90
};

// ==========================================================
// PINS
// ==========================================================

// BH1750 + VL53L0X
#define I2C_SDA 21
#define I2C_SCL 22

// OLED - ORIGINAL PINS
#define OLED_SDA 25
#define OLED_SCL 26

// DHT22
#define DHT_PIN 4
#define DHT_TYPE DHT22

// IR
#define IR_PIN 27

// BUZZER
#define BUZZER_PIN 23

// ==========================================================
// OLED
// ==========================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire1,
  -1
);

// ==========================================================
// SENSORS
// ==========================================================

DHT dht(DHT_PIN, DHT_TYPE);

Adafruit_VL53L0X lox;

BH1750 lightMeter;

// ==========================================================
// SENSOR DATA
// ==========================================================

float temperature = 0;
float humidity = 0;
float lux = 0;

uint16_t distanceMM = 9999;

bool objectDetected = false;

String distanceStatus = "SAFE";
String fogStatus = "CLEAR";

bool oledReady = false;
bool lidarReady = false;
bool lightReady = false;

// ==========================================================
// VEHICLE
// ==========================================================

const char* VEHICLE_ID = "DRS-001";
const char* ZONE_ID = "A3";

// ==========================================================
// DISTANCE SETTINGS
// ==========================================================

const uint16_t WARNING_DISTANCE = 100;
const uint16_t CAUTION_DISTANCE = 200;

// ==========================================================
// FOG SETTINGS
// ==========================================================

const float FOG_HUMIDITY_THRESHOLD = 75.0;
const float FOG_LIGHT_THRESHOLD = 100.0;

// ==========================================================
// TIMERS
// ==========================================================

unsigned long lastLidarRead = 0;
unsigned long lastDHTRead = 0;
unsigned long lastLightRead = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastSerialUpdate = 0;
unsigned long lastESPNOWSend = 0;

const unsigned long LIDAR_INTERVAL = 100;
const unsigned long DHT_INTERVAL = 2000;
const unsigned long LIGHT_INTERVAL = 500;
const unsigned long DISPLAY_INTERVAL = 500;
const unsigned long SERIAL_INTERVAL = 2000;
const unsigned long ESPNOW_INTERVAL = 1000;

// ==========================================================
// BUZZER
// ==========================================================

unsigned long buzzerTimer = 0;
bool buzzerState = false;

// ==========================================================
// ESP-NOW DATA
// ==========================================================

typedef struct {

  char vehicleID[16];
  char zone[8];

  float temperature;
  float humidity;
  float lux;

  uint16_t distanceMM;

  bool objectDetected;
  bool obstacleDetected;

  char fogStatus[20];
  char safetyStatus[20];

  unsigned long packetNumber;

} SensorPacket;

SensorPacket packet;

unsigned long packetNumber = 0;

// ==========================================================
// ESP-NOW CALLBACK
// ==========================================================

void onDataSent(
  const wifi_tx_info_t *info,
  esp_now_send_status_t status
) {

  if (status == ESP_NOW_SEND_SUCCESS) {

    Serial.println("ESP-NOW: SENT OK");

  } else {

    Serial.println("ESP-NOW: SEND FAILED");
  }
}

// ==========================================================
// SETUP
// ==========================================================

void setup() {

  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("============================");
  Serial.println("DRISHTI SENDER START");
  Serial.println("============================");

  // SENSOR I2C
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(100000);

  // OLED I2C
  Wire1.begin(OLED_SDA, OLED_SCL);
  Wire1.setClock(100000);

  delay(500);

  // OLED
  Serial.println("STARTING OLED...");

  if (display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {

    oledReady = true;

    Serial.println("OLED READY!");

    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);

    display.setTextSize(2);
    display.setCursor(15, 15);
    display.println("DRISHTI");

    display.setTextSize(1);
    display.setCursor(15, 45);
    display.println("STARTING");

    display.display();

    delay(2000);

  } else {

    Serial.println("OLED FAILED!");
  }

  // DHT
  dht.begin();
  Serial.println("DHT READY");

  // BH1750
  lightReady = lightMeter.begin(
    BH1750::CONTINUOUS_HIGH_RES_MODE,
    0x23,
    &Wire
  );

  if (lightReady) {
    Serial.println("BH1750 READY");
  } else {
    Serial.println("BH1750 FAILED");
  }

  // VL53L0X
  lidarReady = lox.begin();

  if (lidarReady) {
    Serial.println("VL53L0X READY");
  } else {
    Serial.println("VL53L0X FAILED");
  }

  // IR
  pinMode(IR_PIN, INPUT);

  // BUZZER
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // WIFI
  WiFi.mode(WIFI_STA);

  delay(500);

  Serial.print("Sender MAC: ");
  Serial.println(WiFi.macAddress());

  // ESP-NOW
  if (esp_now_init() != ESP_OK) {

    Serial.println("ESP-NOW INIT FAILED");

  } else {

    Serial.println("ESP-NOW INIT OK");

    esp_now_register_send_cb(onDataSent);

    esp_now_peer_info_t peerInfo = {};

    memcpy(
      peerInfo.peer_addr,
      receiverMAC,
      6
    );

    peerInfo.channel = 0;
    peerInfo.encrypt = false;

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {

      Serial.println("PEER ADD FAILED");

    } else {

      Serial.println("RECEIVER ADDED");
    }
  }

  Serial.println();
  Serial.println("SENDER READY!");
}

// ==========================================================
// LOOP
// ==========================================================

void loop() {

  unsigned long now = millis();

  // VL53L0X
  if (now - lastLidarRead >= LIDAR_INTERVAL) {

    lastLidarRead = now;
    readVL53L0X();
  }

  // IR
  readIRSensor();

  // DHT
  if (now - lastDHTRead >= DHT_INTERVAL) {

    lastDHTRead = now;
    readDHT22();
  }

  // BH1750
  if (now - lastLightRead >= LIGHT_INTERVAL) {

    lastLightRead = now;
    readBH1750();
  }

  // STATUS
  calculateStatus();

  // BUZZER
  updateBuzzer();

  // OLED
  if (now - lastDisplayUpdate >= DISPLAY_INTERVAL) {

    lastDisplayUpdate = now;
    updateOLED();
  }

  // ESP-NOW
  if (now - lastESPNOWSend >= ESPNOW_INTERVAL) {

    lastESPNOWSend = now;
    sendESPNow();
  }

  // SERIAL
  if (now - lastSerialUpdate >= SERIAL_INTERVAL) {

    lastSerialUpdate = now;
    printTelemetry();
  }
}

// ==========================================================
// VL53L0X
// ==========================================================

void readVL53L0X() {

  if (!lidarReady) {
    distanceMM = 9999;
    return;
  }

  VL53L0X_RangingMeasurementData_t measurement;

  lox.rangingTest(&measurement, false);

  if (measurement.RangeStatus != 4) {

    distanceMM = measurement.RangeMilliMeter;

  } else {

    distanceMM = 9999;
  }
}

// ==========================================================
// IR
// ==========================================================

void readIRSensor() {

  objectDetected =
    digitalRead(IR_PIN) == LOW;
}

// ==========================================================
// DHT22
// ==========================================================

void readDHT22() {

  float h = dht.readHumidity();
  float t = dht.readTemperature();

  if (!isnan(h) && !isnan(t)) {

    humidity = h;
    temperature = t;
  }
}

// ==========================================================
// BH1750
// ==========================================================

void readBH1750() {

  if (!lightReady) return;

  float newLux =
    lightMeter.readLightLevel();

  if (!isnan(newLux) && newLux >= 0) {

    lux = newLux;
  }
}

// ==========================================================
// STATUS
// ==========================================================

void calculateStatus() {

  if (distanceMM < WARNING_DISTANCE) {

    distanceStatus = "WARNING";

  } else if (distanceMM <= CAUTION_DISTANCE) {

    distanceStatus = "CAUTION";

  } else {

    distanceStatus = "SAFE";
  }

  if (
    humidity >= FOG_HUMIDITY_THRESHOLD &&
    lux <= FOG_LIGHT_THRESHOLD
  ) {

    fogStatus = "FOG CAN FORM";

  } else {

    fogStatus = "CLEAR";
  }
}

// ==========================================================
// BUZZER
// ==========================================================

void updateBuzzer() {

  unsigned long now = millis();

  if (distanceStatus == "WARNING") {

    if (!buzzerState &&
        now - buzzerTimer >= 700) {

      digitalWrite(BUZZER_PIN, HIGH);

      buzzerState = true;
      buzzerTimer = now;

    } else if (
      buzzerState &&
      now - buzzerTimer >= 120
    ) {

      digitalWrite(BUZZER_PIN, LOW);

      buzzerState = false;
      buzzerTimer = now;
    }

    return;
  }

  if (distanceStatus == "CAUTION") {

    if (!buzzerState &&
        now - buzzerTimer >= 1500) {

      digitalWrite(BUZZER_PIN, HIGH);

      buzzerState = true;
      buzzerTimer = now;

    } else if (
      buzzerState &&
      now - buzzerTimer >= 180
    ) {

      digitalWrite(BUZZER_PIN, LOW);

      buzzerState = false;
      buzzerTimer = now;
    }

    return;
  }

  digitalWrite(BUZZER_PIN, LOW);

  buzzerState = false;
}

// ==========================================================
// OLED
// ==========================================================

void updateOLED() {

  if (!oledReady) return;

  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 0);
  display.println("DRISHTI");

  display.println("---------------------");

  display.print("TEMP : ");
  display.print(temperature, 1);
  display.println(" C");

  display.print("HUM  : ");
  display.print(humidity, 0);
  display.println(" %");

  display.print("LUX  : ");
  display.println(lux, 0);

  display.print("DIST : ");

  if (distanceMM >= 9999) {

    display.println("--");

  } else {

    display.print(distanceMM / 10.0);
    display.println(" cm");
  }

  display.print("OBJ  : ");

  if (objectDetected) {

    display.println("YES");

  } else {

    display.println("NO");
  }

  display.print("STATUS: ");
  display.println(distanceStatus);

  display.display();
}

// ==========================================================
// ESP-NOW SEND
// ==========================================================

void sendESPNow() {

  memset(&packet, 0, sizeof(packet));

  strncpy(
    packet.vehicleID,
    VEHICLE_ID,
    sizeof(packet.vehicleID) - 1
  );

  strncpy(
    packet.zone,
    ZONE_ID,
    sizeof(packet.zone) - 1
  );

  packet.temperature = temperature;
  packet.humidity = humidity;
  packet.lux = lux;

  packet.distanceMM = distanceMM;

  packet.objectDetected = objectDetected;

  packet.obstacleDetected =
    distanceStatus != "SAFE";

  strncpy(
    packet.fogStatus,
    fogStatus.c_str(),
    sizeof(packet.fogStatus) - 1
  );

  strncpy(
    packet.safetyStatus,
    distanceStatus.c_str(),
    sizeof(packet.safetyStatus) - 1
  );

  packetNumber++;

  packet.packetNumber = packetNumber;

  esp_err_t result = esp_now_send(
    receiverMAC,
    (uint8_t *)&packet,
    sizeof(packet)
  );

  if (result != ESP_OK) {

    Serial.print("ESP-NOW ERROR: ");
    Serial.println(result);
  }
}

// ==========================================================
// SERIAL
// ==========================================================

void printTelemetry() {

  Serial.println();

  Serial.println("========== DRISHTI ==========");

  Serial.print("Temperature: ");
  Serial.println(temperature);

  Serial.print("Humidity: ");
  Serial.println(humidity);

  Serial.print("Lux: ");
  Serial.println(lux);

  Serial.print("Distance: ");
  Serial.print(distanceMM);
  Serial.println(" mm");

  Serial.print("Object: ");
  Serial.println(
    objectDetected ? "YES" : "NO"
  );

  Serial.print("Fog: ");
  Serial.println(fogStatus);

  Serial.print("Status: ");
  Serial.println(distanceStatus);

  Serial.println("=============================");
}