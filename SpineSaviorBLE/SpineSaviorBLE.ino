#include <ArduinoBLE.h>
#include <Wire.h>
#include <Adafruit_BNO055.h>
#include <Adafruit_Sensor.h>

// ── BLE UUIDs ──
BLEService spineService("19b10000-e8f2-537e-4f6c-d104768a1214");
BLECharacteristic spineChar(
    "19b10001-e8f2-537e-4f6c-d104768a1214",
    BLERead | BLENotify,
    36  // 9 floats × 4 bytes
);

// ── Packed payload (exactly 36 bytes) ──
struct __attribute__((packed)) SensorPayload {
    float thoracicH, thoracicP, thoracicR;  // bytes  0–11
    float lumbarH,   lumbarP,   lumbarR;    // bytes 12–23
    float cervicalH, cervicalP, cervicalR;  // bytes 24–35
};
SensorPayload payload;

// ── TCA9548A Multiplexer ──
#define TCAADDR 0x70
void tcaSelect(uint8_t channel) {
    Wire.beginTransmission(TCAADDR);
    Wire.write(1 << channel);
    Wire.endTransmission();
}

// ── BNO055 (shared instance, channel-switched) ──
Adafruit_BNO055 bno = Adafruit_BNO055(55, 0x28);

// Port mapping (matches existing app.js processSerialLine):
const uint8_t PORT_THORACIC = 0;
const uint8_t PORT_LUMBAR   = 2;
const uint8_t PORT_CERVICAL = 3;

void readSensor(uint8_t port, float &h, float &p, float &r) {
    tcaSelect(port);
    sensors_event_t event;
    bno.getEvent(&event);
    h = event.orientation.x;  // heading
    p = event.orientation.y;  // pitch
    r = event.orientation.z;  // roll
}

void setup() {
    Serial.begin(115200);
    Wire.begin();

    // Initialize each BNO055 through the multiplexer
    uint8_t ports[] = {PORT_THORACIC, PORT_LUMBAR, PORT_CERVICAL};
    for (uint8_t p : ports) {
        tcaSelect(p);
        if (!bno.begin()) {
            Serial.print("BNO055 not found on port "); Serial.println(p);
            while (1);
        }
        bno.setExtCrystalUse(true);
    }

    // Initialize BLE
    if (!BLE.begin()) {
        Serial.println("BLE init failed!");
        while (1);
    }
    BLE.setLocalName("SpineSavior");
    BLE.setAdvertisedService(spineService);
    spineService.addCharacteristic(spineChar);
    BLE.addService(spineService);
    BLE.advertise();
    Serial.println("BLE advertising as 'SpineSavior'...");
}

void loop() {
    BLEDevice central = BLE.central();
    if (central) {
        Serial.print("Connected: "); Serial.println(central.address());
        while (central.connected()) {
            readSensor(PORT_THORACIC, payload.thoracicH, payload.thoracicP, payload.thoracicR);
            readSensor(PORT_LUMBAR,   payload.lumbarH,   payload.lumbarP,   payload.lumbarR);
            readSensor(PORT_CERVICAL, payload.cervicalH, payload.cervicalP, payload.cervicalR);

            spineChar.writeValue((byte*)&payload, sizeof(payload));
            delay(16);  // ~60 Hz
        }
        Serial.println("Disconnected.");
    }
}
