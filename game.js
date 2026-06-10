/* ==========================================================================
   RETRO SLUG BOXING CORE GAME ENGINE (game.js)
   ========================================================================== */

// Game States
const STATE_MENU = 'menu';
const STATE_ROUND_INTRO = 'round_intro';
const STATE_PLAYING = 'playing';
const STATE_ROUND_END = 'round_end';
const STATE_GAME_OVER = 'game_over';

// Game Modes
const MODE_VS_AI = 'vs_ai';
const MODE_LOCAL = 'local';
const MODE_ONLINE = 'online';

// Global Game Variables
let canvas, ctx;
let gameState = STATE_MENU;
let gameMode = MODE_VS_AI;
let animationFrameId = null;

// Game Entities
let player1, player2;
let particles = [];
let spotlights = [];
let screenShake = { x: 0, y: 0, duration: 0, intensity: 0 };

// Round & Match Variables
let currentRound = 1;
let maxRounds = 3;
let roundTimer = 60; // seconds
let timerInterval = null;
let stateTimer = 0; // used for delaying transitions (in frames)
let winnerText = "";
let countdownText = "";

// Keyboard input state
const keys = {};

// Online Multiplayer WebRTC Variables
let peer = null;
let conn = null;
let isHost = false;
let myRoomCode = "";
let onlineStatusText = "Tidak Terhubung";

// PeerJS Configuration - Use public signaling server
const PEER_PREFIX = 'rsb-';

/* ==========================================================================
   DOM INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    // Open Game Modal from Project Card
    // We will bind this to a button with class "btn-play-game" in index.html
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.btn-play-game');
        if (playBtn) {
            e.preventDefault();
            openGameModal();
        }
    });

    // Close Modal Button
    const closeBtn = document.getElementById('game-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeGameModal);
    }

    // Modal overlay click (close if clicked outside content)
    const modal = document.getElementById('game-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeGameModal();
            }
        });
    }

    // Bind Menu Buttons
    setupMenuButtons();
    // Bind Touch Controls for Mobile
    setupTouchControls();
});

// Setup Menu buttons dynamically
function setupMenuButtons() {
    const btnVsAI = document.getElementById('btn-vs-ai');
    const btnLocal = document.getElementById('btn-local');
    const btnCreateRoom = document.getElementById('btn-create-room');
    const btnJoinRoom = document.getElementById('btn-join-room');
    const cancelRoomBtn = document.getElementById('btn-cancel-room');
    
    if (btnVsAI) btnVsAI.addEventListener('click', () => startGameMode(MODE_VS_AI));
    if (btnLocal) btnLocal.addEventListener('click', () => startGameMode(MODE_LOCAL));
    
    if (btnCreateRoom) btnCreateRoom.addEventListener('click', initOnlineHost);
    if (btnJoinRoom) {
        btnJoinRoom.addEventListener('click', () => {
            const inputVal = document.getElementById('join-code-input').value.trim();
            if (inputVal.length === 4) {
                initOnlineClient(inputVal);
            } else {
                updateOnlineStatus("Masukkan kode 4-digit!", "error");
            }
        });
    }

    if (cancelRoomBtn) {
        cancelRoomBtn.addEventListener('click', closeOnlineConnection);
    }

    // Keyboard inputs listener
    window.addEventListener('keydown', (e) => {
        keys[e.key] = true;
        
        // Prevent default browser scrolling for arrow keys & space inside the game modal
        if (isGameModalOpen()) {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key)) {
                e.preventDefault();
            }
        }
    });
    
    window.addEventListener('keyup', (e) => {
        keys[e.key] = false;
        
        // ESC key to return to menu if in-game
        if (e.key === 'Escape' && isGameModalOpen()) {
            if (gameState !== STATE_MENU) {
                returnToMenu();
            }
        }
    });
}

// Bind mobile virtual gamepad controls
function setupTouchControls() {
    const btnLeft = document.getElementById('touch-left');
    const btnRight = document.getElementById('touch-right');
    const btnJab = document.getElementById('touch-jab');
    const btnBlock = document.getElementById('touch-block');
    const btnHook = document.getElementById('touch-hook');

    if (!btnLeft || !btnRight || !btnJab || !btnBlock || !btnHook) return;

    // Helper to bind continuous press inputs (left, right, block)
    function bindPress(element, keyName) {
        // Touch events
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[keyName] = true;
            element.classList.add('active');
        }, { passive: false });
        
        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[keyName] = false;
            element.classList.remove('active');
        }, { passive: false });

        // Mouse fallbacks
        element.addEventListener('mousedown', (e) => {
            keys[keyName] = true;
            element.classList.add('active');
        });
        
        element.addEventListener('mouseup', (e) => {
            keys[keyName] = false;
            element.classList.remove('active');
        });

        element.addEventListener('mouseleave', (e) => {
            keys[keyName] = false;
            element.classList.remove('active');
        });
    }

    // Helper to bind trigger strikes (jab, hook)
    function bindTrigger(element, actionCallback) {
        // Touch events
        element.addEventListener('touchstart', (e) => {
            e.preventDefault();
            element.classList.add('active');
            actionCallback();
        }, { passive: false });
        
        element.addEventListener('touchend', (e) => {
            e.preventDefault();
            element.classList.remove('active');
        }, { passive: false });

        // Mouse fallbacks
        element.addEventListener('mousedown', (e) => {
            element.classList.add('active');
            actionCallback();
        });
        
        element.addEventListener('mouseup', (e) => {
            element.classList.remove('active');
        });
    }

    // Bind P1 inputs
    bindPress(btnLeft, 'a');
    bindPress(btnRight, 'd');
    bindPress(btnBlock, 's');

    bindTrigger(btnJab, () => {
        if (gameState === STATE_PLAYING && (player1.action === 'idle' || player1.action === 'walk')) {
            player1.setAction('jab', 12);
            player1.vx = player1.facing * 2;
            player1.checkHit(player2, 110, 6);
        }
    });

    bindTrigger(btnHook, () => {
        if (gameState === STATE_PLAYING && (player1.action === 'idle' || player1.action === 'walk')) {
            player1.setAction('hook', 35);
            player1.vx = player1.facing * 5;
            setTimeout(() => {
                if (gameState === STATE_PLAYING && player1.action === 'hook') {
                    player1.checkHit(player2, 85, 16, true);
                }
            }, 150);
        }
    });
}

function isGameModalOpen() {
    const modal = document.getElementById('game-modal');
    return modal && modal.classList.contains('show');
}

function openGameModal() {
    const modal = document.getElementById('game-modal');
    if (modal) {
        modal.classList.add('show');
        initCanvas();
        returnToMenu();
    }
}

function closeGameModal() {
    const modal = document.getElementById('game-modal');
    if (modal) {
        modal.classList.remove('show');
        stopGameLoop();
        closeOnlineConnection();
    }
}

function initCanvas() {
    canvas = document.getElementById('game-canvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        // Set fixed buffer resolution
        canvas.width = 1000;
        canvas.height = 500;
    }
}

function returnToMenu() {
    gameState = STATE_MENU;
    stopGameLoop();
    clearInterval(timerInterval);
    
    // Show Menu overlay, hide room overlay
    document.getElementById('game-menu-overlay').style.display = 'flex';
    document.getElementById('game-room-overlay').style.display = 'none';
    
    // Redraw menu screen
    if (ctx) {
        drawStaticBackground();
    }
}

function stopGameLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

/* ==========================================================================
   ONLINE MULTIPLAYER ENGINE (WEBRTC PEERJS)
   ========================================================================== */
function updateOnlineStatus(text, type = "") {
    const statusEl = document.getElementById('online-status');
    if (statusEl) {
        statusEl.textContent = "Status: " + text;
        statusEl.className = "game-online-status " + type;
    }
    onlineStatusText = text;
}

// Generate random 4-digit code
function generateRoomCode() {
    let code = "";
    for (let i = 0; i < 4; i++) {
        code += Math.floor(Math.random() * 10);
    }
    return code;
}

// Initialize Host Room
function initOnlineHost() {
    closeOnlineConnection();
    myRoomCode = generateRoomCode();
    isHost = true;
    
    updateOnlineStatus("Menghubungkan signaling...", "connecting");
    
    // Create Peer ID 'rsb-XXXX'
    peer = new Peer(PEER_PREFIX + myRoomCode);
    
    peer.on('open', (id) => {
        updateOnlineStatus("Menunggu P2P...", "connecting");
        document.getElementById('room-code-display').textContent = myRoomCode;
        document.getElementById('game-room-overlay').style.display = 'block';
    });
    
    peer.on('connection', (connection) => {
        conn = connection;
        setupOnlineConnection();
    });
    
    peer.on('error', (err) => {
        console.error(err);
        updateOnlineStatus("Gagal membuat room. Coba lagi.", "error");
        closeOnlineConnection();
    });
}

// Initialize Client (Join Room)
function initOnlineClient(code) {
    closeOnlineConnection();
    isHost = false;
    
    updateOnlineStatus("Menghubungkan ke " + code + "...", "connecting");
    
    // Create random temporary Peer ID for client
    peer = new Peer();
    
    peer.on('open', (id) => {
        conn = peer.connect(PEER_PREFIX + code);
        
        conn.on('open', () => {
            setupOnlineConnection();
        });
        
        conn.on('error', (err) => {
            updateOnlineStatus("Koneksi gagal. Periksa kode!", "error");
            closeOnlineConnection();
        });
    });
    
    peer.on('error', (err) => {
        console.error(err);
        updateOnlineStatus("Signaling Error. Coba lagi.", "error");
        closeOnlineConnection();
    });
}

// Bind connection event handlers
function setupOnlineConnection() {
    updateOnlineStatus("Terhubung!", "connected");
    
    // Hide all overlays & start game
    document.getElementById('game-menu-overlay').style.display = 'none';
    document.getElementById('game-room-overlay').style.display = 'none';
    
    gameMode = MODE_ONLINE;
    
    // Handle data messages
    conn.on('data', (data) => {
        handleOnlineData(data);
    });
    
    conn.on('close', () => {
        updateOnlineStatus("Pemain terputus.", "error");
        returnToMenu();
    });
    
    // Start game initialization
    initMatch();
}

function closeOnlineConnection() {
    document.getElementById('game-room-overlay').style.display = 'none';
    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    updateOnlineStatus("Tidak Terhubung");
}

// Send local inputs or game state sync
function handleOnlineData(data) {
    if (isHost) {
        // Host receives client keyboard inputs
        if (data.type === 'client_input') {
            player2.remoteKeys = data.keys;
        }
    } else {
        // Client receives state updates from Host
        if (data.type === 'game_state') {
            // Sync positions & parameters
            player1.x = data.p1.x;
            player1.y = data.p1.y;
            player1.hp = data.p1.hp;
            player1.action = data.p1.action;
            player1.facing = data.p1.facing;
            player1.roundsWon = data.p1.roundsWon;
            
            player2.x = data.p2.x;
            player2.y = data.p2.y;
            player2.hp = data.p2.hp;
            player2.action = data.p2.action;
            player2.facing = data.p2.facing;
            player2.roundsWon = data.p2.roundsWon;
            
            gameState = data.gameState;
            currentRound = data.currentRound;
            roundTimer = data.roundTimer;
            countdownText = data.countdownText;
            winnerText = data.winnerText;
            
            // Replicate particles
            if (data.hits && data.hits.length > 0) {
                data.hits.forEach(hit => {
                    spawnHitParticles(hit.x, hit.y, hit.color);
                    if (hit.isHook) triggerScreenShake(12, 10);
                });
            }
        }
    }
}

// Broadcast game state (Host only)
let pendingHitsToSync = [];
function syncOnlineState() {
    if (!isHost || !conn) return;
    
    const state = {
        type: 'game_state',
        p1: {
            x: player1.x,
            y: player1.y,
            hp: player1.hp,
            action: player1.action,
            facing: player1.facing,
            roundsWon: player1.roundsWon
        },
        p2: {
            x: player2.x,
            y: player2.y,
            hp: player2.hp,
            action: player2.action,
            facing: player2.facing,
            roundsWon: player2.roundsWon
        },
        gameState: gameState,
        currentRound: currentRound,
        roundTimer: roundTimer,
        countdownText: countdownText,
        winnerText: winnerText,
        hits: [...pendingHitsToSync]
    };
    
    conn.send(state);
    pendingHitsToSync = []; // clear queue
}

// Client sends inputs to Host
function syncClientInputs() {
    if (isHost || !conn) return;
    
    const clientKeys = {
        Left: keys['ArrowLeft'] || false,
        Right: keys['ArrowRight'] || false,
        Jab: keys['ArrowUp'] || false,
        Block: keys['ArrowDown'] || false,
        Hook: keys['Enter'] || false
    };
    
    conn.send({
        type: 'client_input',
        keys: clientKeys
    });
}


/* ==========================================================================
   GAME PHYSICS & ENTITIES SYSTEM
   ========================================================================== */

// Particle Class
class Particle {
    constructor(x, y, vx, vy, color, size, life) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.color = color;
        this.size = size;
        this.life = life;
        this.maxLife = life;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.2; // slight gravity
        this.life--;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        // Draw square spark to match retro style
        ctx.fillRect(this.x - this.size/2, this.y - this.size/2, this.size, this.size);
        ctx.restore();
    }
}

// Spotlight Class
class Spotlight {
    constructor(startX, targetX, color) {
        this.x = startX;
        this.targetX = targetX;
        this.color = color;
        this.width = 150;
    }
    
    update(targetX) {
        this.targetX = targetX;
        // Ease towards target
        this.x += (this.targetX - this.x) * 0.08;
    }
    
    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        
        const grad = ctx.createLinearGradient(this.x, 0, this.x, 420);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0.18)');
        grad.addColorStop(0.3, this.color.replace('1)', '0.08)'));
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(this.x - 30, 0);
        ctx.lineTo(this.x + 30, 0);
        ctx.lineTo(this.x + this.width, 420);
        ctx.lineTo(this.x - this.width, 420);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }
}

// Boxer Class
class Boxer {
    constructor(x, y, side, color, name) {
        this.x = x;
        this.y = y; // Y coordinate on floor (bottom of feet = 420)
        this.width = 60;
        this.height = 130;
        this.vx = 0;
        this.vy = 0;
        this.side = side; // 1 = Left, -1 = Right
        this.color = color; // P1: '#06b6d4' (cyan), P2: '#ec4899' (magenta)
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;
        this.roundsWon = 0;
        
        // Boxer states
        this.action = 'idle'; // idle, walk, jab, block, hook, hurt, ko, win
        this.actionTimer = 0;
        this.facing = side;
        this.isGrounded = true;
        this.gravity = 0.6;
        
        // Remote controller inputs (Multiplayer client)
        this.remoteKeys = {};
    }
    
    update(opponent) {
        // Apply Gravity
        if (!this.isGrounded) {
            this.vy += this.gravity;
            this.y += this.vy;
            if (this.y >= 420) {
                this.y = 420;
                this.vy = 0;
                this.isGrounded = true;
            }
        }
        
        // Update Action Timer
        if (this.actionTimer > 0) {
            this.actionTimer--;
            if (this.actionTimer === 0) {
                if (this.action !== 'ko' && this.action !== 'win') {
                    this.action = 'idle';
                }
            }
        }
        
        // Auto-facing opponent (unless in hook/hurt/ko/win)
        if (['idle', 'walk', 'block'].includes(this.action)) {
            this.facing = (opponent.x > this.x) ? 1 : -1;
        }
        
        // Friction on floor
        if (this.isGrounded) {
            this.vx *= 0.8;
            this.x += this.vx;
        } else {
            this.x += this.vx;
        }
        
        // Ring bounds boundary
        const leftLimit = 100;
        const rightLimit = 900;
        if (this.x < leftLimit) {
            this.x = leftLimit;
            this.vx = 0;
        }
        if (this.x > rightLimit) {
            this.x = rightLimit;
            this.vx = 0;
        }
    }
    
    // Trigger action with cooldown duration (in frames)
    setAction(action, duration) {
        this.action = action;
        this.actionTimer = duration;
    }
    
    // Check hit collision
    checkHit(opponent, reach, damage, isHook = false) {
        // Must face the opponent to hit
        const facingOpponent = (this.facing === 1 && opponent.x > this.x) || (this.facing === -1 && opponent.x < this.x);
        if (!facingOpponent) return false;
        
        // Reach distance check
        const dist = Math.abs(this.x - opponent.x);
        if (dist <= reach) {
            // Determine vertical overlap
            const thisTop = this.y - this.height;
            const oppTop = opponent.y - opponent.height;
            const verticalOverlap = (thisTop < opponent.y && this.y > oppTop);
            
            if (verticalOverlap) {
                // Combat outcome
                opponent.takeDamage(damage, this.facing, isHook, this.color);
                return true;
            }
        }
        return false;
    }
    
    takeDamage(rawDamage, knockbackDirection, isHook, attackerColor) {
        if (this.action === 'ko' || this.action === 'win') return;
        
        let damage = rawDamage;
        let isBlocked = (this.action === 'block');
        
        if (isBlocked) {
            // Block reduces damage to 0 or 1
            damage = isHook ? 3 : 0; // Heavy Hook can slightly pierce blocks
        }
        
        this.hp -= damage;
        if (this.hp < 0) this.hp = 0;
        
        // Calculate hit position for sparks
        const hitX = this.x - (this.facing * 15);
        const hitY = this.y - (this.height * 0.7);
        
        if (isBlocked) {
            // Green shield/spark particles on block
            spawnHitParticles(hitX, hitY, '#10b981', 8);
            if (isHost && gameMode === MODE_ONLINE) {
                pendingHitsToSync.push({ x: hitX, y: hitY, color: '#10b981', isHook: false });
            }
        } else {
            // Normal hit
            this.setAction('hurt', isHook ? 25 : 12);
            this.vx = knockbackDirection * (isHook ? 12 : 5);
            
            // Spark particles on hit
            spawnHitParticles(hitX, hitY, attackerColor, isHook ? 22 : 12);
            
            if (isHook) {
                triggerScreenShake(12, 10);
            } else {
                triggerScreenShake(5, 3);
            }
            
            if (isHost && gameMode === MODE_ONLINE) {
                pendingHitsToSync.push({ x: hitX, y: hitY, color: attackerColor, isHook: isHook });
            }
            
            // Check KO
            if (this.hp <= 0) {
                this.setAction('ko', 9999);
                this.vx = knockbackDirection * 15;
                this.vy = -8;
                this.isGrounded = false;
            }
        }
    }
    
    draw(ctx) {
        ctx.save();
        
        // 1. Soft Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        // Scale shadow if jumped
        const shadowScale = Math.max(0.3, 1 - (420 - this.y) / 200);
        ctx.ellipse(this.x, 422, 28 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // 2. Translate coordinates to Boxer center bottom
        ctx.translate(this.x, this.y);
        ctx.scale(this.facing, 1); // Flip horizontally depending on facing direction
        
        const t = Date.now() / 150; // ticker for animation bobbing
        const isHurt = (this.action === 'hurt');
        const isKO = (this.action === 'ko');
        const isWin = (this.action === 'win');
        
        if (isKO) {
            // Draw Knocked Out posture (lying flat/tilted)
            ctx.rotate(-Math.PI / 2.2);
            ctx.translate(10, -30);
        } else if (isHurt) {
            // Tilted backwards when hurt
            ctx.rotate(-0.15);
        } else if (this.action === 'walk') {
            // Bounce up and down slightly when walking
            ctx.translate(0, Math.sin(t) * 3);
        } else if (isWin) {
            // Bounce happily when winning
            ctx.translate(0, -Math.abs(Math.sin(t * 1.5)) * 12);
        }
        
        // --- DRAWING VECTOR RETRO CHARACTER (16-Bit Style) ---
        
        // LEGS (Pixelated trousers/shoes)
        ctx.fillStyle = '#1e293b'; // dark shoes
        if (this.action === 'walk') {
            // Walk cycle leg separation
            const legSeparation = Math.sin(t) * 12;
            ctx.fillRect(-15 + legSeparation, -20, 10, 20);
            ctx.fillRect(5 - legSeparation, -20, 10, 20);
        } else {
            ctx.fillRect(-12, -20, 9, 20);
            ctx.fillRect(3, -20, 9, 20);
        }
        
        // TORSO (Military Vest / Shirt)
        ctx.fillStyle = this.color; // Base P1/P2 color for belt/shoulders
        ctx.fillRect(-16, -55, 32, 35);
        ctx.fillStyle = '#27272a'; // dark cargo shirt
        ctx.fillRect(-14, -53, 28, 25);
        // Chest details
        ctx.fillStyle = this.color;
        ctx.fillRect(-6, -45, 12, 6);
        
        // HEAD (Pixel art head)
        ctx.fillStyle = '#fbcfe8'; // Skin tone
        ctx.fillRect(-12, -82, 24, 28);
        
        // Hair & Cap (Military retro aesthetic)
        ctx.fillStyle = '#18181b'; // dark hair
        ctx.fillRect(-14, -84, 28, 10);
        ctx.fillStyle = this.color; // Cap visor
        ctx.fillRect(-4, -84, 20, 5);
        
        // Eyes (Faces direction of scale)
        if (isKO) {
            // KO'd cross eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(3, -73); ctx.lineTo(9, -67);
            ctx.moveTo(9, -73); ctx.lineTo(3, -67);
            ctx.stroke();
        } else if (isHurt) {
            // Hurt closed eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(4, -70); ctx.lineTo(10, -70);
            ctx.stroke();
        } else {
            // Normal black pixel eye with white glare
            ctx.fillStyle = '#fff';
            ctx.fillRect(4, -74, 7, 7);
            ctx.fillStyle = '#000';
            ctx.fillRect(6, -74, 5, 5);
        }
        
        // GLOVES / ARMS
        ctx.fillStyle = this.color; // Matching glove color
        
        if (this.action === 'jab') {
            // Jab: Extend lead glove far forward
            // Back glove guarding
            drawGlove(ctx, -15, -50, 12, this.color);
            // Extended lead arm & glove
            ctx.fillStyle = '#fbcfe8'; // Skin
            ctx.fillRect(10, -53, 35, 8);
            drawGlove(ctx, 45, -54, 15, this.color);
        } 
        else if (this.action === 'hook') {
            // Hook: Swinging heavy punch (curved/elevated path)
            // Back glove guarding
            drawGlove(ctx, -12, -50, 12, this.color);
            // Swing arm motion trail drawn in game loop, arm drawn curved
            ctx.fillStyle = '#fbcfe8';
            ctx.fillRect(5, -65, 20, 10);
            ctx.fillRect(20, -65, 10, 25);
            // Heavy big glove
            drawGlove(ctx, 25, -45, 19, this.color);
        } 
        else if (this.action === 'block') {
            // Guarding: Both gloves covering face
            drawGlove(ctx, 10, -74, 15, this.color);
            drawGlove(ctx, 4, -62, 14, this.color);
        } 
        else if (isHurt) {
            // Hurt: Gloves flailed wide
            drawGlove(ctx, -25, -40, 12, this.color);
            drawGlove(ctx, -15, -25, 12, this.color);
        } 
        else if (isKO) {
            // Lying gloves
            drawGlove(ctx, -10, -10, 12, this.color);
            drawGlove(ctx, 15, -5, 12, this.color);
        } 
        else if (isWin) {
            // Winner: Both hands raised in victory
            // Arm segments
            ctx.fillStyle = '#fbcfe8';
            ctx.fillRect(-15, -75, 8, 20);
            ctx.fillRect(7, -75, 8, 20);
            drawGlove(ctx, -11, -85, 14, this.color);
            drawGlove(ctx, 11, -85, 14, this.color);
        } 
        else {
            // Idle stance bobbing
            const bob = Math.sin(t * 1.5) * 2;
            drawGlove(ctx, -10, -48 + bob, 12, this.color); // back hand
            drawGlove(ctx, 10, -54 + bob, 13, this.color); // lead hand
        }
        
        ctx.restore();
    }
}

// Draw a glowing retro circle/square glove
function drawGlove(ctx, x, y, size, color) {
    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;
    ctx.fillStyle = color;
    
    // Draw round glove
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    
    // Glove rim highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(x - size/3, y - size/3, size/3, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
}

// Spark explosion
function spawnHitParticles(x, y, color, count = 15) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 8;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed - 1.5; // slight upward bias
        const size = 3 + Math.random() * 5;
        const life = 20 + Math.floor(Math.random() * 20);
        
        particles.push(new Particle(x, y, vx, vy, color, size, life));
    }
}

// Screen Shake Trigger
function triggerScreenShake(duration, intensity) {
    screenShake.duration = duration;
    screenShake.intensity = intensity;
}

// Update Screen Shake Position
function updateScreenShake() {
    if (screenShake.duration > 0) {
        screenShake.x = (Math.random() - 0.5) * 2 * screenShake.intensity;
        screenShake.y = (Math.random() - 0.5) * 2 * screenShake.intensity;
        screenShake.duration--;
    } else {
        screenShake.x = 0;
        screenShake.y = 0;
    }
}


/* ==========================================================================
   GAMEPLAY LOGIC & GAME STATE MACHINE
   ========================================================================== */

function startGameMode(mode) {
    gameMode = mode;
    
    // Hide menu overlay
    document.getElementById('game-menu-overlay').style.display = 'none';
    
    initMatch();
}

function initMatch() {
    // Reset round scores
    currentRound = 1;
    player1 = new Boxer(350, 420, 1, '#06b6d4', 'MARCO');
    player2 = new Boxer(650, 420, -1, '#ec4899', 'REBEL');
    
    // Set Spotlights
    spotlights = [
        new Spotlight(350, 350, 'rgba(6, 182, 212, 1)'),
        new Spotlight(650, 650, 'rgba(236, 72, 153, 1)')
    ];
    
    initRound(currentRound);
    
    // Start Game Loop if not already running
    stopGameLoop();
    gameLoop();
}

function initRound(roundNum) {
    gameState = STATE_ROUND_INTRO;
    stateTimer = 90; // 1.5 seconds in frames
    countdownText = "ROUND " + roundNum;
    winnerText = "";
    
    // Reset players for new round
    player1.x = 350;
    player1.y = 420;
    player1.vx = 0;
    player1.vy = 0;
    player1.hp = 100;
    player1.action = 'idle';
    player1.actionTimer = 0;
    player1.facing = 1;
    
    player2.x = 650;
    player2.y = 420;
    player2.vx = 0;
    player2.vy = 0;
    player2.hp = 100;
    player2.action = 'idle';
    player2.actionTimer = 0;
    player2.facing = -1;
    
    roundTimer = 60;
    particles = [];
    
    // Reset Spotlights
    spotlights[0].x = 350;
    spotlights[1].x = 650;
    
    clearInterval(timerInterval);
}

function startRoundTimer() {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if (gameState === STATE_PLAYING && (isHost || gameMode !== MODE_ONLINE)) {
            roundTimer--;
            
            // Check Timer Timeout
            if (roundTimer <= 0) {
                roundTimer = 0;
                clearInterval(timerInterval);
                resolveRoundTimeout();
            }
            
            if (gameMode === MODE_ONLINE && isHost) {
                syncOnlineState();
            }
        }
    }, 1000);
}

// When round ends by running out of time
function resolveRoundTimeout() {
    let roundWinner = null;
    if (player1.hp > player2.hp) {
        roundWinner = player1;
    } else if (player2.hp > player1.hp) {
        roundWinner = player2;
    }
    
    endRound(roundWinner, "WAKTU HABIS!");
}

function checkRoundEnd() {
    if (player1.hp <= 0) {
        endRound(player2, "T.K.O!");
    } else if (player2.hp <= 0) {
        endRound(player1, "T.K.O!");
    }
}

function endRound(winner, causeText) {
    gameState = STATE_ROUND_END;
    stateTimer = 180; // 3 seconds delay
    clearInterval(timerInterval);
    
    if (winner) {
        winner.roundsWon++;
        winner.setAction('win', 9999);
        winnerText = causeText + " " + winner.name + " MENANG RAUND!";
    } else {
        winnerText = "SERI!";
    }
}

function checkMatchEnd() {
    const roundsToWin = 2;
    if (player1.roundsWon >= roundsToWin) {
        gameState = STATE_GAME_OVER;
        winnerText = "MARCO P1 JUARA MATCH!";
    } else if (player2.roundsWon >= roundsToWin) {
        gameState = STATE_GAME_OVER;
        winnerText = "REBEL P2 JUARA MATCH!";
    } else {
        // Go to next round
        currentRound++;
        initRound(currentRound);
    }
}


/* ==========================================================================
   AI BEHAVIOR LOGIC
   ========================================================================== */
let aiDecisionTimer = 0;
function updateAIBehavior() {
    if (gameState !== STATE_PLAYING) return;
    
    aiDecisionTimer--;
    
    // Check distance between AI (player2) and player (player1)
    const dist = Math.abs(player2.x - player1.x);
    
    // AI Input Flags
    let aiLeft = false;
    let aiRight = false;
    let aiJab = false;
    let aiBlock = false;
    let aiHook = false;
    
    // Core AI loop decisions every 6 frames (reaction time delay)
    if (aiDecisionTimer <= 0) {
        aiDecisionTimer = 6; 
        
        // Dynamic reaction to player attacks
        const playerIsAttacking = ['jab', 'hook'].includes(player1.action) && dist < 120;
        
        if (playerIsAttacking && Math.random() < 0.65) {
            // Block reaction
            player2.remoteKeys.Block = true;
            player2.remoteKeys.Left = false;
            player2.remoteKeys.Right = false;
            return;
        } else {
            player2.remoteKeys.Block = false;
        }
        
        if (dist > 100) {
            // Move closer
            if (player2.x > player1.x) {
                player2.remoteKeys.Left = true;
                player2.remoteKeys.Right = false;
            } else {
                player2.remoteKeys.Right = true;
                player2.remoteKeys.Left = false;
            }
        } 
        else if (dist < 50) {
            // Too close, step back
            if (player2.x > player1.x) {
                player2.remoteKeys.Right = true;
                player2.remoteKeys.Left = false;
            } else {
                player2.remoteKeys.Left = true;
                player2.remoteKeys.Right = false;
            }
        }
        else {
            // Within striking distance: stop moving, randomly strike or block
            player2.remoteKeys.Left = false;
            player2.remoteKeys.Right = false;
            
            const rand = Math.random();
            if (rand < 0.15) {
                player2.remoteKeys.Jab = true;
            } else if (rand < 0.20) {
                player2.remoteKeys.Hook = true;
            } else if (rand < 0.28) {
                player2.remoteKeys.Block = true;
            } else {
                player2.remoteKeys.Jab = false;
                player2.remoteKeys.Hook = false;
                player2.remoteKeys.Block = false;
            }
        }
    }
}


/* ==========================================================================
   INPUT PROCESSING
   ========================================================================== */
function processInputs() {
    if (gameState !== STATE_PLAYING) return;
    
    // --- PLAYER 1 INPUTS ---
    if (player1.action === 'idle' || player1.action === 'walk') {
        let isMoving = false;
        
        if (keys['a'] || keys['A']) {
            player1.vx = -4.5;
            isMoving = true;
        } else if (keys['d'] || keys['D']) {
            player1.vx = 4.5;
            isMoving = true;
        }
        
        player1.action = isMoving ? 'walk' : 'idle';
        
        // Strike inputs P1
        if (keys['w'] || keys['W']) {
            player1.setAction('jab', 12);
            player1.vx = player1.facing * 2; // small forward dash
            player1.checkHit(player2, 110, 6); // lead jab
        } else if (keys['s'] || keys['S']) {
            player1.setAction('block', 999); // block until key released
        } else if (keys[' ']) { // space
            player1.setAction('hook', 35);
            player1.vx = player1.facing * 5; // heavier lunge forward
            // Check strike frame on middle frame of hook punch
            setTimeout(() => {
                if (gameState === STATE_PLAYING && player1.action === 'hook') {
                    player1.checkHit(player2, 85, 16, true); // heavy hook
                }
            }, 150);
        }
    }
    
    // Release block if key released
    if (player1.action === 'block' && !(keys['s'] || keys['S'])) {
        player1.action = 'idle';
        player1.actionTimer = 0;
    }
    
    
    // --- PLAYER 2 INPUTS (Local Keyboard / AI / Online client remote) ---
    let p2Inputs = {};
    
    if (gameMode === MODE_LOCAL) {
        // Read Player 2 local key mappings
        p2Inputs = {
            Left: keys['ArrowLeft'] || false,
            Right: keys['ArrowRight'] || false,
            Jab: keys['ArrowUp'] || false,
            Block: keys['ArrowDown'] || false,
            Hook: keys['Enter'] || false
        };
    } else if (gameMode === MODE_VS_AI || (gameMode === MODE_ONLINE && isHost)) {
        // AI inputs or Online Remote inputs synced to player2.remoteKeys
        p2Inputs = {
            Left: player2.remoteKeys.Left || false,
            Right: player2.remoteKeys.Right || false,
            Jab: player2.remoteKeys.Jab || false,
            Block: player2.remoteKeys.Block || false,
            Hook: player2.remoteKeys.Hook || false
        };
    }
    
    // Apply Player 2 inputs
    if (gameMode !== MODE_ONLINE || isHost) {
        if (player2.action === 'idle' || player2.action === 'walk') {
            let isMoving = false;
            
            if (p2Inputs.Left) {
                player2.vx = -4.5;
                isMoving = true;
            } else if (p2Inputs.Right) {
                player2.vx = 4.5;
                isMoving = true;
            }
            
            player2.action = isMoving ? 'walk' : 'idle';
            
            // Strike inputs P2
            if (p2Inputs.Jab) {
                player2.setAction('jab', 12);
                player2.vx = player2.facing * 2;
                player2.checkHit(player1, 110, 6);
                // Reset remote trigger so it doesn't loop
                player2.remoteKeys.Jab = false;
            } else if (p2Inputs.Block) {
                player2.setAction('block', 999);
            } else if (p2Inputs.Hook) {
                player2.setAction('hook', 35);
                player2.vx = player2.facing * 5;
                setTimeout(() => {
                    if (gameState === STATE_PLAYING && player2.action === 'hook') {
                        player2.checkHit(player1, 85, 16, true);
                    }
                }, 150);
                player2.remoteKeys.Hook = false;
            }
        }
        
        // Release block if key released
        if (player2.action === 'block' && !p2Inputs.Block) {
            player2.action = 'idle';
            player2.actionTimer = 0;
        }
    }
}


/* ==========================================================================
   CANVAS DRAWING & LOOP ENGINE
   ========================================================================== */

function gameLoop() {
    if (!isGameModalOpen()) {
        stopGameLoop();
        return;
    }
    
    // 1. Process Online client send & host sync
    if (gameMode === MODE_ONLINE) {
        if (!isHost) {
            syncClientInputs();
        } else {
            syncOnlineState();
        }
    }
    
    // 2. Physics & State updates (Simulated on Host in Online, or local in other modes)
    if (gameMode !== MODE_ONLINE || isHost) {
        updatePhysics();
    }
    
    // 3. Local rendering and particle animation (Happens on both clients locally)
    renderGame();
    
    animationFrameId = requestAnimationFrame(gameLoop);
}

function updatePhysics() {
    // AI Decision trigger
    if (gameMode === MODE_VS_AI) {
        updateAIBehavior();
    }
    
    // State machine updates
    if (gameState === STATE_ROUND_INTRO) {
        stateTimer--;
        if (stateTimer <= 60) {
            countdownText = "FIGHT!";
        }
        if (stateTimer <= 0) {
            gameState = STATE_PLAYING;
            startRoundTimer();
        }
    } 
    else if (gameState === STATE_PLAYING) {
        processInputs();
        
        player1.update(player2);
        player2.update(player1);
        
        checkRoundEnd();
    } 
    else if (gameState === STATE_ROUND_END) {
        player1.update(player2);
        player2.update(player1);
        
        stateTimer--;
        if (stateTimer <= 0) {
            checkMatchEnd();
        }
    } 
    else if (gameState === STATE_GAME_OVER) {
        player1.update(player2);
        player2.update(player1);
        
        // Press space or enter to restart match
        if (keys[' '] || keys['Enter']) {
            initMatch();
        }
    }
}

function renderGame() {
    ctx.save();
    
    // Screen shake translate
    updateScreenShake();
    ctx.translate(screenShake.x, screenShake.y);
    
    // 1. Background sky/wall
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Drawing spotlights
    if (gameState === STATE_PLAYING || gameState === STATE_ROUND_INTRO || gameState === STATE_ROUND_END || gameState === STATE_GAME_OVER) {
        spotlights[0].update(player1.x);
        spotlights[1].update(player2.x);
        spotlights.forEach(spot => spot.draw(ctx));
    }
    
    // 2. Ring Background Ropes & Posts
    drawRing();
    
    // 3. Draw Players
    player1.draw(ctx);
    player2.draw(ctx);
    
    // 4. Update and Draw Particles
    particles.forEach((p, idx) => {
        p.update();
        p.draw(ctx);
        if (p.life <= 0) particles.splice(idx, 1);
    });
    
    ctx.restore(); // restore screen shake
    
    // 5. Draw HUD interface
    drawHUD();
}

function drawStaticBackground() {
    // Draws clean retro stage in background when on menu
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw spotlights crossing
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad1 = ctx.createLinearGradient(300, 0, 450, 420);
    grad1.addColorStop(0, 'rgba(6, 182, 212, 0.1)');
    grad1.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad1;
    ctx.beginPath();
    ctx.moveTo(350, 0); ctx.lineTo(410, 0); ctx.lineTo(600, 420); ctx.lineTo(300, 420);
    ctx.fill();
    
    const grad2 = ctx.createLinearGradient(700, 0, 550, 420);
    grad2.addColorStop(0, 'rgba(236, 72, 153, 0.1)');
    grad2.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad2;
    ctx.beginPath();
    ctx.moveTo(650, 0); ctx.lineTo(590, 0); ctx.lineTo(400, 420); ctx.lineTo(700, 420);
    ctx.fill();
    ctx.restore();
    
    drawRing();
}

function drawRing() {
    // Draw Floor ground
    ctx.fillStyle = '#8c7865'; // retro beige/brown sand floor
    ctx.fillRect(0, 420, canvas.width, 80);
    
    // Outer shadow rim of ring
    ctx.fillStyle = '#6f5a48';
    ctx.fillRect(0, 420, canvas.width, 6);
    
    // Posts (Iron pillars)
    ctx.fillStyle = '#52525b';
    ctx.fillRect(80, 270, 20, 150); // Left post
    ctx.fillRect(900, 270, 20, 150); // Right post
    // Post caps
    ctx.fillStyle = '#3f3f46';
    ctx.fillRect(75, 260, 30, 10);
    ctx.fillRect(895, 260, 30, 10);
    
    // Ring Ropes (three horizontal striped ropes)
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]); // dotted rope effect
    
    ctx.beginPath();
    ctx.moveTo(90, 300); ctx.lineTo(910, 300); // top rope
    ctx.moveTo(90, 340); ctx.lineTo(910, 340); // mid rope
    ctx.moveTo(90, 380); ctx.lineTo(910, 380); // bottom rope
    ctx.stroke();
    ctx.setLineDash([]); // reset line dash
}

function drawHUD() {
    if (gameState === STATE_MENU) return;
    
    // --- HUD BAR CONTAINER ---
    
    // P1 Healthbar (Cyan)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(25, 25, 250, 35);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.2)';
    ctx.fillRect(27, 27, 246, 31);
    // Gradient filling for health
    const p1HpGrad = ctx.createLinearGradient(25, 0, 275, 0);
    p1HpGrad.addColorStop(0, '#eab308'); // warning orange
    p1HpGrad.addColorStop(1, '#06b6d4'); // cyan
    ctx.fillStyle = p1HpGrad;
    ctx.fillRect(27, 27, (player1.hp / 100) * 246, 31);
    
    // P1 Info text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText("MARCO P1 (CYAN)", 30, 20);
    
    // P1 Rounds won icons (little circles)
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(32 + (i * 18), 43, 6, 0, Math.PI * 2);
        ctx.fillStyle = (player1.roundsWon > i) ? '#06b6d4' : '#3f3f46';
        ctx.fill();
    }
    
    
    // P2 Healthbar (Magenta)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(725, 25, 250, 35);
    ctx.fillStyle = 'rgba(236, 72, 153, 0.2)';
    ctx.fillRect(727, 27, 246, 31);
    // Gradient filling
    const p2HpGrad = ctx.createLinearGradient(725, 0, 975, 0);
    p2HpGrad.addColorStop(0, '#eab308'); // orange
    p2HpGrad.addColorStop(1, '#ec4899'); // magenta
    ctx.fillStyle = p2HpGrad;
    // P2 health bar decreases from right to left
    const p2HpWidth = (player2.hp / 100) * 246;
    ctx.fillRect(973 - p2HpWidth, 27, p2HpWidth, 31);
    
    // P2 Info text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(gameMode === MODE_VS_AI ? "REBEL (KOMPUTER)" : "REBEL P2 (MAGENTA)", 970, 20);
    ctx.textAlign = 'left';
    
    // P2 Rounds won icons
    for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.arc(968 - (i * 18), 43, 6, 0, Math.PI * 2);
        ctx.fillStyle = (player2.roundsWon > i) ? '#ec4899' : '#3f3f46';
        ctx.fill();
    }
    
    
    // --- TIMER PANEL (TOP CENTER) ---
    ctx.fillStyle = '#18181b';
    ctx.fillRect(450, 15, 100, 60);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1;
    ctx.strokeRect(450, 15, 100, 60);
    
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText("ROUND " + currentRound, 500, 30);
    
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 28px monospace';
    // Format double digit timer
    const strTimer = roundTimer < 10 ? "0" + roundTimer : roundTimer;
    ctx.fillText(strTimer, 500, 62);
    ctx.textAlign = 'left'; // reset
    
    
    // --- SCREEN CENTER BANNERS (Intros, Ends, Game Overs) ---
    if (gameState === STATE_ROUND_INTRO) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#eab308';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 200, canvas.width, 100);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.strokeRect(-5, 200, canvas.width + 10, 100);
        
        ctx.fillStyle = '#fff';
        ctx.font = '900 48px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(countdownText, 500, 266);
        ctx.restore();
    } 
    else if (gameState === STATE_ROUND_END) {
        ctx.save();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#f43f5e';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 180, canvas.width, 140);
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.strokeRect(-5, 180, canvas.width + 10, 140);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText("SELESAI!", 500, 225);
        
        ctx.fillStyle = '#fbbf24';
        ctx.font = '900 24px Outfit, sans-serif';
        ctx.fillText(winnerText, 500, 275);
        ctx.restore();
    } 
    else if (gameState === STATE_GAME_OVER) {
        ctx.save();
        ctx.shadowBlur = 25;
        ctx.shadowColor = '#eab308';
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 140, canvas.width, 220);
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 3;
        ctx.strokeRect(-5, 140, canvas.width + 10, 220);
        
        ctx.fillStyle = '#ef4444';
        ctx.font = '900 32px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("MATCH SELESAI!", 500, 200);
        
        ctx.fillStyle = '#fff';
        ctx.font = '900 28px Outfit, sans-serif';
        ctx.fillText(winnerText, 500, 255);
        
        ctx.fillStyle = '#a1a1aa';
        ctx.font = '13px monospace';
        ctx.fillText("TEKAN SPASI / ENTER UNTUK MAIN LAGI", 500, 315);
        ctx.restore();
    }
}
