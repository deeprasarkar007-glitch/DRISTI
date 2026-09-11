#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_VL53L0X.h>
#include <DHT.h>
#include <BH1750.h>

// ==========================================================
//                         PINS
// ==========================================================

// ---------------- I2C BUS 0 ----------------
// VL53L0X + BH1750
#define I2C0_SDA 21
#define I2C0_SCL 22

// ---------------- I2C BUS 1 ----------------
// OLED
#define OLED_SDA 25
#define OLED_SCL 26

// DHT22
#define DHT_PIN 4
#define DHT_TYPE DHT22

// IR obstacle sensor
#define IR_PIN 27

// Buzzer
#define BUZZER_PIN 23

// ==========================================================
//                         OLED
// ==========================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64

#define OLED_ADDR_1 0x3C
#define OLED_ADDR_2 0x3D

// ==========================================================
//                     SENSOR OBJECTS
// ==========================================================

DHT dht(DHT_PIN, DHT_TYPE);

Adafruit_VL53L0X lox;

BH1750 lightMeter;

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire1,
  -1
);

// ==========================================================
//                       SENSOR DATA
// ==========================================================

float temperature = 0.0;
float humidity = 0.0;
float lux = 0.0;

uint16_t distanceMM = 9999;

bool objectDetected = false;

// ==========================================================
//                     SYSTEM STATUS
// ==========================================================

String distanceStatus = "SAFE";
String fogStatus = "CLEAR";

bool oledReady = false;
bool lidarReady = false;
bool lightReady = false;

// ==========================================================
//                   SAFETY THRESHOLDS
// ==========================================================

// Distance is in MILLIMETRES

const uint16_t WARNING_DISTANCE = 100;
const uint16_t CAUTION_DISTANCE = 200;

// ==========================================================
//                     FOG LOGIC
// ==========================================================

// Prototype fog-risk heuristic:
//
// Humidity >= 75%
// AND
// Light <= 100 lux
//
// => FOG CAN FORM

const float FOG_HUMIDITY_THRESHOLD = 75.0;
const float FOG_LIGHT_THRESHOLD = 100.0;

// ==========================================================
//                    VEHICLE INFORMATION
// ==========================================================

const char* VEHICLE_ID = "DRS-001";
const char* ZONE_ID = "A3";

// ==========================================================
//                       TIMERS
// ==========================================================

unsigned long lastLidarRead = 0;
unsigned long lastDHTRead = 0;
unsigned long lastLightRead = 0;
unsigned long lastDisplayUpdate = 0;
unsigned long lastSerialUpdate = 0;

const unsigned long LIDAR_INTERVAL = 100;
const unsigned long DHT_INTERVAL = 2000;
const unsigned long LIGHT_INTERVAL = 200;
const unsigned long DISPLAY_INTERVAL = 200;
const unsigned long SERIAL_INTERVAL = 1000;

// ==========================================================
//                       BUZZER
// ==========================================================

unsigned long buzzerTimer = 0;
bool buzzerState = false;

// ==========================================================
//                   FUNCTION DECLARATIONS
// ==========================================================

void scanBus(TwoWire& bus, const char* name, int sda, int scl);

void readVL53L0X();
void readIRSensor();
void readDHT22();
void readBH1750();

void calculateStatus();
void updateBuzzer();
void updateOLED();
void printTelemetry();

// ==========================================================
//                           SETUP
// ==========================================================

void setup() {

  Serial.begin(115200);

  delay(500);

  Serial.println();
  Serial.println("====================================");
  Serial.println("          DRISHTI SYSTEM");
  Serial.println("====================================");
  Serial.println();

  // ========================================================
  // START I2C BUS 0
  // ========================================================

  Wire.begin(I2C0_SDA, I2C0_SCL);

  delay(100);

  scanBus(
    Wire,
    "Wire / I2C0",
    I2C0_SDA,
    I2C0_SCL
  );

  // ========================================================
  // START I2C BUS 1
  // ========================================================

  Wire1.begin(OLED_SDA, OLED_SCL);

  delay(100);

  scanBus(
    Wire1,
    "Wire1 / I2C1",
    OLED_SDA,
    OLED_SCL
  );

  // ========================================================
  // VL53L0X
  // ========================================================

  Serial.println();
  Serial.println("Initializing VL53L0X...");

  lidarReady = lox.begin();

  if (lidarReady) {

    Serial.println("VL53L0X READY");
  }

  else {

    Serial.println("WARNING: VL53L0X NOT FOUND");
  }

  // ========================================================
  // BH1750
  // ========================================================

  Serial.println();
  Serial.println("Initializing BH1750...");

  lightReady = lightMeter.begin(
    BH1750::CONTINUOUS_HIGH_RES_MODE,
    0x23,
    &Wire
  );

  if (!lightReady) {

    Serial.println("0x23 not found.");
    Serial.println("Trying 0x5C...");

    lightReady = lightMeter.begin(
      BH1750::CONTINUOUS_HIGH_RES_MODE,
      0x5C,
      &Wire
    );
  }

  if (lightReady) {

    Serial.println("BH1750 READY");
  }

  else {

    Serial.println("WARNING: BH1750 NOT FOUND");
  }

  // ========================================================
  // OLED
  // ========================================================

  Serial.println();
  Serial.println("Initializing OLED...");

  if (display.begin(
        SSD1306_SWITCHCAPVCC,
        OLED_ADDR_1
      )) {

    oledReady = true;

    Serial.println("OLED FOUND AT 0x3C");
  }

  else if (display.begin(
             SSD1306_SWITCHCAPVCC,
             OLED_ADDR_2
           )) {

    oledReady = true;

    Serial.println("OLED FOUND AT 0x3D");
  }

  else {

    Serial.println("WARNING: OLED NOT FOUND");
  }

  // ========================================================
  // OLED INITIAL SCREEN
  // ========================================================

  if (oledReady) {

    display.clearDisplay();

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    display.setCursor(0, 0);

    display.println("DRISHTI");
    display.println("----------------");
    display.println("Initializing...");
    display.println();

    display.println("Sensors starting...");

    display.display();

    delay(1000);
  }

  // ========================================================
  // DHT22
  // ========================================================

  dht.begin();

  Serial.println("DHT22 READY");

  // ========================================================
  // IR
  // ========================================================

  pinMode(IR_PIN, INPUT);

  Serial.println("IR SENSOR READY");

  // ========================================================
  // BUZZER
  // ========================================================

  pinMode(BUZZER_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);

  Serial.println("BUZZER READY");

  // ========================================================
  // INITIAL OLED
  // ========================================================

  if (oledReady) {

    display.clearDisplay();

    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);

    display.setCursor(0, 0);

    display.println("DRISHTI");
    display.println("----------------");
    display.println("SYSTEM READY");

    display.display();
  }

  Serial.println();
  Serial.println("====================================");
  Serial.println("             READY");
  Serial.println("====================================");
  Serial.println();

  delay(500);
}

// ==========================================================
//                           LOOP
// ==========================================================

void loop() {

  unsigned long now = millis();

  // ========================================================
  // VL53L0X
  // ========================================================

  if (now - lastLidarRead >= LIDAR_INTERVAL) {

    lastLidarRead = now;

    readVL53L0X();
  }

  // ========================================================
  // IR
  // ========================================================

  readIRSensor();

  // ========================================================
  // DHT22
  // IMPORTANT:
  // DHT22 should not be read every 100 ms
  // ========================================================

  if (now - lastDHTRead >= DHT_INTERVAL) {

    lastDHTRead = now;

    readDHT22();
  }

  // ========================================================
  // BH1750
  // ========================================================

  if (now - lastLightRead >= LIGHT_INTERVAL) {

    lastLightRead = now;

    readBH1750();
  }

  // ========================================================
  // CALCULATE STATUS
  // ========================================================

  calculateStatus();

  // ========================================================
  // BUZZER
  // ========================================================

  updateBuzzer();

  // ========================================================
  // OLED
  // ========================================================

  if (now - lastDisplayUpdate >= DISPLAY_INTERVAL) {

    lastDisplayUpdate = now;

    updateOLED();
  }

  // ========================================================
  // SERIAL TELEMETRY
  // ========================================================

  if (now - lastSerialUpdate >= SERIAL_INTERVAL) {

    lastSerialUpdate = now;

    printTelemetry();
  }
}

// ==========================================================
//                 I2C SCANNER
// ==========================================================

void scanBus(
  TwoWire& bus,
  const char* name,
  int sda,
  int scl
) {

  Serial.println();

  Serial.print("Scanning ");
  Serial.print(name);

  Serial.print(" (SDA=");
  Serial.print(sda);

  Serial.print(", SCL=");
  Serial.print(scl);

  Serial.println(")");

  int found = 0;

  for (uint8_t address = 1; address < 127; address++) {

    bus.beginTransmission(address);

    uint8_t error = bus.endTransmission();

    if (error == 0) {

      Serial.print("  Found device at 0x");

      if (address < 16) {
        Serial.print("0");
      }

      Serial.println(address, HEX);

      found++;
    }
  }

  if (found == 0) {

    Serial.println("  No I2C devices found.");
  }
}

// ==========================================================
//                    READ VL53L0X
// ==========================================================

void readVL53L0X() {

  if (!lidarReady) {

    distanceMM = 9999;

    return;
  }

  VL53L0X_RangingMeasurementData_t measurement;

  lox.rangingTest(
    &measurement,
    false
  );

  /*
     RangeStatus == 4
     means out of range.
  */

  if (measurement.RangeStatus != 4) {

    distanceMM = measurement.RangeMilliMeter;
  }

  else {

    distanceMM = 9999;
  }
}

// ==========================================================
//                       READ IR
// ==========================================================

void readIRSensor() {

  /*
     Typical IR obstacle sensor:

     LOW  = object detected
     HIGH = clear

     If your module behaves opposite,
     change LOW to HIGH.
  */

  objectDetected =
    (digitalRead(IR_PIN) == LOW);
}

// ==========================================================
//                      READ DHT22
// ==========================================================

void readDHT22() {

  float newHumidity =
    dht.readHumidity();

  float newTemperature =
    dht.readTemperature();

  if (
    !isnan(newHumidity) &&
    !isnan(newTemperature)
  ) {

    humidity = newHumidity;
    temperature = newTemperature;
  }

  else {

    Serial.println("DHT22 reading failed.");
  }
}

// ==========================================================
//                      READ BH1750
// ==========================================================

void readBH1750() {

  if (!lightReady) {

    lux = 0;

    return;
  }

  float newLux =
    lightMeter.readLightLevel();

  if (
    !isnan(newLux) &&
    newLux >= 0
  ) {

    lux = newLux;
  }
}

// ==========================================================
//                  CALCULATE SYSTEM STATUS
// ==========================================================

void calculateStatus() {

  // ========================================================
  // DISTANCE STATUS
  // ========================================================

  if (distanceMM < WARNING_DISTANCE) {

    distanceStatus = "WARNING";
  }

  else if (
    distanceMM >= WARNING_DISTANCE &&
    distanceMM <= CAUTION_DISTANCE
  ) {

    distanceStatus = "CAUTION";
  }

  else {

    distanceStatus = "SAFE";
  }

  // ========================================================
  // FOG STATUS
  // ========================================================

  if (
    humidity >= FOG_HUMIDITY_THRESHOLD &&
    lux <= FOG_LIGHT_THRESHOLD
  ) {

    fogStatus = "FOG CAN FORM";
  }

  else {

    fogStatus = "CLEAR";
  }
}

// ==========================================================
//                       BUZZER
// ==========================================================

void updateBuzzer() {

  unsigned long now = millis();

  // ========================================================
  // WARNING
  // ========================================================
  //
  // Pattern:
  //
  // BEEP
  // BEEP
  // BEEP
  // PAUSE
  //
  // ========================================================

  if (distanceStatus == "WARNING") {

    if (buzzerState == false) {

      // Currently OFF

      if (now - buzzerTimer >= 700) {

        digitalWrite(BUZZER_PIN, HIGH);

        buzzerState = true;

        buzzerTimer = now;
      }
    }

    else {

      // Currently ON

      if (now - buzzerTimer >= 120) {

        digitalWrite(BUZZER_PIN, LOW);

        buzzerState = false;

        buzzerTimer = now;
      }
    }

    return;
  }

  // ========================================================
  // CAUTION
  // ========================================================

  if (distanceStatus == "CAUTION") {

    if (buzzerState == false) {

      // OFF → wait before beep

      if (now - buzzerTimer >= 1500) {

        digitalWrite(BUZZER_PIN, HIGH);

        buzzerState = true;

        buzzerTimer = now;
      }
    }

    else {

      // ON → turn off after short beep

      if (now - buzzerTimer >= 180) {

        digitalWrite(BUZZER_PIN, LOW);

        buzzerState = false;

        buzzerTimer = now;
      }
    }

    return;
  }

  // ========================================================
  // SAFE
  // ========================================================

  digitalWrite(BUZZER_PIN, LOW);

  buzzerState = false;

  buzzerTimer = now;
}

// ==========================================================
//                       OLED DISPLAY
// ==========================================================

void updateOLED() {

  if (!oledReady) {

    return;
  }

  display.clearDisplay();

  display.setTextSize(1);

  display.setTextColor(
    SSD1306_WHITE
  );

  display.setCursor(0, 0);

  // --------------------------------------------------------
  // HEADER
  // --------------------------------------------------------

  display.println("DRISHTI");

  display.println("----------------");

  // --------------------------------------------------------
  // HUMIDITY
  // --------------------------------------------------------

  display.print("HUM  : ");

  display.print(
    humidity,
    0
  );

  display.println(" %");

  // --------------------------------------------------------
  // LIGHT
  // --------------------------------------------------------

  display.print("LIGHT: ");

  display.print(
    lux,
    0
  );

  display.println(" LUX");

  // --------------------------------------------------------
  // FOG
  // --------------------------------------------------------

  display.println(fogStatus);

  // --------------------------------------------------------
  // DISTANCE
  // --------------------------------------------------------

  display.print("DIST : ");

  if (distanceMM >= 9999) {

    display.println("-- cm");
  }

  else {

    float distanceCM =
      distanceMM / 10.0;

    display.print(
      distanceCM,
      1
    );

    display.println(" cm");
  }

  // --------------------------------------------------------
  // OBJECT
  // --------------------------------------------------------

  display.print("OBJ  : ");

  if (objectDetected) {

    display.println("DETECTED");
  }

  else {

    display.println("CLEAR");
  }

  // --------------------------------------------------------
  // STATUS
  // --------------------------------------------------------

  display.print("STATUS: ");

  display.println(
    distanceStatus
  );

  // --------------------------------------------------------
  // SEND TO OLED
  // --------------------------------------------------------

  display.display();
}

// ==========================================================
//                    SERIAL TELEMETRY
// ==========================================================

void printTelemetry() {

  Serial.println();
  Serial.println("================================");

  Serial.print("Vehicle       : ");
  Serial.println(VEHICLE_ID);

  Serial.print("Zone          : ");
  Serial.println(ZONE_ID);

  Serial.print("Temperature   : ");
  Serial.print(temperature, 1);
  Serial.println(" C");

  Serial.print("Humidity      : ");
  Serial.print(humidity, 1);
  Serial.println(" %");

  Serial.print("Light         : ");
  Serial.print(lux, 1);
  Serial.println(" lux");

  Serial.print("Distance      : ");

  if (distanceMM >= 9999) {

    Serial.println("OUT OF RANGE");
  }

  else {

    Serial.print(distanceMM);
    Serial.println(" mm");
  }

  Serial.print("Object        : ");

  if (objectDetected) {

    Serial.println("DETECTED");
  }

  else {

    Serial.println("CLEAR");
  }

  Serial.print("Fog Status    : ");
  Serial.println(fogStatus);

  Serial.print("Safety Status : ");
  Serial.println(distanceStatus);

  Serial.println("================================");

  // ========================================================
  // JSON OUTPUT
  // ========================================================

  String json = "{";

  json += "\"vehicle_id\":\"";
  json += VEHICLE_ID;
  json += "\"";

  json += ",\"zone\":\"";
  json += ZONE_ID;
  json += "\"";

  json += ",\"temperature\":";
  json += String(
    temperature,
    1
  );

  json += ",\"humidity\":";
  json += String(
    humidity,
    1
  );

  json += ",\"ambient_light\":";
  json += String(
    lux,
    1
  );

  json += ",\"distance_mm\":";

  if (distanceMM >= 9999) {

    json += "null";
  }

  else {

    json += String(distanceMM);
  }

  json += ",\"object_detected\":";

  json += (
    objectDetected
    ? "true"
    : "false"
  );

  json += ",\"obstacle_detected\":";

  json += (
    distanceStatus != "SAFE"
    ? "true"
    : "false"
  );

  json += ",\"fog_status\":\"";
  json += fogStatus;
  json += "\"";

  json += ",\"status\":\"";
  json += distanceStatus;
  json += "\"";

  json += "}";

  Serial.println(json);
}