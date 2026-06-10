/* ==========================================================================
   BACCARAT ROYALE CORE GAME ENGINE (baccarat.js)
   ========================================================================== */

// Game States
const B_STATE_BETTING = 'betting';
const B_STATE_DEALING = 'dealing';
const B_STATE_REVEAL = 'reveal';
const B_STATE_PAYOUT = 'payout';
const B_STATE_OVER = 'over';

// Bet Spot Constants
const SPOT_PLAYER = 'player';
const SPOT_TIE = 'tie';
const SPOT_BANKER = 'banker';

// Suits & Values
const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
const CARD_LABELS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// Global Game Variables
let bCanvas, bCtx;
let bState = B_STATE_BETTING;
let bAnimId = null;

// Game Modes & Balance
let bMode = 'solo'; // solo, local, online
let playerBalance = 1000; // Used for Solo Mode
let player1Balance = 1000; // Used for 1v1 Mode
let player2Balance = 1000; // Used for 1v1 Mode
let activeBettor = 1; // P1 or P2 currently betting in 1v1
let activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
let selectedChipValue = 50;

// WebRTC PeerJS variables
let peer = null;
let conn = null;
let isHost = false;
let isConnected = false;
let onlineRoomCode = "";
const PEER_PREFIX = 'bac-';

// Card Game variables
let shoe = []; // deck shoe
let playerCards = [];
let bankerCards = [];
let dealQueue = []; // queue of cards to animate
let activeCardInDeal = null; // card currently sliding
let roundWinner = ""; // player, banker, tie
let lastRoundResultText = ""; // text outcome description
let winLossNetMessage = ""; // e.g. "Anda menang +100 koin!"
let lastOutcomeText = "BELUM ADA"; // shows in dashboard
let winnerAnnouncement = ""; // match victory text

// Bead Plate Roadmap History
let roadmapHistory = []; // list of outcomes ('P', 'B', 'T')
const MAX_ROADMAP_CELLS = 72; // 6 rows * 12 columns grid

// Animation configurations
let dealTimer = 0;
let revealTimer = 0;
let payoutTimer = 0;

/* ==========================================================================
   WEB AUDIO API RETRO CASINO SYNTHESIZER
   ========================================================================== */
const BaccaratAudio = {
    ctx: null,
    
    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            this.ctx = new AudioContextClass();
        }
    },
    
    playTone(freq, type, duration, endFreq = null, volume = 0.2) {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        try {
            const osc = this.ctx.createOscillator();
            const gainNode = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            if (endFreq !== null) {
                osc.frequency.exponentialRampToValueAtTime(endFreq, this.ctx.currentTime + duration);
            }
            
            gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
            
            osc.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Audio error: ", e);
        }
    },
    
    // Card slide noise
    playCardSlide() {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        try {
            const duration = 0.25;
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            // White noise
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(800, this.ctx.currentTime);
            filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + duration);
            filter.Q.setValueAtTime(5, this.ctx.currentTime);
            
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0.08, this.ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
            
            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            
            noise.start();
            noise.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Card slide sfx error: ", e);
        }
    },
    
    playCardFlip() {
        // Quick low thud for card flipping
        this.playTone(180, 'sine', 0.08, 90, 0.2);
    },
    
    playChipSound() {
        // High-pitched casino chip clink
        this.playTone(2000, 'sine', 0.08, null, 0.12);
        setTimeout(() => {
            this.playTone(2500, 'sine', 0.05, null, 0.08);
        }, 25);
    },
    
    playClick() {
        this.playTone(900, 'sine', 0.06, 500, 0.12);
    },
    
    playWin() {
        // Happy casino fanfare arpeggio
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'sine', 0.2, null, 0.18);
            }, idx * 100);
        });
    },
    
    playLose() {
        // Sad arpeggio
        const notes = [392, 349.23, 293.66, 220]; // G4, F4, D4, A3
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.25, freq * 0.8, 0.18);
            }, idx * 120);
        });
    },
    
    playTie() {
        // Neutral clean chime
        const notes = [587.33, 587.33, 783.99]; // D5, D5, G5
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'sine', 0.3, null, 0.15);
            }, idx * 80);
        });
    }
};

/* ==========================================================================
   DOM INITIALIZATION & BINDINGS
   ========================================================================== */
function initBaccarat() {
    // Open Modal
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.btn-play-baccarat'); // Bind to new portofolio buttons
        if (playBtn) {
            e.preventDefault();
            openBaccaratModal();
        }
    });

    // Close Modal
    const closeBtn = document.getElementById('baccarat-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeBaccaratModal);
    
    const modal = document.getElementById('baccarat-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeBaccaratModal();
        });
    }

    // Fullscreen Toggle
    const fsBtn = document.getElementById('baccarat-fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', toggleBaccaratFullscreen);
    }
    document.addEventListener('fullscreenchange', handleBaccaratFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleBaccaratFullscreenChange);

    // Game Mode Selection Click Handlers
    const btnModeSolo = document.getElementById('btn-baccarat-mode-solo');
    const btnModeLocal = document.getElementById('btn-baccarat-mode-local');
    const btnModeOnline = document.getElementById('btn-baccarat-mode-online');
    
    if (btnModeSolo) {
        btnModeSolo.addEventListener('click', () => switchBaccaratMode('solo'));
    }
    if (btnModeLocal) {
        btnModeLocal.addEventListener('click', () => switchBaccaratMode('local'));
    }
    if (btnModeOnline) {
        btnModeOnline.addEventListener('click', () => switchBaccaratMode('online'));
    }

    // Online Action Buttons Click Handlers
    const btnOnlineHost = document.getElementById('btn-online-host');
    const btnOnlineJoin = document.getElementById('btn-online-join');
    
    if (btnOnlineHost) {
        btnOnlineHost.addEventListener('click', hostOnlineGame);
    }
    if (btnOnlineJoin) {
        btnOnlineJoin.addEventListener('click', joinOnlineGame);
    }

    // Setup controls
    setupBaccaratControls();
}

// Robust start check
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBaccarat);
} else {
    initBaccarat();
}

function openBaccaratModal() {
    BaccaratAudio.init();
    BaccaratAudio.playClick();
    const modal = document.getElementById('baccarat-modal');
    if (modal) {
        modal.classList.add('show');
        initBaccaratCanvas();
        resetBaccaratMatch();
        startBaccaratLoop();
    }
}

function closeBaccaratModal() {
    BaccaratAudio.playClick();
    const modal = document.getElementById('baccarat-modal');
    if (modal) {
        modal.classList.remove('show');
        stopBaccaratLoop();
        disconnectOnlineGame();
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }
}

function initBaccaratCanvas() {
    bCanvas = document.getElementById('baccarat-canvas'); // Reuse the canvas ID
    if (bCanvas) {
        bCtx = bCanvas.getContext('2d');
        bCanvas.width = 880;
        bCanvas.height = 360;
    }
}

function startBaccaratLoop() {
    stopBaccaratLoop();
    bLoop();
}

function stopBaccaratLoop() {
    if (bAnimId) {
        cancelAnimationFrame(bAnimId);
        bAnimId = null;
    }
}

function toggleBaccaratFullscreen() {
    const modalContent = document.querySelector('.baccarat-modal-content');
    if (!document.fullscreenElement) {
        if (modalContent.requestFullscreen) {
            modalContent.requestFullscreen();
        } else if (modalContent.webkitRequestFullscreen) {
            modalContent.webkitRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function handleBaccaratFullscreenChange() {
    const fsBtn = document.getElementById('baccarat-fullscreen-btn');
    if (!fsBtn) return;
    const icon = fsBtn.querySelector('i');
    
    if (document.fullscreenElement) {
        if (icon) icon.setAttribute('data-lucide', 'minimize');
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
    } else {
        if (icon) icon.setAttribute('data-lucide', 'expand');
        if (screen.orientation && screen.orientation.unlock) {
            screen.orientation.unlock();
        }
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

/* ==========================================================================
   GAME MODES SWITCHER
   ========================================================================== */
function switchBaccaratMode(mode) {
    if (bState !== B_STATE_BETTING && bState !== B_STATE_OVER) {
        alert("Selesaikan putaran game yang sedang berjalan terlebih dahulu!");
        return;
    }
    
    BaccaratAudio.playClick();
    bMode = mode;
    
    // Toggle active selector class
    document.querySelectorAll('.baccarat-mode-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show/hide online setup panel
    const onlineSetupPanel = document.getElementById('baccarat-online-setup');
    if (onlineSetupPanel) {
        if (mode === 'online') {
            onlineSetupPanel.style.display = 'block';
        } else {
            onlineSetupPanel.style.display = 'none';
        }
    }
    
    if (mode === 'solo') {
        document.getElementById('btn-baccarat-mode-solo').classList.add('active');
        disconnectOnlineGame();
        resetBaccaratMatch();
    } else if (mode === 'local') {
        document.getElementById('btn-baccarat-mode-local').classList.add('active');
        disconnectOnlineGame();
        player1Balance = 1000;
        player2Balance = 1000;
        activeBettor = 1;
        resetBaccaratMatch();
    } else if (mode === 'online') {
        document.getElementById('btn-baccarat-mode-online').classList.add('active');
        player1Balance = 1000;
        player2Balance = 1000;
        activeBettor = 1; // Host (P1) is bettor first
        resetBaccaratMatch();
        updateOnlineStatus("Tidak Terhubung", "disconnected");
    }
    
    updateModeDashboardLabels();
}

function updateModeDashboardLabels() {
    const p1Label = document.getElementById('label-player-coin');
    const p2Label = document.getElementById('label-last-outcome');
    const betLabel = document.getElementById('label-current-bet');
    
    if (bMode === 'solo') {
        if (p1Label) p1Label.textContent = "Saldo Anda";
        if (p2Label) p2Label.textContent = "Hasil Terakhir";
        if (betLabel) betLabel.textContent = "Total Taruhan";
    } else if (bMode === 'local') {
        if (p1Label) p1Label.textContent = "Saldo Player 1";
        if (p2Label) p2Label.textContent = "Saldo Player 2";
        if (betLabel) betLabel.textContent = "Taruhan Ronde";
    } else if (bMode === 'online') {
        if (p1Label) {
            p1Label.textContent = isHost ? "Saldo Anda (P1)" : "Saldo P1";
        }
        if (p2Label) {
            p2Label.textContent = isHost ? "Saldo P2" : "Saldo Anda (P2)";
        }
        if (betLabel) betLabel.textContent = "Taruhan Ronde";
    }
}

/* ==========================================================================
   P2P PEERJS ONLINE CONNECTION HANDLERS
   ========================================================================== */
function hostOnlineGame() {
    BaccaratAudio.playClick();
    disconnectOnlineGame(); // Clean up existing
    
    // Generate a 4-digit code
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    onlineRoomCode = code;
    
    const hostCodeVal = document.getElementById('host-code-val');
    const roomCodeDisplay = document.getElementById('room-code-display');
    if (hostCodeVal) hostCodeVal.textContent = code;
    if (roomCodeDisplay) roomCodeDisplay.style.display = 'block';
    
    updateOnlineStatus("Sedang membuat ruangan...", "connecting");
    
    isHost = true;
    peer = new Peer(PEER_PREFIX + code);
    
    peer.on('open', () => {
        updateOnlineStatus("Menunggu lawan masuk (Kode: " + code + ")...", "connecting");
    });
    
    peer.on('connection', (connection) => {
        conn = connection;
        setupConnection();
    });
    
    peer.on('error', (err) => {
        console.error("PeerJS error: ", err);
        updateOnlineStatus("Gagal membuat ruangan. Kode tabrakan?", "disconnected");
        if (roomCodeDisplay) roomCodeDisplay.style.display = 'none';
    });
}

function joinOnlineGame() {
    BaccaratAudio.playClick();
    const input = document.getElementById('join-room-input');
    if (!input || input.value.trim().length !== 4) {
        alert("Masukkan 4 digit kode ruangan yang valid!");
        return;
    }
    
    const code = input.value.trim();
    onlineRoomCode = code;
    disconnectOnlineGame(); // Clean up existing
    
    updateOnlineStatus("Sedang menyambungkan ke " + code + "...", "connecting");
    
    isHost = false;
    peer = new Peer(); // Client peer with random ID
    
    peer.on('open', () => {
        conn = peer.connect(PEER_PREFIX + code);
        setupConnection();
    });
    
    peer.on('error', (err) => {
        console.error("PeerJS error: ", err);
        updateOnlineStatus("Gagal menyambung. Kode salah / ruangan tidak aktif.", "disconnected");
    });
}

function disconnectOnlineGame() {
    isConnected = false;
    isHost = false;
    
    if (conn) {
        conn.close();
        conn = null;
    }
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    const roomDisplay = document.getElementById('room-code-display');
    if (roomDisplay) roomDisplay.style.display = 'none';
    
    const input = document.getElementById('join-room-input');
    if (input) input.value = "";
}

function updateOnlineStatus(msg, state) {
    const statusMsg = document.getElementById('online-status-msg');
    const indicator = document.getElementById('online-indicator');
    
    if (statusMsg) statusMsg.textContent = msg;
    if (indicator) {
        indicator.className = "status-indicator"; // reset
        if (state === 'connecting') indicator.classList.add('connecting');
        else if (state === 'connected') indicator.classList.add('connected');
    }
}

function setupConnection() {
    conn.on('open', () => {
        isConnected = true;
        updateOnlineStatus("Lawan Terhubung! Permainan Dimulai.", "connected");
        
        // Reset game stats for both P1 and P2
        player1Balance = 1000;
        player2Balance = 1000;
        activeBettor = 1; // P1 always shuffles/bets first
        bState = B_STATE_BETTING;
        
        resetBaccaratMatch();
        updateModeDashboardLabels();
        updateBaccaratUI();
    });
    
    conn.on('data', (data) => {
        handleIncomingData(data);
    });
    
    conn.on('close', () => {
        isConnected = false;
        updateOnlineStatus("Koneksi terputus. Lawan meninggalkan permainan.", "disconnected");
        resetBaccaratMatch();
    });
    
    conn.on('error', () => {
        isConnected = false;
        updateOnlineStatus("Koneksi error.", "disconnected");
    });
}

function handleIncomingData(data) {
    if (data.type === 'BET_UPDATE') {
        // Sync active bets on screen
        activeBets = data.bets;
        updateBaccaratUI();
    } 
    else if (data.type === 'BET_LOCK') {
        // Bettor locked bets, so Dealer can deal!
        activeBets = data.bets;
        updateBaccaratUI();
        
        // Unlock Bagi Kartu button for Dealer
        const btnDeal = document.getElementById('btn-baccarat-deal');
        if (btnDeal) {
            btnDeal.disabled = false;
            btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } 
    else if (data.type === 'DEAL_CARDS') {
        // Dealer deals cards, bettor receives cards to animate
        playerCards = [];
        bankerCards = [];
        dealQueue = [];
        activeCardInDeal = null;
        
        // Build the deal queue from indices
        data.cards.forEach(cardData => {
            const cardEntity = {
                label: cardData.label,
                suit: cardData.suit,
                value: cardData.value,
                side: cardData.side,
                index: cardData.index,
                x: 820,
                y: 40,
                targetX: cardData.targetX,
                targetY: cardData.targetY,
                isFaceUp: false,
                scaleX: 1,
                angle: 0,
                speed: 0.12
            };
            dealQueue.push(cardEntity);
        });
        
        bState = B_STATE_DEALING;
        processNextDealQueue();
    }
    else if (data.type === 'ROUND_RESET') {
        // Sync next round roles
        activeBettor = data.nextBettor;
        prepareNextRoundSync();
    }
    else if (data.type === 'MATCH_RESTART') {
        resetBaccaratMatch();
    }
}

/* ==========================================================================
   BACCARAT GAME RULES & CONTROLS
   ========================================================================== */
function setupBaccaratControls() {
    // Chips clicks
    const chips = document.querySelectorAll('.baccarat-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            BaccaratAudio.playClick();
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            
            const val = chip.getAttribute('data-value');
            selectedChipValue = (val === 'all') ? 'all' : parseInt(val);
        });
    });

    // Betting spots clicks
    const spots = document.querySelectorAll('.baccarat-bet-spot');
    spots.forEach(spot => {
        spot.addEventListener('click', () => {
            if (bState !== B_STATE_BETTING) return;
            
            const spotId = spot.getAttribute('data-spot');
            placeBaccaratBet(spotId);
        });
    });

    // Buttons
    const btnDeal = document.getElementById('btn-baccarat-deal');
    const btnClear = document.getElementById('btn-baccarat-clear');
    
    if (btnDeal) {
        btnDeal.addEventListener('click', () => {
            if (bState === B_STATE_OVER) {
                // Main Lagi logic
                BaccaratAudio.playClick();
                if (bMode === 'online') {
                    conn.send({ type: 'MATCH_RESTART' });
                }
                resetBaccaratMatch();
                return;
            }
            if (bState !== B_STATE_BETTING) return;
            
            if (bMode === 'online') {
                if (isMyTurnToBet()) {
                    // We are Bettor clicking "Kunci Taruhan"
                    let totalPlaced = Object.values(activeBets).reduce((a, b) => a + b, 0);
                    if (totalPlaced <= 0) {
                        alert("Pasang taruhan terlebih dahulu!");
                        return;
                    }
                    BaccaratAudio.playClick();
                    // Lock bets locally
                    btnDeal.disabled = true;
                    btnDeal.textContent = "Menunggu Dealer...";
                    conn.send({ type: 'BET_LOCK', bets: activeBets });
                } else {
                    // We are Dealer clicking "Bagi Kartu"
                    BaccaratAudio.playClick();
                    startOnlineDealing();
                }
                return;
            }
            
            // Solo/Local Dealing
            let totalPlaced = Object.values(activeBets).reduce((a, b) => a + b, 0);
            if (totalPlaced <= 0) {
                alert("Pasang taruhan koin Anda di Player, Banker, atau Tie terlebih dahulu!");
                return;
            }
            
            BaccaratAudio.playClick();
            startDealingPhase();
        });
    }

    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (bState !== B_STATE_BETTING) return;
            
            BaccaratAudio.playClick();
            clearBaccaratBets();
        });
    }
}

function isMyTurnToBet() {
    if (bMode !== 'online') return true;
    if (!isConnected) return false;
    return (isHost && activeBettor === 1) || (!isHost && activeBettor === 2);
}

function placeBaccaratBet(spotId) {
    if (!isMyTurnToBet()) return;
    
    let currentBal = playerBalance;
    if (bMode === 'local' || bMode === 'online') {
        currentBal = (activeBettor === 1) ? player1Balance : player2Balance;
    }
    
    let betAmount = 0;
    if (selectedChipValue === 'all') {
        betAmount = currentBal;
    } else {
        betAmount = selectedChipValue;
    }
    
    if (betAmount > currentBal) {
        betAmount = currentBal;
    }
    
    if (betAmount <= 0) return;
    
    if (bMode === 'solo') {
        playerBalance -= betAmount;
    } else {
        if (activeBettor === 1) player1Balance -= betAmount;
        else player2Balance -= betAmount;
    }
    activeBets[spotId] += betAmount;
    
    BaccaratAudio.playChipSound();
    
    if (bMode === 'online') {
        conn.send({ type: 'BET_UPDATE', bets: activeBets });
    }
    
    updateBaccaratUI();
}

function clearBaccaratBets() {
    if (!isMyTurnToBet()) return;
    
    for (let spot in activeBets) {
        if (bMode === 'solo') {
            playerBalance += activeBets[spot];
        } else {
            if (activeBettor === 1) player1Balance += activeBets[spot];
            else player2Balance += activeBets[spot];
        }
        activeBets[spot] = 0;
    }
    
    if (bMode === 'online') {
        conn.send({ type: 'BET_UPDATE', bets: activeBets });
    }
    
    updateBaccaratUI();
}

function updateBaccaratUI() {
    const balanceEl = document.getElementById('baccarat-player-coin');
    const totalBetEl = document.getElementById('baccarat-current-bet');
    const lastResultEl = document.getElementById('baccarat-last-outcome');
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    const btnClear = document.getElementById('btn-baccarat-clear');
    
    if (bMode === 'solo') {
        if (balanceEl) balanceEl.textContent = playerBalance;
        if (lastResultEl) {
            lastResultEl.textContent = lastOutcomeText;
            lastResultEl.className = "baccarat-stat-val";
            if (lastOutcomeText.includes("PLAYER")) lastResultEl.classList.add("blue");
            else if (lastOutcomeText.includes("BANKER")) lastResultEl.classList.add("red");
            else if (lastOutcomeText.includes("TIE")) lastResultEl.classList.add("green");
            else lastResultEl.classList.add("gold");
        }
        if (btnDeal && bState === B_STATE_BETTING) {
            btnDeal.disabled = false;
            btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        if (btnClear && bState === B_STATE_BETTING) {
            btnClear.disabled = false;
        }
    } 
    else if (bMode === 'local') {
        if (balanceEl) balanceEl.textContent = player1Balance;
        if (lastResultEl) {
            lastResultEl.textContent = player2Balance;
            lastResultEl.className = "baccarat-stat-val red"; // banker is red
        }
        
        if (btnDeal && bState === B_STATE_BETTING) {
            btnDeal.disabled = false;
            btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
        if (btnClear && bState === B_STATE_BETTING) {
            btnClear.disabled = false;
        }
    } 
    else if (bMode === 'online') {
        if (balanceEl) balanceEl.textContent = player1Balance;
        if (lastResultEl) {
            lastResultEl.textContent = player2Balance;
            lastResultEl.className = "baccarat-stat-val red";
        }
        
        if (bState === B_STATE_BETTING) {
            if (isMyTurnToBet()) {
                if (btnClear) btnClear.disabled = false;
                if (btnDeal) {
                    const totalBet = Object.values(activeBets).reduce((a, b) => a + b, 0);
                    btnDeal.disabled = (totalBet <= 0); // enabled if bet placed
                    btnDeal.innerHTML = '<i data-lucide="check-square"></i> Kunci Taruhan';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            } else {
                if (btnClear) btnClear.disabled = true;
                if (btnDeal) {
                    btnDeal.disabled = true; // wait for bet lock
                    btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
        }
    }
    
    const totalBet = Object.values(activeBets).reduce((a, b) => a + b, 0);
    if (totalBetEl) totalBetEl.textContent = totalBet;
    
    // Spot Labels
    for (let spot in activeBets) {
        const spotValEl = document.getElementById(`spot-bet-${spot}`);
        if (spotValEl) {
            spotValEl.textContent = activeBets[spot] > 0 ? `${activeBets[spot]} Koin` : "";
        }
        
        // Spot selection borders
        const spotCard = document.querySelector(`.baccarat-bet-spot[data-spot="${spot}"]`);
        if (spotCard) {
            if (activeBets[spot] > 0) {
                spotCard.classList.add('selected');
            } else {
                spotCard.classList.remove('selected');
            }
        }
    }
}

function resetBaccaratMatch() {
    playerBalance = 1000;
    player1Balance = 1000;
    player2Balance = 1000;
    activeBettor = 1;
    activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
    playerCards = [];
    bankerCards = [];
    dealQueue = [];
    activeCardInDeal = null;
    roundWinner = "";
    lastRoundResultText = "";
    winLossNetMessage = "";
    lastOutcomeText = "BELUM ADA";
    bState = B_STATE_BETTING;
    
    initCardShoe();
    updateBaccaratUI();
    updateModeDashboardLabels();
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    if (btnDeal) {
        btnDeal.disabled = (bMode === 'online'); // online starts disabled for dealer
        btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    const btnClear = document.getElementById('btn-baccarat-clear');
    if (btnClear) {
        btnClear.disabled = false;
        btnClear.innerHTML = '<i data-lucide="trash-2"></i> Bersihkan';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

/* ==========================================================================
   SHOE & CARD DECK GENERATOR
   ========================================================================== */
function initCardShoe() {
    shoe = [];
    const numDecks = 8;
    
    for (let d = 0; d < numDecks; d++) {
        for (let suit of SUITS) {
            for (let label of CARD_LABELS) {
                shoe.push({ label, suit, value: getCardNumericValue(label) });
            }
        }
    }
    
    // Shuffle the shoe using Fisher-Yates shuffle
    for (let i = shoe.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shoe[i];
        shoe[i] = shoe[j];
        shoe[j] = temp;
    }
}

function getCardNumericValue(label) {
    if (label === 'A') return 1;
    if (['10', 'J', 'Q', 'K'].includes(label)) return 0;
    return parseInt(label);
}

function getHandScore(hand) {
    let sum = 0;
    hand.forEach(card => {
        sum += card.value;
    });
    return sum % 10;
}

/* ==========================================================================
   GAMEPLAY ROUND CONTROLLERS
   ========================================================================== */
function startDealingPhase() {
    bState = B_STATE_DEALING;
    playerCards = [];
    bankerCards = [];
    dealQueue = [];
    activeCardInDeal = null;
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    const btnClear = document.getElementById('btn-baccarat-clear');
    if (btnDeal) btnDeal.disabled = true;
    if (btnClear) btnClear.disabled = true;
    
    // Reshuffle shoe if running thin
    if (shoe.length < 16) {
        initCardShoe();
    }
    
    // Queue initial 4 cards (P1, B1, P2, B2)
    queueCardToDeal('player', 0, 310, 150);
    queueCardToDeal('banker', 0, 480, 150);
    queueCardToDeal('player', 1, 375, 150);
    queueCardToDeal('banker', 1, 545, 150);
    
    processNextDealQueue();
}

function startOnlineDealing() {
    bState = B_STATE_DEALING;
    playerCards = [];
    bankerCards = [];
    dealQueue = [];
    activeCardInDeal = null;
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    if (btnDeal) btnDeal.disabled = true;
    
    if (shoe.length < 16) {
        initCardShoe();
    }
    
    // Queue initial 4 cards (P1, B1, P2, B2)
    queueCardToDeal('player', 0, 310, 150);
    queueCardToDeal('banker', 0, 480, 150);
    queueCardToDeal('player', 1, 375, 150);
    queueCardToDeal('banker', 1, 545, 150);
    
    // Evaluate third card rules locally to populate the dealQueue completely!
    evaluateThirdCardRulesLocally();
    
    // Send the complete deal queue to the client
    const cardsData = dealQueue.map(c => ({
        label: c.label,
        suit: c.suit,
        value: c.value,
        side: c.side,
        index: c.index,
        targetX: c.targetX,
        targetY: c.targetY
    }));
    
    conn.send({ type: 'DEAL_CARDS', cards: cardsData });
    
    // Start animating deal locally
    processNextDealQueue();
}

function evaluateThirdCardRulesLocally() {
    // Simulate local scores to determine drawing rules
    let initialP = [dealQueue[0], dealQueue[2]];
    let initialB = [dealQueue[1], dealQueue[3]];
    
    let pScore = getHandScore(initialP);
    let bScore = getHandScore(initialB);
    
    if (pScore >= 8 || bScore >= 8) {
        return;
    }
    
    let playerDrew3rd = false;
    let player3rdCardVal = -1;
    
    if (pScore <= 5) {
        queueCardToDeal('player', 2, 440, 240);
        playerDrew3rd = true;
        player3rdCardVal = dealQueue[dealQueue.length - 1].value;
    }
    
    if (playerDrew3rd) {
        let bankerDraws = false;
        if (bScore <= 2) {
            bankerDraws = true;
        } else if (bScore === 3 && player3rdCardVal !== 8) {
            bankerDraws = true;
        } else if (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        } else if (bScore === 5 && [4, 5, 6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        } else if (bScore === 6 && [6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        }
        
        if (bankerDraws) {
            queueCardToDeal('banker', 2, 610, 240);
        }
    } else {
        if (bScore <= 5) {
            queueCardToDeal('banker', 2, 610, 240);
        }
    }
}

function queueCardToDeal(side, index, targetX, targetY) {
    const rawCard = shoe.pop();
    const cardEntity = {
        label: rawCard.label,
        suit: rawCard.suit,
        value: rawCard.value,
        side: side,
        index: index,
        x: 820, // starts at Shoe position (top right)
        y: 40,
        targetX: targetX,
        targetY: targetY,
        isFaceUp: false,
        scaleX: 1,
        angle: 0,
        speed: 0.12 // interpolation speed
    };
    dealQueue.push(cardEntity);
}

function processNextDealQueue() {
    if (dealQueue.length > 0) {
        activeCardInDeal = dealQueue.shift();
        BaccaratAudio.playCardSlide();
    } else {
        activeCardInDeal = null;
        if (bMode !== 'online') {
            evaluateThirdCardRules();
        } else {
            triggerRevealPhase();
        }
    }
}

function evaluateThirdCardRules() {
    let pScore = getHandScore(playerCards);
    let bScore = getHandScore(bankerCards);
    
    // 1. Natural Check (8 or 9)
    if (pScore >= 8 || bScore >= 8) {
        triggerRevealPhase();
        return;
    }
    
    // 2. Player Draw?
    let playerDrew3rd = false;
    let player3rdCardVal = -1;
    
    if (pScore <= 5) {
        queueCardToDeal('player', 2, 440, 240);
        playerDrew3rd = true;
    }
    
    // 3. Banker Draw?
    if (playerDrew3rd) {
        const simulated3rdPlayerCard = dealQueue[0]; // Player's 3rd card is at the head of queue
        player3rdCardVal = simulated3rdPlayerCard.value;
        
        let bankerDraws = false;
        if (bScore <= 2) {
            bankerDraws = true;
        } else if (bScore === 3 && player3rdCardVal !== 8) {
            bankerDraws = true;
        } else if (bScore === 4 && [2, 3, 4, 5, 6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        } else if (bScore === 5 && [4, 5, 6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        } else if (bScore === 6 && [6, 7].includes(player3rdCardVal)) {
            bankerDraws = true;
        }
        
        if (bankerDraws) {
            queueCardToDeal('banker', 2, 610, 240);
        }
    } else {
        if (bScore <= 5) {
            queueCardToDeal('banker', 2, 610, 240);
        }
    }
    
    if (dealQueue.length > 0) {
        processNextDealQueue();
    } else {
        triggerRevealPhase();
    }
}

function triggerRevealPhase() {
    bState = B_STATE_REVEAL;
    revealTimer = 90; // 1.5 seconds reveal timer
}

function calculateRoundResults() {
    const finalPlayerScore = getHandScore(playerCards);
    const finalBankerScore = getHandScore(bankerCards);
    
    if (finalPlayerScore > finalBankerScore) {
        roundWinner = SPOT_PLAYER;
        lastOutcomeText = "PLAYER";
        lastRoundResultText = `PLAYER MENANG (${finalPlayerScore} vs ${finalBankerScore})`;
        roadmapHistory.push('P');
    } else if (finalBankerScore > finalPlayerScore) {
        roundWinner = SPOT_BANKER;
        lastOutcomeText = "BANKER";
        lastRoundResultText = `BANKER MENANG (${finalBankerScore} vs ${finalPlayerScore})`;
        roadmapHistory.push('B');
    } else {
        roundWinner = SPOT_TIE;
        lastOutcomeText = "TIE";
        lastRoundResultText = `TIE / SERI (${finalPlayerScore} Masing-masing)`;
        roadmapHistory.push('T');
    }
    
    // Prune roadmap history if it exceeds the bead grid
    if (roadmapHistory.length > MAX_ROADMAP_CELLS) {
        roadmapHistory.shift(); // keep it shifting left
    }
    
    // Calculations for payouts
    let totalWin = 0;
    let playerBetAmount = activeBets[SPOT_PLAYER];
    let bankerBetAmount = activeBets[SPOT_BANKER];
    let tieBetAmount = activeBets[SPOT_TIE];
    
    if (roundWinner === SPOT_PLAYER) {
        if (playerBetAmount > 0) {
            totalWin += playerBetAmount * 2;
        }
        BaccaratAudio.playWin();
    } else if (roundWinner === SPOT_BANKER) {
        if (bankerBetAmount > 0) {
            totalWin += bankerBetAmount * 1.95;
        }
        BaccaratAudio.playWin();
    } else if (roundWinner === SPOT_TIE) {
        if (tieBetAmount > 0) {
            totalWin += tieBetAmount * 9;
        }
        totalWin += playerBetAmount;
        totalWin += bankerBetAmount;
        BaccaratAudio.playTie();
    }
    
    const netGains = totalWin - (playerBetAmount + bankerBetAmount + tieBetAmount);
    
    if (bMode === 'solo') {
        playerBalance += totalWin;
    } else {
        if (activeBettor === 1) player1Balance += totalWin;
        else player2Balance += totalWin;
    }
    
    if (netGains > 0) {
        winLossNetMessage = `Hasil: Anda menang +${netGains} Koin!`;
        if (bMode === 'online' && !isMyTurnToBet()) {
            winLossNetMessage = `Hasil: Lawan menang +${netGains} Koin!`;
        }
    } else if (netGains < 0) {
        winLossNetMessage = `Hasil: Anda kalah ${Math.abs(netGains)} Koin!`;
        if (bMode === 'online' && !isMyTurnToBet()) {
            winLossNetMessage = `Hasil: Lawan kalah ${Math.abs(netGains)} Koin!`;
        }
    } else {
        winLossNetMessage = `Hasil: Balik Modal (Push / Seri)!`;
        if (netGains === 0 && (playerBetAmount > 0 || bankerBetAmount > 0 || tieBetAmount > 0) && roundWinner !== SPOT_TIE) {
            winLossNetMessage = `Hasil: Kalah Taruhan!`;
            if (bMode === 'online' && !isMyTurnToBet()) {
                winLossNetMessage = `Hasil: Lawan kalah taruhan!`;
            }
            BaccaratAudio.playLose();
        }
    }
    
    // Clear bets for local & solo. Online cleared in prepareNextRound
    if (bMode !== 'online') {
        activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
    }
    updateBaccaratUI();
    
    // Check bankruptcy
    if (bMode === 'solo') {
        if (playerBalance <= 0) {
            bState = B_STATE_OVER;
        } else {
            bState = B_STATE_PAYOUT;
            payoutTimer = 180;
        }
    } else {
        if (player1Balance <= 0) {
            bState = B_STATE_OVER;
            winnerAnnouncement = "PLAYER 1 BANGKRUT! PLAYER 2 MENANG MATCH!";
        } else if (player2Balance <= 0) {
            bState = B_STATE_OVER;
            winnerAnnouncement = "PLAYER 2 BANGKRUT! PLAYER 1 MENANG MATCH!";
        } else {
            bState = B_STATE_PAYOUT;
            payoutTimer = 180;
        }
    }
}

function prepareNextRound() {
    bState = B_STATE_BETTING;
    activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
    
    playerCards = [];
    bankerCards = [];
    dealQueue = [];
    activeCardInDeal = null;
    
    if (bMode === 'local') {
        activeBettor = activeBettor === 1 ? 2 : 1;
    } 
    else if (bMode === 'online' && isConnected) {
        const nextBettor = activeBettor === 1 ? 2 : 1;
        if (isHost) {
            activeBettor = nextBettor;
            conn.send({ type: 'ROUND_RESET', nextBettor: nextBettor });
        }
    }
    
    updateBaccaratUI();
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    const btnClear = document.getElementById('btn-baccarat-clear');
    if (btnDeal) btnDeal.disabled = (bMode === 'online' && !isMyTurnToBet());
    if (btnClear) btnClear.disabled = (bMode === 'online' && !isMyTurnToBet());
}

function prepareNextRoundSync() {
    bState = B_STATE_BETTING;
    activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
    
    playerCards = [];
    bankerCards = [];
    dealQueue = [];
    activeCardInDeal = null;
    
    updateBaccaratUI();
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    const btnClear = document.getElementById('btn-baccarat-clear');
    if (btnDeal) btnDeal.disabled = (bMode === 'online' && !isMyTurnToBet());
    if (btnClear) btnClear.disabled = (bMode === 'online' && !isMyTurnToBet());
}

/* ==========================================================================
   CANVAS LOOP & RENDERING ENGINE
   ========================================================================== */
function bLoop() {
    if (!isBaccaratModalOpen()) return;
    
    updateBaccaratPhysics();
    renderBaccaratTable();
    
    bAnimId = requestAnimationFrame(bLoop);
}

function isBaccaratModalOpen() {
    const modal = document.getElementById('baccarat-modal');
    return modal && modal.classList.contains('show');
}

function updateBaccaratPhysics() {
    // 1. Handle Deal card animations
    if (bState === B_STATE_DEALING || activeCardInDeal !== null) {
        if (activeCardInDeal) {
            activeCardInDeal.x += (activeCardInDeal.targetX - activeCardInDeal.x) * activeCardInDeal.speed;
            activeCardInDeal.y += (activeCardInDeal.targetY - activeCardInDeal.y) * activeCardInDeal.speed;
            
            const dist = Math.sqrt(Math.pow(activeCardInDeal.targetX - activeCardInDeal.x, 2) + Math.pow(activeCardInDeal.targetY - activeCardInDeal.y, 2));
            if (dist < 2) {
                activeCardInDeal.x = activeCardInDeal.targetX;
                activeCardInDeal.y = activeCardInDeal.targetY;
                
                activeCardInDeal.isFaceUp = true;
                BaccaratAudio.playCardFlip();
                
                if (activeCardInDeal.side === 'player') {
                    playerCards.push(activeCardInDeal);
                } else {
                    bankerCards.push(activeCardInDeal);
                }
                
                processNextDealQueue();
            }
        }
    }
    
    // 2. Reveal state timer
    if (bState === B_STATE_REVEAL) {
        revealTimer--;
        if (revealTimer <= 0) {
            calculateRoundResults();
        }
    }
    
    // 3. Payout display timer
    if (bState === B_STATE_PAYOUT) {
        payoutTimer--;
        if (payoutTimer <= 0) {
            prepareNextRound();
        }
    }
}

function renderBaccaratTable() {
    bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
    
    // 1. Table velvet split design
    bCtx.fillStyle = '#060f21';
    bCtx.fillRect(0, 0, bCanvas.width / 2, bCanvas.height);
    
    bCtx.fillStyle = '#210609';
    bCtx.fillRect(bCanvas.width / 2, 0, bCanvas.width / 2, bCanvas.height);
    
    bCtx.fillStyle = 'rgba(251, 191, 36, 0.4)';
    bCtx.fillRect(bCanvas.width / 2 - 2, 10, 4, bCanvas.height - 20);
    
    bCtx.strokeStyle = '#fbbf24';
    bCtx.lineWidth = 4;
    bCtx.strokeRect(10, 10, bCanvas.width - 20, bCanvas.height - 20);
    bCtx.lineWidth = 1;
    bCtx.strokeRect(15, 15, bCanvas.width - 30, bCanvas.height - 30);
    
    // 2. Draw Hand zones (Labels on table felt)
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    
    // Player Felt Zone
    bCtx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    bCtx.fillRect(100, 80, 280, 140);
    bCtx.strokeStyle = 'rgba(59, 130, 246, 0.2)';
    bCtx.lineWidth = 2;
    bCtx.strokeRect(100, 80, 280, 140);
    
    bCtx.fillStyle = 'rgba(59, 130, 246, 0.4)';
    bCtx.font = '900 32px Outfit, sans-serif';
    bCtx.fillText("PLAYER", 240, 110);
    
    // Banker Felt Zone
    bCtx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    bCtx.fillRect(500, 80, 280, 140);
    bCtx.strokeStyle = 'rgba(239, 68, 68, 0.2)';
    bCtx.lineWidth = 2;
    bCtx.strokeRect(500, 80, 280, 140);
    
    bCtx.fillStyle = 'rgba(239, 68, 68, 0.4)';
    bCtx.font = '900 32px Outfit, sans-serif';
    bCtx.fillText("BANKER", 640, 110);
    
    // 3. Draw Shoe container (Top right)
    drawCardShoeUI();
    
    // 4. Draw Dealt Cards
    playerCards.forEach(card => drawCard(card));
    bankerCards.forEach(card => drawCard(card));
    
    if (activeCardInDeal) {
        drawCard(activeCardInDeal);
    }
    
    // 5. Draw Hand scores (Point circles on table)
    if (playerCards.length >= 2) {
        const pScore = getHandScore(playerCards);
        drawScoreBadge(pScore, 240, 200, '#3b82f6');
    }
    if (bankerCards.length >= 2) {
        const bScore = getHandScore(bankerCards);
        drawScoreBadge(bScore, 640, 200, '#ef4444');
    }
    
    // 6. Draw Bead Plate Roadmap (Left side grid)
    drawBeadPlateRoadmap();
    
    // 7. Draw Turn Indicators (Local or Online 1v1)
    drawTurnIndicators();
    
    // 8. Draw State over / payout banners
    drawBaccaratBanners();
}

function drawCardShoeUI() {
    bCtx.save();
    bCtx.fillStyle = 'rgba(0,0,0,0.5)';
    bCtx.fillRect(812, 28, 44, 64);
    
    bCtx.fillStyle = '#1e293b';
    bCtx.fillRect(810, 25, 40, 60);
    bCtx.strokeStyle = '#fbbf24';
    bCtx.lineWidth = 2;
    bCtx.strokeRect(810, 25, 40, 60);
    
    bCtx.fillStyle = '#ef4444';
    bCtx.fillRect(815, 30, 30, 50);
    bCtx.fillStyle = '#fff';
    bCtx.font = '900 10px monospace';
    bCtx.fillText("SHOE", 830, 55);
    bCtx.restore();
}

function drawCard(card) {
    bCtx.save();
    bCtx.translate(card.x, card.y);
    
    const cardWidth = 54;
    const cardHeight = 82;
    
    bCtx.fillStyle = 'rgba(0,0,0,0.3)';
    bCtx.fillRect(-cardWidth/2 + 2, -cardHeight/2 + 2, cardWidth, cardHeight);
    
    if (card.isFaceUp) {
        bCtx.fillStyle = '#ffffff';
        bCtx.fillRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        bCtx.strokeStyle = '#000000';
        bCtx.lineWidth = 1.5;
        bCtx.strokeRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        const isRed = ['hearts', 'diamonds'].includes(card.suit);
        bCtx.fillStyle = isRed ? '#ef4444' : '#0f172a';
        bCtx.font = 'bold 16px Courier New, monospace';
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'top';
        
        bCtx.fillText(card.label, -cardWidth/2 + 4, -cardHeight/2 + 4);
        
        bCtx.font = '22px Courier New, monospace';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        let suitChar = "♣";
        if (card.suit === 'hearts') suitChar = "♥";
        else if (card.suit === 'diamonds') suitChar = "♦";
        else if (card.suit === 'spades') suitChar = "♠";
        
        bCtx.fillText(suitChar, 0, 5);
        
        bCtx.save();
        bCtx.rotate(Math.PI);
        bCtx.font = 'bold 16px Courier New, monospace';
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'top';
        bCtx.fillText(card.label, -cardWidth/2 + 4, -cardHeight/2 + 4);
        bCtx.restore();
    } else {
        bCtx.fillStyle = '#7f1d1d';
        bCtx.fillRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        bCtx.strokeStyle = '#fbbf24';
        bCtx.lineWidth = 2.5;
        bCtx.strokeRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        bCtx.strokeStyle = 'rgba(251, 191, 36, 0.3)';
        bCtx.lineWidth = 1.5;
        bCtx.beginPath();
        bCtx.moveTo(-cardWidth/2, -cardHeight/2);
        bCtx.lineTo(cardWidth/2, cardHeight/2);
        bCtx.moveTo(cardWidth/2, -cardHeight/2);
        bCtx.lineTo(-cardWidth/2, cardHeight/2);
        bCtx.stroke();
    }
    bCtx.restore();
}

function drawScoreBadge(score, x, y, color) {
    bCtx.save();
    bCtx.fillStyle = color;
    bCtx.shadowBlur = 10;
    bCtx.shadowColor = color;
    bCtx.beginPath();
    bCtx.arc(x, y, 20, 0, Math.PI * 2);
    bCtx.fill();
    
    bCtx.fillStyle = '#ffffff';
    bCtx.shadowBlur = 0;
    bCtx.font = 'bold 16px monospace';
    bCtx.textAlign = 'center';
    bCtx.textBaseline = 'middle';
    bCtx.fillText(score, x, y);
    bCtx.restore();
}

function drawBeadPlateRoadmap() {
    const startX = 30;
    const startY = 230;
    const cellWidth = 18;
    const cellHeight = 18;
    const rows = 6;
    const cols = 12;
    
    bCtx.save();
    bCtx.shadowBlur = 0;
    
    bCtx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    bCtx.fillRect(startX, startY, cols * cellWidth, rows * cellHeight);
    
    bCtx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    bCtx.lineWidth = 1;
    for (let r = 0; r <= rows; r++) {
        bCtx.beginPath();
        bCtx.moveTo(startX, startY + r * cellHeight);
        bCtx.lineTo(startX + cols * cellWidth, startY + r * cellHeight);
        bCtx.stroke();
    }
    for (let c = 0; c <= cols; c++) {
        bCtx.beginPath();
        bCtx.moveTo(startX + c * cellWidth, startY);
        bCtx.lineTo(startX + c * cellWidth, startY + rows * cellHeight);
        bCtx.stroke();
    }
    
    roadmapHistory.forEach((outcome, idx) => {
        const col = Math.floor(idx / rows);
        const row = idx % rows;
        
        const cx = startX + col * cellWidth + cellWidth / 2;
        const cy = startY + row * cellHeight + cellHeight / 2;
        
        bCtx.beginPath();
        bCtx.arc(cx, cy, 7, 0, Math.PI * 2);
        
        let circleColor = '#fbbf24';
        let labelChar = 'T';
        if (outcome === 'P') {
            circleColor = '#3b82f6';
            labelChar = 'P';
        } else if (outcome === 'B') {
            circleColor = '#ef4444';
            labelChar = 'B';
        } else {
            circleColor = '#10b981';
            labelChar = 'T';
        }
        
        bCtx.fillStyle = circleColor;
        bCtx.fill();
        
        bCtx.fillStyle = '#ffffff';
        bCtx.font = 'bold 9px Arial, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText(labelChar, cx, cy);
    });
    
    bCtx.fillStyle = '#fbbf24';
    bCtx.font = 'bold 9px monospace';
    bCtx.textAlign = 'left';
    bCtx.fillText("BEAD ROAD HISTORY", startX, startY - 6);
    
    bCtx.restore();
}

function drawTurnIndicators() {
    if (bState !== B_STATE_BETTING) return;
    
    if (bMode === 'local') {
        bCtx.save();
        bCtx.fillStyle = 'rgba(0,0,0,0.65)';
        bCtx.fillRect(160, 20, 560, 42);
        bCtx.strokeStyle = '#fbbf24';
        bCtx.lineWidth = 1.5;
        bCtx.strokeRect(160, 20, 560, 42);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = '900 12px monospace';
        bCtx.textAlign = 'center';
        bCtx.fillText(`PLAYER ${activeBettor} PASANG TARUHAN! PLAYER ${activeBettor === 1 ? 2 : 1} KLIK BAGI KARTU.`, 440, 41);
        bCtx.restore();
    } 
    else if (bMode === 'online' && isConnected) {
        const myTurn = isMyTurnToBet();
        const text = myTurn ? "GILIRAN ANDA PASANG TARUHAN! LAWAN AKAN MEMBAGI KARTU." : "MENUNGGU LAWAN PASANG TARUHAN... ANDA ADALAH DEALER.";
        const accent = myTurn ? '#3b82f6' : '#ef4444';
        
        bCtx.save();
        bCtx.fillStyle = 'rgba(0,0,0,0.65)';
        bCtx.fillRect(160, 20, 560, 42);
        bCtx.strokeStyle = accent;
        bCtx.lineWidth = 1.5;
        bCtx.strokeRect(160, 20, 560, 42);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = '900 12px monospace';
        bCtx.textAlign = 'center';
        bCtx.fillText(text, 440, 41);
        bCtx.restore();
    }
}

function drawBaccaratBanners() {
    if (bState === B_STATE_DEALING) {
        bCtx.fillStyle = 'rgba(0,0,0,0.6)';
        bCtx.fillRect(250, 20, 380, 40);
        bCtx.strokeStyle = '#fbbf24';
        bCtx.strokeRect(250, 20, 380, 40);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = 'bold 14px Courier New, monospace';
        bCtx.textAlign = 'center';
        bCtx.fillText("KARTU SEDANG DIBAGIKAN...", 440, 40);
    } 
    else if (bState === B_STATE_REVEAL) {
        bCtx.fillStyle = 'rgba(0,0,0,0.8)';
        bCtx.fillRect(250, 20, 380, 40);
        bCtx.strokeStyle = '#fbbf24';
        bCtx.strokeRect(250, 20, 380, 40);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = '900 16px Outfit, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.fillText("MENGEVALUASI PEMENANG...", 440, 40);
    } 
    else if (bState === B_STATE_PAYOUT) {
        let accentColor = '#fbbf24';
        if (roundWinner === SPOT_PLAYER) accentColor = '#3b82f6';
        else if (roundWinner === SPOT_BANKER) accentColor = '#ef4444';
        else accentColor = '#10b981';
        
        bCtx.save();
        bCtx.shadowBlur = 10;
        bCtx.shadowColor = accentColor;
        bCtx.fillStyle = 'rgba(9, 13, 22, 0.95)';
        bCtx.fillRect(250, 210, 380, 110);
        bCtx.strokeStyle = accentColor;
        bCtx.lineWidth = 2;
        bCtx.strokeRect(250, 210, 380, 110);
        
        bCtx.fillStyle = accentColor;
        bCtx.font = '900 20px Outfit, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.fillText(lastRoundResultText, 440, 245);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = 'bold 14px monospace';
        bCtx.fillText(winLossNetMessage, 440, 285);
        bCtx.restore();
    } 
    else if (bState === B_STATE_OVER) {
        bCtx.save();
        bCtx.shadowBlur = 20;
        bCtx.shadowColor = '#ef4444';
        bCtx.fillStyle = 'rgba(0,0,0,0.95)';
        bCtx.fillRect(80, 100, 720, 180);
        bCtx.strokeStyle = '#ef4444';
        bCtx.lineWidth = 2;
        bCtx.strokeRect(80, 100, 720, 180);
        
        bCtx.fillStyle = '#ef4444';
        bCtx.font = '900 32px Outfit, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.fillText("MATCH SELESAI!", 440, 155);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = 'bold 18px Outfit, sans-serif';
        bCtx.fillText(winnerAnnouncement.toUpperCase(), 440, 205);
        
        bCtx.fillStyle = '#71717a';
        bCtx.font = '12px monospace';
        bCtx.fillText("SILAKAN KLIK TOMBOL 'MAIN LAGI' DI BAWAH UNTUK MERESET SALDO", 440, 250);
        
        bCtx.restore();
        
        const btnReset = document.getElementById('btn-baccarat-deal');
        if (btnReset) btnReset.textContent = "Main Lagi";
    }
}
