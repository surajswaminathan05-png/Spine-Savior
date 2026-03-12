#include <ArduinoBLE.h>
#include <Wire.h>
#include <Adafruit_BNO055.h>
#include <Adafruit_Sensor.h>

// ── Hardware ──
#define MOTOR_PIN 5

// ── BLE UUIDs ──
BLEService spineService("19b10000-e8f2-537e-4f6c-d104768a1214");
BLECharacteristic spineChar(
    "19b10001-e8f2-537e-4f6c-d104768a1214",
    BLERead | BLENotify,
    36  // 9 floats × 4 bytes
);

// Haptic control — browser writes 0-255 intensity
BLEByteCharacteristic hapticChar(
    "19b10002-e8f2-537e-4f6c-d104768a1214",
    BLEWrite | BLEWriteWithoutResponse
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

    // Haptic motor output
    pinMode(MOTOR_PIN, OUTPUT);
    analogWrite(MOTOR_PIN, 0);  // motor OFF at boot

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
    spineService.addCharacteristic(hapticChar);
    BLE.addService(spineService);
    BLE.advertise();
    Serial.println("BLE advertising as 'SpineSavior'...");
}

void loop() {
    BLEDevice central = BLE.central();
    if (central) {
        Serial.print("Connected: "); Serial.println(central.address());
        while (central.connected()) {
            // Check for haptic command from browser
            if (hapticChar.written()) {
                uint8_t intensity = hapticChar.value();
                analogWrite(MOTOR_PIN, intensity);
                Serial.print("Haptic: "); Serial.println(intensity);
            }

            float h, p, r;
            readSensor(PORT_THORACIC, h, p, r);
            payload.thoracicH = h; payload.thoracicP = p; payload.thoracicR = r;

            readSensor(PORT_LUMBAR, h, p, r);
            payload.lumbarH = h; payload.lumbarP = p; payload.lumbarR = r;

            readSensor(PORT_CERVICAL, h, p, r);
            payload.cervicalH = h; payload.cervicalP = p; payload.cervicalR = r;

            spineChar.writeValue((byte*)&payload, sizeof(payload));
            delay(16);  // ~60 Hz
        }
        analogWrite(MOTOR_PIN, 0);  // safety: motor off on disconnect
        Serial.println("Disconnected.");
    }
}
