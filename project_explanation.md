# Spine Savior: Comprehensive Project Architecture

Spine Savior is a wearable biofeedback system that helps users correct their posture in real-time. It uses physical sensors attached to the user's back to instantly render a physiologically accurate 3D model of their spine on a screen. If the user slouches or tilts, the system detects it using Machine Learning and an AI coach provides friendly verbal corrections. 

Below is an explicit breakdown of the hardware, software, mathematics, and artificial intelligence powering the project.

---

## 1. The Hardware Infrastructure
We built a custom physical sensor harness that tracks the exact orientation of the user's upper body.

*   **Sensors:** We use three **BNO055 9-DOF IMUs** (Inertial Measurement Units). These are smart accelerometer/gyroscope/magnetometer chips that calculate their absolute orientation in 3D space.
*   **Placement:** The sensors correspond to the three main anatomical regions of the human spine: **Cervical** (neck), **Thoracic** (mid-back), and **Lumbar** (lower back).
*   **Multiplexer:** A **TCA9548A I2C Multiplexer** acts as a traffic controller, allowing the three identical BNO055 sensors to communicate over a single data line.
*   **Microcontroller:** An **ESP32** or **Arduino** acts as the system's brain, collecting the Euler angles (pitch, roll, heading) from all three sensors and instantaneously streaming them over a USB cable.

## 2. The Software & 3D Visualization
The frontend is a lightweight, blazing-fast web application that runs directly in your browser without requiring bulky software installation.

*   **Web Serial API:** The browser securely connects directly to the USB hardware. No background servers are required; everything happens locally.
*   **Graphics Engine:** **Three.js** is used to render a high-quality, anatomically accurate 3D model of a human spine (.GLB format) on a dark, studio-lit web canvas.
*   **Vanilla Web Tech:** The interface is built entirely with plain **HTML, CSS, and JavaScript**.

## 3. Mathematics & Biomechanical Physics
Translating the movement of just 3 discrete sensors into a fluid, 24-bone spine requires advanced mathematics to prevent unnatural, robotic movements.

*   **PubMed Biomechanical Constraints:** The bones in your neck can twist much further than the bones in your lower back. We hardcoded actual medical Range of Motion (ROM) limits derived from clinical research papers. The software physically prevents the 3D model from bending in ways a human spine biologically cannot.
*   **Gaussian Falloff Blending:** When the neck sensor tilts, the upper neck vertebrae tilt the most, but the movement mathematically "falls off" or fades as it travels down the upper back. This creates a smooth, naturally distributed curve rather than a jagged right-angle bend.
*   **Critically Damped Spring Physics:** Raw sensor data is naturally jittery. We pass the data through a mathematical spring-damper algorithm. It acts like the suspension on a car, absorbing the sudden twitches and making the 3D spine move fluidly and heavily, like real bones and muscle.

## 4. Machine Learning (ML) Posture Classification
We use Machine Learning to figure out if you're slouching, leaning, or sitting normally. 

*   **TensorFlow.js:** We use Google's machine learning library designed specifically for out-of-the-box browser use. The data never leaves the user's computer, ensuring total privacy.
*   **Model Architecture:** We built a **1D-CNN (1-Dimensional Convolutional Neural Network)**. Instead of looking at a single instant or "snapshot" of your posture, our model looks at a 1-second "sliding window" of data (60 frames of pitch, roll, and heading from the sensors). A 1D-CNN is perfect for analyzing continuous time-based signals because it learns the "shape" of your movement, ignoring brief twitches.
*   **Guided Training Wizard:** The software securely guides the user to sit in 5 distinct postures (*Normal, Forward Head, Slouching, Lordosis, Lateral Tilt*). It records a custom dataset of their specific body, compiles the neural network, and trains a highly personalized posture classifier in just a few seconds.

## 5. Artificial Intelligence (AI) Coaching
When the Machine Learning model identifies bad posture, an AI generates a customized, supportive coaching tip.

*   **Google Gemini Nano:** We utilize Google Chrome's built-in "on-device" Large Language Model. Like the ML classifier, it runs locally on the computer's CPU/GPU, requiring no internet connection or cloud processing.
*   **Prompt Engineering Strategy:** Once the ML system categorizes the posture (e.g., *"Forward Head"*), we feed that label—along with the exact, real-time degrees of tilt in the user's upper and lower back—directly into Gemini Nano. We instruct it to act as an encouraging, non-medical coach.
*   **The Result:** The system dynamically generates an actionable 1-sentence tip (e.g., *"Your head is drifting slightly forward; imagine a string pulling the crown of your head upward."*) instead of repeating identical, pre-written canned messages. If Gemini Nano is unavailable on the user's machine, the system seamlessly falls back to a curated expert rule-based system.
