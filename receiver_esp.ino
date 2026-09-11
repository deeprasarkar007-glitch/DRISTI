#include <WiFi.h>
#include <esp_now.h>

// =====================================================
// SAME DATA STRUCTURE AS SENDER
// =====================================================

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

SensorPacket receivedData;

// =====================================================
// RSSI PROXIMITY
//
// CLOSE RANGE BARANO HOYECHE
// =====================================================

String getProximity(int rssi) {

  // TABLE ER EKDOM KACHE
  if (rssi >= -65) {

    return "VERY CLOSE";
  }

  // CLOSE RANGE BESH BARIYE DILAM
  else if (rssi >= -78) {

    return "CLOSE";
  }

  // MEDIUM
  else if (rssi >= -88) {

    return "MEDIUM";
  }

  // FAR
  else if (rssi >= -96) {

    return "FAR";
  }

  // MORE FAR
  else {

    return "VERY FAR";
  }
}

// =====================================================
// RECEIVE CALLBACK
// =====================================================

void onDataRecv(
  const esp_now_recv_info_t *recvInfo,
  const uint8_t *incomingData,
  int len
) {

  if (len != sizeof(SensorPacket)) {

    Serial.print("INVALID PACKET SIZE: ");
    Serial.println(len);

    return;
  }

  memcpy(
    &receivedData,
    incomingData,
    sizeof(receivedData)
  );

  // GET RSSI
  int rssi = recvInfo->rx_ctrl->rssi;

  // GET PROXIMITY
  String proximity = getProximity(rssi);

  // =================================================
  // DISPLAY DATA
  // =================================================

  Serial.println();

  Serial.println("========================================");
  Serial.println("         DRISHTI RECEIVED DATA");
  Serial.println("========================================");

  Serial.print("Vehicle ID      : ");
  Serial.println(receivedData.vehicleID);

  Serial.print("Zone            : ");
  Serial.println(receivedData.zone);

  Serial.print("Packet Number   : ");
  Serial.println(receivedData.packetNumber);

  Serial.println("----------------------------------------");

  Serial.print("Temperature     : ");
  Serial.print(receivedData.temperature);
  Serial.println(" C");

  Serial.print("Humidity        : ");
  Serial.print(receivedData.humidity);
  Serial.println(" %");

  Serial.print("Light           : ");
  Serial.print(receivedData.lux);
  Serial.println(" Lux");

  Serial.print("Distance Sensor : ");

  if (receivedData.distanceMM >= 9999) {

    Serial.println("NO DATA");

  } else {

    Serial.print(receivedData.distanceMM);
    Serial.println(" mm");
  }

  Serial.print("IR Object       : ");

  if (receivedData.objectDetected) {

    Serial.println("DETECTED");

  } else {

    Serial.println("CLEAR");
  }

  Serial.print("Obstacle        : ");

  if (receivedData.obstacleDetected) {

    Serial.println("YES");

  } else {

    Serial.println("NO");
  }

  Serial.print("Fog Status      : ");
  Serial.println(receivedData.fogStatus);

  Serial.print("Safety Status   : ");
  Serial.println(receivedData.safetyStatus);

  Serial.println("----------------------------------------");

  // RSSI
  Serial.print("RSSI            : ");
  Serial.print(rssi);
  Serial.println(" dBm");

  // PROXIMITY
  Serial.print("PROXIMITY       : ");
  Serial.println(proximity);

  Serial.println("========================================");

  // =================================================
  // DASHBOARD JSON
  // =================================================

  Serial.print("{");

  Serial.print("\"vehicle_id\":\"");
  Serial.print(receivedData.vehicleID);
  Serial.print("\",");

  Serial.print("\"zone\":\"");
  Serial.print(receivedData.zone);
  Serial.print("\",");

  Serial.print("\"packet\":");
  Serial.print(receivedData.packetNumber);
  Serial.print(",");

  Serial.print("\"temperature\":");
  Serial.print(receivedData.temperature);
  Serial.print(",");

  Serial.print("\"humidity\":");
  Serial.print(receivedData.humidity);
  Serial.print(",");

  Serial.print("\"ambient_light\":");
  Serial.print(receivedData.lux);
  Serial.print(",");

  Serial.print("\"distance_mm\":");
  Serial.print(receivedData.distanceMM);
  Serial.print(",");

  Serial.print("\"object_detected\":");
  Serial.print(
    receivedData.objectDetected ?
    "true" : "false"
  );
  Serial.print(",");

  Serial.print("\"obstacle_detected\":");
  Serial.print(
    receivedData.obstacleDetected ?
    "true" : "false"
  );
  Serial.print(",");

  Serial.print("\"fog_status\":\"");
  Serial.print(receivedData.fogStatus);
  Serial.print("\",");

  Serial.print("\"safety_status\":\"");
  Serial.print(receivedData.safetyStatus);
  Serial.print("\",");

  Serial.print("\"rssi\":");
  Serial.print(rssi);
  Serial.print(",");

  Serial.print("\"proximity\":\"");
  Serial.print(proximity);
  Serial.print("\"");

  Serial.println("}");
}

// =====================================================
// SETUP
// =====================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("========================================");
  Serial.println("       DRISHTI ESP-NOW RECEIVER");
  Serial.println("========================================");

  WiFi.mode(WIFI_STA);

  delay(500);

  Serial.print("Receiver MAC: ");
  Serial.println(WiFi.macAddress());

  // ESP-NOW INIT

  if (esp_now_init() != ESP_OK) {

    Serial.println("ESP-NOW INIT FAILED!");

    return;
  }

  Serial.println("ESP-NOW INIT SUCCESS");

  // REGISTER CALLBACK

  esp_now_register_recv_cb(onDataRecv);

  Serial.println("RECEIVER READY!");
}

// =====================================================
// LOOP
// =====================================================

void loop() {

  // ALL DATA RECEIVED
  // AUTOMATICALLY VIA CALLBACK
}