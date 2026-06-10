/**
 * Koko-chan 3D: Tokyo Crossing (Rooster Fighter Edition)
 * Core 3D Game Engine using Three.js
 */

// DOM Elements
const canvasWrapper = document.getElementById('canvas-wrapper');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const currentScoreEl = document.getElementById('current-score');
const finalScoreEl = document.getElementById('final-score');
const recordStatusEl = document.getElementById('record-status');
const heartsEl = document.getElementById('hearts');
const muteBtn = document.getElementById('mute-btn');
const playerNameInput = document.getElementById('player-name');
const leaderboardStart = document.getElementById('leaderboard-start');
const leaderboardOver = document.getElementById('leaderboard-over');

// Game Constants
const GRID_UNIT = 3; // 1 Grid cell = 3 units in Three.js
const COLS = 12;     // Width grid columns
const ROWS = 14;     // Height grid rows
const ROAD_START_Z = 21; // Bottom z coordinate

// Game State
let score = 0;
let lives = 3;
let gameOver = false;
let gameStarted = false;
let soundEnabled = true;
let keys = {};
let frameCount = 0;
let currentPlayerName = "GaloLutador";

// Three.js Core Variables
let scene, camera, renderer;
let playerMesh;
let roadLanes = [];
let obstacles3D = [];
let particles3D = [];

// Screen Shake variables
let shakeIntensity = 0;

// Web Audio API Synth (Synthesized sounds)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
}

function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.4);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    } else if (type === 'score') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.linearRampToValueAtTime(0.08, now + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.8);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

// ----------------- LEADERBOARD LOGIC -----------------
function getLeaderboard() {
    const data = localStorage.getItem('koko_3d_leaderboard');
    if (data) {
        try {
            return JSON.parse(data);
        } catch(e) {
            return [];
        }
    }
    // Default initial rankings
    const defaults = [
        { name: "Keiji", score: 150 },
        { name: "GaloDoido", score: 100 },
        { name: "Chicco", score: 80 },
        { name: "Sasa", score: 50 },
        { name: "PiuPiu", score: 20 }
    ];
    localStorage.setItem('koko_3d_leaderboard', JSON.stringify(defaults));
    return defaults;
}

function saveScore(name, scoreVal) {
    const list = getLeaderboard();
    const sanitizedName = name.trim().toUpperCase() || "ANÔNIMO";
    list.push({ name: sanitizedName, score: scoreVal });
    // Sort descending
    list.sort((a, b) => b.score - a.score);
    // Cap at top 5
    const top5 = list.slice(0, 5);
    localStorage.setItem('koko_3d_leaderboard', JSON.stringify(top5));
    
    // Check if score is the all-time high
    const isNewRecord = top5[0].name === sanitizedName && top5[0].score === scoreVal;
    return isNewRecord;
}

function populateLeaderboards() {
    const list = getLeaderboard();
    const renderList = (container) => {
        container.innerHTML = '';
        list.forEach((entry, idx) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            if (entry.name === currentPlayerName.toUpperCase()) {
                row.className += ' highlight';
            }
            row.innerHTML = `
                <div>
                    <span class="rank-num">#${idx + 1}</span>
                    <span class="rank-name">${escapeHtml(entry.name)}</span>
                </div>
                <span class="rank-score">${entry.score} pts</span>
            `;
            container.appendChild(row);
        });
    };
    renderList(leaderboardStart);
    renderList(leaderboardOver);
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Initial rankings draw
populateLeaderboards();


// ----------------- 3D MODEL PROCEDURAL CREATION -----------------

// Create Keiji the Rooster Fighter (Voxel Style)
function create3DPlayer() {
    const playerGroup = new THREE.Group();

    // Body (White Voxel)
    const bodyGeom = new THREE.BoxGeometry(0.8, 0.8, 0.8);
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const bodyMesh = new THREE.Mesh(bodyGeom, whiteMat);
    bodyMesh.position.y = 0.5;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    playerGroup.add(bodyMesh);

    // Comb (Red martial design)
    const combGeom = new THREE.BoxGeometry(0.15, 0.3, 0.5);
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff1040 });
    const combMesh = new THREE.Mesh(combGeom, redMat);
    combMesh.position.set(0, 0.95, 0.1);
    combMesh.castShadow = true;
    playerGroup.add(combMesh);

    // Beak (Chibi Yellow)
    const beakGeom = new THREE.BoxGeometry(0.2, 0.2, 0.25);
    const yellowMat = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
    const beakMesh = new THREE.Mesh(beakGeom, yellowMat);
    beakMesh.position.set(0, 0.65, 0.45);
    beakMesh.castShadow = true;
    playerGroup.add(beakMesh);

    // Eyes (Determined black boxes)
    const eyeGeom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    const blackMat = new THREE.MeshLambertMaterial({ color: 0x000000 });
    
    const leftEye = new THREE.Mesh(eyeGeom, blackMat);
    leftEye.position.set(-0.35, 0.68, 0.3);
    playerGroup.add(leftEye);
    
    const rightEye = new THREE.Mesh(eyeGeom, blackMat);
    rightEye.position.set(0.35, 0.68, 0.3);
    playerGroup.add(rightEye);

    // Wings (Assertive battle-pose wings)
    const wingGeom = new THREE.BoxGeometry(0.12, 0.4, 0.4);
    const leftWing = new THREE.Mesh(wingGeom, whiteMat);
    leftWing.position.set(-0.45, 0.5, 0);
    leftWing.castShadow = true;
    playerGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeom, whiteMat);
    rightWing.position.set(0.45, 0.5, 0);
    rightWing.castShadow = true;
    playerGroup.add(rightWing);

    // Legs (Voxel muscular legs)
    const legGeom = new THREE.BoxGeometry(0.12, 0.3, 0.12);
    
    const leftLeg = new THREE.Mesh(legGeom, yellowMat);
    leftLeg.position.set(-0.2, 0.15, 0);
    leftLeg.castShadow = true;
    playerGroup.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeom, yellowMat);
    rightLeg.position.set(0.2, 0.15, 0);
    rightLeg.castShadow = true;
    playerGroup.add(rightLeg);

    // Set shadow configs on everything
    playerGroup.traverse(node => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    return playerGroup;
}

// Create Chibi Cars in 3D
function create3DCar(colorHex) {
    const carGroup = new THREE.Group();

    // Chassis Box
    const bodyGeom = new THREE.BoxGeometry(1.6, 0.6, 1.0);
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = 0.4;
    carGroup.add(bodyMesh);

    // Cabin Box
    const cabinGeom = new THREE.BoxGeometry(1.0, 0.5, 0.9);
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x1f1a30 }); // dark glass
    const cabinMesh = new THREE.Mesh(cabinGeom, cabinMat);
    cabinMesh.position.set(-0.1, 0.85, 0);
    carGroup.add(cabinMesh);

    // Wheels (4 cylinders)
    const wheelGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.15, 8);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
    const wheelOffsets = [
        { x: -0.5, z: -0.55 },
        { x: -0.5, z: 0.55 },
        { x: 0.5, z: -0.55 },
        { x: 0.5, z: 0.55 }
    ];
    
    const wheels = [];
    wheelOffsets.forEach(offset => {
        const wheelMesh = new THREE.Mesh(wheelGeom, wheelMat);
        wheelMesh.rotation.x = Math.PI / 2;
        wheelMesh.position.set(offset.x, 0.22, offset.z);
        carGroup.add(wheelMesh);
        wheels.push(wheelMesh);
    });

    // Save wheels reference for animation
    carGroup.userData = { wheels: wheels, type: 'car' };

    // Headlights
    const lightGeom = new THREE.BoxGeometry(0.1, 0.15, 0.15);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffca0 }); // glowing light yellow
    
    const leftHeadlight = new THREE.Mesh(lightGeom, lightMat);
    leftHeadlight.position.set(0.81, 0.45, -0.3);
    carGroup.add(leftHeadlight);

    const rightHeadlight = new THREE.Mesh(lightGeom, lightMat);
    rightHeadlight.position.set(0.81, 0.45, 0.3);
    carGroup.add(rightHeadlight);

    carGroup.traverse(node => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    return carGroup;
}

// Create Chibi Voxel Truck
function create3DTruck() {
    const truckGroup = new THREE.Group();

    // Cargo container
    const cargoGeom = new THREE.BoxGeometry(2.4, 1.2, 1.1);
    const cargoMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const cargoMesh = new THREE.Mesh(cargoGeom, cargoMat);
    cargoMesh.position.set(-0.3, 0.9, 0);
    truckGroup.add(cargoMesh);

    // Front cabin
    const cabinGeom = new THREE.BoxGeometry(0.9, 0.8, 1.0);
    const cabinMat = new THREE.MeshLambertMaterial({ color: 0x05d9e8 });
    const cabinMesh = new THREE.Mesh(cabinGeom, cabinMat);
    cabinMesh.position.set(1.1, 0.7, 0);
    truckGroup.add(cabinMesh);

    // Dark windshield
    const windGeom = new THREE.BoxGeometry(0.2, 0.4, 0.8);
    const windMat = new THREE.MeshLambertMaterial({ color: 0x1f1a30 });
    const windMesh = new THREE.Mesh(windGeom, windMat);
    windMesh.position.set(1.46, 0.8, 0);
    truckGroup.add(windMesh);

    // Wheels (6 wheels for heavy truck)
    const wheelGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 8);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
    const wheelOffsets = [
        { x: -1.0, z: -0.6 },
        { x: -1.0, z: 0.6 },
        { x: -0.2, z: -0.6 },
        { x: -0.2, z: 0.6 },
        { x: 0.9, z: -0.6 },
        { x: 0.9, z: 0.6 }
    ];
    
    const wheels = [];
    wheelOffsets.forEach(offset => {
        const wheelMesh = new THREE.Mesh(wheelGeom, wheelMat);
        wheelMesh.rotation.x = Math.PI / 2;
        wheelMesh.position.set(offset.x, 0.28, offset.z);
        truckGroup.add(wheelMesh);
        wheels.push(wheelMesh);
    });

    truckGroup.userData = { wheels: wheels, type: 'truck' };

    truckGroup.traverse(node => {
        if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
        }
    });

    return truckGroup;
}

// Create Chibi Scooter
function create3DScooter() {
    const scooterGroup = new THREE.Group();

    // Body frame
    const frameGeom = new THREE.BoxGeometry(1.0, 0.3, 0.3);
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xff2a74 });
    const frameMesh = new THREE.Mesh(frameGeom, frameMat);
    frameMesh.position.y = 0.3;
    scooterGroup.add(frameMesh);

    // Seat
    const seatGeom = new THREE.BoxGeometry(0.5, 0.15, 0.25);
    const seatMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const seatMesh = new THREE.Mesh(seatGeom, seatMat);
    seatMesh.position.set(-0.1, 0.45, 0);
    scooterGroup.add(seatMesh);

    // Handlebars vertical bar
    const barGeom = new THREE.BoxGeometry(0.1, 0.7, 0.1);
    const barMesh = new THREE.Mesh(barGeom, frameMat);
    barMesh.position.set(0.4, 0.65, 0);
    scooterGroup.add(barMesh);

    // Scooter Wheels
    const wheelGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 8);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    
    const wheels = [];
    [-0.4, 0.4].forEach(xOffset => {
        const wheelMesh = new THREE.Mesh(wheelGeom, wheelMat);
        wheelMesh.rotation.x = Math.PI / 2;
        wheelMesh.position.set(xOffset, 0.18, 0);
        scooterGroup.add(wheelMesh);
        wheels.push(wheelMesh);
    });

    scooterGroup.userData = { wheels: wheels, type: 'scooter' };

    scooterGroup.traverse(node => {
        if (node.isMesh) {
            node.castShadow = true;
        }
    });

    return scooterGroup;
}

// ----------------- 3D ENVIRONMENT INITIALIZATION -----------------

function init3D() {
    // 1. Setup Scene
    scene = new THREE.Scene();
    // Beautiful anime skyline fog
    scene.background = new THREE.Color(0x0f0c1b);
    scene.fog = new THREE.FogExp2(0x0f0c1b, 0.015);

    // 2. Setup Camera
    const width = canvasWrapper.clientWidth;
    const height = canvasWrapper.clientHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    
    // Position camera dynamically at isometric high angle
    camera.position.set(0, 16, 17);
    camera.lookAt(new THREE.Vector3(0, 0, -2));

    // 3. Setup Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Clear old elements and insert new 3D canvas
    canvasWrapper.innerHTML = '';
    canvasWrapper.appendChild(renderer.domElement);

    // 4. Setup Lighting
    // Ambient neon light tint
    const ambientLight = new THREE.AmbientLight(0x3e356b, 1.2);
    scene.add(ambientLight);

    // Directional (Sunlight casting shonen shadows)
    const dirLight = new THREE.DirectionalLight(0xfff5ee, 1.5);
    dirLight.position.set(15, 25, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 50;
    
    // Shadow bounds
    const d = 25;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    
    scene.add(dirLight);

    // 5. Build Grid Street Environment
    buildTokyoEnvironment();

    // 6. Spawn Player Rooster Keiji
    playerMesh = create3DPlayer();
    scene.add(playerMesh);
}

function buildTokyoEnvironment() {
    // Clear existing lanes
    roadLanes = [];

    // Visual configurations for lanes
    for (let r = 0; r < ROWS; r++) {
        const laneZ = getZFromRow(r);
        const laneType = getLaneType(r);

        const group = new THREE.Group();

        if (laneType === 'safe') {
            // Pavement concrete lane
            const pavementGeom = new THREE.BoxGeometry(COLS * GRID_UNIT, 0.3, GRID_UNIT);
            const pavementMat = new THREE.MeshStandardMaterial({ 
                color: 0x2a2240, 
                roughness: 0.8 
            });
            const pavement = new THREE.Mesh(pavementGeom, pavementMat);
            pavement.receiveShadow = true;
            group.add(pavement);

            // Add neon borders
            const lineGeom = new THREE.BoxGeometry(COLS * GRID_UNIT, 0.05, 0.05);
            const neonMat = new THREE.MeshBasicMaterial({ color: 0x05d9e8 });
            
            const lineFront = new THREE.Mesh(lineGeom, neonMat);
            lineFront.position.set(0, 0.16, GRID_UNIT/2);
            group.add(lineFront);

            const lineBack = new THREE.Mesh(lineGeom, neonMat);
            lineBack.position.set(0, 0.16, -GRID_UNIT/2);
            group.add(lineBack);

            // Spawn props (sakura tree or vending machine)
            for (let c = 0; c < COLS; c++) {
                const propX = getXFromCol(c);
                if ((c + r) % 4 === 0 && Math.abs(c - COLS/2) > 1) {
                    // Chibi Sakura Tree
                    const tree = create3DSakuraTree();
                    tree.position.set(propX, 0.15, 0);
                    group.add(tree);
                } else if ((c + r) % 7 === 0 && Math.abs(c - COLS/2) > 1) {
                    // Cute Vending Machine
                    const machine = create3DVendingMachine();
                    machine.position.set(propX, 0.15, 0);
                    group.add(machine);
                }
            }
        } else {
            // Asphalt street
            const asphaltGeom = new THREE.BoxGeometry(COLS * GRID_UNIT, 0.2, GRID_UNIT);
            const asphaltMat = new THREE.MeshStandardMaterial({ 
                color: 0x16132b,
                roughness: 0.9 
            });
            const asphalt = new THREE.Mesh(asphaltGeom, asphaltMat);
            asphalt.receiveShadow = true;
            group.add(asphalt);

            // Draw warning yellow borders next to safe lanes
            if (getLaneType(r - 1) === 'safe') {
                const warnGeom = new THREE.BoxGeometry(COLS * GRID_UNIT, 0.02, 0.08);
                const yellowMat = new THREE.MeshLambertMaterial({ color: 0xf5ee30 });
                const warningLine = new THREE.Mesh(warnGeom, yellowMat);
                warningLine.position.set(0, 0.11, -GRID_UNIT/2 + 0.1);
                group.add(warningLine);
            }

            // Zebra markings (on rows bordering safe blocks)
            if (r === ROWS - 2 || r === 4 || r === 9) {
                for (let c = 0; c < COLS; c += 2) {
                    const zebraGeom = new THREE.BoxGeometry(1.6, 0.01, GRID_UNIT - 0.4);
                    const zebraMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.15 });
                    const zebra = new THREE.Mesh(zebraGeom, zebraMat);
                    zebra.position.set(getXFromCol(c), 0.11, 0);
                    group.add(zebra);
                }
            }
        }

        group.position.set(0, 0, laneZ);
        scene.add(group);
        roadLanes.push(group);
    }
}

// Sakura Tree voxel model
function create3DSakuraTree() {
    const tree = new THREE.Group();
    // Trunk
    const trunkGeom = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4f3728 });
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 0.4;
    trunk.castShadow = true;
    tree.add(trunk);

    // Voxel pink foliage
    const foliageGeom = new THREE.BoxGeometry(0.8, 0.7, 0.8);
    const foliageMat = new THREE.MeshLambertMaterial({ color: 0xffb7c5 });
    const foliage = new THREE.Mesh(foliageGeom, foliageMat);
    foliage.position.y = 0.95;
    foliage.castShadow = true;
    tree.add(foliage);

    return tree;
}

// Chibi Vending Machine
function create3DVendingMachine() {
    const machine = new THREE.Group();
    
    const bodyGeom = new THREE.BoxGeometry(0.5, 0.9, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xff2a74 }); // red machine
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.45;
    body.castShadow = true;
    machine.add(body);

    const screenGeom = new THREE.BoxGeometry(0.35, 0.25, 0.05);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x05d9e8 }); // cyan glowing screen
    const screenMesh = new THREE.Mesh(screenGeom, screenMat);
    screenMesh.position.set(0, 0.65, 0.2);
    machine.add(screenMesh);

    return machine;
}

function getZFromRow(row) {
    return ROAD_START_Z - (row * GRID_UNIT) - GRID_UNIT / 2;
}

function getXFromCol(col) {
    return -((COLS * GRID_UNIT) / 2) + (col * GRID_UNIT) + GRID_UNIT / 2;
}

function getLaneType(row) {
    if (row === 0 || row === 5 || row === 10 || row === ROWS - 1) {
        return 'safe';
    }
    return 'road';
}


// ----------------- PLAYER LOGIC -----------------

// Grid position values
let playerGridX = Math.floor(COLS / 2);
let playerGridY = ROWS - 1;

// Jump Lerp details (parabolic movement)
let isJumping = false;
let jumpTime = 0;
const JUMP_DURATION = 15; // frames
let jumpStartX = 0, jumpStartZ = 0;
let jumpTargetX = 0, jumpTargetZ = 0;

// Rotate representation
let playerHeading = 0; // target rotation angle around Y

function movePlayer(dir) {
    if (gameOver || !gameStarted || isJumping) return;

    let nextGridX = playerGridX;
    let nextGridY = playerGridY;

    if (dir === 'up') {
        nextGridY--;
        playerHeading = 0; // Facing Up (away from camera)
    } else if (dir === 'down') {
        nextGridY++;
        playerHeading = Math.PI; // Facing Down
    } else if (dir === 'left') {
        nextGridX--;
        playerHeading = Math.PI / 2; // Facing Left
    } else if (dir === 'right') {
        nextGridX++;
        playerHeading = -Math.PI / 2; // Facing Right
    }

    // Boundary checks
    if (nextGridX >= 0 && nextGridX < COLS && nextGridY >= 0 && nextGridY < ROWS) {
        playerGridX = nextGridX;
        playerGridY = nextGridY;
        
        // Start parabolic jump animation
        isJumping = true;
        jumpTime = 0;
        
        jumpStartX = playerMesh.position.x;
        jumpStartZ = playerMesh.position.z;
        
        jumpTargetX = getXFromCol(playerGridX);
        jumpTargetZ = getZFromRow(playerGridY);

        playSound('jump');
        spawn3DFeathers(playerMesh.position.x, playerMesh.position.z, 3);

        // Score check (only give points for advancing up)
        const currentLevel = (ROWS - 1) - playerGridY;
        if (currentLevel * 10 > score) {
            const diff = (currentLevel * 10) - score;
            score += diff;
            updateScore();

            // Reached top Shibuya goal
            if (playerGridY === 0) {
                playSound('score');
                setTimeout(() => {
                    resetPlayer();
                    spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 8);
                }, 300);
            }
        }
    }
}

function resetPlayer() {
    playerGridX = Math.floor(COLS / 2);
    playerGridY = ROWS - 1;
    isJumping = false;
    playerMesh.position.set(getXFromCol(playerGridX), 0, getZFromRow(playerGridY));
    playerMesh.rotation.y = 0;
    playerHeading = 0;
    playerMesh.scale.set(1, 1, 1);
}

function updatePlayerAnimation() {
    // Rotation lerp
    let diffRot = playerHeading - playerMesh.rotation.y;
    // Handle wrap-around
    while (diffRot < -Math.PI) diffRot += Math.PI * 2;
    while (diffRot > Math.PI) diffRot -= Math.PI * 2;
    playerMesh.rotation.y += diffRot * 0.25;

    if (isJumping) {
        jumpTime++;
        const t = jumpTime / JUMP_DURATION;

        // Position Lerp
        playerMesh.position.x = jumpStartX + (jumpTargetX - jumpStartX) * t;
        playerMesh.position.z = jumpStartZ + (jumpTargetZ - jumpStartZ) * t;

        // Parabolic vertical jump arc (Height limit: 1.2 units)
        const jumpHeight = Math.sin(t * Math.PI) * 1.2;
        playerMesh.position.y = jumpHeight;

        // Squash and stretch scale keyframes
        const stretch = 1.0 + Math.sin(t * Math.PI) * 0.3;
        const squash = 1.0 - Math.sin(t * Math.PI) * 0.25;
        playerMesh.scale.set(squash, stretch, squash);

        if (jumpTime >= JUMP_DURATION) {
            playerMesh.position.x = jumpTargetX;
            playerMesh.position.z = jumpTargetZ;
            playerMesh.position.y = 0;
            playerMesh.scale.set(1, 1, 1);
            isJumping = false;
        }
    }
}


// ----------------- OBSTACLES (TRAFFIC) LOGIC -----------------

// Lane Configuration
const LANES = [
    { row: 1, speed: -0.15, rate: 0.015, type: 'car' },
    { row: 2, speed: 0.10,  rate: 0.010, type: 'truck' },
    { row: 3, speed: -0.09, rate: 0.018, type: 'scooter' },
    { row: 4, speed: 0.22,  rate: 0.008, type: 'car' },
    { row: 5, speed: 0,    rate: 0,     type: 'safe' },
    { row: 6, speed: -0.12, rate: 0.014, type: 'car' },
    { row: 7, speed: 0.09,  rate: 0.012, type: 'truck' },
    { row: 8, speed: -0.11, rate: 0.015, type: 'car' },
    { row: 9, speed: 0.16,  rate: 0.011, type: 'scooter' },
    { row: 10, speed: 0,   rate: 0,     type: 'safe' },
    { row: 11, speed: -0.18, rate: 0.009, type: 'car' },
    { row: 12, speed: 0.13,  rate: 0.013, type: 'car' }
];

const CAR_COLORS = [0xff2a74, 0x05d9e8, 0xf5ee30, 0xff8d00, 0x9b51e0, 0x47e62a];

function spawnTraffic() {
    LANES.forEach(lane => {
        if (lane.rate > 0) {
            const sameLaneObs = obstacles3D.filter(o => o.userData.row === lane.row);
            let canSpawn = true;
            const threshold = 10; // distance spacing in 3D units

            sameLaneObs.forEach(obs => {
                if (lane.speed > 0 && obs.position.x < -18 + threshold) canSpawn = false;
                if (lane.speed < 0 && obs.position.x > 18 - threshold) canSpawn = false;
            });

            if (canSpawn && Math.random() < lane.rate) {
                let mesh;
                const randomColor = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];

                if (lane.type === 'truck') {
                    mesh = create3DTruck();
                } else if (lane.type === 'scooter') {
                    mesh = create3DScooter();
                } else {
                    mesh = create3DCar(randomColor);
                }

                // Initial position off-screen
                const initialX = lane.speed > 0 ? -22 : 22;
                mesh.position.set(initialX, 0, getZFromRow(lane.row));
                
                // Rotate meshes to face correct driving direction
                if (lane.speed < 0) {
                    mesh.rotation.y = Math.PI; // flip direction
                }

                // Store metadata
                mesh.userData.row = lane.row;
                mesh.userData.speed = lane.speed * (0.85 + Math.random() * 0.3);

                scene.add(mesh);
                obstacles3D.push(mesh);
            }
        }
    });
}

function updateTraffic() {
    obstacles3D.forEach(obs => {
        // Move
        obs.position.x += obs.userData.speed;

        // Spin wheels
        if (obs.userData.wheels) {
            obs.userData.wheels.forEach(wheel => {
                // Direction rotation matches travel direction
                wheel.rotation.y += obs.userData.speed * 2.0;
            });
        }
    });

    // Remove off-screen obstacles
    const boundary = 25;
    obstacles3D.forEach(obs => {
        if (Math.abs(obs.position.x) > boundary) {
            scene.remove(obs);
        }
    });
    obstacles3D = obstacles3D.filter(obs => Math.abs(obs.position.x) <= boundary);
}


// ----------------- 3D PARTICLE SYSTEMS -----------------

class Particle3D {
    constructor(x, y, z, colorHex, type) {
        this.type = type; // 'feather', 'spark', 'sakura'
        this.color = colorHex;
        
        let geom;
        if (type === 'feather') {
            geom = new THREE.BoxGeometry(0.15, 0.05, 0.3);
        } else if (type === 'sakura') {
            geom = new THREE.BoxGeometry(0.12, 0.02, 0.2);
        } else {
            // sparks
            geom = new THREE.BoxGeometry(0.08, 0.08, 0.08);
        }

        const mat = new THREE.MeshBasicMaterial({ 
            color: colorHex, 
            transparent: true,
            opacity: 1.0
        });

        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(x, y, z);
        
        // Random velocities
        if (type === 'sakura') {
            this.vx = -0.05 - Math.random() * 0.05;
            this.vy = -0.08 - Math.random() * 0.08;
            this.vz = -0.04 - Math.random() * 0.04;
        } else if (type === 'spark') {
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = Math.random() * 0.3;
            this.vz = (Math.random() - 0.5) * 0.3;
        } else {
            // feathers
            this.vx = (Math.random() - 0.5) * 0.15;
            this.vy = (Math.random() - 0.5) * 0.1;
            this.vz = (Math.random() - 0.5) * 0.15;
        }

        // Rotational velocities
        this.rx = Math.random() * 0.1;
        this.ry = Math.random() * 0.1;

        this.alpha = 1.0;
        this.decay = 0.015 + Math.random() * 0.02;

        scene.add(this.mesh);
    }

    update() {
        this.mesh.position.x += this.vx;
        this.mesh.position.y += this.vy;
        this.mesh.position.z += this.vz;

        this.mesh.rotation.x += this.rx;
        this.mesh.rotation.y += this.ry;

        this.alpha -= this.decay;
        this.mesh.material.opacity = Math.max(0, this.alpha);
        
        // Add low gravity to feathers/sakura
        if (this.type !== 'spark') {
            this.vy -= 0.002;
        }
    }

    isDead() {
        return this.alpha <= 0;
    }

    destroy() {
        scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}

function spawn3DFeathers(x, z, count = 4) {
    for (let i = 0; i < count; i++) {
        const y = playerMesh.position.y + 0.3;
        particles3D.push(new Particle3D(
            x + (Math.random() - 0.5) * 0.5,
            y,
            z + (Math.random() - 0.5) * 0.5,
            0xffffff,
            'feather'
        ));
    }
}

// Spark explosion particles
function spawn3DSparks(x, z, count = 15) {
    const colors = [0xff2a74, 0x05d9e8, 0xf5ee30];
    for (let i = 0; i < count; i++) {
        const y = playerMesh.position.y + 0.3;
        const color = colors[Math.floor(Math.random() * colors.length)];
        particles3D.push(new Particle3D(x, y, z, color, 'spark'));
    }
}

function spawn3DSakuraWind() {
    if (Math.random() < 0.06) {
        // Spawn high in the sky, off-screen on the right/front
        const sx = 15 + Math.random() * 10;
        const sy = 10 + Math.random() * 5;
        const sz = playerMesh.position.z + 10 - Math.random() * 30;
        particles3D.push(new Particle3D(sx, sy, sz, 0xffc0cb, 'sakura'));
    }
}

function update3DParticles() {
    particles3D.forEach(p => p.update());
    // Destroy dead particles
    particles3D.forEach(p => {
        if (p.isDead()) {
            p.destroy();
        }
    });
    particles3D = particles3D.filter(p => !p.isDead());
}


// ----------------- COLLISION DETECTION -----------------

function checkCollisions() {
    if (isJumping && playerMesh.position.y > 0.5) return; // Jump above traffic height gives safety!

    // Simple bounding box checks
    const pX = playerMesh.position.x;
    const pZ = playerMesh.position.z;
    const pRadius = 0.45; // collision width

    for (let obs of obstacles3D) {
        const oX = obs.position.x;
        const oZ = obs.position.z;
        
        // Get obstacle bounds based on type
        const oWidth = obs.userData.type === 'truck' ? 2.3 : (obs.userData.type === 'scooter' ? 0.9 : 1.5);
        const oDepth = 0.8;

        if (Math.abs(pZ - oZ) < (pRadius + oDepth / 2)) {
            if (Math.abs(pX - oX) < (pRadius + oWidth / 2)) {
                // COLLISION MATCHED!
                handleHit();
                break;
            }
        }
    }
}

function handleHit() {
    lives--;
    updateHearts();
    
    // Screen shake trigger
    shakeIntensity = 0.8;

    // Sparks & Feathers
    spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 22);
    spawn3DFeathers(playerMesh.position.x, playerMesh.position.z, 15);

    playSound('crash');

    if (lives <= 0) {
        endGame();
    } else {
        resetPlayer();
    }
}


// ----------------- GAME STATE CONTROL LOOP -----------------

function update() {
    if (!gameStarted || gameOver) return;

    frameCount++;

    updatePlayerAnimation();
    spawnTraffic();
    updateTraffic();
    checkCollisions();
    spawn3DSakuraWind();
    update3DParticles();

    // Camera follow lerp (keep player centered z-wise)
    const targetCamZ = playerMesh.position.z + 17;
    camera.position.z += (targetCamZ - camera.position.z) * 0.1;
    
    const targetCamX = playerMesh.position.x * 0.6;
    camera.position.x += (targetCamX - camera.position.x) * 0.05;

    // Shake camera logic decay
    if (shakeIntensity > 0) {
        camera.position.x += (Math.random() - 0.5) * shakeIntensity;
        camera.position.y += (Math.random() - 0.5) * shakeIntensity;
        shakeIntensity *= 0.88;
    } else {
        camera.position.y += (16 - camera.position.y) * 0.1; // lerp back to 16
    }
}

function render() {
    if (renderer) {
        renderer.render(scene, camera);
    }
}

function gameLoop() {
    update();
    render();
    requestAnimationFrame(gameLoop);
}


// ----------------- UI / EVENTS LOGIC -----------------

function updateScore() {
    const paddedScore = String(score).padStart(4, '0');
    currentScoreEl.textContent = paddedScore;
}

function updateHearts() {
    const hearts = heartsEl.querySelectorAll('.heart');
    hearts.forEach((heart, idx) => {
        if (idx >= lives) {
            heart.classList.add('lost');
        } else {
            heart.classList.remove('lost');
        }
    });
}

function resetHearts() {
    const hearts = heartsEl.querySelectorAll('.heart');
    hearts.forEach(heart => heart.classList.remove('lost'));
}

function startGame() {
    initAudio();
    
    // Capture user name
    currentPlayerName = playerNameInput.value.trim().toUpperCase() || "GALOLUTADOR";
    
    gameStarted = true;
    gameOver = false;
    score = 0;
    lives = 3;
    
    // Clear old elements from scene
    obstacles3D.forEach(obs => scene.remove(obs));
    obstacles3D = [];
    particles3D.forEach(p => scene.remove(p.mesh));
    particles3D = [];

    updateScore();
    resetHearts();
    resetPlayer();
    
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');

    spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 8);
}

function endGame() {
    gameOver = true;
    gameStarted = false;
    finalScoreEl.textContent = score;

    // Save score and check record
    const isNewRecord = saveScore(currentPlayerName, score);
    
    if (isNewRecord) {
        recordStatusEl.textContent = 'SIM! 🔥';
        recordStatusEl.style.color = 'var(--yellow)';
    } else {
        recordStatusEl.textContent = 'Não';
        recordStatusEl.style.color = 'var(--text-muted)';
    }

    // Refresh Leaderboard views
    populateLeaderboards();

    playSound('gameover');
    gameOverScreen.classList.add('active');
}

// Controls listeners
window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        // Prevent default browser scrolling only when typing fields are not focused!
        if (document.activeElement !== playerNameInput) {
            e.preventDefault();
        }
    }
    
    if (keys[e.code]) return;
    keys[e.code] = true;

    if (!gameStarted || gameOver || document.activeElement === playerNameInput) return;

    if (e.code === 'ArrowUp' || e.code === 'KeyW') movePlayer('up');
    if (e.code === 'ArrowDown' || e.code === 'KeyS') movePlayer('down');
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') movePlayer('left');
    if (e.code === 'ArrowRight' || e.code === 'KeyD') movePlayer('right');
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
});

// Start Clicking
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Mute toggle
muteBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
        muteBtn.textContent = '🔊 Som: Ligado';
        muteBtn.style.color = 'var(--secondary)';
    } else {
        muteBtn.textContent = '🔇 Som: Mudo';
        muteBtn.style.color = 'var(--text-muted)';
    }
});

// Mobile button listeners
document.getElementById('btn-up').addEventListener('touchstart', (e) => { e.preventDefault(); movePlayer('up'); });
document.getElementById('btn-down').addEventListener('touchstart', (e) => { e.preventDefault(); movePlayer('down'); });
document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); movePlayer('left'); });
document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); movePlayer('right'); });

document.getElementById('btn-up').addEventListener('mousedown', () => movePlayer('up'));
document.getElementById('btn-down').addEventListener('mousedown', () => movePlayer('down'));
document.getElementById('btn-left').addEventListener('mousedown', () => movePlayer('left'));
document.getElementById('btn-right').addEventListener('mousedown', () => movePlayer('right'));

// Resize window handler
window.addEventListener('resize', () => {
    if (camera && renderer && canvasWrapper) {
        const w = canvasWrapper.clientWidth;
        const h = canvasWrapper.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
});

// Init 3D environment and kick off loop
init3D();
requestAnimationFrame(gameLoop);
