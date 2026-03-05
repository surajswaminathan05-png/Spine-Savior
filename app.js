// ============================================================
//  Spine Savior — 3D Spinal Visualization with Imported GLB
//  Uses a real anatomical spine model from Sketchfab
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ============================================================
//  CONFIGURATION
// ============================================================
const CONFIG = {
    smoothing: 0.3,
    // Model file
    modelPath: 'spine.glb',
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
        this.joints = [];            // { group, region, restPitch }
        this.regionCounts = { lumbar: 5, thoracic: 12, cervical: 7 };
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

            // Store joint for animation
            this.joints.push({
                group: wrapper,
                region: region,
                restPitch: 0,
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
        const s = 1 - CONFIG.smoothing;
        const d = this.sensorData;
        d.cervical.h = THREE.MathUtils.lerp(d.cervical.h, v[0], s);
        d.cervical.p = THREE.MathUtils.lerp(d.cervical.p, v[1], s);
        d.cervical.r = THREE.MathUtils.lerp(d.cervical.r, v[2], s);
        d.thoracic.h = THREE.MathUtils.lerp(d.thoracic.h, v[3], s);
        d.thoracic.p = THREE.MathUtils.lerp(d.thoracic.p, v[4], s);
        d.thoracic.r = THREE.MathUtils.lerp(d.thoracic.r, v[5], s);
        d.lumbar.h = THREE.MathUtils.lerp(d.lumbar.h, v[6], s);
        d.lumbar.p = THREE.MathUtils.lerp(d.lumbar.p, v[7], s);
        d.lumbar.r = THREE.MathUtils.lerp(d.lumbar.r, v[8], s);
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
        d.cervical.h = Math.sin(t * 0.3) * 3;
        d.cervical.p = breath * 2.5 + Math.sin(t * 0.7) * 1.5;
        d.cervical.r = Math.sin(t * 0.5) * 2;
        d.thoracic.h = Math.sin(t * 0.25) * 1.5;
        d.thoracic.p = breath * 3.5 + Math.sin(t * 0.4) * 0.8;
        d.thoracic.r = Math.sin(t * 0.6) * 1.2;
        d.lumbar.h = Math.sin(t * 0.2) * 0.8;
        d.lumbar.p = breath * 2.5 + Math.sin(t * 0.35) * 1;
        d.lumbar.r = Math.sin(t * 0.45) * 0.7;
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
        for (const joint of this.joints) {
            const region = joint.region;
            const n = this.regionCounts[region];
            const dh = (d[region].h - b[region].h) / n;
            const dp = (d[region].p - b[region].p) / n;
            const dr = (d[region].r - b[region].r) / n;
            joint.group.rotation.x = joint.restPitch + THREE.MathUtils.degToRad(dp);
            joint.group.rotation.y = THREE.MathUtils.degToRad(-dh);
            joint.group.rotation.z = THREE.MathUtils.degToRad(dr);
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
        const dev =
            Math.abs(d.cervical.p - b.cervical.p) + Math.abs(d.cervical.r - b.cervical.r) +
            Math.abs(d.thoracic.p - b.thoracic.p) + Math.abs(d.thoracic.r - b.thoracic.r) +
            Math.abs(d.lumbar.p - b.lumbar.p) + Math.abs(d.lumbar.r - b.lumbar.r);
        return Math.max(0, Math.round(100 - dev * 0.8));
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
        const alerts = [];
        if (Math.abs(d.cervical.p - b.cervical.p) > 20) alerts.push({ cls: 'bad', text: '🚨 Severe forward head tilt' });
        else if (Math.abs(d.cervical.p - b.cervical.p) > 10) alerts.push({ cls: 'warn', text: '⚠️ Forward head posture' });
        if (Math.abs(d.cervical.r - b.cervical.r) > 15) alerts.push({ cls: 'warn', text: '⚠️ Head lateral tilt' });
        if (Math.abs(d.thoracic.p - b.thoracic.p) > 15) alerts.push({ cls: 'warn', text: '⚠️ Thoracic slouching' });
        if (Math.abs(d.lumbar.p - b.lumbar.p) > 15) alerts.push({ cls: 'warn', text: '⚠️ Lumbar over-flexion' });
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
