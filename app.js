// ============================================================
//  Spine Savior — 3D Spinal Visualization with Imported GLB
//  Uses a real anatomical spine model from Sketchfab
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
//  CONFIGURATION — Biomechanical Data Tables
//  Sources: PubMed ROM studies, Disney Research dynamics,
//  BNO055 datasheets, motion capture literature (52 sources)
// ============================================================
const CONFIG = {
    modelPath: 'spine.glb',

    // Spring-damper smoothing (critically damped second-order system)
    spring: {
        stiffness: 150.0,
        get damping() { return 2.0 * Math.sqrt(this.stiffness); },
    },

    // Where each sensor sits along the vertebral chain (global index, 0=L1 bottom)
    sensorPositions: { lumbar: 2, thoracic: 12, cervical: 20 },
    blendSigma: 4.0, // Gaussian falloff width for inter-region blending

    // Per-vertebra flexibility weights (bottom→top, sums to 1.0 within each region)
    // Source: PubMed in-vivo segmental ROM data
    flexWeights: {
        lumbar: [0.16, 0.17, 0.19, 0.24, 0.24],
        thoracic: [0.10, 0.10, 0.09, 0.08, 0.07, 0.06,
            0.06, 0.07, 0.08, 0.09, 0.10, 0.10],
        cervical: [0.25, 0.25, 0.10, 0.10, 0.10, 0.10, 0.10],
    },

    // ROM constraints in degrees per spinal level [flexExt, latBend, axialRot]
    // Source: PubMed segmental ROM and neutral zone studies
    romLimits: {
        lumbar: [
            [9.5, 8.4, 1.6],   // L1-L2
            [10.1, 9.8, 2.4],   // L2-L3
            [11.2, 12.0, 1.3],  // L3-L4
            [14.3, 8.8, 2.1],   // L4-L5
            [14.3, 7.6, 1.6],   // L5-S1
        ],
        thoracic: [
            [4.0, 6.0, 9.0], [4.0, 6.0, 8.0], [4.0, 5.0, 7.0], [3.5, 5.0, 6.0],
            [3.0, 4.0, 5.0], [2.5, 3.5, 4.0], [2.5, 3.5, 4.0], [3.0, 4.0, 5.0],
            [3.5, 5.0, 5.0], [4.0, 5.0, 4.0], [5.0, 5.0, 3.0], [5.0, 5.0, 3.0],
        ],
        cervical: [
            [15.0, 8.0, 40.0],  // C1-C2 (atlas-axis: massive axial rotation)
            [15.0, 8.0, 40.0],  // C2-C3
            [10.0, 10.0, 7.0],  // C3-C4
            [10.0, 10.0, 7.0],  // C4-C5
            [10.0, 10.0, 7.0],  // C5-C6
            [8.0, 7.0, 5.0],   // C6-C7
            [5.0, 4.0, 3.0],   // C7-T1
        ],
    },

    // Global regional ROM totals (for posture scoring normalization)
    regionalROM: {
        cervical: { flexExt: 64, latBend: 49, axialRot: 85 },
        thoracic: { flexExt: 26, latBend: 30, axialRot: 47 },
        lumbar: { flexExt: 65, latBend: 30, axialRot: 15.3 },
    },
};

// ============================================================
//  MAIN APPLICATION
// ============================================================
class SpineSavior {
    constructor() {
        this.sensorData = {
            cervical: { h: 0, p: 0, r: 0 },
            thoracic: { h: 0, p: 0, r: 0 },
            lumbar: { h: 0, p: 0, r: 0 },
        };
        this.baseline = null;
        this.dataReady = false;
        this.joints = [];  // { group, region, regionIndex, globalIndex, flexWeight, romLimit, velocity, currentRot }
        this.port = null;
        this.reader = null;
        this.keepReading = false;
        this.simulationMode = false;
        this.frameCount = 0;
        this.lastFpsTime = performance.now();
        this.fps = 0;
        this.dataCount = 0;
        this.lastDataRateTime = performance.now();
        this.dataRate = 0;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.modelLoaded = false;
        this.init();
    }

    init() {
        this.setupScene();
        this.loadSpineModel();
        this.setupUI();
        this.animate();
    }

    // ==========================================================
    //  SCENE
    // ==========================================================
    setupScene() {
        const container = document.getElementById('canvas-container');
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0f1e);


        // Camera — lateral view to show S-curve
        this.camera = new THREE.PerspectiveCamera(
            38, window.innerWidth / window.innerHeight, 0.1, 2000
        );
        this.camera.position.set(600, 300, 200);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 280, 0);
        this.controls.minDistance = 200;
        this.controls.maxDistance = 1200;
        this.controls.update();

        // Lighting — studio setup
        this.scene.add(new THREE.AmbientLight(0x505570, 0.5));
        this.scene.add(new THREE.HemisphereLight(0xc0c8e0, 0x304050, 0.4));

        const keyLight = new THREE.DirectionalLight(0xfff0dd, 1.4);
        keyLight.position.set(200, 500, 300);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        const sc = keyLight.shadow.camera;
        sc.near = 1; sc.far = 1200;
        sc.left = -300; sc.right = 300; sc.top = 600; sc.bottom = -100;
        this.scene.add(keyLight);

        const fillLight = new THREE.DirectionalLight(0x8090ff, 0.3);
        fillLight.position.set(-200, 300, -150);
        this.scene.add(fillLight);

        const rimLight = new THREE.DirectionalLight(0xffd0b0, 0.25);
        rimLight.position.set(0, 100, -300);
        this.scene.add(rimLight);


        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // ==========================================================
    //  LOAD & INTEGRATE GLB MODEL
    // ==========================================================
    loadSpineModel() {
        const loader = new GLTFLoader();
        loader.load(
            CONFIG.modelPath,
            (gltf) => {
                console.log('Spine GLB loaded successfully');
                this.integrateModel(gltf);
            },
            (progress) => {
                const pct = progress.total
                    ? Math.round((progress.loaded / progress.total) * 100)
                    : '?';
                console.log(`Loading spine: ${pct}%`);
            },
            (error) => {
                console.error('Failed to load spine model:', error);
            }
        );
    }

    integrateModel(gltf) {
        const root = gltf.scene;

        // ---- Step 1: Collect all meshes with their world-space bounding box centers ----
        const meshInfos = [];
        root.traverse((child) => {
            if (!child.isMesh) return;
            child.geometry.computeBoundingBox();
            const bb = child.geometry.boundingBox;
            child.updateWorldMatrix(true, false);

            // Compute world-space center of the bounding box
            const localCenter = new THREE.Vector3();
            bb.getCenter(localCenter);
            const worldCenter = localCenter.clone().applyMatrix4(child.matrixWorld);

            // Force material to be fully opaque, double-sided, depth-writing
            if (child.material) {
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.side = THREE.DoubleSide;
                child.material.depthWrite = true;
                child.material.alphaTest = 0;
            }

            child.castShadow = true;
            child.receiveShadow = true;

            meshInfos.push({
                mesh: child,
                worldCenter: worldCenter,
                yCenter: worldCenter.y,
                materialName: child.material?.name || '',
            });
        });

        // ---- Step 2: Add the entire GLTF scene to our scene (preserving its graph) ----
        this.scene.add(root);

        // ---- Step 3: Sort meshes by Y center ----
        meshInfos.sort((a, b) => a.yCenter - b.yCenter);
        console.log(`Found ${meshInfos.length} meshes in GLB`);

        // ---- Step 4: Separate discs from vertebral bodies ----
        const vertebrae = meshInfos.filter(m => m.materialName !== 'lambert3');
        const discs = meshInfos.filter(m => m.materialName === 'lambert3');
        console.log(`Vertebral bodies: ${vertebrae.length}, Discs: ${discs.length}`);

        // ---- Step 5: Identify movable vertebrae (exclude sacrum = lambert2) ----
        const movableVerts = vertebrae.filter(v => v.materialName !== 'lambert2');
        movableVerts.sort((a, b) => a.yCenter - b.yCenter);

        // ---- Step 6: Assign regions by sorted order ----
        const lumbarCount = Math.min(5, movableVerts.length);
        const thoracicCount = Math.min(12, movableVerts.length - lumbarCount);

        for (let i = 0; i < movableVerts.length; i++) {
            let region;
            if (i < lumbarCount) region = 'lumbar';
            else if (i < lumbarCount + thoracicCount) region = 'thoracic';
            else region = 'cervical';

            const info = movableVerts[i];

            // For each vertebra, we will create a wrapper Group at the mesh's
            // world center. The mesh gets reparented into this group so its
            // pivot point is at its center. This lets us rotate it in place.
            const wrapper = new THREE.Group();

            // Position the wrapper at the mesh's world center
            const parent = info.mesh.parent;
            const wc = info.worldCenter;

            // Get the mesh's current world matrix
            info.mesh.updateWorldMatrix(true, false);
            const meshWorldMatrix = info.mesh.matrixWorld.clone();

            // Insert wrapper into the same parent as the mesh
            parent.add(wrapper);

            // Position wrapper in the parent's local space
            // Convert world center to parent's local space
            const parentWorldInverse = new THREE.Matrix4();
            parent.updateWorldMatrix(true, false);
            parentWorldInverse.copy(parent.matrixWorld).invert();
            const localPivot = wc.clone().applyMatrix4(parentWorldInverse);
            wrapper.position.copy(localPivot);
            wrapper.updateWorldMatrix(true, false);

            // Remove mesh from parent, add to wrapper
            parent.remove(info.mesh);
            wrapper.add(info.mesh);

            // Recompute mesh's local position relative to the wrapper
            // mesh world pos should stay the same, so:
            // meshWorld = wrapper.matrixWorld * mesh.localMatrix
            // mesh.localMatrix = inverse(wrapper.matrixWorld) * meshWorld
            const wrapperWorldInverse = new THREE.Matrix4();
            wrapperWorldInverse.copy(wrapper.matrixWorld).invert();
            const newLocalMatrix = meshWorldMatrix.clone().premultiply(wrapperWorldInverse);
            info.mesh.matrix.copy(newLocalMatrix);
            info.mesh.matrix.decompose(info.mesh.position, info.mesh.quaternion, info.mesh.scale);

            // Determine the local index within this region
            const regionIndex = (region === 'lumbar') ? i
                : (region === 'thoracic') ? i - lumbarCount
                    : i - lumbarCount - thoracicCount;

            // Store joint with full biomechanical metadata + spring-damper state
            this.joints.push({
                group: wrapper,
                region: region,
                regionIndex: regionIndex,
                globalIndex: i,
                restPitch: 0,
                flexWeight: CONFIG.flexWeights[region][regionIndex] || (1 / CONFIG.flexWeights[region].length),
                romLimit: CONFIG.romLimits[region][regionIndex] || [10, 10, 10],
                // Spring-damper per-axis state
                velocity: { x: 0, y: 0, z: 0 },
                currentRot: { x: 0, y: 0, z: 0 },
            });
        }

        // ---- Step 7: Also wrap each disc in a group so it rotates with its neighbor ----
        // Find the nearest vertebra below each disc and rotate together
        // For now, discs stay fixed — they're cosmetic spacers

        // Center the model vertically
        // The model's Y range is roughly -110 to 590, center at ~240
        root.position.y = -240;

        this.modelLoaded = true;
        console.log(`Built ${this.joints.length} rotatable joints`);

    }

    // ==========================================================
    //  WEB SERIAL
    // ==========================================================
    async connect() {
        if (!('serial' in navigator)) {
            alert('Web Serial API not supported. Use Chrome 89+.');
            return;
        }
        try {
            this.port = await navigator.serial.requestPort();
            await this.port.open({ baudRate: 115200 });
            this.keepReading = true;
            this.updateConnectionUI('connected');
            this.readSerialLoop();
        } catch (err) {
            console.error('Serial error:', err);
            this.updateConnectionUI('disconnected');
        }
    }

    async disconnect() {
        this.keepReading = false;
        if (this.reader) { try { await this.reader.cancel(); } catch (e) { } this.reader = null; }
        if (this.port) { try { await this.port.close(); } catch (e) { } this.port = null; }
        this.updateConnectionUI('disconnected');
    }

    async readSerialLoop() {
        const decoder = new TextDecoderStream();
        const closed = this.port.readable.pipeTo(decoder.writable);
        this.reader = decoder.readable.getReader();
        let buf = '';
        try {
            while (this.keepReading) {
                const { value, done } = await this.reader.read();
                if (done) break;
                buf += value;
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const l of lines) this.processSerialLine(l.trim());
            }
        } catch (e) {
            if (this.keepReading) console.error('Read error:', e);
        } finally {
            this.reader.releaseLock();
            await closed.catch(() => { });
        }
    }

    processSerialLine(line) {
        if (!line) return;
        if (/[a-zA-Z]/.test(line.replace(/[eE][-+]?\d+/g, ''))) return;
        const parts = line.split(',');
        if (parts.length !== 9) return;
        const v = parts.map(s => parseFloat(s.trim()));
        if (v.some(Number.isNaN)) return;

        // Direct assignment — spring-damper in updateSpine() handles all smoothing
        const d = this.sensorData;
        d.thoracic.h = v[0]; d.thoracic.p = v[1]; d.thoracic.r = v[2]; // port 0 → thoracic
        d.lumbar.h = v[3]; d.lumbar.p = v[4]; d.lumbar.r = v[5]; // port 2 → lumbar
        d.cervical.h = v[6]; d.cervical.p = v[7]; d.cervical.r = v[8]; // port 3 → cervical
        this.dataReady = true;
        this.dataCount++;
    }

    // ==========================================================
    //  SIMULATION
    // ==========================================================
    updateSimulation(time) {
        const t = time * 0.001;
        const breath = Math.sin(t * Math.PI * 2 * 0.15);
        const d = this.sensorData;

        // Cervical: high ROM for axial rotation (C1-C2), moderate flex/ext
        d.cervical.h = Math.sin(t * 0.3) * 8;
        d.cervical.p = breath * 4 + Math.sin(t * 0.7) * 3;
        d.cervical.r = Math.sin(t * 0.5) * 4;

        // Thoracic: low flex/ext (rib cage constraint), moderate axial rotation
        d.thoracic.h = Math.sin(t * 0.25) * 6;
        d.thoracic.p = breath * 2 + Math.sin(t * 0.4) * 1.5;
        d.thoracic.r = Math.sin(t * 0.6) * 4;

        // Lumbar: high flex/ext, almost no axial rotation
        d.lumbar.h = Math.sin(t * 0.2) * 1.5;
        d.lumbar.p = breath * 6 + Math.sin(t * 0.35) * 4;
        d.lumbar.r = Math.sin(t * 0.45) * 3;

        this.dataReady = true;
    }

    // ==========================================================
    //  SPINE UPDATE (animation)
    // ==========================================================
    updateSpine() {
        if (!this.dataReady || !this.modelLoaded) return;
        const d = this.sensorData;
        const b = this.baseline || {
            cervical: { h: 0, p: 0, r: 0 },
            thoracic: { h: 0, p: 0, r: 0 },
            lumbar: { h: 0, p: 0, r: 0 },
        };

        // 1. Compute per-region deltas (degrees, baseline-subtracted)
        const regionDeltas = {};
        for (const region of ['lumbar', 'thoracic', 'cervical']) {
            regionDeltas[region] = {
                p: d[region].p - b[region].p,  // pitch → flexion/extension
                r: d[region].r - b[region].r,  // roll  → lateral bend
                h: d[region].h - b[region].h,  // heading → axial rotation
            };
        }

        const dt = 1.0 / 60.0;
        const K = CONFIG.spring.stiffness;
        const D = CONFIG.spring.damping;
        const sigma = CONFIG.blendSigma;
        const sensorPos = CONFIG.sensorPositions;

        for (const joint of this.joints) {
            // 2. GAUSSIAN BLENDING — blend all 3 sensor signals with distance falloff
            let blendedP = 0, blendedR = 0, blendedH = 0, totalWeight = 0;
            for (const region of ['lumbar', 'thoracic', 'cervical']) {
                const dist = Math.abs(joint.globalIndex - sensorPos[region]);
                const w = Math.exp(-(dist * dist) / (2 * sigma * sigma));
                blendedP += regionDeltas[region].p * w;
                blendedR += regionDeltas[region].r * w;
                blendedH += regionDeltas[region].h * w;
                totalWeight += w;
            }
            blendedP /= totalWeight;
            blendedR /= totalWeight;
            blendedH /= totalWeight;

            // 3. FLEXIBILITY WEIGHTING — scale by this vertebra's biomechanical share
            const fw = joint.flexWeight;
            const regionVertCount = CONFIG.flexWeights[joint.region].length;
            const scaledP = blendedP * fw * regionVertCount;
            const scaledR = blendedR * fw * regionVertCount;
            const scaledH = blendedH * fw * regionVertCount;

            // 4. ROM CLAMPING — enforce anatomical limits per level
            const [maxFE, maxLB, maxAR] = joint.romLimit;
            const clampedP = THREE.MathUtils.clamp(scaledP, -maxFE, maxFE);
            const clampedR = THREE.MathUtils.clamp(scaledR, -maxLB, maxLB);
            const clampedH = THREE.MathUtils.clamp(scaledH, -maxAR, maxAR);

            // 5. SPRING-DAMPER SMOOTHING — critically damped second-order system
            const targets = {
                x: THREE.MathUtils.degToRad(clampedP),
                y: THREE.MathUtils.degToRad(-clampedH),
                z: THREE.MathUtils.degToRad(clampedR),
            };
            for (const axis of ['x', 'y', 'z']) {
                const error = targets[axis] - joint.currentRot[axis];
                const accel = K * error - D * joint.velocity[axis];
                joint.velocity[axis] += accel * dt;
                joint.currentRot[axis] += joint.velocity[axis] * dt;
            }

            // 6. APPLY to the wrapper group
            joint.group.rotation.x = joint.restPitch + joint.currentRot.x;
            joint.group.rotation.y = joint.currentRot.y;
            joint.group.rotation.z = joint.currentRot.z;
        }
    }

    // ==========================================================
    //  POSTURE SCORING
    // ==========================================================
    getPostureScore() {
        const d = this.sensorData;
        const b = this.baseline || {
            cervical: { h: 0, p: 0, r: 0 },
            thoracic: { h: 0, p: 0, r: 0 },
            lumbar: { h: 0, p: 0, r: 0 },
        };
        const rom = CONFIG.regionalROM;

        // ROM-normalized deviation: how far off baseline as fraction of max ROM
        const cervDev = Math.abs(d.cervical.p - b.cervical.p) / rom.cervical.flexExt +
            Math.abs(d.cervical.r - b.cervical.r) / rom.cervical.latBend;
        const thorDev = Math.abs(d.thoracic.p - b.thoracic.p) / rom.thoracic.flexExt +
            Math.abs(d.thoracic.r - b.thoracic.r) / rom.thoracic.latBend;
        const lumDev = Math.abs(d.lumbar.p - b.lumbar.p) / rom.lumbar.flexExt +
            Math.abs(d.lumbar.r - b.lumbar.r) / rom.lumbar.latBend;

        // Average normalized deviation (0 = perfect, 1 = at ROM limit)
        const normalizedDev = (cervDev + thorDev + lumDev) / 6;
        return Math.max(0, Math.round(100 * (1 - normalizedDev * 2)));
    }

    // ==========================================================
    //  UI
    // ==========================================================
    updateUI() {
        if (!this.dataReady) return;
        const d = this.sensorData;
        document.getElementById('cH').textContent = d.cervical.h.toFixed(1);
        document.getElementById('cP').textContent = d.cervical.p.toFixed(1);
        document.getElementById('cR').textContent = d.cervical.r.toFixed(1);
        document.getElementById('tH').textContent = d.thoracic.h.toFixed(1);
        document.getElementById('tP').textContent = d.thoracic.p.toFixed(1);
        document.getElementById('tR').textContent = d.thoracic.r.toFixed(1);
        document.getElementById('lH').textContent = d.lumbar.h.toFixed(1);
        document.getElementById('lP').textContent = d.lumbar.p.toFixed(1);
        document.getElementById('lR').textContent = d.lumbar.r.toFixed(1);

        const score = this.getPostureScore();
        const circ = 2 * Math.PI * 52;
        document.getElementById('gaugeFill').style.strokeDashoffset = circ * (1 - score / 100);
        document.getElementById('scoreValue').textContent = score;

        const stops = document.querySelectorAll('#gaugeGrad stop');
        if (score > 70) { stops[0].style.stopColor = '#7CB342'; stops[1].style.stopColor = '#69F0AE'; }
        else if (score > 40) { stops[0].style.stopColor = '#FFD54F'; stops[1].style.stopColor = '#FFA726'; }
        else { stops[0].style.stopColor = '#FF5252'; stops[1].style.stopColor = '#D50000'; }

        const st = document.getElementById('postureStatus');
        if (score > 80) { st.textContent = '✅ Excellent posture'; st.style.color = '#69F0AE'; }
        else if (score > 60) { st.textContent = '👍 Good posture'; st.style.color = '#7CB342'; }
        else if (score > 40) { st.textContent = '⚠️ Needs attention'; st.style.color = '#FFD54F'; }
        else { st.textContent = '🚨 Poor posture'; st.style.color = '#FF5252'; }

        this.updateAlerts(d);
    }

    updateAlerts(d) {
        const b = this.baseline || {
            cervical: { h: 0, p: 0, r: 0 },
            thoracic: { h: 0, p: 0, r: 0 },
            lumbar: { h: 0, p: 0, r: 0 },
        };
        const rom = CONFIG.regionalROM;
        const alerts = [];

        // ROM-relative thresholds: warn at >50% ROM, bad at >75% ROM
        const cervP = Math.abs(d.cervical.p - b.cervical.p);
        if (cervP > rom.cervical.flexExt * 0.75)
            alerts.push({ cls: 'bad', text: '🚨 Severe forward head tilt' });
        else if (cervP > rom.cervical.flexExt * 0.5)
            alerts.push({ cls: 'warn', text: '⚠️ Forward head posture' });

        if (Math.abs(d.cervical.r - b.cervical.r) > rom.cervical.latBend * 0.5)
            alerts.push({ cls: 'warn', text: '⚠️ Head lateral tilt' });

        if (Math.abs(d.thoracic.p - b.thoracic.p) > rom.thoracic.flexExt * 0.5)
            alerts.push({ cls: 'warn', text: '⚠️ Thoracic slouching' });

        if (Math.abs(d.lumbar.p - b.lumbar.p) > rom.lumbar.flexExt * 0.5)
            alerts.push({ cls: 'warn', text: '⚠️ Lumbar over-flexion' });

        if (Math.abs(d.lumbar.h - b.lumbar.h) > rom.lumbar.axialRot * 0.5)
            alerts.push({ cls: 'warn', text: '⚠️ Lumbar over-rotation' });

        if (!alerts.length) alerts.push({ cls: 'good', text: '✅ All regions aligned' });
        document.getElementById('alertsList').innerHTML =
            alerts.map(a => `<div class="alert-item ${a.cls}">${a.text}</div>`).join('');
    }

    updateConnectionUI(state) {
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        const btn = document.getElementById('connectBtn');
        dot.className = 'status-dot ' + state;
        if (state === 'connected') { text.textContent = 'Connected'; btn.textContent = 'Disconnect'; }
        else if (state === 'simulating') { text.textContent = 'Simulating'; btn.textContent = 'Connect'; }
        else { text.textContent = 'Disconnected'; btn.textContent = 'Connect'; }
    }

    calibrate() {
        this.baseline = JSON.parse(JSON.stringify(this.sensorData));
        document.getElementById('calibStatus').textContent = 'Calibration: ✅ set';
        const btn = document.getElementById('calibrateBtn');
        btn.style.background = 'rgba(124,179,66,0.2)';
        btn.style.borderColor = '#7CB342';
        setTimeout(() => { btn.style.background = ''; btn.style.borderColor = ''; }, 800);
    }

    resetCamera() {
        this.controls.target.set(0, 280, 0);
        this.camera.position.set(600, 300, 200);
        this.controls.update();
    }

    // ==========================================================
    //  ANIMATION LOOP
    // ==========================================================
    animate() {
        requestAnimationFrame(() => this.animate());
        const now = performance.now();
        if (this.simulationMode) this.updateSimulation(now);
        this.updateSpine();
        this.frameCount++;
        if (this.frameCount % 4 === 0) this.updateUI();
        if (now - this.lastFpsTime >= 1000) {
            this.fps = Math.round(this.frameCount / ((now - this.lastFpsTime) / 1000));
            this.frameCount = 0;
            this.lastFpsTime = now;
            document.getElementById('fpsCounter').textContent = this.fps + ' FPS';
        }
        if (now - this.lastDataRateTime >= 1000) {
            this.dataRate = this.dataCount;
            this.dataCount = 0;
            this.lastDataRateTime = now;
            document.getElementById('dataRate').textContent = this.dataRate + ' Hz';
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    // ==========================================================
    //  UI EVENT HANDLERS
    // ==========================================================
    setupUI() {
        document.getElementById('connectBtn').addEventListener('click', () => {
            if (this.port) this.disconnect(); else this.connect();
        });
        document.getElementById('simToggle').addEventListener('change', (e) => {
            this.simulationMode = e.target.checked;
            if (this.simulationMode) this.updateConnectionUI('simulating');
            else if (!this.port) { this.updateConnectionUI('disconnected'); this.dataReady = false; }
        });
        document.getElementById('calibrateBtn').addEventListener('click', () => this.calibrate());
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            switch (e.key.toLowerCase()) {
                case 'c': this.calibrate(); break;
                case 's':
                    this.simulationMode = !this.simulationMode;
                    document.getElementById('simToggle').checked = this.simulationMode;
                    document.getElementById('simToggle').dispatchEvent(new Event('change'));
                    break;
                case 'r': this.resetCamera(); break;
            }
        });
    }
}

const app = new SpineSavior();
