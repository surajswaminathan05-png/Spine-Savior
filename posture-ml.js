// ============================================================
//  POSTURE ML — TensorFlow.js Classifier + AI Coach
//  Spine Savior — Alameda County Science & Engineering Fair
// ============================================================

// ============================================================
//  POSTURE LABELS
// ============================================================
export const POSTURE_LABELS = ['normal', 'forward_head', 'slouching', 'lordosis', 'lateral_tilt'];
export const POSTURE_DISPLAY = {
    normal: '✅ Normal',
    forward_head: '🔽 Forward Head',
    slouching: '🔄 Slouching',
    lordosis: '⬆️ Lordosis',
    lateral_tilt: '↔️ Lateral Tilt',
};

// ============================================================
//  POSTURE RECORDER — Captures labeled training data
// ============================================================
export class PostureRecorder {
    constructor() {
        this.frames = [];         // { data: [9 floats], label: string, timestamp: number }
        this.isRecording = false;
    }

    pushFrame(sensorData, label) { return this.addFrame(sensorData, label); }

    addFrame(sensorData, label) {
        if (!label) return;
        this.frames.push({
            data: [
                sensorData.cervical.h, sensorData.cervical.p, sensorData.cervical.r,
                sensorData.thoracic.h, sensorData.thoracic.p, sensorData.thoracic.r,
                sensorData.lumbar.h, sensorData.lumbar.p, sensorData.lumbar.r,
            ],
            label: label,
            timestamp: performance.now(),
        });
    }

    get frameCount() { return this.frames.length; }

    getFrameCountByLabel() {
        const counts = {};
        for (const label of POSTURE_LABELS) counts[label] = 0;
        for (const f of this.frames) counts[f.label] = (counts[f.label] || 0) + 1;
        return counts;
    }

    // Build sliding windows for training: [windowSize, 9] per sample
    buildWindows(windowSize = 60) {
        // Group frames by label for even window creation
        const byLabel = {};
        for (const label of POSTURE_LABELS) byLabel[label] = [];
        for (const f of this.frames) {
            if (byLabel[f.label]) byLabel[f.label].push(f.data);
        }

        const windows = [];
        const labels = [];

        for (const label of POSTURE_LABELS) {
            const frames = byLabel[label];
            if (frames.length < windowSize) continue;
            // Sliding window with step = windowSize/2 for overlap
            const step = Math.max(1, Math.floor(windowSize / 2));
            for (let i = 0; i <= frames.length - windowSize; i += step) {
                windows.push(frames.slice(i, i + windowSize));
                labels.push(POSTURE_LABELS.indexOf(label));
            }
        }

        return { windows, labels };
    }

    exportJSON() {
        const payload = {
            version: 2,
            sensorMode: 'quaternion-derived-euler',
            exportedAt: Date.now(),
            frames: this.frames,
        };
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `posture-data-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    importJSON(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            // Handle both versioned format { version, frames } and legacy array format
            let frames;
            if (parsed.version) {
                if (parsed.version !== 2) {
                    console.warn(`[ML] Data version mismatch: got v${parsed.version}, expected v2. Retrain recommended.`);
                }
                frames = parsed.frames || [];
            } else if (Array.isArray(parsed)) {
                console.warn('[ML] Importing legacy (pre-quaternion) training data. Retrain recommended.');
                frames = parsed;
            } else {
                console.error('[ML] Unrecognized data format');
                return 0;
            }
            this.frames.push(...frames);
            return frames.length;
        } catch (e) {
            console.error('Import failed:', e);
        }
        return 0;
    }

    removeLabel(label) {
        this.frames = this.frames.filter(f => f.label !== label);
    }

    clear() { this.frames = []; }
}


// ============================================================
//  POSTURE CLASSIFIER — 1D-CNN via TensorFlow.js
// ============================================================
export class PostureClassifier {
    constructor() {
        this.model = null;
        this.isReady = false;
        this.isTraining = false;
        this.windowSize = 60;  // 1 second at 60fps
        this.buffer = [];      // rolling buffer for live inference
        this.modelKey = 'localstorage://posture-model-v2'; // v2: quaternion-derived Euler
    }

    // Try to load a previously trained model from localStorage
    async loadSaved() {
        try {
            this.model = await tf.loadLayersModel(this.modelKey);
            this.isReady = true;
            console.log('[ML] Loaded saved model from localStorage');
            return true;
        } catch (e) {
            console.log('[ML] No saved model found');
            return false;
        }
    }

    // Build the 1D-CNN architecture
    buildModel() {
        const model = tf.sequential();

        model.add(tf.layers.conv1d({
            inputShape: [this.windowSize, 9],
            filters: 32,
            kernelSize: 5,
            activation: 'relu',
            padding: 'same',
        }));
        model.add(tf.layers.maxPooling1d({ poolSize: 2 }));

        model.add(tf.layers.conv1d({
            filters: 64,
            kernelSize: 3,
            activation: 'relu',
            padding: 'same',
        }));
        model.add(tf.layers.maxPooling1d({ poolSize: 2 }));

        model.add(tf.layers.flatten());
        model.add(tf.layers.dense({ units: 64, activation: 'relu' }));
        model.add(tf.layers.dropout({ rate: 0.3 }));
        model.add(tf.layers.dense({ units: POSTURE_LABELS.length, activation: 'softmax' }));

        model.compile({
            optimizer: tf.train.adam(0.001),
            loss: 'categoricalCrossentropy',
            metrics: ['accuracy'],
        });

        return model;
    }

    // Train on recorded data
    async train(recorder, onProgress) {
        if (this.isTraining) return { success: false, error: 'Already training' };
        this.isTraining = true;

        try {
            const { windows, labels } = recorder.buildWindows(this.windowSize);

            if (windows.length < 20) {
                this.isTraining = false;
                return { success: false, error: `Not enough data: ${windows.length} windows (need ≥20). Record more posture samples.` };
            }

            // Check we have at least 2 classes represented
            const uniqueLabels = new Set(labels);
            if (uniqueLabels.size < 2) {
                this.isTraining = false;
                return { success: false, error: `Only ${uniqueLabels.size} posture class recorded. Need at least 2 different postures.` };
            }

            // Build fresh model
            this.model = this.buildModel();

            // Create tensors
            const xs = tf.tensor3d(windows); // [numSamples, windowSize, 9]
            const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), POSTURE_LABELS.length);

            // Shuffle and train
            const history = await this.model.fit(xs, ys, {
                epochs: 20,
                batchSize: 32,
                validationSplit: 0.2,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch, logs) => {
                        if (onProgress) onProgress(epoch + 1, 20, logs);
                    }
                }
            });

            // Save to localStorage
            await this.model.save(this.modelKey);
            this.isReady = true;

            // Clean up tensors
            xs.dispose();
            ys.dispose();

            const finalAcc = history.history.acc[history.history.acc.length - 1];
            const finalLoss = history.history.loss[history.history.loss.length - 1];

            this.isTraining = false;
            return {
                success: true,
                accuracy: Math.round(finalAcc * 100),
                loss: finalLoss.toFixed(4),
                samples: windows.length,
                classes: uniqueLabels.size,
            };
        } catch (e) {
            this.isTraining = false;
            return { success: false, error: e.message };
        }
    }

    // Feed a single frame into the rolling buffer, classify when buffer is full
    pushFrame(sensorData) {
        this.buffer.push([
            sensorData.cervical.h, sensorData.cervical.p, sensorData.cervical.r,
            sensorData.thoracic.h, sensorData.thoracic.p, sensorData.thoracic.r,
            sensorData.lumbar.h, sensorData.lumbar.p, sensorData.lumbar.r,
        ]);
        // Keep buffer at windowSize
        if (this.buffer.length > this.windowSize) {
            this.buffer.shift();
        }
    }

    // Run inference on the current buffer
    async classify() {
        if (!this.isReady || !this.model || this.buffer.length < this.windowSize) {
            return null;
        }

        const input = tf.tensor3d([this.buffer]); // [1, windowSize, 9]
        const prediction = this.model.predict(input);
        const probabilities = await prediction.data();
        input.dispose();
        prediction.dispose();

        const maxIdx = probabilities.indexOf(Math.max(...probabilities));

        return {
            label: POSTURE_LABELS[maxIdx],
            display: POSTURE_DISPLAY[POSTURE_LABELS[maxIdx]],
            confidence: probabilities[maxIdx],
            probabilities: Object.fromEntries(
                POSTURE_LABELS.map((l, i) => [l, probabilities[i]])
            ),
        };
    }
}


// ============================================================
//  POSTURE COACH — Gemini Nano + Expert System Fallback
// ============================================================
const COACHING_TIPS = {
    normal: [
        "Great posture! Keep it up 💪",
        "Your spine alignment looks excellent — stay tall!",
        "Perfect form. This is your healthy baseline.",
    ],
    forward_head: [
        "Try tucking your chin slightly — imagine a string pulling the top of your head up.",
        "Your head is drifting forward. Roll your shoulders back and lift your chest.",
        "Forward head posture detected. Gently pull your chin back toward your spine.",
    ],
    slouching: [
        "You're rounding your upper back. Try squeezing your shoulder blades together.",
        "Sit tall! Imagine your spine is a stack of coins — keep them balanced.",
        "Slouching detected. Take a deep breath, lift your sternum, and drop your shoulders.",
    ],
    lordosis: [
        "Your lower back is arching too much. Engage your core to flatten it slightly.",
        "Try a gentle pelvic tilt — rotate your hips slightly forward to reduce the arch.",
        "Excessive lumbar curve detected. Tighten your abs and tuck your pelvis under.",
    ],
    lateral_tilt: [
        "You're leaning to one side. Center your weight evenly on both sit bones.",
        "Check if your desk or chair is level — uneven surfaces cause lateral tilt.",
        "Lateral asymmetry detected. Straighten up and distribute your weight evenly.",
    ],
};

export class PostureCoach {
    constructor() {
        this.hasNano = false;
        this.nanoSession = null;
        this.lastLabel = null;
        this.lastCoachTime = 0;
        this.coachInterval = 30000; // 30 seconds minimum between updates
        this.tipIndex = {};         // track which tip to show next per label
        for (const label of POSTURE_LABELS) this.tipIndex[label] = 0;
        this.checkNanoAvailability();
    }

    async checkNanoAvailability() {
        try {
            if (window.ai && window.ai.languageModel) {
                const caps = await window.ai.languageModel.capabilities();
                this.hasNano = caps.available === 'readily' || caps.available === 'after-download';
                console.log(`[Coach] Gemini Nano: ${this.hasNano ? 'available ✓' : 'not available'}`);
            }
        } catch (e) {
            this.hasNano = false;
            console.log('[Coach] Gemini Nano not available, using expert system');
        }
    }

    // Get coaching tip from expert system
    getExpertTip(label) {
        const tips = COACHING_TIPS[label] || COACHING_TIPS.normal;
        const idx = this.tipIndex[label] % tips.length;
        this.tipIndex[label]++;
        return tips[idx];
    }

    // Get coaching tip from Gemini Nano (with fallback)
    async getCoaching(label, sensorData) {
        if (!this.hasNano) {
            return this.getExpertTip(label);
        }

        try {
            // Create a session if we don't have one
            if (!this.nanoSession) {
                this.nanoSession = await window.ai.languageModel.create({
                    systemPrompt: 'You are a brief, friendly posture coach for a student. Always respond with exactly 1-2 sentences of encouraging, actionable advice. Never use medical jargon.',
                });
            }

            const prompt = `The user's posture is classified as "${label}". ` +
                `Cervical pitch: ${sensorData.cervical.p.toFixed(1)}°, ` +
                `Thoracic pitch: ${sensorData.thoracic.p.toFixed(1)}°, ` +
                `Lumbar pitch: ${sensorData.lumbar.p.toFixed(1)}°. ` +
                `Give a quick, encouraging correction tip.`;

            const result = await this.nanoSession.prompt(prompt);
            return result || this.getExpertTip(label);
        } catch (e) {
            console.warn('[Coach] Nano failed, using expert system:', e.message);
            return this.getExpertTip(label);
        }
    }

    // Called when classification result arrives
    async onClassification(result, sensorData) {
        if (!result) return null;

        const now = performance.now();
        const labelChanged = result.label !== this.lastLabel;
        const timeElapsed = now - this.lastCoachTime > this.coachInterval;

        // Only update coaching when label changes or enough time has passed
        if (!labelChanged && !timeElapsed) return null;

        this.lastLabel = result.label;
        this.lastCoachTime = now;

        const tip = await this.getCoaching(result.label, sensorData);

        // Update the UI
        const el = document.getElementById('coachMessage');
        if (el) el.textContent = tip;

        return tip;
    }

    destroy() {
        if (this.nanoSession) {
            this.nanoSession.destroy();
            this.nanoSession = null;
        }
    }
}
