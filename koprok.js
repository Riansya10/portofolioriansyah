/* ==========================================================================
   KOPROK COIN BOWL CORE ENGINE (koprok.js)
   ========================================================================== */

// Game States
const K_STATE_BETTING = 'betting';
const K_STATE_SHAKING = 'shaking';
const K_STATE_REVEAL = 'reveal';
const K_STATE_PAYOUT = 'payout';
const K_STATE_OVER = 'over';

// Bet Spot Constants
const SPOT_3G = '3g'; // 3 Gambar (Heads)
const SPOT_2G1A = '2g1a'; // 2 Gambar 1 Angka
const SPOT_1G2A = '1g2a'; // 1 Gambar 2 Angka
const SPOT_3A = '3a'; // 3 Angka (Tails)

// Global Game Variables
let kCanvas, kCtx;
let kState = K_STATE_BETTING;
let kAnimId = null;

// Virtual Balances
let playerCoin = 1000;
let aiCoin = 1000;

// Betting board states
let selectedChip = 50; // default selected chip amount
let playerBets = { [SPOT_3G]: 0, [SPOT_2G1A]: 0, [SPOT_1G2A]: 0, [SPOT_3A]: 0 };
let aiBets = { spot: null, amount: 0 };
let activeOutcome = null; // outcome of the round: 3g, 2g1a, 1g2a, or 3a
let payoutMessage = "";
let winnerText = "";
let winnerAnnouncement = "";

// Animations entities
let bowlY = 160; // Initial bowl position
let bowlState = 'open'; // open, closing, closed, shaking, opening
let bowlShakeOffset = { x: 0, y: 0 };
let shakeTimer = 0;
let revealTimer = 0;
let payoutTimer = 0;

// Coins representation
let coins = [
    { x: 340, y: 200, state: 'heads', scaleX: 1, targetState: 'heads', angle: 0 },
    { x: 440, y: 220, state: 'heads', scaleX: 1, targetState: 'heads', angle: 0 },
    { x: 540, y: 200, state: 'heads', scaleX: 1, targetState: 'heads', angle: 0 }
];

/* ==========================================================================
   WEB AUDIO API RETRO CASINO SYNTHESIZER
   ========================================================================== */
const KoprokAudio = {
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
    
    // Shaking rattling noise synthesizer
    playRattle(duration) {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        
        try {
            const bufferSize = this.ctx.sampleRate * duration;
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            // Generate periodic rattling burst noise
            for (let i = 0; i < bufferSize; i++) {
                const burstPattern = Math.sin(i * 0.02) * Math.sin(i * 0.001);
                data[i] = (Math.random() * 2 - 1) * (burstPattern > 0.3 ? 0.8 : 0.05);
            }
            
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(1200, this.ctx.currentTime);
            
            const gainNode = this.ctx.createGain();
            gainNode.gain.setValueAtTime(0.18, this.ctx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + duration);
            
            noise.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(this.ctx.destination);
            
            noise.start();
            noise.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Rattle error: ", e);
        }
    },
    
    // Coin clinking sound
    playCoinClink(pitchOffset = 0) {
        // Double tone beep resembling metal coins hit
        this.playTone(1800 + pitchOffset, 'sine', 0.12, null, 0.15);
        setTimeout(() => {
            this.playTone(2400 + pitchOffset, 'sine', 0.08, null, 0.1);
        }, 30);
    },
    
    playClick() {
        this.playTone(800, 'sine', 0.06, 400, 0.12);
    },
    
    playWin() {
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'sine', 0.25, null, 0.18);
            }, idx * 120);
        });
    },
    
    playLose() {
        const notes = [392, 349.23, 311.13, 261.63]; // G4, F4, Eb4, C4
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playTone(freq, 'triangle', 0.3, freq * 0.8, 0.18);
            }, idx * 150);
        });
    }
};

/* ==========================================================================
   DOM INITIALIZATION & ACTIONS
   ========================================================================== */
function initKoprok() {
    // Open Koprok Modal
    document.body.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.btn-play-koprok');
        if (playBtn) {
            e.preventDefault();
            openKoprokModal();
        }
    });

    // Close Modal
    const closeBtn = document.getElementById('koprok-modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeKoprokModal);
    
    const modal = document.getElementById('koprok-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeKoprokModal();
        });
    }

    // Fullscreen Toggle
    const fsBtn = document.getElementById('koprok-fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', toggleKoprokFullscreen);
    }
    document.addEventListener('fullscreenchange', handleKoprokFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleKoprokFullscreenChange);

    // Setup Game controls
    setupKoprokControls();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initKoprok);
} else {
    initKoprok();
}

function openKoprokModal() {
    KoprokAudio.init();
    KoprokAudio.playClick();
    const modal = document.getElementById('koprok-modal');
    if (modal) {
        modal.classList.add('show');
        initKoprokCanvas();
        resetMatch();
        startKoprokLoop();
    }
}

function closeKoprokModal() {
    KoprokAudio.playClick();
    const modal = document.getElementById('koprok-modal');
    if (modal) {
        modal.classList.remove('show');
        stopKoprokLoop();
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }
}

function initKoprokCanvas() {
    kCanvas = document.getElementById('koprok-canvas');
    if (kCanvas) {
        kCtx = kCanvas.getContext('2d');
        kCanvas.width = 880;
        kCanvas.height = 360;
    }
}

function startKoprokLoop() {
    stopKoprokLoop();
    kLoop();
}

function stopKoprokLoop() {
    if (kAnimId) {
        cancelAnimationFrame(kAnimId);
        kAnimId = null;
    }
}

function toggleKoprokFullscreen() {
    const modalContent = document.querySelector('.koprok-modal-content');
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

function handleKoprokFullscreenChange() {
    const fsBtn = document.getElementById('koprok-fullscreen-btn');
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
   GAME MECHANICS & CONTROLLER
   ========================================================================== */
function setupKoprokControls() {
    // Bind Chip click handlers
    const chips = document.querySelectorAll('.koprok-chip');
    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            KoprokAudio.playClick();
            chips.forEach(c => c.classList.remove('selected'));
            chip.classList.add('selected');
            
            const val = chip.getAttribute('data-value');
            selectedChip = (val === 'all') ? 'all' : parseInt(val);
        });
    });

    // Bind Betting spots click handlers
    const spots = document.querySelectorAll('.koprok-bet-spot');
    spots.forEach(spot => {
        spot.addEventListener('click', () => {
            if (kState !== K_STATE_BETTING) return;
            
            const spotId = spot.getAttribute('data-spot');
            placeBetOnSpot(spotId);
        });
    });

    // Bind Action Buttons
    const btnShake = document.getElementById('btn-koprok-shake');
    const btnReset = document.getElementById('btn-koprok-reset');
    
    if (btnShake) {
        btnShake.addEventListener('click', () => {
            if (kState !== K_STATE_BETTING) return;
            
            // Check if player has placed any bets
            let totalPlaced = Object.values(playerBets).reduce((a, b) => a + b, 0);
            if (totalPlaced <= 0) {
                alert("Pasang taruhan koin Anda terlebih dahulu!");
                return;
            }
            
            KoprokAudio.playClick();
            triggerShakePhase();
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (kState === K_STATE_OVER) {
                KoprokAudio.playClick();
                resetMatch();
                return;
            }
            if (kState !== K_STATE_BETTING) return;
            
            KoprokAudio.playClick();
            clearPlayerBets();
        });
    }
}

// Player adds bet to a spot
function placeBetOnSpot(spotId) {
    let betAmount = 0;
    
    if (selectedChip === 'all') {
        betAmount = playerCoin;
    } else {
        betAmount = selectedChip;
    }
    
    // Clamp to available balance
    if (betAmount > playerCoin) {
        betAmount = playerCoin;
    }
    
    if (betAmount <= 0) return;
    
    playerCoin -= betAmount;
    playerBets[spotId] += betAmount;
    
    KoprokAudio.playTone(300 + (playerBets[spotId] * 0.5), 'sine', 0.1, null, 0.15);
    updateDashboardUI();
}

// Clear all current staged bets
function clearPlayerBets() {
    for (let spotId in playerBets) {
        playerCoin += playerBets[spotId];
        playerBets[spotId] = 0;
    }
    updateDashboardUI();
}

function updateDashboardUI() {
    const playerCoinEl = document.getElementById('koprok-player-coin');
    const aiCoinEl = document.getElementById('koprok-ai-coin');
    const currentBetEl = document.getElementById('koprok-current-bet');
    
    if (playerCoinEl) playerCoinEl.textContent = playerCoin;
    if (aiCoinEl) aiCoinEl.textContent = aiCoin;
    
    const totalBet = Object.values(playerBets).reduce((a, b) => a + b, 0);
    if (currentBetEl) currentBetEl.textContent = totalBet;
    
    // Update labels inside the betting spots
    for (let spotId in playerBets) {
        const spotValEl = document.getElementById(`spot-bet-${spotId}`);
        if (spotValEl) {
            spotValEl.textContent = playerBets[spotId] > 0 ? `${playerBets[spotId]} Koin` : "";
        }
        // Toggle selected class on container
        const spotCard = document.querySelector(`.koprok-bet-spot[data-spot="${spotId}"]`);
        if (spotCard) {
            if (playerBets[spotId] > 0) {
                spotCard.classList.add('selected');
            } else {
                spotCard.classList.remove('selected');
            }
        }
    }
}

function resetMatch() {
    playerCoin = 1000;
    aiCoin = 1000;
    kState = K_STATE_BETTING;
    bowlState = 'open';
    bowlY = 50;
    winnerText = "";
    payoutMessage = "";
    winnerAnnouncement = "";
    
    // Reset player bets
    for (let spot in playerBets) playerBets[spot] = 0;
    
    // Reset coins orientation
    coins.forEach(c => {
        c.state = 'heads';
        c.targetState = 'heads';
        c.scaleX = 1;
    });
    
    updateDashboardUI();
    
    const btnShake = document.getElementById('btn-koprok-shake');
    if (btnShake) btnShake.disabled = false;
    
    const btnReset = document.getElementById('btn-koprok-reset');
    if (btnReset) {
        btnReset.innerHTML = '<i data-lucide="trash-2"></i> Bersihkan';
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

/* ==========================================================================
   GAMEPLAY PHASE CONTROLLERS
   ========================================================================== */
function triggerShakePhase() {
    kState = K_STATE_SHAKING;
    bowlState = 'closing';
    shakeTimer = 90; // Shaking lasts 1.5 seconds (90 frames)
    
    // Trigger AI Decision profile
    decideAIBet();
    
    const btnShake = document.getElementById('btn-koprok-shake');
    if (btnShake) btnShake.disabled = true;
}

// AI placing bets profile
function decideAIBet() {
    if (aiCoin <= 0) {
        aiBets = { spot: null, amount: 0 };
        return;
    }
    
    // AI bets a random portion of its balance (10% to 30%)
    const pct = 0.1 + (Math.random() * 0.2);
    let amount = Math.floor(aiCoin * pct);
    
    // Round to nearest 10
    amount = Math.ceil(amount / 10) * 10;
    if (amount > aiCoin) amount = aiCoin;
    if (amount <= 0) amount = 10; // minimum bet
    
    // Pick random spot
    const spots = [SPOT_3G, SPOT_2G1A, SPOT_1G2A, SPOT_3A];
    const pickedSpot = spots[Math.floor(Math.random() * spots.length)];
    
    aiCoin -= amount;
    aiBets = { spot: pickedSpot, amount: amount };
}

// Logic to determine flips
function executeFlippedCoins() {
    // Generate random binary (0 = Tails/Angka, 1 = Heads/Gambar) for 3 coins
    let flipResult = [];
    for (let i = 0; i < 3; i++) {
        const flip = Math.random() < 0.5 ? 'heads' : 'tails';
        flipResult.push(flip);
        coins[i].targetState = flip;
    }
    
    // Check outcome category
    const headsCount = flipResult.filter(f => f === 'heads').length;
    if (headsCount === 3) {
        activeOutcome = SPOT_3G;
        payoutMessage = "3 GAMBAR (HEADS)!";
    } else if (headsCount === 2) {
        activeOutcome = SPOT_2G1A;
        payoutMessage = "2 GAMBAR & 1 ANGKA!";
    } else if (headsCount === 1) {
        activeOutcome = SPOT_1G2A;
        payoutMessage = "1 GAMBAR & 2 ANGKA!";
    } else {
        activeOutcome = SPOT_3A;
        payoutMessage = "3 ANGKA (TAILS)!";
    }
}

// Apply payout calculations
function processPayout() {
    let p1Win = 0;
    let aiWin = 0;
    
    // Odds/Payout ratios
    const odds = {
        [SPOT_3G]: 4,    // 1:4 payout
        [SPOT_2G1A]: 2,  // 1:2 payout
        [SPOT_1G2A]: 2,  // 1:2 payout
        [SPOT_3A]: 4     // 1:4 payout
    };
    
    // Player wins calculation
    const playerBetAmount = playerBets[activeOutcome] || 0;
    if (playerBetAmount > 0) {
        p1Win = playerBetAmount * odds[activeOutcome];
        playerCoin += p1Win;
    }
    
    // AI wins calculation
    if (aiBets.spot === activeOutcome) {
        aiWin = aiBets.amount * odds[activeOutcome];
        aiCoin += aiWin;
    }
    
    // Payout text display
    let summaryText = "";
    if (p1Win > 0 && aiWin > 0) {
        summaryText = `Anda menang +${p1Win} koin. AI menang +${aiWin} koin.`;
        KoprokAudio.playWin();
    } else if (p1Win > 0) {
        summaryText = `Anda menang +${p1Win} koin! AI Kalah.`;
        KoprokAudio.playWin();
    } else if (aiWin > 0) {
        summaryText = `Anda Kalah! AI menang +${aiWin} koin.`;
        KoprokAudio.playLose();
    } else {
        summaryText = "Kedua pemain kalah taruhan raund ini!";
        KoprokAudio.playLose();
    }
    
    winnerText = summaryText;
    
    // Clear staged bets
    for (let spot in playerBets) playerBets[spot] = 0;
    
    updateDashboardUI();
    
    // Check overall bankrupt conditions
    if (playerCoin <= 0) {
        kState = K_STATE_OVER;
        winnerAnnouncement = "ANDA BANGKRUT! KOMPUTER AI MENANG MATCH!";
    } else if (aiCoin <= 0) {
        kState = K_STATE_OVER;
        winnerAnnouncement = "AI BANGKRUT! ANDA MENANG MATCH!";
    } else {
        // Continue to next round
        payoutTimer = 180; // 3 seconds in frames
    }
}

/* ==========================================================================
   CANVAS LOOP & RENDERING ENGINE
   ========================================================================== */
function kLoop() {
    if (!isKoprokModalOpen()) return;
    
    updateKoprokPhysics();
    renderKoprok();
    
    kAnimId = requestAnimationFrame(kLoop);
}

function isKoprokModalOpen() {
    const modal = document.getElementById('koprok-modal');
    return modal && modal.classList.contains('show');
}

function updateKoprokPhysics() {
    if (kState === K_STATE_SHAKING) {
        // 1. Closing Bowl over coins
        if (bowlState === 'closing') {
            bowlY += 6; // Move down
            if (bowlY >= 160) {
                bowlY = 160;
                bowlState = 'closed';
                KoprokAudio.playRattle(1.5); // Start rattle sound
            }
        } 
        // 2. Shaking closed bowl
        else if (bowlState === 'closed') {
            shakeTimer--;
            
            // Random offset shaking
            bowlShakeOffset.x = (Math.random() - 0.5) * 12;
            bowlShakeOffset.y = (Math.random() - 0.5) * 12;
            
            if (shakeTimer <= 0) {
                bowlShakeOffset = { x: 0, y: 0 };
                kState = K_STATE_REVEAL;
                bowlState = 'opening';
                revealTimer = 100; // 1.6s
                executeFlippedCoins(); // Determine outcomes
            }
        }
    } 
    else if (kState === K_STATE_REVEAL) {
        // 1. Lift bowl
        if (bowlState === 'opening') {
            bowlY -= 6;
            if (bowlY <= 40) {
                bowlY = 40;
                bowlState = 'open';
            }
        }
        
        // 2. Spin coins on reveal
        revealTimer--;
        
        coins.forEach((coin, idx) => {
            // Spin coin by shrinking scaleX
            if (revealTimer > 20) {
                coin.angle += 0.25;
                coin.scaleX = Math.cos(coin.angle);
                
                // Clinking noises during spin
                if (revealTimer % 18 === 0) {
                    KoprokAudio.playCoinClink(idx * 200);
                }
            } else {
                // Settle on final target orientation
                coin.scaleX += (1 - coin.scaleX) * 0.2;
                coin.state = coin.targetState;
            }
        });
        
        if (revealTimer <= 0) {
            kState = K_STATE_PAYOUT;
            processPayout();
        }
    } 
    else if (kState === K_STATE_PAYOUT) {
        payoutTimer--;
        if (payoutTimer <= 0) {
            kState = K_STATE_BETTING;
            
            const btnShake = document.getElementById('btn-koprok-shake');
            if (btnShake) btnShake.disabled = false;
        }
    }
}

function renderKoprok() {
    kCtx.clearRect(0, 0, kCanvas.width, kCanvas.height);
    
    // 1. Background green velvet fabric layout
    kCtx.fillStyle = '#064e3b'; // Dark green casino velvet
    kCtx.fillRect(0, 0, kCanvas.width, kCanvas.height);
    
    // Decorative gold borders
    kCtx.strokeStyle = '#eab308';
    kCtx.lineWidth = 4;
    kCtx.strokeRect(10, 10, kCanvas.width - 20, kCanvas.height - 20);
    kCtx.lineWidth = 1;
    kCtx.strokeRect(16, 16, kCanvas.width - 32, kCanvas.height - 32);
    
    // 2. Betting Circle area on table (rattle plate)
    kCtx.fillStyle = '#0f172a'; // dark plate circle background
    kCtx.beginPath();
    kCtx.arc(440, 200, 190, 0, Math.PI * 2);
    kCtx.fill();
    kCtx.lineWidth = 3;
    kCtx.strokeStyle = '#fbbf24';
    kCtx.stroke();
    
    // Three inner coin slots
    kCtx.strokeStyle = 'rgba(251, 191, 36, 0.2)';
    kCtx.lineWidth = 1.5;
    coins.forEach(coin => {
        kCtx.beginPath();
        kCtx.arc(coin.x, coin.y + 10, 36, 0, Math.PI * 2);
        kCtx.stroke();
    });
    
    // 3. Draw Coins
    if (bowlState !== 'closed') {
        coins.forEach(coin => drawKoprokCoin(coin));
    }
    
    // 4. Draw Bowl
    drawKoprokBowl();
    
    // 5. Draw Info Texts (Outcome result / Game over banners)
    drawKoprokBanners();
}

// Drawing Coin with reflection
function drawKoprokCoin(coin) {
    kCtx.save();
    kCtx.translate(coin.x, coin.y);
    kCtx.scale(coin.scaleX, 1); // shrink horizontally for spinning effect
    
    const isHeads = (coin.state === 'heads');
    
    // Shadow of coin
    kCtx.fillStyle = 'rgba(0,0,0,0.4)';
    kCtx.beginPath();
    kCtx.arc(2, 5, 30, 0, Math.PI * 2);
    kCtx.fill();
    
    if (isHeads) {
        // HEADS (GOLD EMBLEM)
        kCtx.fillStyle = '#fbbf24'; // main gold color
        kCtx.beginPath();
        kCtx.arc(0, 0, 30, 0, Math.PI * 2);
        kCtx.fill();
        kCtx.lineWidth = 2.5;
        kCtx.strokeStyle = '#d97706'; // dark gold rim
        kCtx.stroke();
        
        // Inner crown/head detailing
        kCtx.fillStyle = '#d97706';
        kCtx.beginPath();
        kCtx.moveTo(-10, 10);
        kCtx.lineTo(-12, -2);
        kCtx.lineTo(-5, 4);
        kCtx.lineTo(0, -10); // crown tip
        kCtx.lineTo(5, 4);
        kCtx.lineTo(12, -2);
        kCtx.lineTo(10, 10);
        kCtx.closePath();
        kCtx.fill();
        
        // Stars/Embellish dots
        kCtx.fillStyle = '#fff';
        kCtx.fillRect(-2, -2, 4, 4);
    } else {
        // TAILS (SILVER NUMERIC VALUE)
        kCtx.fillStyle = '#cbd5e1'; // main silver color
        kCtx.beginPath();
        kCtx.arc(0, 0, 30, 0, Math.PI * 2);
        kCtx.fill();
        kCtx.lineWidth = 2.5;
        kCtx.strokeStyle = '#64748b'; // dark silver rim
        kCtx.stroke();
        
        // Inner numeric value "500"
        kCtx.fillStyle = '#475569';
        kCtx.font = '900 16px Courier New, monospace';
        kCtx.textAlign = 'center';
        kCtx.textBaseline = 'middle';
        kCtx.fillText("500", 0, 2);
    }
    
    kCtx.restore();
}

// Drawing covered bowl
function drawKoprokBowl() {
    if (bowlState === 'open') return;
    
    kCtx.save();
    kCtx.translate(440 + bowlShakeOffset.x, bowlY + bowlShakeOffset.y);
    
    // Bowl shadow
    kCtx.fillStyle = 'rgba(0,0,0,0.5)';
    kCtx.beginPath();
    kCtx.ellipse(0, 95, 120, 30, 0, 0, Math.PI * 2);
    kCtx.fill();
    
    // Wooden Bowl Body (Reddish wood)
    const bowlGrad = kCtx.createLinearGradient(-110, -50, 110, 80);
    bowlGrad.addColorStop(0, '#f87171');
    bowlGrad.addColorStop(0.4, '#b91c1c');
    bowlGrad.addColorStop(1, '#7f1d1d');
    kCtx.fillStyle = bowlGrad;
    
    kCtx.beginPath();
    kCtx.arc(0, 30, 110, 0, Math.PI, false); // bottom cup half
    kCtx.lineTo(-110, 30);
    kCtx.closePath();
    kCtx.fill();
    
    // Golden Rim Ring
    kCtx.fillStyle = '#fbbf24';
    kCtx.fillRect(-114, 24, 228, 8);
    kCtx.strokeStyle = '#d97706';
    kCtx.strokeRect(-114, 24, 228, 8);
    
    // Golden Handle Knob at top
    kCtx.fillStyle = '#fbbf24';
    kCtx.beginPath();
    kCtx.arc(0, -60, 18, 0, Math.PI * 2);
    kCtx.fill();
    kCtx.strokeStyle = '#d97706';
    kCtx.stroke();
    
    kCtx.fillStyle = '#d97706';
    kCtx.fillRect(-6, -60, 12, 90); // connection bar
    
    kCtx.restore();
}

function drawKoprokBanners() {
    // 1. Shaking notice
    if (kState === K_STATE_SHAKING) {
        kCtx.fillStyle = 'rgba(0,0,0,0.6)';
        kCtx.fillRect(100, 20, 680, 50);
        kCtx.strokeStyle = '#f59e0b';
        kCtx.strokeRect(100, 20, 680, 50);
        
        kCtx.fillStyle = '#fff';
        kCtx.font = 'bold 16px Courier New, monospace';
        kCtx.textAlign = 'center';
        kCtx.fillText("MANGKOK SEDANG DIKOCOK...", 440, 50);
    } 
    // 2. Reveal result display
    else if (kState === K_STATE_REVEAL) {
        kCtx.fillStyle = 'rgba(0,0,0,0.8)';
        kCtx.fillRect(250, 20, 380, 50);
        kCtx.strokeStyle = '#fbbf24';
        kCtx.strokeRect(250, 20, 380, 50);
        
        kCtx.fillStyle = '#fff';
        kCtx.font = '900 18px Outfit, sans-serif';
        kCtx.textAlign = 'center';
        kCtx.fillText("HASIL: " + payoutMessage, 440, 51);
    } 
    // 3. Payout summary card
    else if (kState === K_STATE_PAYOUT) {
        kCtx.save();
        kCtx.shadowBlur = 10;
        kCtx.shadowColor = '#eab308';
        kCtx.fillStyle = 'rgba(15,23,42,0.9)';
        kCtx.fillRect(150, 140, 580, 120);
        kCtx.strokeStyle = '#fbbf24';
        kCtx.lineWidth = 2;
        kCtx.strokeRect(150, 140, 580, 120);
        
        kCtx.fillStyle = '#eab308';
        kCtx.font = '900 22px Outfit, sans-serif';
        kCtx.textAlign = 'center';
        kCtx.fillText("HASIL KELUAR: " + payoutMessage, 440, 185);
        
        kCtx.fillStyle = '#fff';
        kCtx.font = '14px monospace';
        kCtx.fillText(winnerText, 440, 225);
        kCtx.restore();
    } 
    // 4. Bankrupt Game Over Overlay
    else if (kState === K_STATE_OVER) {
        kCtx.save();
        kCtx.shadowBlur = 20;
        kCtx.shadowColor = '#ef4444';
        kCtx.fillStyle = 'rgba(0,0,0,0.95)';
        kCtx.fillRect(80, 100, 720, 180);
        kCtx.strokeStyle = '#ef4444';
        kCtx.lineWidth = 2;
        kCtx.strokeRect(80, 100, 720, 180);
        
        kCtx.fillStyle = '#ef4444';
        kCtx.font = '900 32px Outfit, sans-serif';
        kCtx.textAlign = 'center';
        kCtx.fillText("MATCH SELESAI!", 440, 155);
        
        kCtx.fillStyle = '#fff';
        kCtx.font = 'bold 20px Outfit, sans-serif';
        kCtx.fillText(winnerAnnouncement, 440, 205);
        
        // Show restart instructions
        kCtx.fillStyle = '#71717a';
        kCtx.font = '12px monospace';
        kCtx.fillText("SILAKAN KLIK TOMBOL 'MAIN LAGI' DI BAWAH UNTUK MERESET", 440, 250);
        
        kCtx.restore();
        
        // Force reset match on click "Main Lagi" (Reset button in UI handles it)
        const btnReset = document.getElementById('btn-koprok-reset');
        if (btnReset) btnReset.textContent = "Main Lagi";
    }
}
