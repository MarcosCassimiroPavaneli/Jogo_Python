/**
 * Koko-chan 3D: Tokyo Crossing (Rooster Fighter Edition)
 * Core 3D Game Engine - Fullscreen + Infinite Difficulty + High-Detail Rooster
 */

// DOM Elements
const canvasWrapper = document.getElementById('canvas-wrapper');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startGlowBox = document.getElementById('start-glow-box');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const currentScoreEl = document.getElementById('current-score');
const finalScoreEl = document.getElementById('final-score');
const recordStatusEl = document.getElementById('record-status');
const heartsEl = document.getElementById('hearts');
const muteBtn = document.getElementById('mute-btn');
const playerNameInput = document.getElementById('player-name');
const nameErrorMsg = document.getElementById('name-error-msg');
const leaderboardStart = document.getElementById('leaderboard-start');
const leaderboardOver = document.getElementById('leaderboard-over');

// Game Constants
const GRID_UNIT = 3;
const COLS = 14;
const ROWS = 14;
const ROAD_START_Z = 21;

// Game State
let score = 0;
let lives = 3;
let gameOver = false;
let gameStarted = false;
let soundEnabled = true;
let keys = {};
let frameCount = 0;
let currentPlayerName = '';

// ---- Difficulty System ----
// Phase 1 (start): multiplier = 1.0
// Phase 2 (after 1st crossing): multiplier = 1.4 (locked, no further increase)
let difficultyPhase = 1;
let difficultyMultiplier = 1.0;

// Three.js
let scene, camera, renderer;
let playerMesh;
let roadLanes = [];
let obstacles3D = [];
let particles3D = [];

// Screen shake
let shakeIntensity = 0;

// Web Audio
const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function initAudio() {
    if (!audioCtx) audioCtx = new AudioCtxClass();
}

function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'jump') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.15);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'crash') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.linearRampToValueAtTime(30, now + 0.4);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
        const osc2 = audioCtx.createOscillator();
        const g2 = audioCtx.createGain();
        osc2.connect(g2); g2.connect(audioCtx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(60, now);
        g2.gain.setValueAtTime(0.3, now);
        g2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc2.start(now); osc2.stop(now + 0.5);
    } else if (type === 'levelup') {
        osc.type = 'sine';
        [523, 659, 784, 1047].forEach((f, i) => {
            osc.frequency.setValueAtTime(f, now + i * 0.08);
        });
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    } else if (type === 'score') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, now);
        osc.frequency.setValueAtTime(659, now + 0.08);
        osc.frequency.setValueAtTime(784, now + 0.16);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    } else if (type === 'gameover') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(80, now + 0.8);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    }
}

// ---- Leaderboard ----
function getLeaderboard() {
    try {
        const raw = localStorage.getItem('koko_3d_leaderboard_v2');
        if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
}

function saveScore(name, sc) {
    const list = getLeaderboard();
    list.push({ name: name.trim().toUpperCase(), score: sc });
    list.sort((a,b) => b.score - a.score);
    const top5 = list.slice(0,5);
    localStorage.setItem('koko_3d_leaderboard_v2', JSON.stringify(top5));
    return top5[0].name === name.trim().toUpperCase() && top5[0].score === sc;
}

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function populateLeaderboards() {
    const list = getLeaderboard();
    [leaderboardStart, leaderboardOver].forEach(container => {
        if (!container) return;
        container.innerHTML = '';
        if (list.length === 0) {
            container.innerHTML = '<div class="leaderboard-row empty">Seja o primeiro a jogar!</div>';
            return;
        }
        list.forEach((e, i) => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row' + (e.name === currentPlayerName.toUpperCase() ? ' highlight' : '');
            row.innerHTML = `<div><span class="rank-num">#${i+1}</span><span class="rank-name">${escapeHtml(e.name)}</span></div><span class="rank-score">${e.score} pts</span>`;
            container.appendChild(row);
        });
    });
}
populateLeaderboards();

// ---- Name Validation ----
function validateName(name) {
    const cleaned = name.trim();
    if (cleaned.length < 2) return false;
    if (/^\s+$/.test(cleaned)) return false;
    return true;
}

function showNameError() {
    nameErrorMsg.classList.add('active');
    playerNameInput.style.borderColor = 'var(--primary)';
    playerNameInput.style.boxShadow = '0 0 15px var(--primary-glow)';
    startGlowBox.classList.remove('shake');
    void startGlowBox.offsetWidth; // reflow for re-trigger
    startGlowBox.classList.add('shake');
    setTimeout(() => nameErrorMsg.classList.remove('active'), 3000);
    setTimeout(() => {
        playerNameInput.style.borderColor = '';
        playerNameInput.style.boxShadow = '';
    }, 800);
}

playerNameInput.addEventListener('input', () => {
    nameErrorMsg.classList.remove('active');
    playerNameInput.style.borderColor = '';
    playerNameInput.style.boxShadow = '';
});

// ---- Procedural 3D Models ----

// HIGH-DETAIL Rooster Fighter (Keiji) with headband, gloves, belt
function create3DPlayer() {
    const g = new THREE.Group();
    
    const white = new THREE.MeshLambertMaterial({ color: 0xfafafa });
    const red   = new THREE.MeshLambertMaterial({ color: 0xff1040 });
    const yellow = new THREE.MeshLambertMaterial({ color: 0xffcc00 });
    const black = new THREE.MeshLambertMaterial({ color: 0x0d0d0d });
    const gold  = new THREE.MeshLambertMaterial({ color: 0xffd700 });
    const darkRed = new THREE.MeshLambertMaterial({ color: 0xcc0020 });
    const neonRed = new THREE.MeshLambertMaterial({ color: 0xff3366, emissive: new THREE.Color(0x440011) });
    const skin  = new THREE.MeshLambertMaterial({ color: 0xffe0a0 });
    
    const box = (w,h,d) => new THREE.BoxGeometry(w,h,d);
    const mk = (geom, mat) => { const m = new THREE.Mesh(geom, mat); m.castShadow = true; return m; };

    // --- LEGS (muscular, two thick columns) ---
    const lLeg = mk(box(0.28,0.32,0.28), yellow);
    lLeg.position.set(-0.18, 0.16, 0);
    g.add(lLeg);
    const rLeg = mk(box(0.28,0.32,0.28), yellow);
    rLeg.position.set(0.18, 0.16, 0);
    g.add(rLeg);
    // Feet
    const lFoot = mk(box(0.3,0.08,0.36), yellow);
    lFoot.position.set(-0.18, 0.02, 0.04);
    g.add(lFoot);
    const rFoot = mk(box(0.3,0.08,0.36), yellow);
    rFoot.position.set(0.18, 0.02, 0.04);
    g.add(rFoot);
    // Toe claws
    for (let i=-1; i<=1; i++) {
        const claw = mk(box(0.05,0.05,0.12), yellow);
        claw.position.set(-0.18 + i*0.09, 0.01, 0.22);
        g.add(claw);
        const claw2 = mk(box(0.05,0.05,0.12), yellow);
        claw2.position.set(0.18 + i*0.09, 0.01, 0.22);
        g.add(claw2);
    }

    // --- BODY (wide, barrel-chest) ---
    const body = mk(box(0.88,0.78,0.82), white);
    body.position.set(0, 0.7, 0);
    g.add(body);
    
    // Belly highlight stripe (bright white accent)
    const belly = mk(box(0.5,0.3,0.04), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    belly.position.set(0, 0.58, 0.42);
    g.add(belly);

    // --- CHAMPION BELT ---
    const belt = mk(box(0.92,0.12,0.86), gold);
    belt.position.set(0, 0.38, 0);
    g.add(belt);
    // Belt buckle center
    const buckle = mk(box(0.18,0.16,0.06), new THREE.MeshLambertMaterial({ color: 0xffd700, emissive: new THREE.Color(0x443300) }));
    buckle.position.set(0, 0.38, 0.45);
    g.add(buckle);
    // Belt studs
    for (let i=-2; i<=2; i++) {
        if (i === 0) continue;
        const stud = mk(box(0.06,0.06,0.05), gold);
        stud.position.set(i * 0.15, 0.38, 0.44);
        g.add(stud);
    }

    // --- WINGS (dramatic spread) ---
    const lWing1 = mk(box(0.14,0.5,0.42), white);
    lWing1.position.set(-0.5, 0.65, 0);
    lWing1.rotation.z = 0.15;
    g.add(lWing1);
    const lWing2 = mk(box(0.1,0.28,0.32), new THREE.MeshLambertMaterial({color:0xeeeeee}));
    lWing2.position.set(-0.62, 0.44, 0.05);
    lWing2.rotation.z = 0.25;
    g.add(lWing2);

    const rWing1 = mk(box(0.14,0.5,0.42), white);
    rWing1.position.set(0.5, 0.65, 0);
    rWing1.rotation.z = -0.15;
    g.add(rWing1);
    const rWing2 = mk(box(0.1,0.28,0.32), new THREE.MeshLambertMaterial({color:0xeeeeee}));
    rWing2.position.set(0.62, 0.44, 0.05);
    rWing2.rotation.z = -0.25;
    g.add(rWing2);

    // ---- BOXING GLOVES (strapped to wings) ----
    // Left glove - chunky red boxing glove
    const lGlove = mk(box(0.28,0.26,0.3), neonRed);
    lGlove.position.set(-0.68, 0.6, 0.1);
    g.add(lGlove);
    const lGloveKnuck = mk(box(0.24,0.1,0.08), darkRed);
    lGloveKnuck.position.set(-0.68, 0.68, 0.25);
    g.add(lGloveKnuck);
    // Glove strap
    const lStrap = mk(box(0.22,0.06,0.04), gold);
    lStrap.position.set(-0.68, 0.44, 0.24);
    g.add(lStrap);

    // Right glove
    const rGlove = mk(box(0.28,0.26,0.3), neonRed);
    rGlove.position.set(0.68, 0.6, 0.1);
    g.add(rGlove);
    const rGloveKnuck = mk(box(0.24,0.1,0.08), darkRed);
    rGloveKnuck.position.set(0.68, 0.68, 0.25);
    g.add(rGloveKnuck);
    const rStrap = mk(box(0.22,0.06,0.04), gold);
    rStrap.position.set(0.68, 0.44, 0.24);
    g.add(rStrap);

    // --- HEAD (round, larger) ---
    const head = mk(box(0.75,0.72,0.72), white);
    head.position.set(0, 1.34, 0);
    g.add(head);
    
    // Cheek puffs (chibi)
    const lCheek = mk(box(0.12,0.14,0.08), new THREE.MeshLambertMaterial({color:0xffcccc}));
    lCheek.position.set(-0.37, 1.28, 0.35);
    g.add(lCheek);
    const rCheek = mk(box(0.12,0.14,0.08), new THREE.MeshLambertMaterial({color:0xffcccc}));
    rCheek.position.set(0.37, 1.28, 0.35);
    g.add(rCheek);
    
    // Wattle (red throat badge of a fighter)
    const wattle = mk(box(0.22,0.18,0.07), red);
    wattle.position.set(0, 1.1, 0.37);
    g.add(wattle);

    // --- EYES (large, determined anime eyes) ---
    // Eye whites
    const lEyeWhite = mk(box(0.18,0.18,0.06), new THREE.MeshLambertMaterial({color:0xffffff}));
    lEyeWhite.position.set(-0.22, 1.38, 0.37);
    g.add(lEyeWhite);
    const rEyeWhite = mk(box(0.18,0.18,0.06), new THREE.MeshLambertMaterial({color:0xffffff}));
    rEyeWhite.position.set(0.22, 1.38, 0.37);
    g.add(rEyeWhite);
    // Pupils (large, determined)
    const lPupil = mk(box(0.1,0.12,0.04), black);
    lPupil.position.set(-0.2, 1.37, 0.41);
    g.add(lPupil);
    const rPupil = mk(box(0.1,0.12,0.04), black);
    rPupil.position.set(0.22, 1.37, 0.41);
    g.add(rPupil);
    // Angry eyebrow lines
    const lBrow = mk(box(0.2,0.05,0.04), black);
    lBrow.position.set(-0.21, 1.5, 0.38);
    lBrow.rotation.z = 0.3;
    g.add(lBrow);
    const rBrow = mk(box(0.2,0.05,0.04), black);
    rBrow.position.set(0.21, 1.5, 0.38);
    rBrow.rotation.z = -0.3;
    g.add(rBrow);
    // Eye glint
    const lGlint = mk(box(0.04,0.04,0.03), new THREE.MeshBasicMaterial({color:0xffffff}));
    lGlint.position.set(-0.17, 1.42, 0.42);
    g.add(lGlint);
    const rGlint = mk(box(0.04,0.04,0.03), new THREE.MeshBasicMaterial({color:0xffffff}));
    rGlint.position.set(0.25, 1.42, 0.42);
    g.add(rGlint);

    // --- BEAK (strong, sharp) ---
    const beakTop = mk(box(0.2,0.1,0.22), yellow);
    beakTop.position.set(0, 1.28, 0.46);
    g.add(beakTop);
    const beakBot = mk(box(0.16,0.08,0.18), new THREE.MeshLambertMaterial({color:0xffaa00}));
    beakBot.position.set(0, 1.18, 0.45);
    g.add(beakBot);

    // --- COMB (multi-voxel warrior crest) ---
    const combBase = mk(box(0.16,0.14,0.56), red);
    combBase.position.set(0, 1.72, 0.05);
    g.add(combBase);
    // Crest spikes
    const spike1 = mk(box(0.12,0.3,0.14), red);
    spike1.position.set(0, 1.88, 0.18);
    g.add(spike1);
    const spike2 = mk(box(0.1,0.4,0.12), red);
    spike2.position.set(0, 1.94, -0.02);
    g.add(spike2);
    const spike3 = mk(box(0.1,0.26,0.12), red);
    spike3.position.set(0, 1.84, -0.2);
    g.add(spike3);

    // --- WARRIOR HEADBAND (red with kanji motif) ---
    const band = mk(box(0.82,0.1,0.76), new THREE.MeshLambertMaterial({color:0xdd0022}));
    band.position.set(0, 1.56, 0);
    g.add(band);
    // Gold trim on headband
    const bandTrimF = mk(box(0.84,0.03,0.04), gold);
    bandTrimF.position.set(0, 1.6, 0.38);
    g.add(bandTrimF);
    const bandTrimB = mk(box(0.84,0.03,0.04), gold);
    bandTrimB.position.set(0, 1.6, -0.38);
    g.add(bandTrimB);
    // Headband knot at back
    const knot = mk(box(0.16,0.14,0.1), new THREE.MeshLambertMaterial({color:0xcc0020}));
    knot.position.set(0, 1.54, -0.42);
    g.add(knot);
    // Trailing knot tails (flowing back)
    const tail1 = mk(box(0.07,0.32,0.06), new THREE.MeshLambertMaterial({color:0xdd0022}));
    tail1.position.set(-0.05, 1.34, -0.46);
    tail1.rotation.x = 0.3;
    g.add(tail1);
    const tail2 = mk(box(0.07,0.28,0.06), new THREE.MeshLambertMaterial({color:0xcc0022}));
    tail2.position.set(0.05, 1.32, -0.5);
    tail2.rotation.x = 0.5;
    g.add(tail2);

    // Enable shadows on all
    g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    return g;
}

function create3DCar(colorHex) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: colorHex });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a1835, transparent: true, opacity: 0.85 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffca0 });
    const rimMat   = new THREE.MeshLambertMaterial({ color: 0xaaaaaa });

    // Chassis
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.55,1.0), bodyMat);
    chassis.position.y = 0.42; g.add(chassis);
    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.05,0.48,0.9), glassMat);
    cab.position.set(-0.12,0.88,0); g.add(cab);
    // Hood slope
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.14,0.92), bodyMat);
    hood.position.set(0.63,0.78,0); g.add(hood);
    // Spoiler
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.7,0.08,1.0), bodyMat);
    spoiler.position.set(-0.72,0.88,0); g.add(spoiler);

    // Wheels
    const wGeom = new THREE.CylinderGeometry(0.24,0.24,0.14,10);
    const rimGeom = new THREE.CylinderGeometry(0.14,0.14,0.15,8);
    const wheels = [];
    [[-0.55,-0.55],[-0.55,0.55],[0.55,-0.55],[0.55,0.55]].forEach(([x,z]) => {
        const w = new THREE.Mesh(wGeom, wheelMat);
        w.rotation.x = Math.PI/2;
        w.position.set(x, 0.24, z); g.add(w);
        const rim = new THREE.Mesh(rimGeom, rimMat);
        rim.rotation.x = Math.PI/2;
        rim.position.set(x, 0.24, z); g.add(rim);
        wheels.push(w);
    });

    // Headlights
    [[-0.3],[0.3]].forEach(([z]) => {
        const h = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.14,0.14), lightMat);
        h.position.set(0.86,0.5,z); g.add(h);
    });
    // Tail lights (red)
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    [[-0.3],[0.3]].forEach(([z]) => {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.1,0.12), tailMat);
        t.position.set(-0.86,0.52,z); g.add(t);
    });

    g.userData = { wheels, type: 'car' };
    g.traverse(n => { if(n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    return g;
}

function create3DTruck() {
    const g = new THREE.Group();
    const cargoMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
    const cabMat   = new THREE.MeshLambertMaterial({ color: 0x05d9e8 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.5,1.3,1.1), cargoMat);
    cargo.position.set(-0.4,0.95,0); g.add(cargo);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,1.05), cabMat);
    cab.position.set(1.15,0.75,0); g.add(cab);
    const wind = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.45,0.85), new THREE.MeshLambertMaterial({color:0x1a1835, transparent:true, opacity:0.8}));
    wind.position.set(1.56,0.82,0); g.add(wind);

    const wGeom = new THREE.CylinderGeometry(0.28,0.28,0.16,10);
    const wheels = [];
    [[-1.1,-0.62],[-1.1,0.62],[-0.2,-0.62],[-0.2,0.62],[0.88,-0.62],[0.88,0.62]].forEach(([x,z]) => {
        const w = new THREE.Mesh(wGeom, wheelMat);
        w.rotation.x = Math.PI/2;
        w.position.set(x,0.28,z); g.add(w);
        wheels.push(w);
    });

    g.userData = { wheels, type: 'truck' };
    g.traverse(n => { if(n.isMesh) { n.castShadow = true; n.receiveShadow = true; } });
    return g;
}

function create3DScooter() {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0xff2a74 });
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.05,0.28,0.28), frameMat);
    frame.position.y = 0.3; g.add(frame);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55,0.14,0.24), new THREE.MeshLambertMaterial({color:0x222222}));
    seat.position.set(-0.1,0.45,0); g.add(seat);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08,0.65,0.08), frameMat);
    bar.position.set(0.42,0.65,0); g.add(bar);

    const wGeom = new THREE.CylinderGeometry(0.18,0.18,0.1,10);
    const wheels = [];
    [-0.42,0.42].forEach(x => {
        const w = new THREE.Mesh(wGeom, wheelMat);
        w.rotation.x = Math.PI/2;
        w.position.set(x,0.18,0); g.add(w);
        wheels.push(w);
    });

    g.userData = { wheels, type: 'scooter' };
    g.traverse(n => { if(n.isMesh) n.castShadow = true; });
    return g;
}

function create3DSakuraTree() {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.13,0.9,7), new THREE.MeshLambertMaterial({color:0x4f3728}));
    trunk.position.y = 0.45; trunk.castShadow = true; g.add(trunk);
    const foliage = new THREE.Mesh(new THREE.BoxGeometry(0.9,0.8,0.9), new THREE.MeshLambertMaterial({color:0xffb7c5}));
    foliage.position.y = 1.0; foliage.castShadow = true; g.add(foliage);
    return g;
}

function create3DVendingMachine() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55,1.0,0.45), new THREE.MeshLambertMaterial({color:0xff2a74}));
    body.position.y = 0.5; body.castShadow = true; g.add(body);
    const scr = new THREE.Mesh(new THREE.BoxGeometry(0.38,0.28,0.06), new THREE.MeshBasicMaterial({color:0x05d9e8}));
    scr.position.set(0,0.7,0.22); g.add(scr);
    return g;
}

// ---- Environment Setup ----
function getZFromRow(row) { return ROAD_START_Z - row * GRID_UNIT - GRID_UNIT / 2; }
function getXFromCol(col) { return -((COLS * GRID_UNIT) / 2) + col * GRID_UNIT + GRID_UNIT / 2; }
function getLaneType(row) {
    if (row === 0 || row === 5 || row === 10 || row === ROWS - 1) return 'safe';
    return 'road';
}

function init3D() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0a17);
    scene.fog = new THREE.FogExp2(0x0c0a17, 0.012);

    const w = window.innerWidth, h = window.innerHeight;
    camera = new THREE.PerspectiveCamera(50, w/h, 0.1, 150);
    camera.position.set(0, 18, 18);
    camera.lookAt(new THREE.Vector3(0, 0, -2));

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // insert canvas behind overlays
    canvasWrapper.insertBefore(renderer.domElement, canvasWrapper.firstChild);

    // Lighting
    const ambient = new THREE.AmbientLight(0x3e356b, 1.4);
    scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xfff5ee, 2.0);
    dir.position.set(20, 30, 15);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    const d = 30;
    dir.shadow.camera.left = -d; dir.shadow.camera.right = d;
    dir.shadow.camera.top = d; dir.shadow.camera.bottom = -d;
    dir.shadow.camera.far = 80;
    scene.add(dir);

    // Neon accent lights
    const pink = new THREE.PointLight(0xff2a74, 0.6, 20);
    pink.position.set(-5, 5, 5);
    scene.add(pink);
    const cyan = new THREE.PointLight(0x05d9e8, 0.5, 20);
    cyan.position.set(5, 5, 5);
    scene.add(cyan);

    buildEnvironment();

    playerMesh = create3DPlayer();
    scene.add(playerMesh);
}

function buildEnvironment() {
    roadLanes = [];
    for (let r = 0; r < ROWS; r++) {
        const laneZ = getZFromRow(r);
        const type = getLaneType(r);
        const grp = new THREE.Group();

        if (type === 'safe') {
            const pave = new THREE.Mesh(new THREE.BoxGeometry(COLS*GRID_UNIT, 0.3, GRID_UNIT), new THREE.MeshStandardMaterial({color:0x2a2240,roughness:0.8}));
            pave.receiveShadow = true; grp.add(pave);

            const neon = new THREE.MeshBasicMaterial({color:0x05d9e8});
            [GRID_UNIT/2, -GRID_UNIT/2].forEach(z => {
                const l = new THREE.Mesh(new THREE.BoxGeometry(COLS*GRID_UNIT, 0.05,0.05), neon);
                l.position.set(0, 0.17, z); grp.add(l);
            });

            for (let c = 0; c < COLS; c++) {
                const px = getXFromCol(c);
                if ((c+r)%4===0 && Math.abs(c-COLS/2)>1) {
                    const t = create3DSakuraTree(); t.position.set(px,0.15,0); grp.add(t);
                } else if ((c+r)%7===0 && Math.abs(c-COLS/2)>1) {
                    const v = create3DVendingMachine(); v.position.set(px,0.15,0); grp.add(v);
                }
            }
        } else {
            const asph = new THREE.Mesh(new THREE.BoxGeometry(COLS*GRID_UNIT,0.2,GRID_UNIT), new THREE.MeshStandardMaterial({color:0x14112a,roughness:0.9}));
            asph.receiveShadow = true; grp.add(asph);

            if (getLaneType(r-1)==='safe') {
                const warn = new THREE.Mesh(new THREE.BoxGeometry(COLS*GRID_UNIT,0.02,0.1), new THREE.MeshLambertMaterial({color:0xf5ee30}));
                warn.position.set(0,0.11,-GRID_UNIT/2+0.1); grp.add(warn);
            }
            if (r===ROWS-2||r===4||r===9) {
                for (let c=0;c<COLS;c+=2) {
                    const zb = new THREE.Mesh(new THREE.BoxGeometry(1.7,0.01,GRID_UNIT-0.4), new THREE.MeshLambertMaterial({color:0xffffff,transparent:true,opacity:0.15}));
                    zb.position.set(getXFromCol(c),0.11,0); grp.add(zb);
                }
            }
        }

        grp.position.set(0, 0, laneZ);
        scene.add(grp);
        roadLanes.push(grp);
    }
}

// ---- Player State ----
let playerGridX = Math.floor(COLS/2);
let playerGridY = ROWS - 1;
let isJumping = false, jumpTime = 0;
const JUMP_DURATION = 14;
let jumpStartX = 0, jumpStartZ = 0, jumpTargetX = 0, jumpTargetZ = 0;
let playerHeading = 0;

function resetPlayer() {
    playerGridX = Math.floor(COLS/2);
    playerGridY = ROWS - 1;
    isJumping = false;
    playerMesh.position.set(getXFromCol(playerGridX), 0, getZFromRow(playerGridY));
    playerMesh.rotation.y = 0;
    playerHeading = 0;
    playerMesh.scale.set(1,1,1);
}

function movePlayer(dir) {
    if (gameOver || !gameStarted || isJumping) return;
    let nx = playerGridX, ny = playerGridY;
    if (dir==='up')    { ny--; playerHeading = 0; }
    else if (dir==='down') { ny++; playerHeading = Math.PI; }
    else if (dir==='left') { nx--; playerHeading = Math.PI/2; }
    else if (dir==='right') { nx++; playerHeading = -Math.PI/2; }

    if (nx>=0 && nx<COLS && ny>=0 && ny<ROWS) {
        playerGridX = nx; playerGridY = ny;
        isJumping = true; jumpTime = 0;
        jumpStartX = playerMesh.position.x;
        jumpStartZ = playerMesh.position.z;
        jumpTargetX = getXFromCol(playerGridX);
        jumpTargetZ = getZFromRow(playerGridY);
        playSound('jump');
        spawn3DFeathers(playerMesh.position.x, playerMesh.position.z, 3);

        const level = (ROWS-1) - playerGridY;
        if (level * 10 > score) {
            score += (level*10) - score;
            updateScore();
        }

        if (playerGridY === 0) {
            // Reached the top! Level up difficulty once
            playSound('score');
            if (difficultyPhase === 1) {
                difficultyPhase = 2;
                difficultyMultiplier = 1.4;
                playSound('levelup');
                showLevelUpBanner();
            }
            // Reset back to bottom for infinite play
            setTimeout(() => {
                resetPlayer();
                spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 10);
            }, 250);
        }
    }
}

let levelUpBannerTimeout = null;
function showLevelUpBanner() {
    // Create a temporary DOM banner
    const banner = document.createElement('div');
    banner.style.cssText = `
        position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
        background:rgba(245,238,48,0.95); color:#0f0c1b;
        font-family:'Press Start 2P',monospace; font-size:22px;
        padding:20px 36px; border-radius:16px;
        box-shadow:0 0 40px rgba(245,238,48,0.7);
        z-index:9999; text-align:center; letter-spacing:2px;
        pointer-events:none;
        animation:banner-pop 0.3s ease;
    `;
    banner.innerHTML = '⚡ FASE 2! ⚡<br><span style="font-size:12px;color:#440;">DIFICULDADE AUMENTADA!</span>';
    document.body.appendChild(banner);
    if (levelUpBannerTimeout) clearTimeout(levelUpBannerTimeout);
    levelUpBannerTimeout = setTimeout(() => {
        banner.style.opacity = '0';
        banner.style.transition = 'opacity 0.5s';
        setTimeout(() => banner.remove(), 600);
    }, 2200);
}

function updatePlayerAnimation() {
    let dr = playerHeading - playerMesh.rotation.y;
    while (dr < -Math.PI) dr += Math.PI*2;
    while (dr >  Math.PI) dr -= Math.PI*2;
    playerMesh.rotation.y += dr * 0.22;

    if (isJumping) {
        jumpTime++;
        const t = jumpTime / JUMP_DURATION;
        playerMesh.position.x = jumpStartX + (jumpTargetX-jumpStartX)*t;
        playerMesh.position.z = jumpStartZ + (jumpTargetZ-jumpStartZ)*t;
        playerMesh.position.y = Math.sin(t*Math.PI) * 1.4;
        const s = 1 + Math.sin(t*Math.PI)*0.3;
        const sq = 1 - Math.sin(t*Math.PI)*0.25;
        playerMesh.scale.set(sq,s,sq);
        if (jumpTime >= JUMP_DURATION) {
            playerMesh.position.set(jumpTargetX, 0, jumpTargetZ);
            playerMesh.scale.set(1,1,1);
            isJumping = false;
        }
    }
}

// ---- Lane Config ----
const BASE_LANES = [
    { row:1,  speed:-0.16, rate:0.014, type:'car' },
    { row:2,  speed:0.11,  rate:0.010, type:'truck' },
    { row:3,  speed:-0.10, rate:0.017, type:'scooter' },
    { row:4,  speed:0.24,  rate:0.008, type:'car' },
    { row:6,  speed:-0.13, rate:0.014, type:'car' },
    { row:7,  speed:0.10,  rate:0.012, type:'truck' },
    { row:8,  speed:-0.12, rate:0.015, type:'car' },
    { row:9,  speed:0.17,  rate:0.011, type:'scooter' },
    { row:11, speed:-0.19, rate:0.009, type:'car' },
    { row:12, speed:0.14,  rate:0.013, type:'car' }
];

const CAR_COLORS = [0xff2a74,0x05d9e8,0xf5ee30,0xff8d00,0x9b51e0,0x47e62a,0xff6600,0x00ffaa];

function getLaneDef(row) { return BASE_LANES.find(l => l.row === row); }

function spawnTraffic() {
    BASE_LANES.forEach(lane => {
        const speed = lane.speed * difficultyMultiplier;
        const rate  = lane.rate  * difficultyMultiplier;
        const same  = obstacles3D.filter(o => o.userData.row === lane.row);
        let canSpawn = true;
        same.forEach(o => {
            if (speed>0 && o.position.x < -20 + 12) canSpawn = false;
            if (speed<0 && o.position.x >  20 - 12) canSpawn = false;
        });
        if (canSpawn && Math.random() < rate) {
            const col = CAR_COLORS[Math.floor(Math.random()*CAR_COLORS.length)];
            let mesh;
            if (lane.type==='truck')   mesh = create3DTruck();
            else if (lane.type==='scooter') mesh = create3DScooter();
            else mesh = create3DCar(col);

            const ix = speed>0 ? -24 : 24;
            mesh.position.set(ix, 0, getZFromRow(lane.row));
            if (speed<0) mesh.rotation.y = Math.PI;
            mesh.userData.row = lane.row;
            mesh.userData.speed = speed * (0.85 + Math.random()*0.3);
            mesh.userData.type = lane.type;
            scene.add(mesh);
            obstacles3D.push(mesh);
        }
    });
}

function updateTraffic() {
    obstacles3D.forEach(o => {
        o.position.x += o.userData.speed;
        (o.userData.wheels||[]).forEach(w => { w.rotation.y += o.userData.speed * 2; });
    });
    obstacles3D.forEach(o => { if (Math.abs(o.position.x) > 28) scene.remove(o); });
    obstacles3D = obstacles3D.filter(o => Math.abs(o.position.x) <= 28);
}

// ---- Particles ----
class Particle3D {
    constructor(x,y,z,color,type) {
        this.type = type;
        const geom = type==='feather' ? new THREE.BoxGeometry(0.15,0.05,0.3)
                   : type==='sakura'  ? new THREE.BoxGeometry(0.12,0.02,0.2)
                   : new THREE.BoxGeometry(0.09,0.09,0.09);
        const mat = new THREE.MeshBasicMaterial({color, transparent:true, opacity:1});
        this.mesh = new THREE.Mesh(geom, mat);
        this.mesh.position.set(x,y,z);
        if (type==='sakura') { this.vx=-0.06-Math.random()*0.05; this.vy=-0.06-Math.random()*0.08; this.vz=-0.04-Math.random()*0.04; }
        else if (type==='spark') { this.vx=(Math.random()-0.5)*0.35; this.vy=Math.random()*0.35; this.vz=(Math.random()-0.5)*0.35; }
        else { this.vx=(Math.random()-0.5)*0.16; this.vy=(Math.random()-0.5)*0.12; this.vz=(Math.random()-0.5)*0.16; }
        this.rx = Math.random()*0.1; this.ry = Math.random()*0.1;
        this.alpha = 1; this.decay = 0.015+Math.random()*0.02;
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
        if (this.type!=='spark') this.vy -= 0.002;
    }
    isDead() { return this.alpha <= 0; }
    destroy() { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

function spawn3DFeathers(x,z,n=4) {
    for (let i=0;i<n;i++) particles3D.push(new Particle3D(x+(Math.random()-.5)*.5, playerMesh.position.y+0.3, z+(Math.random()-.5)*.5, 0xffffff, 'feather'));
}
function spawn3DSparks(x,z,n=16) {
    const cols=[0xff2a74,0x05d9e8,0xf5ee30];
    for (let i=0;i<n;i++) particles3D.push(new Particle3D(x, playerMesh.position.y+0.4, z, cols[i%3], 'spark'));
}
function spawn3DSakura() {
    if (Math.random()<0.06) particles3D.push(new Particle3D(15+Math.random()*12, 10+Math.random()*6, playerMesh.position.z+10-Math.random()*32, 0xffc0cb, 'sakura'));
}
function updateParticles() {
    particles3D.forEach(p=>p.update());
    particles3D.forEach(p=>{ if(p.isDead()) p.destroy(); });
    particles3D = particles3D.filter(p=>!p.isDead());
}

// ---- Collision ----
function checkCollisions() {
    if (isJumping && playerMesh.position.y > 0.55) return;
    const px = playerMesh.position.x, pz = playerMesh.position.z, pr = 0.44;
    for (const obs of obstacles3D) {
        const oW = obs.userData.type==='truck'?2.3:(obs.userData.type==='scooter'?0.9:1.55);
        if (Math.abs(pz - obs.position.z) < (pr + 0.42) && Math.abs(px - obs.position.x) < (pr + oW/2)) {
            handleHit(); break;
        }
    }
}

function handleHit() {
    lives--;
    updateHearts();
    shakeIntensity = 0.9;
    spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 24);
    spawn3DFeathers(playerMesh.position.x, playerMesh.position.z, 14);
    playSound('crash');
    if (lives <= 0) endGame();
    else resetPlayer();
}

// ---- Game Loop ----
function update() {
    if (!gameStarted || gameOver) return;
    frameCount++;
    updatePlayerAnimation();
    spawnTraffic();
    updateTraffic();
    checkCollisions();
    spawn3DSakura();
    updateParticles();

    // Camera follow
    camera.position.z += (playerMesh.position.z + 18 - camera.position.z) * 0.1;
    camera.position.x += (playerMesh.position.x * 0.55 - camera.position.x) * 0.06;
    if (shakeIntensity > 0) {
        camera.position.x += (Math.random()-.5)*shakeIntensity;
        camera.position.y += (Math.random()-.5)*shakeIntensity;
        shakeIntensity *= 0.86;
        if (shakeIntensity < 0.05) shakeIntensity = 0;
    } else {
        camera.position.y += (18 - camera.position.y) * 0.08;
    }
}

function gameLoop() {
    update();
    if (renderer) renderer.render(scene, camera);
    requestAnimationFrame(gameLoop);
}

// ---- UI Helpers ----
function updateScore() {
    currentScoreEl.textContent = String(score).padStart(4,'0');
}
function updateHearts() {
    const hs = heartsEl.querySelectorAll('.heart');
    hs.forEach((h,i) => i>=lives ? h.classList.add('lost') : h.classList.remove('lost'));
}
function resetHearts() {
    heartsEl.querySelectorAll('.heart').forEach(h=>h.classList.remove('lost'));
}

function startGame() {
    const name = playerNameInput.value.trim().toUpperCase();
    if (!validateName(name)) {
        showNameError();
        playerNameInput.focus();
        return;
    }
    currentPlayerName = name;
    initAudio();
    gameStarted = true;
    gameOver = false;
    score = 0;
    lives = 3;
    difficultyPhase = 1;
    difficultyMultiplier = 1.0;

    obstacles3D.forEach(o=>scene.remove(o)); obstacles3D = [];
    particles3D.forEach(p=>scene.remove(p.mesh)); particles3D = [];

    updateScore();
    resetHearts();
    resetPlayer();
    populateLeaderboards();

    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    spawn3DSparks(playerMesh.position.x, playerMesh.position.z, 10);
}

function endGame() {
    gameOver = true; gameStarted = false;
    finalScoreEl.textContent = score;
    const isRecord = saveScore(currentPlayerName, score);
    recordStatusEl.textContent = isRecord ? 'SIM! 🔥' : 'Não';
    recordStatusEl.style.color = isRecord ? 'var(--yellow)' : 'var(--text-muted)';
    populateLeaderboards();
    playSound('gameover');
    gameOverScreen.classList.add('active');
}

// ---- Input Events ----
window.addEventListener('keydown', e => {
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','KeyW','KeyA','KeyS','KeyD'].includes(e.code)) {
        if (document.activeElement !== playerNameInput) e.preventDefault();
    }
    if (keys[e.code]) return;
    keys[e.code] = true;
    if (!gameStarted || gameOver || document.activeElement === playerNameInput) return;
    if (e.code==='ArrowUp'||e.code==='KeyW') movePlayer('up');
    if (e.code==='ArrowDown'||e.code==='KeyS') movePlayer('down');
    if (e.code==='ArrowLeft'||e.code==='KeyA') movePlayer('left');
    if (e.code==='ArrowRight'||e.code==='KeyD') movePlayer('right');
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// Enter key in name field triggers start
playerNameInput.addEventListener('keydown', e => { if (e.key==='Enter') startGame(); });

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

muteBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    muteBtn.textContent = soundEnabled ? '🔊 Som: Ligado' : '🔇 Som: Mudo';
    muteBtn.style.color  = soundEnabled ? 'var(--secondary)' : 'var(--text-muted)';
});

['up','down','left','right'].forEach(d => {
    const btn = document.getElementById(`btn-${d}`);
    btn.addEventListener('touchstart', e => { e.preventDefault(); movePlayer(d); });
    btn.addEventListener('mousedown', () => movePlayer(d));
});

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Boot ----
init3D();
requestAnimationFrame(gameLoop);
