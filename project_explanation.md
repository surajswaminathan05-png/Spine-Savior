# Spine Savior: A Wearable Multi-Sensor Biofeedback System for Real-Time Spinal Posture Monitoring, On-Device Machine Learning Classification, and Haptic Corrective Feedback

---

## Abstract

**Spine Savior** is an integrated wearable biofeedback device that continuously monitors the orientation of the human vertebral column across three anatomical spinal regions—cervical (C1–C7), thoracic (T1–T12), and lumbar (L1–L5)—using an array of three 9-degree-of-freedom (9-DOF) inertial measurement unit (IMU) sensors. Sensor fusion data is transmitted wirelessly via Bluetooth Low Energy (BLE) to a real-time browser-based application, which renders a physiologically accurate, biomechanically constrained 3D model of the spine, classifies postural deviations using an on-device 1-Dimensional Convolutional Neural Network (1D-CNN) trained via TensorFlow.js, delivers dynamic coaching through Google Gemini Nano (a local large language model), and activates dual haptic vibration motors mounted on the user's body to deliver immediate tactile corrective alerts when poor posture is detected. The entire system—from sensor to feedback—operates without any cloud dependency, ensuring complete user data privacy.

---

## 1. Problem Statement & Motivation

Poor posture is one of the most prevalent ergonomic health risks in modern society. The American Chiropractic Association estimates that approximately 80% of the population will experience back pain at some point in their lives, much of it attributable to sustained postural misalignment. Forward head posture (anterior head carriage), thoracic kyphosis (slouching), excessive lumbar lordosis, and lateral spinal tilt are the primary pathological deviations. Existing commercial solutions either use simple single-axis tilt sensors (e.g., Upright Go) or camera-based estimation (e.g., smartphone apps), which lack the multi-regional anatomical precision required for clinically meaningful posture assessment.

**Spine Savior** addresses this gap by deploying a distributed sensor array that maps the orientation of all three major spinal regions independently, applies clinically-sourced biomechanical range-of-motion (ROM) constraints, and provides multimodal corrective feedback through visual, auditory/textual, and now haptic (tactile vibration) channels.

---

## 2. Hardware Architecture

### 2.1 Sensor Array: Three BNO055 9-DOF Absolute Orientation IMUs

The backbone of the sensing system is three **Bosch BNO055** inertial measurement units, each containing three independent sensor elements:

- **Triaxial accelerometer** (±2g/±4g/±8g/±16g range): measures linear acceleration and the static gravitational vector to determine tilt relative to the earth's surface.
- **Triaxial gyroscope** (up to ±2000°/s): measures angular velocity for tracking rapid rotational movements.
- **Triaxial magnetometer** (±1300 µT / ±2500 µT Z-axis): measures the earth's magnetic field for absolute heading reference.

What distinguishes the BNO055 from cheaper IMUs (e.g., MPU-6050) is its onboard **ARM Cortex-M0+ microprocessor** running a proprietary sensor fusion algorithm. This algorithm combines the raw 9-axis data using an extended Kalman filter to output pre-computed **Euler angles** (heading, pitch, roll) with absolute orientation in 3D space, eliminating the need for external sensor fusion software and mitigating gyroscope drift over time.

**Placement on the body:**
| Sensor | Anatomical Region | Vertebrae Monitored | Multiplexer Port |
|--------|-------------------|---------------------|------------------|
| Sensor 1 | **Cervical** (Neck) | C1–C7 | Port 3 |
| Sensor 2 | **Thoracic** (Upper/Mid-Back) | T1–T12 | Port 0 |
| Sensor 3 | **Lumbar** (Lower Back) | L1–L5 | Port 2 |

Each sensor is housed in a custom 3D-printed ABS/PLA snap-fit enclosure (designed in OpenSCAD, exported to STL for slicing) and attached to the user's back via an adjustable elastic strap harness.

### 2.2 I²C Multiplexer: TCA9548A

All three BNO055 sensors share the same factory-default I²C address (`0x28`). Because the I²C protocol identifies devices by address, placing three identically-addressed devices on the same bus would cause an address collision. The **Texas Instruments TCA9548A** 8-channel I²C multiplexer resolves this: it sits at address `0x70` and acts as a channel switch, electrically connecting the microcontroller's I²C bus to only one downstream channel at a time. The firmware cycles through three channels (ports 0, 2, and 3) in rapid succession, reading all three sensors sequentially within each polling cycle.

### 2.3 Microcontroller: Arduino Nano 33 BLE

The **Arduino Nano 33 BLE** is the system's embedded controller. It is built around the **Nordic Semiconductor nRF52840** system-on-chip (SoC), which contains:

- An **ARM Cortex-M4F** processor at 64 MHz (with hardware floating-point unit for fast Euler angle processing).
- An integrated **Bluetooth Low Energy 5.0** radio (2.4 GHz ISM band), enabling direct wireless communication with any BLE-capable host without an external Bluetooth module.
- 256 KB RAM and 1 MB flash memory.

**Firmware operation (`SpineSaviorBLE.ino`):**

1. **Initialization:** The firmware initializes the I²C bus (`Wire.begin()`), configures each BNO055 via the TCA9548A multiplexer (calling `tcaSelect(port)` then `bno.begin()` for ports 0, 2, and 3), and enables the external 32.768 kHz crystal oscillator on each sensor for higher accuracy fusion.
2. **BLE service registration:** A custom BLE GATT (Generic Attribute Profile) service is registered with a 128-bit UUID (`19b10000-e8f2-537e-4f6c-d104768a1214`). A single BLE characteristic within this service is configured as `BLERead | BLENotify` with a 36-byte payload (9 floats × 4 bytes each).
3. **Main loop (60 Hz polling):** Upon a BLE central device (the browser) connecting, the firmware enters a tight polling loop:
   - For each of the three sensors, it calls `tcaSelect()` then `bno.getEvent()` to retrieve the latest Euler angles (heading, pitch, roll).
   - The nine float values are packed into a C struct with `__attribute__((packed))` to prevent compiler-inserted padding, ensuring an exact 36-byte binary payload.
   - The payload is written to the BLE characteristic via `spineChar.writeValue()`.
   - A 16 ms delay enforces an approximately **60 Hz** data rate.

4. **BLE advertising:** The device advertises as `"SpineSavior"` and is discoverable by any compatible BLE scanner or browser supporting the Web Bluetooth API.

### 2.4 Haptic Feedback Actuators: Dual DC Vibration Motors

Two **10 mm × 3 mm flat coin-type DC vibration motors** (ERM — Eccentric Rotating Mass motors) are integrated into the wearable harness. These motors operate at **3V DC** and spin an off-center mass at approximately **12,000 RPM**, generating a perceptible tactile vibration (similar to a smartphone vibration alert).

**Placement and function:**
- The two motors are positioned on the user's body at locations corresponding to the cervical and lumbar regions.
- When the machine learning classifier detects any postural deviation (forward head, slouching, lordosis, or lateral tilt), the system signals the Arduino to activate the corresponding vibration motor(s), providing an immediate **somatosensory cue** to the user.
- This haptic modality is critical because it allows posture correction even when the user is not looking at the screen—during studying, reading, or working—delivering a tactile "nudge" that operates below conscious awareness threshold yet triggers corrective postural adjustment.

**Specifications:**
| Parameter | Value |
|-----------|-------|
| Motor type | Flat coin ERM (Eccentric Rotating Mass) |
| Dimensions | 10 mm diameter × 3 mm height |
| Operating voltage | 3V DC |
| Rotational speed | ~12,000 RPM |
| Material | Stainless steel housing |
| Drive method | GPIO pin → NPN transistor (e.g., 2N2222) → motor (with flyback diode) |

### 2.5 3D-Printed Enclosures

All electronic modules are housed in custom-designed **snap-fit enclosures** modeled in **OpenSCAD** (a parametric, script-based CAD tool) and exported as `.stl` files for 3D printing via FDM (Fused Deposition Modeling):

- **Central hub enclosure** (3.5" × 2.0" × 0.5"): Houses the Arduino Nano 33 BLE, TCA9548A multiplexer, and battery.
- **Sensor enclosures** (1.4"–2.0" × 1.5" × 0.5"): Individual housings for each BNO055 sensor module with rounded corners and snap-fit lids for tool-free access.

### 2.6 Power Supply

The entire wearable system is powered by a **3.7V lithium-polymer (LiPo) battery** connected to the Arduino Nano 33 BLE's VIN pin, providing portable operation. The BNO055 sensors draw approximately 12 mA each (36 mA total), the Arduino draws ~50 mA, and the vibration motors draw ~80 mA each when active, yielding a total peak system current of approximately **250 mA** (with both motors running), enabling several hours of continuous use on a standard 500–1000 mAh cell.

---

## 3. Communication Protocol: Bluetooth Low Energy (BLE)

The wireless link between the wearable hardware and the software application uses **Bluetooth Low Energy 5.0** (also known as Bluetooth Smart), a low-power wireless protocol optimized for intermittent, small-packet data transfer:

- **Physical layer:** 2.4 GHz ISM band, 1 Mbps data rate (BLE 5.0 also supports 2 Mbps LE 2M PHY).
- **Protocol stack:** GATT (Generic Attribute Profile) over ATT (Attribute Protocol) over L2CAP.
- **Connection interval:** Negotiated between central (browser) and peripheral (Arduino); the firmware writes data every 16 ms.
- **Payload:** A single 36-byte binary blob containing 9 IEEE 754 single-precision floating-point values (little-endian byte order, matching ARM Cortex-M4 native format).

On the software side, the **Web Bluetooth API** (supported in Chromium-based browsers: Chrome 89+, Edge) enables the web application to directly discover, connect to, and subscribe to BLE GATT notifications from the Arduino—entirely in JavaScript, with no native drivers, platform SDKs, or server middleware required.

---

## 4. Software Architecture

The entire front-end application is a **single-page web application (SPA)** built with vanilla HTML5, CSS3, and ES6+ JavaScript modules. There is no build system, no npm dependencies, and no server-side logic. The application loads instantly from a static file server.

### 4.1 Real-Time 3D Spinal Visualization (Three.js)

The application renders a high-fidelity, anatomically accurate 3D model of the human vertebral column using **Three.js** (r160), a WebGL-based 3D graphics library.

**Model:** A GLB (Binary glTF) format 3D mesh of a human spine, sourced from anatomical repositories, containing individually segmented meshes for:
- 5 lumbar vertebrae (L1–L5)
- 12 thoracic vertebrae (T1–T12)
- 7 cervical vertebrae (C1–C7)
- Intervertebral discs (cosmetic, non-articulating)
- Sacrum (fixed, non-movable)

**Integration pipeline:**
1. The GLB is parsed by `GLTFLoader`. Each mesh is identified, and its world-space bounding box center is computed.
2. Meshes are sorted by vertical Y-position (inferior → superior).
3. Intervertebral discs (identified by material `lambert3`) are separated from vertebral bodies; the sacrum (`lambert2`) is excluded from articulation.
4. Each movable vertebra is wrapped in a `THREE.Group` pivot node positioned at the mesh's centroid, enabling rotation about its anatomical center of rotation.

**Rendering features:**
- ACES Filmic tone mapping for cinematic lighting.
- Three-point studio lighting (key, fill, rim) with PCF soft shadow mapping (1024×1024 shadow map).
- Hemisphere light for ambient environmental fill.
- OrbitControls for interactive camera orbit, pan, and zoom.
- 60 FPS render loop via `requestAnimationFrame`.

### 4.2 Biomechanical Motion Model

Translating three discrete sensor readings into fluid, biologically plausible motion across 24 individually articulating vertebrae requires three layers of biomechanical computation:

#### 4.2.1 Gaussian Falloff Blending

Each sensor's influence on nearby vertebrae is distributed using a **Gaussian (normal distribution) weighting function**:

$$w_i = \exp\left(-\frac{(i - s)^2}{2\sigma^2}\right)$$

Where:
- $i$ = global index of the vertebra (0 = L1, ascending to C7)
- $s$ = global index of the sensor's anatomical position (lumbar = 2, thoracic = 12, cervical = 20)
- $\sigma$ = 4.0 (the blend width parameter, empirically tuned)

This creates a smooth bell-shaped influence curve: vertebrae directly at the sensor position receive full weight, while distant vertebrae receive exponentially decaying influence. The total contribution from all three sensors is normalized to sum to 1.0, preventing double-counting.

#### 4.2.2 Per-Vertebra Flexibility Weighting

Not all vertebrae in a spinal region contribute equally to regional motion. The weights are derived from **PubMed-published in-vivo segmental range-of-motion studies**:

- **Lumbar:** L4-L5 and L5-S1 contribute the most flexion/extension (24% each); L1-L2 the least (16%).
- **Thoracic:** Motion is relatively evenly distributed (6–10% per level), reflecting rib cage constraint.
- **Cervical:** C1-C2 (the atlas-axis joint) accounts for the majority of axial rotation (25% each), while lower cervical segments (C3–C7) contribute more evenly.

Each sensor's contribution is scaled by the target vertebra's flexibility weight and the number of vertebrae in its region, accurately simulating how spinal motion is distributed in real human anatomy.

#### 4.2.3 Range-of-Motion (ROM) Clamping

Every intervertebral joint has hard anatomical limits on how far it can move, which vary dramatically by region and axis:

| Level | Flexion/Extension | Lateral Bending | Axial Rotation |
|-------|-------------------|-----------------|----------------|
| C1-C2 | 15.0° | 8.0° | **40.0°** |
| T6-T7 | 2.5° | 3.5° | 4.0° |
| L4-L5 | **14.3°** | 8.8° | 2.1° |

Note the extreme differences: the atlas-axis joint (C1-C2) permits 40° of axial rotation (enabling you to turn your head), while lumbar vertebrae allow only ~2° of rotation (your lower back barely twists). These limits are sourced from clinically published segmental ROM data. The software clamps all computed rotations to these limits using `THREE.MathUtils.clamp()`, preventing the 3D model from ever bending in biologically impossible ways.

#### 4.2.4 Critically Damped Spring-Damper Smoothing

Raw IMU data is inherently noisy (sensor jitter, ADC quantization noise, magnetic interference). To produce smooth, natural-looking motion, each vertebra's rotation is filtered through a **critically damped second-order spring-damper system**:

$$a = K \cdot (x_{target} - x_{current}) - D \cdot v$$
$$v_{n+1} = v_n + a \cdot \Delta t$$
$$x_{n+1} = x_n + v_{n+1} \cdot \Delta t$$

Where:
- $K = 150.0$ (spring stiffness constant)
- $D = 2\sqrt{K} \approx 24.5$ (damping coefficient, set to the **critical damping ratio** to prevent oscillation)
- $v$ = angular velocity state
- $\Delta t = 1/60$ s (frame time)

**Critical damping** ($\zeta = 1.0$) is the mathematical sweet spot: the system converges to the target rotation as fast as possible without ever overshooting. This is the same dynamic model used for automotive suspension systems, camera gimbal stabilization, and AAA game character animation. The result is a 3D spine that moves fluidly and heavily, like real tissue and bone, rather than snapping jerkily to each new sensor reading.

### 4.3 Posture Scoring Algorithm

The system continuously computes a **0–100 posture score** based on the aggregate deviation from the calibrated baseline (ideal posture):

1. For each region (cervical, thoracic, lumbar), the absolute difference between the current sensor angles and the calibrated baseline is computed.
2. Each deviation is **normalized by the region's total ROM** (e.g., 64° flex/ext for cervical, 26° for thoracic, 65° for lumbar), converting absolute degrees into a 0.0–1.0 fraction of maximum possible deviation.
3. The six normalized deviations (pitch + roll for each of three regions) are averaged.
4. The score is calculated as: `Score = max(0, round(100 × (1 - 2 × averageDeviation)))`

This ROM-normalized approach ensures that a 10° deviation in the thoracic spine (which has only 26° total ROM) is correctly weighted as more severe than a 10° deviation in the cervical spine (64° total ROM).

### 4.4 Clinical Alert System

The application generates real-time clinical-style alerts using ROM-relative thresholds:
- **Warning level** (⚠️): Deviation exceeds **50% of regional ROM** (e.g., >32° cervical pitch shift).
- **Severe level** (🚨): Deviation exceeds **75% of regional ROM**.

Alert categories include:
- Forward head posture (cervical pitch deviation)
- Head lateral tilt (cervical roll deviation)
- Thoracic slouching (thoracic pitch deviation)
- Lumbar over-flexion (lumbar pitch deviation)
- Lumbar over-rotation (lumbar heading deviation)

---

## 5. Machine Learning: On-Device Posture Classification

### 5.1 Framework: TensorFlow.js

The ML system uses **TensorFlow.js v4.17**, Google's JavaScript implementation of the TensorFlow deep learning framework. All model training and inference execute directly in the browser's main thread via WebGL-accelerated tensor operations. No training data or model weights ever leave the user's device.

### 5.2 Data Collection: Guided Training Wizard

The application includes a guided training wizard that walks the user through recording **five distinct postural classes**:

1. **Normal** — upright, neutral spine alignment
2. **Forward Head** (anterior head carriage) — chin protruding forward of the shoulder line
3. **Slouching** (thoracic kyphosis) — excessive rounding of the upper back
4. **Lordosis** — excessive inward curvature of the lower back
5. **Lateral Tilt** — asymmetric lean to one side

For each posture, the user holds the position for 30–90 seconds. At 60 Hz, this yields **1,800–5,400 frames** per class. Each frame is a 9-dimensional feature vector: `[cervicalH, cervicalP, cervicalR, thoracicH, thoracicP, thoracicR, lumbarH, lumbarP, lumbarR]`.

### 5.3 Preprocessing: Sliding Window Segmentation

Raw frames are segmented into overlapping **sliding windows** of 60 frames (1 second of data at 60 Hz), with a 50% overlap (step = 30 frames). Each window becomes a training sample with shape `[60, 9]` — a 60-timestep sequence of 9-channel sensor data. This temporal context is critical: it allows the model to learn the *temporal dynamics* of each posture, not just static snapshots.

### 5.4 Model Architecture: 1D Convolutional Neural Network (1D-CNN)

The neural network architecture is a **1D-CNN** (1-Dimensional Convolutional Neural Network), specifically designed for time-series classification:

```
Layer (type)                 Output Shape          Parameters
=============================================================
conv1d (Conv1D)              [60, 32]              1,472
  └─ 32 filters, kernel 5, ReLU, "same" padding
maxPooling1d                 [30, 32]              0
conv1d_1 (Conv1D)            [30, 64]              6,208
  └─ 64 filters, kernel 3, ReLU, "same" padding
maxPooling1d_1               [15, 64]              0
flatten                      [960]                 0
dense (Dense)                [64]                  61,504
  └─ ReLU activation
dropout                      [64]                  0
  └─ 30% dropout (regularization)
dense_1 (Dense)              [5]                   325
  └─ Softmax activation (5-class probability)
=============================================================
Total params: ~69,509
```

**Why 1D-CNN?** Unlike fully connected networks (which would treat each timestep independently), convolutional layers slide learned filters across the time axis, detecting local temporal patterns (e.g., the characteristic gradual drift of forward head posture vs. the sudden drop of slouching). Max pooling layers downsample the temporal resolution, creating a hierarchical feature representation. This architecture is standard in inertial sensor-based human activity recognition (HAR) literature.

### 5.5 Training Configuration

- **Optimizer:** Adam (learning rate = 0.001), an adaptive gradient descent algorithm.
- **Loss function:** Categorical cross-entropy (standard for multi-class classification).
- **Epochs:** 20 full passes over the training set.
- **Batch size:** 32 samples per gradient update.
- **Validation split:** 20% of data held out for overfitting detection.
- **Regularization:** 30% Dropout before the final layer to prevent overfitting to the small per-user dataset.
- **Model persistence:** Trained weights are serialized to `localStorage` using TensorFlow.js's built-in model saving, allowing the model to persist across browser sessions.

### 5.6 Live Inference Pipeline

During real-time operation:
1. Every frame, the 9-channel sensor vector is pushed into a rolling buffer of length 60.
2. Every 60 frames (~1 second), the buffer is converted to a `[1, 60, 9]` tensor and passed through `model.predict()`.
3. The softmax output yields a probability distribution over 5 classes. The class with the highest probability is selected as the prediction, along with its confidence score.
4. The predicted label drives both the AI coaching system and the haptic feedback actuators.

---

## 6. Artificial Intelligence: On-Device Coaching via Google Gemini Nano

### 6.1 Google Gemini Nano — Chrome's Built-In LLM

When the ML classifier identifies a postural deviation, the system generates a **personalized, context-aware coaching message** using **Google Gemini Nano**, a compact large language model (LLM) embedded directly in Chrome's rendering engine (via the `window.ai.languageModel` API).

Key characteristics:
- **On-device inference:** All language model computation runs locally on the user's CPU/GPU. No data is sent to any server.
- **System prompt engineering:** The model is initialized with a system prompt: *"You are a brief, friendly posture coach for a student. Always respond with exactly 1-2 sentences of encouraging, actionable advice. Never use medical jargon."*
- **Context injection:** Each prompt includes the specific ML classification label (e.g., `"Forward Head"`) **and** the real-time Euler angle readings (e.g., `"Cervical pitch: 22.4°, Thoracic pitch: -8.1°"`), enabling the LLM to generate dynamically tailored, data-aware responses rather than generic advice.

### 6.2 Expert System Fallback

If Gemini Nano is not available on the user's device (e.g., unsupported browser version, hardware limitations), the system seamlessly falls back to a **deterministic expert rule-based system** containing 15 curated coaching tips (3 per posture class), authored based on physical therapy and ergonomic best practices. The tips rotate cyclically to avoid repetition.

---

## 7. Haptic Feedback Subsystem

### 7.1 Tactile Corrective Alerts

The haptic feedback subsystem represents the system's **somatosensory output modality** — the only feedback channel that does not require the user to be visually attending to any screen.

When the 1D-CNN classifier detects a posture classified as anything other than `"normal"` with sufficiently high confidence:
1. The classification result is sent back to the Arduino via a BLE write characteristic.
2. The Arduino activates one or both of the 3V DC vibration motors using GPIO-driven NPN transistor switching circuits.
3. The motors generate a perceptible, localized vibration at the relevant anatomical region (cervical or lumbar), alerting the user to correct their posture.

### 7.2 Motor Drive Circuit

Each motor is driven through a standard **NPN transistor switching circuit**:
- An Arduino GPIO pin (3.3V logic high) drives the base of an NPN transistor (e.g., 2N2222A) through a 1 kΩ base resistor.
- The transistor's collector is connected to the motor, and the emitter is connected to ground.
- A **flyback diode** (1N4001) is wired reverse-parallel across the motor terminals to suppress back-EMF voltage spikes when the motor is de-energized, protecting the transistor and microcontroller from inductive kickback.
- Motor power is sourced from the 3.3V or VBAT rail of the Arduino.

### 7.3 Haptic Pattern Design

The vibration pattern is designed for maximum perceptibility without being disruptive:
- **Short double-pulse pattern** (200 ms ON, 100 ms OFF, 200 ms ON) for moderate deviations.
- **Continuous vibration** (up to 2 seconds) for severe deviations (>75% ROM threshold).
- **Cooldown period:** A minimum 30-second interval between haptic alerts to prevent habituation (sensory adaptation), where the user's nervous system would begin to ignore a constant stimulus.

---

## 8. 3D-Printed Enclosure Design

All electronics are housed in custom parametric enclosures designed in **OpenSCAD** and printed via FDM:

- **Central Hub** (3.5" × 2.0" × 0.5"): Contains the Arduino Nano 33 BLE, TCA9548A multiplexer, LiPo battery, vibration motor driver circuitry, and wiring harness connectors.
- **Sensor Pods** (two form factors: 1.4" × 1.5" and 2.0" × 1.5", both 0.5" tall): House individual BNO055 breakout boards with routed I²C cable channels.
- **Design features:** Rounded corners (2 mm fillet radius), snap-fit lid closures (no screws required), ventilation slots for passive thermal management, and cable routing channels.

---

## 9. System Integration & Data Flow Summary

```
┌──────────────────────────────────────────────────────────┐
│                    WEARABLE HARDWARE                     │
│                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │ BNO055   │  │ BNO055   │  │ BNO055   │              │
│   │ Cervical │  │ Thoracic │  │ Lumbar   │              │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│        │I²C          │I²C          │I²C                  │
│        └──────┬──────┴──────┬──────┘                     │
│           ┌───┴───┐                                      │
│           │TCA9548A│ (I²C Multiplexer)                   │
│           └───┬───┘                                      │
│               │I²C                                       │
│        ┌──────┴──────┐    ┌───────────┐┌───────────┐     │
│        │ Arduino Nano│    │ Vibration ││ Vibration │     │
│        │   33 BLE    ├───►│ Motor #1  ││ Motor #2  │     │
│        │ (nRF52840)  │    │(Cervical) ││ (Lumbar)  │     │
│        └──────┬──────┘    └───────────┘└───────────┘     │
│               │BLE 5.0 (2.4 GHz wireless)                │
└───────────────┼──────────────────────────────────────────┘
                │  36-byte binary packets @ 60 Hz
                ▼
┌──────────────────────────────────────────────────────────┐
│                  BROWSER APPLICATION                     │
│                                                          │
│   ┌─────────────┐   ┌───────────────────┐                │
│   │ Web         │   │ Three.js Engine   │                │
│   │ Bluetooth   ├──►│ 24-bone spine     │                │
│   │ API         │   │ with ROM + spring │                │
│   └──────┬──────┘   └───────────────────┘                │
│          │                                               │
│   ┌──────┴──────┐   ┌───────────────────┐                │
│   │ TensorFlow. │   │ Gemini Nano       │                │
│   │ js 1D-CNN   ├──►│ AI Coach          │                │
│   │ Classifier  │   │ (on-device LLM)   │                │
│   └─────────────┘   └───────────────────┘                │
│                                                          │
│   Outputs: 3D visualization, posture score (0-100),      │
│   clinical alerts, ML classification, AI coaching tips,  │
│   haptic motor activation commands                       │
└──────────────────────────────────────────────────────────┘
```

---

## 10. Key Technical Innovations

1. **Multi-regional distributed IMU sensing:** Unlike single-sensor commercial devices, Spine Savior independently tracks all three spinal regions, enabling differential diagnosis between cervical, thoracic, and lumbar deviations.

2. **Clinically-sourced biomechanical constraints:** PubMed-published segmental ROM data prevents the 3D model from producing physiologically impossible poses, adding clinical credibility.

3. **Personalized on-device ML:** The 1D-CNN is trained on each individual user's body geometry and postural habits, producing a classifier customized to their unique anatomy rather than a generic population model.

4. **Zero-cloud architecture:** Every computation—BLE communication, 3D rendering, neural network training/inference, LLM coaching, and haptic feedback triggering—executes entirely on the user's local hardware, ensuring complete biometric data privacy under HIPAA-aligned design principles.

5. **Multimodal feedback loop:** The system closes the sensory-motor feedback loop through three parallel channels—visual (3D spine + score + alerts), cognitive (AI coaching text), and somatosensory (haptic vibration)—maximizing the probability of corrective action regardless of the user's attentional state.

---

## 11. Technologies & Tools Summary

| Category | Technology | Role |
|----------|-----------|------|
| IMU Sensors | Bosch BNO055 (×3) | 9-DOF absolute orientation sensing |
| Multiplexer | TI TCA9548A | I²C address conflict resolution |
| Microcontroller | Arduino Nano 33 BLE (nRF52840) | Sensor polling, BLE transmission, motor control |
| Haptic Actuators | 10mm×3mm coin vibration motors (×2) | Tactile posture correction alerts |
| Wireless | Bluetooth Low Energy 5.0 | Wearable ↔ browser communication |
| Browser API | Web Bluetooth API | JavaScript-level BLE access |
| 3D Rendering | Three.js r160 (WebGL) | Real-time spinal visualization |
| 3D Model | GLB (Binary glTF) | Anatomical spine mesh |
| ML Framework | TensorFlow.js v4.17 | 1D-CNN posture classifier |
| AI / LLM | Google Gemini Nano | On-device natural language coaching |
| CAD | OpenSCAD | Parametric enclosure design |
| Fabrication | FDM 3D printing | Custom hardware housings |
| Languages | C++ (Arduino), JavaScript (ES6+), HTML5, CSS3 | Firmware + web application |
