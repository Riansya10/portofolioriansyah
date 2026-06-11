/* ==========================================================================
   CYBER DERBY ROYALE - GAME LOGIC & ENGINE (derby.js)
   ========================================================================== */

(function () {
    // Game variables
    let playerCoins = 1000;
    let selectedChip = 50; // default chip value
    let activeBets = {};   // { horseId: betAmount }
    let totalBet = 0;
    let raceInProgress = false;
    let raceFinished = false;
    let resultsHistory = []; // Array of winning horse IDs

    // Track parameters
    const TRACK_LENGTH = 3200; // Total distance of the race
    let canvas, ctx;
    let animationFrameId;
    let lastTime = 0;
    let cameraX = 0;

    // Sound variables
    let audioCtx = null;
    let crowdNoiseSource = null;
    let crowdGainNode = null;
    let gallopInterval = null;

    // Horses Data Definition
    const HORSES = [
        {
            id: 1,
            number: "01",
            name: "AERO SWIFT",
            color: "#00f0ff",      // Cyan
            odds: 2.2,
            speedStat: 4,
            staminaStat: 4,
            formStat: 4,           // Random variation factor
            description: "Konsisten dan cepat di segala kondisi track.",
            // Runtime simulation variables
            x: 0,
            y: 0,
            currentSpeed: 0,
            boostCooldown: 0,
            boostActive: 0,
            finished: false,
            finishTime: 0,
            legPhase: 0
        },
        {
            id: 2,
            number: "02",
            name: "CRIMSON BOLT",
            color: "#ff0055",      // Neon Pink/Red
            odds: 3.5,
            speedStat: 5,
            staminaStat: 2,
            formStat: 5,
            description: "Sangat cepat di awal, rawan lelah di garis finish.",
            x: 0,
            y: 0,
            currentSpeed: 0,
            boostCooldown: 0,
            boostActive: 0,
            finished: false,
            finishTime: 0,
            legPhase: 0
        },
        {
            id: 3,
            number: "03",
            name: "VOLT DUST",
            color: "#eab308",      // Yellow
            odds: 4.8,
            speedStat: 3,
            staminaStat: 5,
            formStat: 3,
            description: "Lambat di awal, tangguh dan melesat cepat di akhir.",
            x: 0,
            y: 0,
            currentSpeed: 0,
            boostCooldown: 0,
            boostActive: 0,
            finished: false,
            finishTime: 0,
            legPhase: 0
        },
        {
            id: 4,
            number: "04",
            name: "GLITCH RUNNER",
            color: "#a855f7",      // Purple
            odds: 8.0,
            speedStat: 4,
            staminaStat: 3,
            formStat: 5,
            description: "Sulit diprediksi, memiliki boost acak tak terduga.",
            x: 0,
            y: 0,
            currentSpeed: 0,
            boostCooldown: 0,
            boostActive: 0,
            finished: false,
            finishTime: 0,
            legPhase: 0
        },
        {
            id: 5,
            number: "05",
            name: "NEON SPARK",
            color: "#00ff88",      // Green
            odds: 15.0,
            speedStat: 2,
            staminaStat: 4,
            formStat: 4,
            description: "Kuda underdog, berpotensi memberikan jackpot besar.",
            x: 0,
            y: 0,
            currentSpeed: 0,
            boostCooldown: 0,
            boostActive: 0,
            finished: false,
            finishTime: 0,
            legPhase: 0
        }
    ];

    // Particle pool for dust/sparks
    let particles = [];

    // Commentary lists
    const COMMENTARY_START = [
        "Dan mereka mulai berlari! Start yang sangat bersih!",
        "Gerbang dibuka! Balapan Cyber Derby Royale dimulai!",
        "Balapan telah dimulai! Semua kuda melesat keluar dari gerbang start!"
    ];

    const COMMENTARY_MID = [
        "{leader} memimpin di posisi terdepan!",
        "Persaingan sangat ketat! {leader} berusaha mempertahankan keunggulan!",
        "{leader} memacu kecepatan dengan sangat aggresif!",
        "{challenger} menempel ketat di belakang {leader}!",
        "Tikungan pertama terlewati, {leader} memimpin balapan!"
    ];

    const COMMENTARY_BOOST = [
        "{horse} mengaktifkan TURBO CHARGE! Melesat bagai peluru!",
        "{horse} mendapatkan lonjakan daya! Kecepatan meningkat drastis!",
        "{horse} menggunakan nitrous booster! Mengambil alih lintasan!"
    ];

    const COMMENTARY_FATIGUE = [
        "{horse} tampak mulai kehabisan daya di lintasan luar!",
        "Stamina {horse} menurun! Kecepatannya mulai melambat!",
        "{horse} tampak kelelahan memacu tenaganya!"
    ];

    const COMMENTARY_FINISH = [
        "Luar biasa! {winner} menyentuh garis finish pertama kali!",
        "SELESAI! {winner} memenangkan balapan Cyber Derby Royale hari ini!",
        "Dan juara kita adalah... {winner}! Kemenangan yang spektakuler!"
    ];

    let commentaryQueue = [];
    let currentCommentaryText = "Pasang taruhan Anda pada kuda favorit dan klik MULAI BALAPAN!";
    let commentaryTimer = null;

    /* ==========================================================================
       INITIALIZATION
       ========================================================================== */
    document.addEventListener("DOMContentLoaded", () => {
        initDerbyGame();
    });

    function initDerbyGame() {
        // Find DOM Elements
        canvas = document.getElementById("derby-canvas");
        if (!canvas) return;
        ctx = canvas.getContext("2d");

        // Fit canvas resolution
        canvas.width = 900;
        canvas.height = 360;

        // Reset positions
        resetHorses();

        // Bind UI Events
        setupUIEvents();

        // Initial render
        drawRaceTrack();

        // Update stats display
        updateUIDisplay();
    }

    function setupUIEvents() {
        // Trigger Modal Open (bind to buttons)
        document.addEventListener("click", (e) => {
            const playBtn = e.target.closest(".btn-play-derby");
            if (playBtn) {
                e.preventDefault();
                openDerbyModal();
            }
        });

        // Close Modal
        const closeBtn = document.getElementById("derby-modal-close");
        if (closeBtn) {
            closeBtn.addEventListener("click", closeDerbyModal);
        }

        // Fullscreen Toggle
        const fsBtn = document.getElementById("derby-fullscreen-btn");
        const modalContent = document.querySelector(".derby-modal-content");
        if (fsBtn && modalContent) {
            fsBtn.addEventListener("click", () => {
                if (!document.fullscreenElement) {
                    modalContent.requestFullscreen().catch(() => {
                        // fallback to pseudo fullscreen
                        modalContent.classList.toggle("derby-pseudo-fullscreen");
                    });
                } else {
                    document.exitFullscreen();
                }
            });
        }

        // Listen for escape to exit pseudo fullscreen
        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement) {
                modalContent?.classList.remove("derby-pseudo-fullscreen");
            }
        });

        // Click outside modal content to close
        const modal = document.getElementById("derby-modal");
        if (modal) {
            modal.addEventListener("click", (e) => {
                if (e.target === modal && !raceInProgress) {
                    closeDerbyModal();
                }
            });
        }

        // Chip Selector Buttons
        const chips = document.querySelectorAll(".derby-chip");
        chips.forEach(chip => {
            chip.addEventListener("click", () => {
                if (raceInProgress) return;
                chips.forEach(c => c.classList.remove("selected"));
                chip.classList.add("selected");
                
                const val = chip.getAttribute("data-value");
                if (val === "all") {
                    selectedChip = playerCoins;
                } else {
                    selectedChip = parseInt(val);
                }
                playSynthesizedSound("chip");
            });
        });

        // Horse Betting Spots Click Handler
        const spots = document.querySelectorAll(".derby-bet-spot");
        spots.forEach(spot => {
            spot.addEventListener("click", () => {
                if (raceInProgress) return;
                const id = parseInt(spot.getAttribute("data-horse-id"));
                placeBet(id);
            });
        });

        // Clear Bets
        const clearBtn = document.getElementById("btn-derby-clear");
        if (clearBtn) {
            clearBtn.addEventListener("click", () => {
                if (raceInProgress) return;
                clearBets();
                playSynthesizedSound("clear");
            });
        }

        // Start Race
        const startBtn = document.getElementById("btn-derby-race");
        if (startBtn) {
            startBtn.addEventListener("click", () => {
                if (raceInProgress || totalBet === 0) return;
                startRaceSimulation();
            });
        }
    }

    /* ==========================================================================
       MODAL CONTROLS
       ========================================================================== */
    function openDerbyModal() {
        const modal = document.getElementById("derby-modal");
        if (modal) {
            modal.classList.add("show");
            // Re-fit canvas just in case
            setTimeout(() => {
                initAudio();
                initDerbyGame();
            }, 100);
        }
    }

    function closeDerbyModal() {
        const modal = document.getElementById("derby-modal");
        if (modal) {
            modal.classList.remove("show");
            stopRaceAudio();
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        }
    }

    /* ==========================================================================
       SOUND SYNTHESIZER (Web Audio API)
       ========================================================================== */
    function initAudio() {
        if (audioCtx) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error("Web Audio API not supported in this browser", e);
        }
    }

    function playSynthesizedSound(type) {
        if (!audioCtx) return;
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === "chip") {
            // High-pitched mechanical click/clink
            osc.type = "sine";
            osc.frequency.setValueAtTime(1000, now);
            osc.frequency.exponentialRampToValueAtTime(3000, now + 0.08);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
        } 
        else if (type === "clear") {
            // Swoosh down
            osc.type = "triangle";
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
        } 
        else if (type === "bell") {
            // Double starting bell ring
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = "sine";
            osc2.frequency.setValueAtTime(1200, now + 0.15);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            gain2.gain.setValueAtTime(0.15, now + 0.15);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
            osc2.start(now + 0.15);
            osc2.stop(now + 0.55);
        } 
        else if (type === "win") {
            // Arpeggio chime
            const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
            notes.forEach((freq, idx) => {
                const noteOsc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                noteOsc.type = "sine";
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
                noteOsc.connect(noteGain);
                noteGain.connect(audioCtx.destination);
                noteGain.gain.setValueAtTime(0.1, now + idx * 0.1);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.3);
                noteOsc.start(now + idx * 0.1);
                noteOsc.stop(now + idx * 0.1 + 0.3);
            });
        } 
        else if (type === "lose") {
            // Sad slides
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(110, now + 0.4);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        }
    }

    function startRaceAudio() {
        if (!audioCtx) return;
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        // 1. Create simulated crowd white noise
        const bufferSize = audioCtx.sampleRate * 2.0; // 2s loop
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        crowdNoiseSource = audioCtx.createBufferSource();
        crowdNoiseSource.buffer = buffer;
        crowdNoiseSource.loop = true;

        // Create lowpass filter to make it sound like a crowd in a stadium
        const filter = audioCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(450, now);
        filter.Q.setValueAtTime(1.2, now);

        crowdGainNode = audioCtx.createGain();
        crowdGainNode.gain.setValueAtTime(0.03, now); // start quiet

        crowdNoiseSource.connect(filter);
        filter.connect(crowdGainNode);
        crowdGainNode.connect(audioCtx.destination);
        crowdNoiseSource.start(now);

        // 2. Horse Galloping Footsteps loop sound
        let gallopCounter = 0;
        gallopInterval = setInterval(() => {
            if (!raceInProgress) return;
            
            // Get leading horse's speed to adjust footstep rhythm
            let maxSpeed = 0;
            HORSES.forEach(h => {
                if (!h.finished && h.currentSpeed > maxSpeed) {
                    maxSpeed = h.currentSpeed;
                }
            });

            // Trigger footstep thump sound
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "triangle";
            
            // double thump sound (gallop beat: da-dum ... da-dum)
            const pitch = 50 + Math.random() * 10;
            osc.frequency.setValueAtTime(pitch, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(20, audioCtx.currentTime + 0.05);
            
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start();
            osc.stop(audioCtx.currentTime + 0.06);

            // Slightly staggered double tap
            setTimeout(() => {
                if (!raceInProgress) return;
                const osc2 = audioCtx.createOscillator();
                const gain2 = audioCtx.createGain();
                osc2.type = "triangle";
                osc2.frequency.setValueAtTime(pitch - 5, audioCtx.currentTime);
                osc2.frequency.exponentialRampToValueAtTime(15, audioCtx.currentTime + 0.04);
                
                gain2.gain.setValueAtTime(0.08, audioCtx.currentTime);
                gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.04);
                
                osc2.connect(gain2);
                gain2.connect(audioCtx.destination);
                osc2.start();
                osc2.stop(audioCtx.currentTime + 0.05);
            }, 80);

        }, 220); // base galloping rate
    }

    function adjustCrowdVolume(intensity) {
        // intensity is a value from 0 to 1 representing proximity to finish line
        if (crowdGainNode && audioCtx) {
            const vol = 0.03 + intensity * 0.15; // scales up to 0.18 max volume
            crowdGainNode.gain.linearRampToValueAtTime(vol, audioCtx.currentTime + 0.3);
        }
    }

    function stopRaceAudio() {
        if (crowdNoiseSource) {
            try { crowdNoiseSource.stop(); } catch(e) {}
            crowdNoiseSource = null;
        }
        if (gallopInterval) {
            clearInterval(gallopInterval);
            gallopInterval = null;
        }
    }

    /* ==========================================================================
       BETTING LOGIC
       ========================================================================== */
    function placeBet(horseId) {
        if (selectedChip <= 0) return;

        // Check if balance is enough
        if (playerCoins < selectedChip) {
            selectedChip = playerCoins; // set to maximum remaining
            if (playerCoins === 0) return;
        }

        // Record bet
        if (!activeBets[horseId]) {
            activeBets[horseId] = 0;
        }
        activeBets[horseId] += selectedChip;
        playerCoins -= selectedChip;
        totalBet += selectedChip;

        // Play chip sound
        playSynthesizedSound("chip");

        // Update UI
        updateUIDisplay();
    }

    function clearBets() {
        // Return bets to balance
        playerCoins += totalBet;
        activeBets = {};
        totalBet = 0;
        updateUIDisplay();
    }

    function updateUIDisplay() {
        // Balance elements
        const coinsEl = document.getElementById("derby-player-coin");
        const betEl = document.getElementById("derby-current-bet");
        const outcomeEl = document.getElementById("derby-last-outcome");

        if (coinsEl) coinsEl.textContent = playerCoins;
        if (betEl) betEl.textContent = totalBet;

        // Reset bet status indicator on spots
        HORSES.forEach(horse => {
            const spot = document.querySelector(`.derby-bet-spot[data-horse-id="${horse.id}"]`);
            const betText = document.getElementById(`spot-bet-${horse.id}`);
            
            if (spot) {
                if (activeBets[horse.id]) {
                    spot.classList.add("has-bet");
                    if (betText) betText.textContent = `BET: ${activeBets[horse.id]}`;
                } else {
                    spot.classList.remove("has-bet");
                    if (betText) betText.textContent = "";
                }
            }
        });

        // Enable/disable action buttons
        const startBtn = document.getElementById("btn-derby-race");
        const clearBtn = document.getElementById("btn-derby-clear");

        if (startBtn) startBtn.disabled = (totalBet === 0 || raceInProgress);
        if (clearBtn) clearBtn.disabled = (totalBet === 0 || raceInProgress);
    }

    /* ==========================================================================
       SIMULATION ENGINE (PHYSICS & AI)
       ========================================================================== */
    function resetHorses() {
        particles = [];
        HORSES.forEach((horse, index) => {
            horse.x = 20; // starting line offset
            // distribute Y coordinates evenly inside track lanes (track height: 260px, lane height: ~45px)
            horse.y = 80 + index * 52; 
            horse.currentSpeed = 0;
            horse.boostCooldown = 40 + Math.random() * 80;
            horse.boostActive = 0;
            horse.finished = false;
            horse.finishTime = 0;
            horse.legPhase = Math.random() * Math.PI * 2;
        });
        cameraX = 0;
        raceFinished = false;
    }

    function startRaceSimulation() {
        raceInProgress = true;
        raceFinished = false;
        resetHorses();
        updateUIDisplay();

        // Clear commentary
        commentaryQueue = [];
        addCommentary(COMMENTARY_START[Math.floor(Math.random() * COMMENTARY_START.length)]);

        // Sound FX
        playSynthesizedSound("bell");
        startRaceAudio();

        // Start animation loop
        lastTime = performance.now();
        animationFrameId = requestAnimationFrame(raceLoop);
    }

    function raceLoop(time) {
        if (!raceInProgress) return;

        const dt = (time - lastTime) / 1000;
        lastTime = time;

        // Clear canvas
        ctx.fillStyle = "#06090e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Update physics
        updateRacePhysics(dt);

        // Draw track and horses
        drawRaceTrack();
        drawHorses();
        drawParticles();

        // Check if all horses finished
        const allFinished = HORSES.every(h => h.finished);
        if (allFinished && !raceFinished) {
            handleRaceFinished();
        } else {
            animationFrameId = requestAnimationFrame(raceLoop);
        }
    }

    function updateRacePhysics(dt) {
        let maxLeaderX = 0;
        let leader = null;

        HORSES.forEach(horse => {
            if (horse.finished) {
                // simple speed decelerate after finish
                horse.currentSpeed = Math.max(0, horse.currentSpeed - 80 * dt);
                horse.x += horse.currentSpeed * dt;
                horse.legPhase += (horse.currentSpeed / 20) * dt;
                return;
            }

            // --- AI Acceleration Logic ---
            let baseSpeed = 100 + (horse.speedStat * 15); // pixels per second (around 140-215 px/s)
            
            // Random performance factor (simulate racetrack fluctuations/waves)
            let form = Math.sin(performance.now() / 800 + horse.id) * 20;
            let noise = (Math.random() * 2 - 1) * 12;

            // Fatigue effect near the end of the race
            let fatigue = 0;
            if (horse.x > 2000) {
                // Lower stamina horses slow down more
                fatigue = (6 - horse.staminaStat) * (horse.x - 2000) * 0.05;
                if (Math.random() < 0.005 && horse.staminaStat <= 3) {
                    addCommentary(COMMENTARY_FATIGUE[Math.floor(Math.random() * COMMENTARY_FATIGUE.length)].replace("{horse}", horse.name));
                }
            }

            // Turbo boost handling
            if (horse.boostActive > 0) {
                baseSpeed += 130; // speed injection
                horse.boostActive -= dt;
                
                // Add exhaust particles
                if (Math.random() < 0.4) {
                    createParticles(horse.x - 10, horse.y, horse.color, 4);
                }
            } else {
                // Decrease cooldown if not active
                horse.boostCooldown -= dt;
                if (horse.boostCooldown <= 0) {
                    // Trigger random turbo charge based on form stat
                    if (Math.random() < 0.35 + (horse.formStat * 0.05)) {
                        horse.boostActive = 1.0 + Math.random() * 1.5; // active for 1-2.5s
                        horse.boostCooldown = 150 + Math.random() * 150; // high cooldown
                        
                        // Add to live commentary
                        addCommentary(COMMENTARY_BOOST[Math.floor(Math.random() * COMMENTARY_BOOST.length)].replace("{horse}", horse.name));
                        
                        // Spark particles burst
                        createParticles(horse.x, horse.y, "#ffffff", 12);
                    } else {
                        // reset cooldown slightly
                        horse.boostCooldown = 30 + Math.random() * 40;
                    }
                }
            }

            // Calculate final speed
            let targetSpeed = Math.max(50, baseSpeed + form + noise - fatigue);
            // Interpolate speed smoothly
            horse.currentSpeed += (targetSpeed - horse.currentSpeed) * 3 * dt;
            
            // Advance distance
            horse.x += horse.currentSpeed * dt;

            // Leg animation cycle matches movement speed
            horse.legPhase += (horse.currentSpeed / 12) * dt;

            // Gallop ground spark particles
            if (Math.sin(horse.legPhase) > 0.8 && Math.random() < 0.25) {
                createParticles(horse.x - 25, horse.y + 15, horse.color, 2);
            }

            // Finish line check
            if (horse.x >= TRACK_LENGTH) {
                horse.finished = true;
                horse.finishTime = performance.now();
                
                // Track leader finish order for commentary
                const finishedCount = HORSES.filter(h => h.finished).length;
                if (finishedCount === 1) {
                    addCommentary(COMMENTARY_FINISH[Math.floor(Math.random() * COMMENTARY_FINISH.length)].replace("{winner}", horse.name));
                }
            }

            // Find leader
            if (horse.x > maxLeaderX) {
                maxLeaderX = horse.x;
                leader = horse;
            }
        });

        // Trigger dynamic commentary updates during mid-race
        if (Math.random() < 0.008 && leader && !leader.finished) {
            const nextHorse = [...HORSES].filter(h => h !== leader).sort((a,b) => b.x - a.x)[0];
            const msg = COMMENTARY_MID[Math.floor(Math.random() * COMMENTARY_MID.length)]
                .replace("{leader}", leader.name)
                .replace("{challenger}", nextHorse.name);
            addCommentary(msg);
        }

        // Dynamic Camera Panning
        // Camera centers the leader but stops scrolling when finish line is in view
        const targetCameraX = Math.max(0, Math.min(maxLeaderX - 350, TRACK_LENGTH - canvas.width + 100));
        cameraX += (targetCameraX - cameraX) * 4 * dt;

        // Dynamic audio volume adjustment as horses near the finish line
        const completionPct = Math.max(0, Math.min(1, maxLeaderX / TRACK_LENGTH));
        adjustCrowdVolume(completionPct);
    }

    /* ==========================================================================
       CANVAS RENDERING OPERATIONS
       ========================================================================== */
    function drawRaceTrack() {
        // Draw cyber track background grid lines (horizontal scroll)
        const gridOffset = -cameraX % 40;
        ctx.strokeStyle = "rgba(0, 240, 255, 0.03)";
        ctx.lineWidth = 1;
        for (let x = gridOffset; x < canvas.width; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Draw track lanes bounds
        ctx.fillStyle = "rgba(7, 11, 18, 0.6)";
        ctx.fillRect(0, 50, canvas.width, 270);

        ctx.strokeStyle = "rgba(0, 255, 136, 0.15)";
        ctx.lineWidth = 2;
        for (let i = 0; i <= 5; i++) {
            const y = 60 + i * 52;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
            
            // lane indicators
            if (i < 5) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.02)";
                ctx.fillText(`LANE ${i+1}`, 15, y + 30);
            }
        }

        // Draw Start Line (if in camera view)
        const startX = 60 - cameraX;
        if (startX > -20 && startX < canvas.width + 20) {
            ctx.strokeStyle = "#ff00aa";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(startX, 60);
            ctx.lineTo(startX, 320);
            ctx.stroke();
            
            // start gate text
            ctx.fillStyle = "#ff00aa";
            ctx.font = "bold 10px monospace";
            ctx.fillText("START GATE", startX - 30, 50);
        }

        // Draw Finish Line (if in camera view)
        const finishX = TRACK_LENGTH - cameraX;
        if (finishX > -50 && finishX < canvas.width + 50) {
            // Checkered finish line pattern
            ctx.strokeStyle = "#00ff88";
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(finishX, 60);
            ctx.lineTo(finishX, 320);
            ctx.stroke();

            // Glow effect
            ctx.strokeStyle = "rgba(0, 255, 136, 0.4)";
            ctx.lineWidth = 16;
            ctx.beginPath();
            ctx.moveTo(finishX, 60);
            ctx.lineTo(finishX, 320);
            ctx.stroke();

            ctx.fillStyle = "#00ff88";
            ctx.font = "bold 12px 'Outfit', sans-serif";
            ctx.fillText("FINISH LINE", finishX - 35, 50);
        }

        // Racetrack Distance markers along the top edge
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.font = "9px monospace";
        for (let dist = 400; dist < TRACK_LENGTH; dist += 400) {
            const markerX = dist - cameraX;
            if (markerX > 0 && markerX < canvas.width) {
                ctx.beginPath();
                ctx.arc(markerX, 58, 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillText(`${dist}m`, markerX - 10, 48);
            }
        }
    }

    function drawHorses() {
        ctx.save();
        
        HORSES.forEach(horse => {
            const screenX = horse.x - cameraX;
            const screenY = horse.y;

            // Skip rendering if way off-screen
            if (screenX < -100 || screenX > canvas.width + 100) return;

            // Draw shadow beneath horse
            ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
            ctx.beginPath();
            ctx.ellipse(screenX - 8, screenY + 16, 25, 6, 0, 0, Math.PI*2);
            ctx.fill();

            // Set glow styling for cyber horses
            ctx.strokeStyle = horse.color;
            ctx.lineWidth = 3;
            ctx.shadowBlur = 8;
            ctx.shadowColor = horse.color;

            // Draw Cybernetic Horse Shape
            ctx.beginPath();
            
            // 1. Body main capsule
            // center body at (screenX - 10, screenY)
            ctx.ellipse(screenX - 10, screenY, 18, 9, 0, 0, Math.PI * 2);
            
            // 2. Neck
            ctx.moveTo(screenX + 2, screenY - 5);
            ctx.lineTo(screenX + 12, screenY - 16);
            
            // 3. Head
            ctx.lineTo(screenX + 20, screenY - 14);
            ctx.lineTo(screenX + 16, screenY - 8);
            ctx.lineTo(screenX + 8, screenY - 6);
            
            // 4. Ears
            ctx.moveTo(screenX + 11, screenY - 17);
            ctx.lineTo(screenX + 13, screenY - 22);
            ctx.lineTo(screenX + 15, screenY - 16);

            ctx.stroke();

            // Reset glow specifically for structural details
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2.5;

            // 5. Draw Running Legs (galloping math calculations)
            const legSwing = Math.sin(horse.legPhase);
            const legSwingOpp = -Math.sin(horse.legPhase);

            // Back leg 1 (Left)
            drawLeg(screenX - 22, screenY + 5, legSwing, horse.color);
            // Back leg 2 (Right)
            drawLeg(screenX - 17, screenY + 5, legSwingOpp, horse.color, true);

            // Front leg 1 (Left)
            drawLeg(screenX + 2, screenY + 5, legSwingOpp + 0.3, horse.color);
            // Front leg 2 (Right)
            drawLeg(screenX + 7, screenY + 5, legSwing + 0.3, horse.color, true);

            // 6. Cyber Tail (Wavy sine wave line)
            ctx.strokeStyle = horse.color;
            ctx.beginPath();
            ctx.moveTo(screenX - 28, screenY - 2);
            const tailWhip = Math.cos(horse.legPhase * 2) * 5;
            ctx.quadraticCurveTo(
                screenX - 38, screenY - 5 + tailWhip,
                screenX - 44, screenY + 2 + tailWhip
            );
            ctx.stroke();

            // 7. Horse Number Tag on body
            ctx.fillStyle = "#ffffff";
            ctx.font = "bold 9px monospace";
            ctx.shadowColor = "#000";
            ctx.shadowBlur = 3;
            ctx.fillText(horse.number, screenX - 15, screenY + 3);
            ctx.shadowBlur = 0;

            // 8. If boost is active, draw a cyan fire/exhaust particle shape at the back
            if (horse.boostActive > 0) {
                ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
                ctx.beginPath();
                ctx.moveTo(screenX - 32, screenY);
                ctx.lineTo(screenX - 48 - (Math.random() * 15), screenY - 3 + (Math.random()*6));
                ctx.lineTo(screenX - 32, screenY - 6);
                ctx.closePath();
                ctx.fill();
            }
        });
        
        ctx.restore();
    }

    function drawLeg(startX, startY, swing, color, isSecondary) {
        ctx.save();
        ctx.strokeStyle = color;
        // make secondary legs slightly dimmer to give depth perception
        if (isSecondary) {
            ctx.strokeStyle = color + "99"; 
        }
        ctx.lineWidth = 3;

        // Joint math (thigh and shin joint)
        const thighLength = 12;
        const shinLength = 10;
        
        // joint position
        const jointX = startX + Math.sin(swing) * 8;
        const jointY = startY + Math.cos(swing) * 8 + 4;
        
        // hoof position
        const hoofX = jointX + Math.sin(swing - 0.5) * shinLength;
        const hoofY = jointY + Math.cos(swing - 0.5) * shinLength;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(jointX, jointY);
        ctx.lineTo(hoofX, hoofY);
        ctx.stroke();
        ctx.restore();
    }

    /* ==========================================================================
       PARTICLE PHYSICS SYSTEM
       ========================================================================== */
    function createParticles(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                x: x,
                y: y + 10 + (Math.random() * 8 - 4),
                vx: -50 - Math.random() * 100, // speed shoot left
                vy: (Math.random() * 2 - 1) * 30,  // slight vertical drift
                color: color,
                alpha: 1.0,
                decay: 1.5 + Math.random() * 2.0, // fade out speed
                size: 1.5 + Math.random() * 2
            });
        }
    }

    function drawParticles() {
        particles.forEach((p, idx) => {
            p.x += p.vx * 0.016; // simulate constant 60fps dt
            p.y += p.vy * 0.016;
            p.alpha -= p.decay * 0.016;

            if (p.alpha <= 0) {
                particles.splice(idx, 1);
                return;
            }

            // draw particles relative to camera view
            const screenX = p.x - cameraX;
            if (screenX > 0 && screenX < canvas.width) {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(screenX, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1.0; // reset transparency
    }

    /* ==========================================================================
       LIVE COMMENTARY GENERATOR
       ========================================================================== */
    function addCommentary(text) {
        commentaryQueue.push(text);
        if (!commentaryTimer) {
            processCommentaryQueue();
        }
    }

    function processCommentaryQueue() {
        const consoleText = document.getElementById("derby-commentary-text");
        if (commentaryQueue.length > 0) {
            currentCommentaryText = commentaryQueue.shift();
            if (consoleText) {
                consoleText.textContent = currentCommentaryText;
                
                // Add retro sound for commentary update (typewriter bleep)
                if (audioCtx && audioCtx.state !== "suspended") {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    osc.type = "sine";
                    osc.frequency.setValueAtTime(600, audioCtx.currentTime);
                    osc.connect(gain);
                    gain.connect(audioCtx.destination);
                    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.03);
                    osc.start();
                    osc.stop(audioCtx.currentTime + 0.03);
                }
            }
            // Delay next message
            commentaryTimer = setTimeout(processCommentaryQueue, 2800);
        } else {
            commentaryTimer = null;
        }
    }

    /* ==========================================================================
       POST-RACE EVALUATION & ODDS PAYOUT
       ========================================================================== */
    function handleRaceFinished() {
        raceInProgress = false;
        raceFinished = true;
        stopRaceAudio();

        // Sort horses by finishTime to find winner
        const leaderboard = [...HORSES].sort((a, b) => a.finishTime - b.finishTime);
        const winner = leaderboard[0];

        // Sound outcome
        let playerWon = false;
        let payout = 0;

        if (activeBets[winner.id]) {
            payout = Math.floor(activeBets[winner.id] * winner.odds);
            playerCoins += payout;
            playerWon = true;
        }

        // Add to history roadmap (max 8 entries)
        resultsHistory.unshift({
            number: winner.number,
            color: winner.color
        });
        if (resultsHistory.length > 8) {
            resultsHistory.pop();
        }
        updateRoadmap();

        // Render result text in modal popup inside commentary
        let resultMsg = "";
        if (playerWon) {
            resultMsg = `ANDA MENANG! ${winner.name} juara 1. Anda menerima payout ${payout} koin!`;
            playSynthesizedSound("win");
        } else {
            resultMsg = `Balapan selesai. ${winner.name} juara 1. Taruhan Anda kalah.`;
            playSynthesizedSound("lose");
        }
        
        // Push final result to commentary immediately
        commentaryQueue = []; // clear remaining queue
        if (commentaryTimer) clearTimeout(commentaryTimer);
        commentaryTimer = null;
        addCommentary(resultMsg);

        // Update dashboard status
        const outcomeEl = document.getElementById("derby-last-outcome");
        if (outcomeEl) {
            outcomeEl.textContent = `${winner.name} (#${winner.number})`;
            outcomeEl.style.color = winner.color;
        }

        // Reset active bets
        activeBets = {};
        totalBet = 0;

        // Save coins if needed
        updateUIDisplay();
    }

    function updateRoadmap() {
        const roadmapGroup = document.getElementById("derby-roadmap-group");
        if (!roadmapGroup) return;

        roadmapGroup.innerHTML = "";
        resultsHistory.forEach(hist => {
            const dot = document.createElement("span");
            dot.className = "derby-roadmap-dot";
            dot.textContent = hist.number;
            dot.style.borderColor = hist.color;
            dot.style.color = hist.color;
            dot.style.boxShadow = `0 0 5px ${hist.color}33`;
            roadmapGroup.appendChild(dot);
        });
    }
})();
