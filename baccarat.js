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

// Virtual Balance & Betting
let playerBalance = 1000;
let activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
let selectedChipValue = 50;

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
        // Change text of Shake button to Deal / Bagi Kartu
        btnDeal.innerHTML = '<i data-lucide="shuffle"></i> Bagi Kartu';
        if (typeof lucide !== 'undefined') lucide.createIcons();

        btnDeal.addEventListener('click', () => {
            if (bState === B_STATE_OVER) {
                // Main Lagi logic
                BaccaratAudio.playClick();
                resetBaccaratMatch();
                return;
            }
            if (bState !== B_STATE_BETTING) return;
            
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

function placeBaccaratBet(spotId) {
    let betAmount = 0;
    
    if (selectedChipValue === 'all') {
        betAmount = playerBalance;
    } else {
        betAmount = selectedChipValue;
    }
    
    if (betAmount > playerBalance) {
        betAmount = playerBalance;
    }
    
    if (betAmount <= 0) return;
    
    playerBalance -= betAmount;
    activeBets[spotId] += betAmount;
    
    BaccaratAudio.playChipSound();
    updateBaccaratUI();
}

function clearBaccaratBets() {
    for (let spot in activeBets) {
        playerBalance += activeBets[spot];
        activeBets[spot] = 0;
    }
    updateBaccaratUI();
}

function updateBaccaratUI() {
    const balanceEl = document.getElementById('baccarat-player-coin');
    const totalBetEl = document.getElementById('baccarat-current-bet');
    const lastResultEl = document.getElementById('baccarat-last-outcome'); // Reused for last outcome
    
    if (balanceEl) balanceEl.textContent = playerBalance;
    
    const totalBet = Object.values(activeBets).reduce((a, b) => a + b, 0);
    if (totalBetEl) totalBetEl.textContent = totalBet;
    
    if (lastResultEl) {
        lastResultEl.textContent = lastOutcomeText;
        lastResultEl.className = "baccarat-stat-val"; // Reset
        if (lastOutcomeText.includes("PLAYER")) lastResultEl.classList.add("blue");
        else if (lastOutcomeText.includes("BANKER")) lastResultEl.classList.add("red");
        else if (lastOutcomeText.includes("TIE")) lastResultEl.classList.add("green");
        else lastResultEl.classList.add("gold");
    }
    
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
    
    const btnDeal = document.getElementById('btn-baccarat-deal');
    if (btnDeal) {
        btnDeal.disabled = false;
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
        // Proceed to evaluation / third card logic
        evaluateThirdCardRules();
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
        // Player draws 3rd card
        queueCardToDeal('player', 2, 440, 240); // Drawn sideways or below
        playerDrew3rd = true;
    }
    
    // 3. Banker Draw?
    if (playerDrew3rd) {
        // If Player drew a third card, check Banker drawing table
        // We look at player's third card value to determine Banker draw
        // Let's resolve the actual card that will be dealt to the player
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
        // If Player stood (6 or 7), Banker draws if score is 0-5
        if (bScore <= 5) {
            queueCardToDeal('banker', 2, 610, 240);
        }
    }
    
    if (dealQueue.length > 0) {
        // Continue deal animations for third cards
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
            totalWin += playerBetAmount * 2; // Return original + 1:1 win
        }
        // Banker and Tie bets are lost
        BaccaratAudio.playWin();
    } else if (roundWinner === SPOT_BANKER) {
        if (bankerBetAmount > 0) {
            // Standard Banker pays 0.95:1 (house 5% commission)
            totalWin += bankerBetAmount * 1.95;
        }
        // Player and Tie bets are lost
        BaccaratAudio.playWin();
    } else if (roundWinner === SPOT_TIE) {
        if (tieBetAmount > 0) {
            totalWin += tieBetAmount * 9; // Return original + 8:1 win
        }
        // TIE RULE: Player and Banker bets are PUSHED (returned to player balance!)
        totalWin += playerBetAmount;
        totalWin += bankerBetAmount;
        
        BaccaratAudio.playTie();
    }
    
    const netGains = totalWin - (playerBetAmount + bankerBetAmount + tieBetAmount);
    playerBalance += totalWin;
    
    if (netGains > 0) {
        winLossNetMessage = `Hasil: Anda menang +${netGains} Koin!`;
    } else if (netGains < 0) {
        winLossNetMessage = `Hasil: Anda kalah ${Math.abs(netGains)} Koin!`;
    } else {
        winLossNetMessage = `Hasil: Balik Modal (Push / Seri)!`;
        if (netGains === 0 && (playerBetAmount > 0 || bankerBetAmount > 0 || tieBetAmount > 0) && roundWinner !== SPOT_TIE) {
            winLossNetMessage = `Hasil: Kalah Taruhan!`;
            BaccaratAudio.playLose();
        }
    }
    
    // Clear bets
    activeBets = { [SPOT_PLAYER]: 0, [SPOT_TIE]: 0, [SPOT_BANKER]: 0 };
    updateBaccaratUI();
    
    // Check bankruptcy
    if (playerBalance <= 0) {
        bState = B_STATE_OVER;
    } else {
        bState = B_STATE_PAYOUT;
        payoutTimer = 180; // 3 seconds display
    }
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
            // Interpolate position
            activeCardInDeal.x += (activeCardInDeal.targetX - activeCardInDeal.x) * activeCardInDeal.speed;
            activeCardInDeal.y += (activeCardInDeal.targetY - activeCardInDeal.y) * activeCardInDeal.speed;
            
            // Check if card has arrived close enough
            const dist = Math.sqrt(Math.pow(activeCardInDeal.targetX - activeCardInDeal.x, 2) + Math.pow(activeCardInDeal.targetY - activeCardInDeal.y, 2));
            if (dist < 2) {
                activeCardInDeal.x = activeCardInDeal.targetX;
                activeCardInDeal.y = activeCardInDeal.targetY;
                
                // Flip card animation starts
                activeCardInDeal.isFaceUp = true;
                BaccaratAudio.playCardFlip();
                
                // Add card to player/banker hand arrays
                if (activeCardInDeal.side === 'player') {
                    playerCards.push(activeCardInDeal);
                } else {
                    bankerCards.push(activeCardInDeal);
                }
                
                // Process next in queue
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
            bState = B_STATE_BETTING;
            const btnDeal = document.getElementById('btn-baccarat-deal');
            const btnClear = document.getElementById('btn-baccarat-clear');
            if (btnDeal) btnDeal.disabled = false;
            if (btnClear) btnClear.disabled = false;
        }
    }
}

function renderBaccaratTable() {
    bCtx.clearRect(0, 0, bCanvas.width, bCanvas.height);
    
    // 1. Table velvet split design
    // Left half (Blue / Player side)
    bCtx.fillStyle = '#060f21';
    bCtx.fillRect(0, 0, bCanvas.width / 2, bCanvas.height);
    
    // Right half (Red / Banker side)
    bCtx.fillStyle = '#210609';
    bCtx.fillRect(bCanvas.width / 2, 0, bCanvas.width / 2, bCanvas.height);
    
    // Center divider
    bCtx.fillStyle = 'rgba(251, 191, 36, 0.4)';
    bCtx.fillRect(bCanvas.width / 2 - 2, 10, 4, bCanvas.height - 20);
    
    // Gold borders around velvet table
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
    
    // Draw the active sliding card
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
    
    // 7. Draw State over / payout banners
    drawBaccaratBanners();
}

function drawCardShoeUI() {
    bCtx.save();
    // Shadow
    bCtx.fillStyle = 'rgba(0,0,0,0.5)';
    bCtx.fillRect(812, 28, 44, 64);
    
    // Shoe body
    bCtx.fillStyle = '#1e293b';
    bCtx.fillRect(810, 25, 40, 60);
    bCtx.strokeStyle = '#fbbf24';
    bCtx.lineWidth = 2;
    bCtx.strokeRect(810, 25, 40, 60);
    
    // Cards inside shoe pattern
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
    
    // Card Shadow
    bCtx.fillStyle = 'rgba(0,0,0,0.3)';
    bCtx.fillRect(-cardWidth/2 + 2, -cardHeight/2 + 2, cardWidth, cardHeight);
    
    if (card.isFaceUp) {
        // Face up: Card front
        bCtx.fillStyle = '#ffffff';
        bCtx.fillRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        bCtx.strokeStyle = '#000000';
        bCtx.lineWidth = 1.5;
        bCtx.strokeRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        // Colors: red for hearts/diamonds, black for clubs/spades
        const isRed = ['hearts', 'diamonds'].includes(card.suit);
        bCtx.fillStyle = isRed ? '#ef4444' : '#0f172a';
        bCtx.font = 'bold 16px Courier New, monospace';
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'top';
        
        // Label (Top-Left)
        bCtx.fillText(card.label, -cardWidth/2 + 4, -cardHeight/2 + 4);
        
        // Suit Icon (Center of card)
        bCtx.font = '22px Courier New, monospace';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        let suitChar = "♣";
        if (card.suit === 'hearts') suitChar = "♥";
        else if (card.suit === 'diamonds') suitChar = "♦";
        else if (card.suit === 'spades') suitChar = "♠";
        
        bCtx.fillText(suitChar, 0, 5);
        
        // Label (Bottom-Right, inverted)
        bCtx.save();
        bCtx.rotate(Math.PI);
        bCtx.font = 'bold 16px Courier New, monospace';
        bCtx.textAlign = 'left';
        bCtx.textBaseline = 'top';
        bCtx.fillText(card.label, -cardWidth/2 + 4, -cardHeight/2 + 4);
        bCtx.restore();
    } else {
        // Face down: Card back
        bCtx.fillStyle = '#7f1d1d'; // luxury deep red pattern
        bCtx.fillRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        bCtx.strokeStyle = '#fbbf24'; // gold border
        bCtx.lineWidth = 2.5;
        bCtx.strokeRect(-cardWidth/2, -cardHeight/2, cardWidth, cardHeight);
        
        // Cross pattern inside back
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
    
    // Label score text
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
    
    // Draw grid background
    bCtx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    bCtx.fillRect(startX, startY, cols * cellWidth, rows * cellHeight);
    
    // Draw grid lines
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
    
    // Draw cells outcomes
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
        
        // Draw outcome character inside circle
        bCtx.fillStyle = '#ffffff';
        bCtx.font = 'bold 9px Arial, sans-serif';
        bCtx.textAlign = 'center';
        bCtx.textBaseline = 'middle';
        bCtx.fillText(labelChar, cx, cy);
    });
    
    // Roadmap title tag
    bCtx.fillStyle = '#fbbf24';
    bCtx.font = 'bold 9px monospace';
    bCtx.textAlign = 'left';
    bCtx.fillText("BEAD ROAD HISTORY", startX, startY - 6);
    
    bCtx.restore();
}

function drawBaccaratBanners() {
    // 1. Shaking notice
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
    // 2. Reveal result display
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
    // 3. Payout summary card
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
    // 4. Bankrupt Game Over Overlay
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
        bCtx.fillText("ANDA BANGKRUT!", 440, 155);
        
        bCtx.fillStyle = '#fff';
        bCtx.font = 'bold 20px Outfit, sans-serif';
        bCtx.fillText("SALDO VIRTUAL ANDA TELAH HABIS", 440, 205);
        
        // Show restart instructions
        bCtx.fillStyle = '#71717a';
        bCtx.font = '12px monospace';
        bCtx.fillText("SILAKAN KLIK TOMBOL 'MAIN LAGI' DI BAWAH UNTUK MERESET SALDO", 440, 250);
        
        bCtx.restore();
        
        // Force reset match on click "Main Lagi" (Reset button in UI handles it)
        const btnReset = document.getElementById('btn-baccarat-deal');
        if (btnReset) btnReset.textContent = "Main Lagi";
    }
}
