/**
 * Koko-chan: Tokyo Crossing (Rooster Fighter Edition)
 * Core Game Engine
 */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// DOM Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');
const currentScoreEl = document.getElementById('current-score');
const finalScoreEl = document.getElementById('final-score');
const recordStatusEl = document.getElementById('record-status');
const highScoreValEl = document.getElementById('high-score-val');
const heartsEl = document.getElementById('hearts');
const muteBtn = document.getElementById('mute-btn');

// Game Settings & Grid Configurations
const GRID_SIZE = 50;
const ROWS = canvas.height / GRID_SIZE; // 14 rows
const COLS = canvas.width / GRID_SIZE;  // 12 columns

// Game State
let score = 0;
let highScore = localStorage.getItem('koko_high_score') || 0;
let lives = 3;
let gameOver = false;
let gameStarted = false;
let soundEnabled = true;
let keys = {};
let lastTime = 0;
let frameCount = 0;

// Screen Shake
let shakeDuration = 0;
let shakeIntensity = 0;

// Assets
const chickenImg = new Image();
chickenImg.src = 'assets/chicken.png';

const carImg = new Image();
carImg.src = 'assets/car.png';

// Sound Synthesis (Web Audio API)
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
        // Shonen power jump sweep
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
    } else if (type === 'crash') {
        // Dramatic explosion noise
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.4);
        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);

        // Low rumble frequency
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(80, now);
        osc2.frequency.linearRampToValueAtTime(20, now + 0.5);
        gain2.gain.setValueAtTime(0.4, now);
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now);
        osc2.stop(now + 0.5);
    } else if (type === 'score') {
        // High pitched retro power-up chime
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
        osc.frequency.setValueAtTime(783.99, now + 0.16); // G5
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0.1, now + 0.2);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
    } else if (type === 'gameover') {
        // SAD anime descent melody
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, now); // A4
        osc.frequency.linearRampToValueAtTime(110, now + 0.8);
        gainNode.gain.setValueAtTime(0.25, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
    }
}

// Update High Score Display on load
highScoreValEl.textContent = highScore;

// Classes

class Player {
    constructor() {
        this.reset();
        this.width = 44;
        this.height = 44;
    }

    reset() {
        this.gridX = Math.floor(COLS / 2);
        this.gridY = ROWS - 1; // start at the bottom safe lane
        this.x = this.gridX * GRID_SIZE + (GRID_SIZE - 44) / 2;
        this.y = this.gridY * GRID_SIZE + (GRID_SIZE - 44) / 2;
        this.targetX = this.x;
        this.targetY = this.y;
        this.scaleX = 1;
        this.scaleY = 1;
        this.moving = false;
        this.moveSpeed = 0.25; // Interpolation speed
        this.facing = 'up'; // 'up', 'down', 'left', 'right'
    }

    move(dir) {
        if (gameOver || !gameStarted) return;
        
        let nextGridX = this.gridX;
        let nextGridY = this.gridY;

        if (dir === 'up') {
            nextGridY--;
            this.facing = 'up';
        } else if (dir === 'down') {
            nextGridY++;
            this.facing = 'down';
        } else if (dir === 'left') {
            nextGridX--;
            this.facing = 'left';
        } else if (dir === 'right') {
            nextGridX++;
            this.facing = 'right';
        }

        // Boundary checks
        if (nextGridX >= 0 && nextGridX < COLS && nextGridY >= 0 && nextGridY < ROWS) {
            this.gridX = nextGridX;
            this.gridY = nextGridY;
            this.targetX = this.gridX * GRID_SIZE + (GRID_SIZE - this.width) / 2;
            this.targetY = this.gridY * GRID_SIZE + (GRID_SIZE - this.height) / 2;
            this.moving = true;

            // Jump stretch/squash effect (Anime style juice!)
            this.scaleX = 0.8;
            this.scaleY = 1.3;

            // Spawn jump particles (feathers)
            spawnFeathers(this.x + this.width / 2, this.y + this.height, 4);

            playSound('jump');

            // Score check (only give points for advancing up)
            // Calculate score based on highest row reached in this life
            const currentLevel = (ROWS - 1) - this.gridY;
            if (currentLevel * 10 > score) {
                const diff = (currentLevel * 10) - score;
                score += diff;
                updateScore();

                // Play special score chime when reaching top safe zone
                if (this.gridY === 0) {
                    playSound('score');
                    // Reset to bottom to restart loop, but keep score!
                    setTimeout(() => {
                        this.reset();
                        spawnFlash(canvas.width / 2, canvas.height - 25);
                    }, 300);
                }
            }
        }
    }

    update() {
        // Smoothly interpolate position (lerp)
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;

        this.x += dx * this.moveSpeed;
        this.y += dy * this.moveSpeed;

        if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
            this.x = this.targetX;
            this.y = this.targetY;
            this.moving = false;
        }

        // Decay scale animation back to 1
        this.scaleX += (1 - this.scaleX) * 0.15;
        this.scaleY += (1 - this.scaleY) * 0.15;
    }

    draw() {
        ctx.save();
        // Move to player center for scale and rotation
        ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
        ctx.scale(this.scaleX, this.scaleY);

        // Flip image based on direction
        if (this.facing === 'left') {
            ctx.scale(-1, 1);
        } else if (this.facing === 'down') {
            ctx.rotate(Math.PI);
        } else if (this.facing === 'right') {
            // No scale flip needed if facing right is default, otherwise:
            // Adjust based on image default. Let's assume default is facing right/up.
        }

        // Draw Rooster Fighter Keiji
        // With smooth shadow glow
        ctx.shadowBlur = 15;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
        
        ctx.drawImage(chickenImg, -this.width / 2, -this.height / 2, this.width, this.height);
        ctx.restore();
    }
}

class Obstacle {
    constructor(row, speed, type) {
        this.row = row;
        this.speed = speed; // positive = moves right, negative = moves left
        this.type = type; // 'car', 'truck', 'scooter'
        this.y = this.row * GRID_SIZE + (GRID_SIZE - 40) / 2;
        this.width = type === 'truck' ? 90 : (type === 'scooter' ? 35 : 60);
        this.height = 36;
        
        // Spawn off-screen
        if (this.speed > 0) {
            this.x = -this.width - 20;
        } else {
            this.x = canvas.width + 20;
        }

        // Custom styling modifiers for anime variety (hue, speed scaling)
        this.hueRotate = Math.floor(Math.random() * 360);
    }

    update() {
        this.x += this.speed;
    }

    draw() {
        ctx.save();
        
        // Apply Hue Rotation Filter to make cars colorful
        ctx.filter = `hue-rotate(${this.hueRotate}deg) saturate(1.5)`;

        // Flip drawing if driving left
        if (this.speed < 0) {
            ctx.translate(this.x + this.width / 2, this.y + this.height / 2);
            ctx.scale(-1, 1);
            ctx.drawImage(carImg, -this.width / 2, -this.height / 2, this.width, this.height);
        } else {
            ctx.drawImage(carImg, this.x, this.y, this.width, this.height);
        }

        ctx.restore();
    }

    isOffscreen() {
        if (this.speed > 0 && this.x > canvas.width + 50) return true;
        if (this.speed < 0 && this.x < -this.width - 50) return true;
        return false;
    }

    getBounds() {
        return {
            x: this.x + 4,
            y: this.y + 4,
            width: this.width - 8,
            height: this.height - 8
        };
    }
}

// Particle Systems

class Particle {
    constructor(x, y, color, type) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.type = type; // 'feather', 'spark', 'sakura'
        this.vx = (Math.random() - 0.5) * (type === 'spark' ? 6 : 2);
        this.vy = type === 'sakura' ? (1 + Math.random()) : (Math.random() - 0.5) * (type === 'spark' ? 6 : 2);
        if (type === 'sakura') this.vx = -0.5 - Math.random() * 0.5; // sakura drifts left
        
        this.size = Math.random() * (type === 'spark' ? 6 : 8) + 2;
        this.alpha = 1;
        this.decay = Math.random() * 0.02 + 0.01;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.alpha -= this.decay;
        this.rotation += this.rotationSpeed;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        if (this.type === 'feather') {
            // Draw feather shape
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, this.size, this.size / 2, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'sakura') {
            // Beautiful pink cherry blossom petal
            ctx.fillStyle = '#ffb7c5';
            ctx.beginPath();
            ctx.moveTo(0, -this.size);
            ctx.quadraticCurveTo(this.size, -this.size, this.size / 2, 0);
            ctx.quadraticCurveTo(0, this.size, -this.size / 2, 0);
            ctx.quadraticCurveTo(-this.size, -this.size, 0, -this.size);
            ctx.fill();
        } else {
            // Sparks
            ctx.fillStyle = this.color;
            ctx.shadowBlur = 10;
            ctx.shadowColor = this.color;
            ctx.fillRect(-this.size / 2, -this.size / 2, this.size, this.size);
        }

        ctx.restore();
    }
}

// Arrays of active elements
let obstacles = [];
let particles = [];
const player = new Player();

// Lane Definitions
// Each lane has: row index, base speed of traffic, spawning rate factor, direction, vehicle type
const LANES = [
    { row: 1, speed: -2.0, rate: 0.015, type: 'car' },       // Row 1: Fast cars going left
    { row: 2, speed: 1.5,  rate: 0.010, type: 'truck' },     // Row 2: Slow trucks going right
    { row: 3, speed: -1.2, rate: 0.018, type: 'scooter' },   // Row 3: Busy scooters left
    { row: 4, speed: 2.8,  rate: 0.008, type: 'car' },       // Row 4: Bullet speed sports car right
    { row: 5, speed: 0,    rate: 0,     type: 'safe' },      // Row 5: SAFE ZONE (Midway sidewalk)
    { row: 6, speed: -1.8, rate: 0.014, type: 'car' },       // Row 6: Taxis going left
    { row: 7, speed: 1.2,  rate: 0.012, type: 'truck' },     // Row 7: Heavy vehicles right
    { row: 8, speed: -1.5, rate: 0.015, type: 'car' },       // Row 8: Medium traffic left
    { row: 9, speed: 2.2,  rate: 0.011, type: 'scooter' },   // Row 9: Commuter scooters right
    { row: 10, speed: 0,   rate: 0,     type: 'safe' },      // Row 10: SAFE ZONE (Second midway)
    { row: 11, speed: -2.5, rate: 0.009, type: 'car' },      // Row 11: Speeding racers left
    { row: 12, speed: 1.8,  rate: 0.013, type: 'car' }       // Row 12: General traffic right
];

// Spawn Particle Functions
function spawnFeathers(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
        // Feathers are white/light gray
        particles.push(new Particle(x, y, '#ffffff', 'feather'));
    }
}

function spawnSparks(x, y, count = 12) {
    const colors = ['#ff2a74', '#05d9e8', '#f5ee30', '#ff8d00'];
    for (let i = 0; i < count; i++) {
        const randColor = colors[Math.floor(Math.random() * colors.length)];
        particles.push(new Particle(x, y, randColor, 'spark'));
    }
}

function spawnFlash(x, y) {
    // Large spark visual for spawn
    spawnSparks(x, y, 6);
}

function spawnSakura() {
    // Sakura falling from the sky (top edge)
    if (Math.random() < 0.05) {
        particles.push(new Particle(Math.random() * canvas.width * 1.5, -10, '#ffb7c5', 'sakura'));
    }
}

// Background Drawing (Tokyo Crossing Aesthetic)
function drawTokyoBackground() {
    // Background color
    ctx.fillStyle = '#0f0c1b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw row styles
    for (let r = 0; r < ROWS; r++) {
        const y = r * GRID_SIZE;

        // Check if row is a safe zone (0 is top, 5 and 10 are midway safe, 13 is bottom start)
        const laneType = getLaneType(r);

        if (laneType === 'safe') {
            // Stylized Safe Sidewalk (Tokyo pink-purple pavement tile look)
            ctx.fillStyle = '#221a36';
            ctx.fillRect(0, y, canvas.width, GRID_SIZE);
            
            // Neon cyan lane divider line
            ctx.fillStyle = '#05d9e8';
            ctx.fillRect(0, y, canvas.width, 2);
            ctx.fillRect(0, y + GRID_SIZE - 2, canvas.width, 2);

            // Draw cute vending machine / sakura trees icons abstractly
            ctx.fillStyle = 'rgba(5, 217, 232, 0.15)';
            ctx.font = '12px "Fredoka"';
            for (let i = 0; i < COLS; i++) {
                if ((i + r) % 3 === 0) {
                    ctx.fillText('🌸', i * GRID_SIZE + 15, y + 30);
                } else if ((i + r) % 5 === 0) {
                    ctx.fillText('🏪', i * GRID_SIZE + 15, y + 30);
                }
            }
        } else {
            // Concrete street lane
            ctx.fillStyle = '#141124';
            ctx.fillRect(0, y, canvas.width, GRID_SIZE);

            // Road dash divider markings (only between adjacent road rows)
            const nextLane = getLaneType(r + 1);
            if (nextLane && nextLane !== 'safe') {
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.lineWidth = 2;
                ctx.setLineDash([15, 15]);
                ctx.beginPath();
                ctx.moveTo(0, y + GRID_SIZE);
                ctx.lineTo(canvas.width, y + GRID_SIZE);
                ctx.stroke();
                ctx.setLineDash([]); // Reset dash
            }

            // Draw bright yellow warning lines on the outer edges of the street blocks
            const prevLane = getLaneType(r - 1);
            if (prevLane === 'safe') {
                ctx.fillStyle = 'rgba(245, 238, 48, 0.4)';
                ctx.fillRect(0, y, canvas.width, 2);
            }
        }
    }

    // Tokyo Shibuya Crossing Zebra Lines (specifically on top safe lane, bottom safe lane)
    drawZebraCrossing(ROWS - 1);
    drawZebraCrossing(5);
    drawZebraCrossing(10);
}

function getLaneType(row) {
    if (row === 0 || row === 5 || row === 10 || row === ROWS - 1) {
        return 'safe';
    }
    return 'road';
}

function drawZebraCrossing(row) {
    const y = row * GRID_SIZE;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    for (let i = 0; i < COLS; i++) {
        if (i % 2 === 0) {
            ctx.fillRect(i * GRID_SIZE + 10, y + 5, 30, GRID_SIZE - 10);
        }
    }
}

// Action Speedlines Overlay (Shonen Action Feeling!)
function drawAnimeSpeedlines() {
    if (frameCount % 4 === 0) return; // Flickering effect

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1.5;
    
    // Draw lines radiating outwards from player
    const px = player.x + player.width / 2;
    const py = player.y + player.height / 2;

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
        const startDist = 120 + Math.random() * 50;
        const endDist = 350;

        const x1 = px + Math.cos(angle) * startDist;
        const y1 = py + Math.sin(angle) * startDist;
        const x2 = px + Math.cos(angle) * endDist;
        const y2 = py + Math.sin(angle) * endDist;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }
    ctx.restore();
}

// Collisions
function checkCollisions() {
    const pBounds = {
        x: player.x + 6,
        y: player.y + 6,
        width: player.width - 12,
        height: player.height - 12
    };

    for (let obs of obstacles) {
        const oBounds = obs.getBounds();

        if (pBounds.x < oBounds.x + oBounds.width &&
            pBounds.x + pBounds.width > oBounds.x &&
            pBounds.y < oBounds.y + oBounds.height &&
            pBounds.y + pBounds.height > oBounds.y) {
            
            // CRASH HIT!
            handleHit();
            break;
        }
    }
}

function handleHit() {
    lives--;
    updateHearts();
    
    // Screen shake trigger
    shakeDuration = 20; // frames
    shakeIntensity = 12; // pixels

    // Particles
    spawnSparks(player.x + player.width / 2, player.y + player.height / 2, 25);
    spawnFeathers(player.x + player.width / 2, player.y + player.height / 2, 18);

    playSound('crash');

    if (lives <= 0) {
        endGame();
    } else {
        // Respawn player
        player.reset();
    }
}

// Game Control Loops
function update(time) {
    if (!gameStarted || gameOver) return;

    frameCount++;

    // Screen Shake decay
    if (shakeDuration > 0) {
        shakeDuration--;
        shakeIntensity *= 0.9;
    }

    player.update();

    // Spawning Traffic
    LANES.forEach(lane => {
        if (lane.rate > 0) {
            // Check lane direction and space before spawning
            const sameLaneObstacles = obstacles.filter(obs => obs.row === lane.row);
            let canSpawn = true;

            // Prevent stacking cars on top of each other
            sameLaneObstacles.forEach(obs => {
                if (lane.speed > 0 && obs.x < 120) canSpawn = false;
                if (lane.speed < 0 && obs.x > canvas.width - 120) canSpawn = false;
            });

            if (canSpawn && Math.random() < lane.rate) {
                // Modulate speed slightly per car for organic traffic
                const speedVar = lane.speed * (0.8 + Math.random() * 0.4);
                obstacles.push(new Obstacle(lane.row, speedVar, lane.type));
            }
        }
    });

    // Update Obstacles
    obstacles.forEach(obs => obs.update());
    // Filter out off-screen obstacles
    obstacles = obstacles.filter(obs => !obs.isOffscreen());

    // Check hit collision
    checkCollisions();

    // Sakura wind
    spawnSakura();

    // Update Particles
    particles.forEach(p => p.update());
    particles = particles.filter(p => p.alpha > 0);
}

function draw() {
    ctx.save();

    // Screen Shake apply
    if (shakeDuration > 0) {
        const shakeX = (Math.random() - 0.5) * shakeIntensity;
        const shakeY = (Math.random() - 0.5) * shakeIntensity;
        ctx.translate(shakeX, shakeY);

        // Flash Red visual style for impact
        if (shakeDuration > 15) {
            ctx.fillStyle = 'rgba(255, 42, 116, 0.25)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
    }

    drawTokyoBackground();

    // Draw Obstacles
    obstacles.forEach(obs => obs.draw());

    // Draw Particles
    particles.forEach(p => p.draw());

    // Draw Player (Keiji)
    player.draw();

    // Draw Anime Shonen Speedlines overlay for dramatic crossing
    drawAnimeSpeedlines();

    ctx.restore();
}

function gameLoop(time) {
    update(time);
    draw();
    requestAnimationFrame(gameLoop);
}

// UI State Updates
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
    gameStarted = true;
    gameOver = false;
    score = 0;
    lives = 3;
    obstacles = [];
    particles = [];
    updateScore();
    resetHearts();
    player.reset();
    
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');

    spawnFlash(player.x + player.width / 2, player.y + player.height / 2);
}

function endGame() {
    gameOver = true;
    gameStarted = false;
    finalScoreEl.textContent = score;

    // High Score check
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('koko_high_score', highScore);
        highScoreValEl.textContent = highScore;
        recordStatusEl.textContent = 'SIM! 🔥';
        recordStatusEl.style.color = 'var(--yellow)';
    } else {
        recordStatusEl.textContent = 'Não';
        recordStatusEl.style.color = 'var(--text-muted)';
    }

    playSound('gameover');
    gameOverScreen.classList.add('active');
}

// Keyboards & Mobile controls Listeners
window.addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
        e.preventDefault(); // prevent default scrolling
    }
    
    // Throttle double clicking key hold
    if (keys[e.code]) return;
    keys[e.code] = true;

    if (!gameStarted || gameOver) return;

    if (e.code === 'ArrowUp' || e.code === 'KeyW') player.move('up');
    if (e.code === 'ArrowDown' || e.code === 'KeyS') player.move('down');
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') player.move('left');
    if (e.code === 'ArrowRight' || e.code === 'KeyD') player.move('right');
});

window.addEventListener('keyup', e => {
    keys[e.code] = false;
});

// Start button clicking
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

// Touch controls gamepad buttons
document.getElementById('btn-up').addEventListener('touchstart', (e) => { e.preventDefault(); player.move('up'); });
document.getElementById('btn-down').addEventListener('touchstart', (e) => { e.preventDefault(); player.move('down'); });
document.getElementById('btn-left').addEventListener('touchstart', (e) => { e.preventDefault(); player.move('left'); });
document.getElementById('btn-right').addEventListener('touchstart', (e) => { e.preventDefault(); player.move('right'); });

// Mouse click fallback for mobile buttons testing on desktop
document.getElementById('btn-up').addEventListener('mousedown', () => player.move('up'));
document.getElementById('btn-down').addEventListener('mousedown', () => player.move('down'));
document.getElementById('btn-left').addEventListener('mousedown', () => player.move('left'));
document.getElementById('btn-right').addEventListener('mousedown', () => player.move('right'));

// Preload Images verification & kick off game loop
let assetsLoaded = 0;
function assetLoaded() {
    assetsLoaded++;
    if (assetsLoaded === 2) {
        // Kick off loop
        requestAnimationFrame(gameLoop);
    }
}

chickenImg.onload = assetLoaded;
carImg.onload = assetLoaded;

// Safe fallbacks if image fails to load
chickenImg.onerror = () => { console.error("Could not load chicken sprite."); assetLoaded(); };
carImg.onerror = () => { console.error("Could not load car sprite."); assetLoaded(); };
