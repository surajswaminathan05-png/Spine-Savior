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
    48  // 12 floats × 4 bytes (quaternion: w,x,y,z × 3 sensors)
);

// Haptic control — browser writes 0-255 intensity
BLEByteCharacteristic hapticChar(
    "19b10002-e8f2-537e-4f6c-d104768a1214",
    BLEWrite | BLEWriteWithoutResponse
);

// ── Packed payload (exactly 48 bytes) ──
// Quaternion output: avoids gimbal lock at ±90° pitch (lying down)
struct __attribute__((packed)) SensorPayload {
    float thoracicW, thoracicX, thoracicY, thoracicZ;  // bytes  0–15
    float lumbarW,   lumbarX,   lumbarY,   lumbarZ;     // bytes 16–31
    float cervicalW, cervicalX, cervicalY, cervicalZ;   // bytes 32–47
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

// Port mapping (matches existing app.js):
const uint8_t PORT_THORACIC = 0;
const uint8_t PORT_LUMBAR   = 2;
const uint8_t PORT_CERVICAL = 3;

// Read quaternion directly from BNO055 fusion output
// Returns unit quaternion (w,x,y,z) — singularity-free
void readSensor(uint8_t port, float &w, float &x, float &y, float &z) {
    tcaSelect(port);
    imu::Quaternion q = bno.getQuat();
    w = q.w(); x = q.x(); y = q.y(); z = q.z();
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

            float w, x, y, z;
            readSensor(PORT_THORACIC, w, x, y, z);
            payload.thoracicW = w; payload.thoracicX = x;
            payload.thoracicY = y; payload.thoracicZ = z;

            readSensor(PORT_LUMBAR, w, x, y, z);
            payload.lumbarW = w; payload.lumbarX = x;
            payload.lumbarY = y; payload.lumbarZ = z;

            readSensor(PORT_CERVICAL, w, x, y, z);
            payload.cervicalW = w; payload.cervicalX = x;
            payload.cervicalY = y; payload.cervicalZ = z;

            spineChar.writeValue((byte*)&payload, sizeof(payload));
            delay(16);  // ~60 Hz
        }
        analogWrite(MOTOR_PIN, 0);  // safety: motor off on disconnect
        Serial.println("Disconnected.");
    }
}
