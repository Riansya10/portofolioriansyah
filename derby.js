/* ==========================================================================
   CYBER RIDER DERBY - ARCADE RACER GAME LOGIC & ENGINE (derby.js)
   ========================================================================== */

(function () {
    // Game state
    let gameActive = false;
    let raceState = "menu"; // "menu", "countdown", "racing", "finished"
    let countdownVal = 3;
    let countdownTimer = null;
    
    // Player stats
    let playerZ = 0;       // distance along track
    let playerX = 0;       // lateral lane position (-1.8 to +1.8)
    let playerSpeed = 0;   // SP actual
    let playerStamina = 100; // ST actual
    let playerWhipActive = false;
    let playerRank = 6;
    let finishOrder = [];  // Array of finished horses
    let finishTime = 0;
    let raceStartTime = 0;
    
    // Collision invulnerability
    let invulnFrames = 0;
    const INVULN_MAX_FRAMES = 90; // 1.5 seconds at 60fps

    // Inputs
    let keys = {};
    const LATERAL_SPEED = 2.4; // lane units per second
    
    // Track parameters
    const TRACK_LENGTH = 36000; // 1800 meters total (36000 world Z units)
    let canvas, ctx;
    let animationFrameId;
    let lastTime = 0;
    
    // Web Audio Synthesizer
    let audioCtx = null;
    let crowdCheerSource = null;
    let crowdCheerGain = null;

    // Horses definition (Player is id: 0, cyan)
    const HORSES = [
        {
            id: 0,
            name: "CYBER STREAK",
            color: "#00f0ff",
            number: "08",
            isPlayer: true,
            z: 0,
            x: 0,
            speed: 0,
            legPhase: 0,
            finished: false,
            time: 0
        },
        {
            id: 1,
            name: "NEON AURA",
            color: "#ff00aa",
            number: "01",
            isPlayer: false,
            z: 1200,
            x: -0.9,
            speed: 250,
            legPhase: 0,
            finished: false,
            time: 0,
            targetX: -0.9,
            laneTimer: 2
        },
        {
            id: 2,
            name: "VOLT FALCON",
            color: "#eab308",
            number: "02",
            isPlayer: false,
            z: 400,
            x: 0.9,
            speed: 242,
            legPhase: 0,
            finished: false,
            time: 0,
            targetX: 0.9,
            laneTimer: 3
        },
        {
            id: 3,
            name: "CRIMSON COMET",
            color: "#ff0055",
            number: "03",
            isPlayer: false,
            z: 2000,
            x: 0.3,
            speed: 258,
            legPhase: 0,
            finished: false,
            time: 0,
            targetX: 0.3,
            laneTimer: 1.5
        },
        {
            id: 4,
            name: "GLITCH PHANTOM",
            color: "#a855f7",
            number: "04",
            isPlayer: false,
            z: 800,
            x: -0.3,
            speed: 246,
            legPhase: 0,
            finished: false,
            time: 0,
            targetX: -0.3,
            laneTimer: 4
        },
        {
            id: 5,
            name: "AERO SWIFT",
            color: "#00ff88",
            number: "05",
            isPlayer: false,
            z: 1600,
            x: -1.4,
            speed: 254,
            legPhase: 0,
            finished: false,
            time: 0,
            targetX: -1.4,
            laneTimer: 2.5
        }
    ];

    // Particle pools
    let particles = [];

    // Camera parameters
    const horizonY = 135;
    const focalLength = 250;
    const roadWidthAtBottom = 450;

    /* ==========================================================================
       INITIALIZATION
       ========================================================================== */
    document.addEventListener("DOMContentLoaded", () => {
        initDerbyGame();
    });

    function initDerbyGame() {
        canvas = document.getElementById("derby-canvas");
        if (!canvas) return;
        ctx = canvas.getContext("2d");

        // Fit resolution
        canvas.width = 900;
        canvas.height = 360;

        // Bind events
        setupUIEvents();

        // Bind Keyboard Inputs
        window.addEventListener("keydown", (e) => {
            if (raceState === "racing") {
                const key = e.key;
                keys[key] = true;

                if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar", "w", "W"].includes(key)) {
                    e.preventDefault();
                }

                if (["w", "W", " ", "Spacebar"].includes(key)) {
                    playerWhipActive = true;
                }
            }
        });
        window.addEventListener("keyup", (e) => {
            if (raceState === "racing") {
                const key = e.key;
                keys[key] = false;
                if (["w", "W", " ", "Spacebar"].includes(key)) {
                    playerWhipActive = false;
                }
            }
        });

        // Initial render menu state
        drawMenuBackground();
    }

    function setupUIEvents() {
        // Trigger Modal Open (bind to button in index.html)
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
                        modalContent.classList.toggle("derby-pseudo-fullscreen");
                    });
                } else {
                    document.exitFullscreen();
                }
            });
        }

        // Escape full screen handling
        document.addEventListener("fullscreenchange", () => {
            if (!document.fullscreenElement) {
                modalContent?.classList.remove("derby-pseudo-fullscreen");
            }
        });

        // Play/Restart buttons
        document.addEventListener("click", (e) => {
            const startBtn = e.target.closest("#btn-derby-start-game");
            const restartBtn = e.target.closest("#btn-derby-restart");
            
            if (startBtn || restartBtn) {
                e.preventDefault();
                initAudio();
                startRaceCountdown();
            }
        });

        // Virtual Touch controls for Mobile Gamepad
        const leftBtn = document.getElementById("touch-derby-left");
        const rightBtn = document.getElementById("touch-derby-right");
        const whipBtn = document.getElementById("touch-derby-whip");

        if (leftBtn && rightBtn && whipBtn) {
            // Touch Left
            leftBtn.addEventListener("touchstart", (e) => { e.preventDefault(); keys["ArrowLeft"] = true; }, { passive: false });
            leftBtn.addEventListener("touchend", (e) => { e.preventDefault(); keys["ArrowLeft"] = false; }, { passive: false });
            
            // Touch Right
            rightBtn.addEventListener("touchstart", (e) => { e.preventDefault(); keys["ArrowRight"] = true; }, { passive: false });
            rightBtn.addEventListener("touchend", (e) => { e.preventDefault(); keys["ArrowRight"] = false; }, { passive: false });
            
            // Touch Whip
            whipBtn.addEventListener("touchstart", (e) => { e.preventDefault(); playerWhipActive = true; }, { passive: false });
            whipBtn.addEventListener("touchend", (e) => { e.preventDefault(); playerWhipActive = false; }, { passive: false });
            
            // Mouse equivalents just in case for testing responsive layout on desktop
            leftBtn.addEventListener("mousedown", () => { keys["ArrowLeft"] = true; });
            leftBtn.addEventListener("mouseup", () => { keys["ArrowLeft"] = false; });
            leftBtn.addEventListener("mouseleave", () => { keys["ArrowLeft"] = false; });

            rightBtn.addEventListener("mousedown", () => { keys["ArrowRight"] = true; });
            rightBtn.addEventListener("mouseup", () => { keys["ArrowRight"] = false; });
            rightBtn.addEventListener("mouseleave", () => { keys["ArrowRight"] = false; });

            whipBtn.addEventListener("mousedown", () => { playerWhipActive = true; });
            whipBtn.addEventListener("mouseup", () => { playerWhipActive = false; });
            whipBtn.addEventListener("mouseleave", () => { playerWhipActive = false; });
        }
    }

    function openDerbyModal() {
        const modal = document.getElementById("derby-modal");
        if (modal) {
            modal.classList.add("show");
            showScreen("start");
            gameActive = true;
            resetGameState();
            setTimeout(() => {
                initDerbyGame();
            }, 100);
        }
    }

    function closeDerbyModal() {
        const modal = document.getElementById("derby-modal");
        if (modal) {
            modal.classList.remove("show");
            stopRaceAudio();
            gameActive = false;
            raceState = "menu";
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (countdownTimer) clearInterval(countdownTimer);
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
            console.error("Web Audio API not supported", e);
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

        if (type === "tick") {
            // Short countdown beep
            osc.type = "sine";
            osc.frequency.setValueAtTime(440, now);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } 
        else if (type === "go") {
            // Higher starting beep
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        }
        else if (type === "whip") {
            // Whip crack (filtered white noise burst)
            const bufferSize = audioCtx.sampleRate * 0.08; // 80ms
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(1200, now);
            filter.Q.setValueAtTime(3.0, now);

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.16, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            noiseNode.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noiseNode.start(now);

            // Follow-up slap chime
            osc.type = "triangle";
            osc.frequency.setValueAtTime(600, now + 0.01);
            osc.frequency.exponentialRampToValueAtTime(200, now + 0.06);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.start(now);
            osc.stop(now + 0.06);
        }
        else if (type === "crash") {
            // Crash impact (heavy rumble)
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.linearRampToValueAtTime(20, now + 0.5);
            gain.gain.setValueAtTime(0.25, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
            osc.start(now);
            osc.stop(now + 0.5);

            // Noise element of crash
            const bufferSize = audioCtx.sampleRate * 0.4;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(180, now);
            
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.2, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

            noise.connect(lowpass);
            lowpass.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noise.start(now);
        }
        else if (type === "win") {
            // Retro happy victory theme
            const melody = [523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50]; // C major scale
            melody.forEach((freq, idx) => {
                const noteOsc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                noteOsc.type = "triangle";
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.1);
                noteOsc.connect(noteGain);
                noteGain.connect(audioCtx.destination);
                noteGain.gain.setValueAtTime(0.15, now + idx * 0.1);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.25);
                noteOsc.start(now + idx * 0.1);
                noteOsc.stop(now + idx * 0.1 + 0.25);
            });
        }
        else if (type === "lose") {
            // Sad descending jingle
            const melody = [440.00, 415.30, 392.00, 349.23];
            melody.forEach((freq, idx) => {
                const noteOsc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                noteOsc.type = "sawtooth";
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.18);
                noteOsc.connect(noteGain);
                noteGain.connect(audioCtx.destination);
                noteGain.gain.setValueAtTime(0.12, now + idx * 0.18);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.3);
                noteOsc.start(now + idx * 0.18);
                noteOsc.stop(now + idx * 0.18 + 0.3);
            });
        }
    }

    function startRaceAudio() {
        if (!audioCtx) return;
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        // White noise for ambient wind/crowd
        const bufferSize = audioCtx.sampleRate * 2.0;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        crowdCheerSource = audioCtx.createBufferSource();
        crowdCheerSource.buffer = buffer;
        crowdCheerSource.loop = true;

        const bandpass = audioCtx.createBiquadFilter();
        bandpass.type = "bandpass";
        bandpass.frequency.setValueAtTime(350, now);
        bandpass.Q.setValueAtTime(0.8, now);

        crowdCheerGain = audioCtx.createGain();
        crowdCheerGain.gain.setValueAtTime(0.04, now); // quiet wind at start

        crowdCheerSource.connect(bandpass);
        bandpass.connect(crowdCheerGain);
        crowdCheerGain.connect(audioCtx.destination);
        crowdCheerSource.start(now);
    }

    function stopRaceAudio() {
        if (crowdCheerSource) {
            try { crowdCheerSource.stop(); } catch(e) {}
            crowdCheerSource = null;
        }
    }

    /* ==========================================================================
       GAME FLOW & STATE MANAGEMENT
       ========================================================================== */
    function resetGameState() {
        playerZ = 0;
        playerX = 0;
        playerSpeed = 0;
        playerStamina = 100;
        playerWhipActive = false;
        playerRank = 6;
        finishOrder = [];
        finishTime = 0;
        invulnFrames = 0;
        keys = {};
        particles = [];

        // Reset all horses positions
        HORSES[0].z = 0;
        HORSES[0].x = 0;
        HORSES[0].speed = 0;
        HORSES[0].finished = false;

        HORSES[1].z = 1800; // spread along Z
        HORSES[1].x = -0.9;
        HORSES[1].speed = 250;
        HORSES[1].finished = false;
        HORSES[1].targetX = -0.9;

        HORSES[2].z = 700;
        HORSES[2].x = 1.0;
        HORSES[2].speed = 242;
        HORSES[2].finished = false;
        HORSES[2].targetX = 1.0;

        HORSES[3].z = 2400;
        HORSES[3].x = 0.4;
        HORSES[3].speed = 256;
        HORSES[3].finished = false;
        HORSES[3].targetX = 0.4;

        HORSES[4].z = 1200;
        HORSES[4].x = -0.3;
        HORSES[4].speed = 246;
        HORSES[4].finished = false;
        HORSES[4].targetX = -0.3;

        HORSES[5].z = 3000;
        HORSES[5].x = -1.3;
        HORSES[5].speed = 260;
        HORSES[5].finished = false;
        HORSES[5].targetX = -1.3;

        // Reset finished status
        HORSES.forEach(h => {
            h.finished = false;
            h.time = 0;
            h.legPhase = Math.random() * Math.PI * 2;
        });

        // Hide screens
        hideAllScreens();
    }

    function startRaceCountdown() {
        resetGameState();
        raceState = "countdown";
        countdownVal = 3;
        showScreen("countdown");
        updateCountdownUI();

        playSynthesizedSound("tick");

        countdownTimer = setInterval(() => {
            countdownVal--;
            if (countdownVal > 0) {
                playSynthesizedSound("tick");
                updateCountdownUI();
            } else if (countdownVal === 0) {
                playSynthesizedSound("go");
                updateCountdownUI("GO!");
            } else {
                clearInterval(countdownTimer);
                hideAllScreens();
                raceState = "racing";
                raceStartTime = performance.now();
                startRaceAudio();
                
                // Start animation loop
                lastTime = performance.now();
                if (animationFrameId) cancelAnimationFrame(animationFrameId);
                animationFrameId = requestAnimationFrame(gameLoop);
            }
        }, 1000);
    }

    function updateCountdownUI(overrideText) {
        const textEl = document.getElementById("derby-countdown-text");
        if (textEl) {
            textEl.textContent = overrideText || countdownVal;
            // Add slight bump animation
            textEl.style.transform = "scale(1.2)";
            setTimeout(() => {
                textEl.style.transform = "scale(1.0)";
            }, 200);
        }
    }

    function showScreen(type) {
        // Hide all screens
        document.getElementById("derby-screen-start").style.display = "none";
        document.getElementById("derby-screen-countdown").style.display = "none";
        document.getElementById("derby-screen-leaderboard").style.display = "none";

        // Show specific
        if (type === "start") {
            document.getElementById("derby-screen-start").style.display = "flex";
        } else if (type === "countdown") {
            document.getElementById("derby-screen-countdown").style.display = "flex";
        } else if (type === "leaderboard") {
            document.getElementById("derby-screen-leaderboard").style.display = "flex";
        }
    }

    function hideAllScreens() {
        document.getElementById("derby-screen-start").style.display = "none";
        document.getElementById("derby-screen-countdown").style.display = "none";
        document.getElementById("derby-screen-leaderboard").style.display = "none";
    }

    /* ==========================================================================
       MAIN GAME LOOP & PHYSICAL CALCS
       ========================================================================== */
    function gameLoop(time) {
        if (raceState !== "racing" && raceState !== "finished") return;

        const dt = Math.min(0.032, (time - lastTime) / 1000); // clamp dt to prevent giant physics jumps
        lastTime = time;

        // Physics updates
        if (raceState === "racing") {
            updatePlayerPhysics(dt);
            updateNPCPhysics(dt);
            checkCollisions();
            calculateRanks();
        } else if (raceState === "finished") {
            // decelerate slowly
            playerSpeed = Math.max(0, playerSpeed - 150 * dt);
            playerZ += playerSpeed * dt;
            HORSES[0].z = playerZ;
            HORSES[0].legPhase += (playerSpeed / 12) * dt;

            // NPCs keep running slowly
            updateNPCPhysics(dt);
        }

        // Render everything
        renderFrame();

        // Continue loop
        animationFrameId = requestAnimationFrame(gameLoop);
    }

    function updatePlayerPhysics(dt) {
        // Invulnerability frame ticks
        if (invulnFrames > 0) invulnFrames--;

        // Lateral Movement
        if (keys["ArrowLeft"] || keys["a"] || keys["A"]) {
            playerX -= LATERAL_SPEED * dt;
        }
        if (keys["ArrowRight"] || keys["d"] || keys["D"]) {
            playerX += LATERAL_SPEED * dt;
        }
        // Clamp lateral position to stay on road
        playerX = Math.max(-1.8, Math.min(1.8, playerX));
        HORSES[0].x = playerX;

        // Speed / Acceleration Logic
        let maxSpeed = 240;      // Base cruising speed
        let accelRate = 120;     // Normal acceleration
        let decelRate = 180;     // Normal deceleration

        // Stamina logic
        if (playerWhipActive && playerStamina > 0) {
            maxSpeed = 480;       // Whip boost speed
            accelRate = 260;      // Faster speed rise
            playerStamina = Math.max(0, playerStamina - 24 * dt); // drain stamina
            
            // Trigger whip audio sound occasionally
            if (Math.random() < 0.08) {
                playSynthesizedSound("whip");
                createSparks(playerZ, playerX, "#ff00aa", 3);
            }
        } else {
            // recover stamina slowly when not whipping
            let recoveryMultiplier = 1.0;
            // recovers faster at slower speed
            if (playerSpeed < 180) recoveryMultiplier = 1.8;
            playerStamina = Math.min(100, playerStamina + 9 * recoveryMultiplier * dt);
        }

        // Apply stamina penalty
        if (playerStamina <= 0) {
            maxSpeed = 160; // slow tired jog
            decelRate = 220; // force deceleration quickly
        }

        // Interpolate speed
        if (playerSpeed < maxSpeed) {
            playerSpeed = Math.min(maxSpeed, playerSpeed + accelRate * dt);
        } else if (playerSpeed > maxSpeed) {
            playerSpeed = Math.max(maxSpeed, playerSpeed - decelRate * dt);
        }

        // Apply speed to advance distance
        playerZ += playerSpeed * dt;
        HORSES[0].z = playerZ;
        HORSES[0].speed = playerSpeed;

        // Horse leg running leg swing rate
        HORSES[0].legPhase += (playerSpeed / 12) * dt;

        // Kick up dust trail particles from hooves
        if (Math.sin(HORSES[0].legPhase) > 0.8 && playerSpeed > 50 && Math.random() < 0.3) {
            createDust(playerZ - 15, playerX + (Math.random() * 0.2 - 0.1), "#ffffff", 2);
        }

        // Finish line check
        if (playerZ >= TRACK_LENGTH && !HORSES[0].finished) {
            HORSES[0].finished = true;
            HORSES[0].time = (performance.now() - raceStartTime) / 1000;
            finishOrder.push(HORSES[0]);
            
            // End race
            handleRaceFinish();
        }

        // Adjust crowd cheer volume based on speed and finish proximity
        if (crowdCheerGain) {
            const proximity = Math.min(1, playerZ / TRACK_LENGTH);
            const volume = 0.04 + (proximity * 0.12) + (playerSpeed / 500) * 0.04;
            crowdCheerGain.gain.setValueAtTime(volume, audioCtx.currentTime);
        }

        // Update HUD DOM Elements
        updateHUD();
    }

    function updateNPCPhysics(dt) {
        HORSES.forEach(horse => {
            if (horse.isPlayer) return;

            // Decelerate if finished
            if (horse.finished) {
                horse.speed = Math.max(0, horse.speed - 150 * dt);
                horse.z += horse.speed * dt;
                horse.legPhase += (horse.speed / 12) * dt;
                return;
            }

            // Simple NPC AI
            // 1. Target Lane shifting
            horse.laneTimer -= dt;
            if (horse.laneTimer <= 0) {
                // Pick a new random target lane position
                horse.targetX = (Math.random() * 2 - 1) * 1.5;
                horse.laneTimer = 1.5 + Math.random() * 3.5;
            }

            // Move lateral position towards target lane
            horse.x += (horse.targetX - horse.x) * 1.2 * dt;

            // 2. NPC Speeds
            let baseSpeed = 240;
            if (horse.id === 1) baseSpeed = 252; // Neon Aura
            if (horse.id === 3) baseSpeed = 265; // Crimson Comet
            if (horse.id === 5) baseSpeed = 258; // Aero Swift
            
            // Random acceleration wave
            let wave = Math.sin(performance.now() / 1500 + horse.id) * 35;
            let targetSpeed = baseSpeed + wave;

            horse.speed += (targetSpeed - horse.speed) * 2 * dt;
            horse.z += horse.speed * dt;
            horse.legPhase += (horse.speed / 12) * dt;

            // Dust trail
            if (Math.sin(horse.legPhase) > 0.8 && horse.speed > 50 && Math.random() < 0.25) {
                createDust(horse.z - 15, horse.x, "#ffffff", 1);
            }

            // Finish check
            if (horse.z >= TRACK_LENGTH && !horse.finished) {
                horse.finished = true;
                horse.time = (performance.now() - raceStartTime) / 1000;
                finishOrder.push(horse);
            }
        });
    }

    function checkCollisions() {
        // Invulnerable check
        if (invulnFrames > 0) return;

        HORSES.forEach(horse => {
            if (horse.isPlayer || horse.finished) return;

            // 3D Collision check: Z distance and X (lane) difference
            const zDiff = horse.z - playerZ;
            
            // We only collide if the NPC is in front of the player (we hit them from behind)
            if (zDiff > 0 && zDiff < 70) {
                const xDiff = Math.abs(horse.x - playerX);
                
                // Lane width spans roughly -2 to +2 (total 4 units)
                // A horse is roughly 0.3 units wide
                if (xDiff < 0.38) {
                    // CRASH!
                    playSynthesizedSound("crash");
                    playerSpeed = 60; // knock back speed
                    invulnFrames = INVULN_MAX_FRAMES; // activate flashing/invulnerability
                    
                    // Spark burst particles
                    createSparks(playerZ + 10, playerX, "#ff0000", 12);
                    createSparks(playerZ + 10, playerX, "#ffffff", 6);
                }
            }
        });
    }

    function calculateRanks() {
        // Sort horses by distance (descending)
        const sorted = [...HORSES].sort((a, b) => b.z - a.z);
        playerRank = sorted.findIndex(h => h.isPlayer) + 1;
    }

    /* ==========================================================================
       CANVAS PSEUDO-3D RENDER ENGINE
       ========================================================================== */
    function renderFrame() {
        // Clear canvas
        ctx.fillStyle = "#04060a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Sky (synthwave night sky gradient)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, "#05070e");
        skyGrad.addColorStop(0.6, "#180625");
        skyGrad.addColorStop(1, "#360028");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, horizonY);

        // Draw Synthwave Sun
        drawSynthwaveSun();

        // Draw City Silhouette
        drawCitySilhouette();

        // 2. Draw Road (Pseudo-3D Segments)
        // Segment Z spacing
        const segmentLength = 80;
        const startSegIdx = Math.floor(playerZ / segmentLength);
        
        // Draw from furthest to closest (back-to-front painter's algorithm)
        for (let i = startSegIdx + 40; i >= startSegIdx; i--) {
            const worldZ = i * segmentLength;
            const relZ1 = worldZ - playerZ;
            const relZ2 = (i + 1) * segmentLength - playerZ;

            // Perspective division scale factor
            const scale1 = focalLength / (relZ1 + focalLength);
            const scale2 = focalLength / (relZ2 + focalLength);

            // Clip road if behind camera
            if (scale1 <= 0 || scale2 <= 0) continue;

            const y1 = horizonY + (canvas.height - horizonY) * scale1;
            const y2 = horizonY + (canvas.height - horizonY) * scale2;

            // Clip if above horizon
            if (y1 <= horizonY || y2 <= horizonY) continue;

            // Lane coordinate calculations
            const x1 = canvas.width / 2;
            const x2 = canvas.width / 2;

            const w1 = roadWidthAtBottom * scale1;
            const w2 = roadWidthAtBottom * scale2;

            // Alternating grass and asphalt colors
            const isEven = i % 2 === 0;
            
            // Grass fields
            ctx.fillStyle = isEven ? "#051308" : "#081d0d"; // deep green
            ctx.fillRect(0, Math.floor(y2), canvas.width, Math.ceil(y1 - y2));

            // Road polygons
            ctx.fillStyle = isEven ? "#0c0f16" : "#111622"; // cyber asphalt
            ctx.beginPath();
            ctx.moveTo(x1 - w1, y1);
            ctx.lineTo(x2 - w2, y2);
            ctx.lineTo(x2 + w2, y2);
            ctx.lineTo(x1 + w1, y1);
            ctx.fill();

            // Glowing rumble strips (edges)
            const rumbleW1 = w1 * 0.05;
            const rumbleW2 = w2 * 0.05;
            ctx.fillStyle = isEven ? "#00f0ff" : "#ff00aa"; // flashing neon cyan / pink

            // Left rumble
            ctx.beginPath();
            ctx.moveTo(screenCoordX(x1 - w1, rumbleW1), y1);
            ctx.lineTo(screenCoordX(x2 - w2, rumbleW2), y2);
            ctx.lineTo(x2 - w2, y2);
            ctx.lineTo(x1 - w1, y1);
            ctx.fill();

            // Right rumble
            ctx.beginPath();
            ctx.moveTo(x1 + w1, y1);
            ctx.lineTo(x2 + w2, y2);
            ctx.lineTo(screenCoordX(x2 + w2, -rumbleW2), y2);
            ctx.lineTo(screenCoordX(x1 + w1, -rumbleW1), y1);
            ctx.fill();

            // Center lane stripes (draw dashes for lanes)
            if (isEven) {
                ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
                ctx.lineWidth = 2 * scale1;
                // draw 4 lane lines separating 5 lanes
                for (let lane = -1.2; lane <= 1.2; lane += 0.6) {
                    const lx1 = x1 + lane * w1;
                    const lx2 = x2 + lane * w2;
                    ctx.beginPath();
                    ctx.moveTo(lx1, y1);
                    ctx.lineTo(lx2, y2);
                    ctx.stroke();
                }
            }

            // Draw Finish Line Checkered Banner on Road if visible
            const finishSegIdx = Math.floor(TRACK_LENGTH / segmentLength);
            if (i === finishSegIdx) {
                ctx.fillStyle = "#00ff88"; // glowing finish line
                ctx.shadowBlur = 15;
                ctx.shadowColor = "#00ff88";
                ctx.beginPath();
                ctx.moveTo(x1 - w1, y1);
                ctx.lineTo(x2 - w2, y2);
                ctx.lineTo(x2 + w2, y2);
                ctx.lineTo(x1 + w1, y1);
                ctx.fill();
                ctx.shadowBlur = 0; // reset
            }
        }

        // 3. Draw Particles
        renderParticles();

        // 4. Draw Horses (Sorted by Z distance so back-to-front rendering works perfectly)
        const sortedHorses = [...HORSES].sort((a, b) => b.z - a.z);
        sortedHorses.forEach(horse => {
            draw3DHorse(horse);
        });
    }

    function screenCoordX(x, width) {
        return x + width;
    }

    function drawSynthwaveSun() {
        ctx.save();
        const centerX = canvas.width / 2;
        const centerY = horizonY - 10;
        const rad = 50;

        // Glow
        ctx.shadowBlur = 25;
        ctx.shadowColor = "#ff00aa";

        // Yellow to Magenta gradient
        const sunGrad = ctx.createLinearGradient(centerX, centerY - rad, centerX, centerY + rad);
        sunGrad.addColorStop(0, "#fffb00");
        sunGrad.addColorStop(0.5, "#ff007b");
        sunGrad.addColorStop(1, "#5b0082");
        ctx.fillStyle = sunGrad;

        ctx.beginPath();
        ctx.arc(centerX, centerY, rad, Math.PI, 0); // half circle above horizon
        ctx.fill();

        ctx.restore();

        // Sun scanline slits (classic synthwave styling)
        ctx.fillStyle = "#04060a";
        for (let y = centerY - rad; y < centerY; y += 6) {
            // make lines progressively wider at the bottom
            const lineH = 2.5 * ((y - (centerY - rad)) / rad);
            ctx.fillRect(centerX - rad - 10, y, rad * 2 + 20, lineH);
        }
    }

    function drawCitySilhouette() {
        ctx.save();
        ctx.fillStyle = "#0c0514";
        ctx.strokeStyle = "rgba(0, 240, 255, 0.1)";
        ctx.lineWidth = 1;

        // Draw simple neon skyscrapers blocky skyline on horizon
        const skyline = [
            {w: 30, h: 40}, {w: 20, h: 60}, {w: 40, h: 25}, {w: 15, h: 80},
            {w: 25, h: 50}, {w: 50, h: 30}, {w: 35, h: 70}, {w: 20, h: 45}
        ];

        let curX = 150;
        // repeat skyline
        for (let r = 0; r < 2; r++) {
            skyline.forEach(build => {
                ctx.fillRect(curX, horizonY - build.h, build.w, build.h);
                ctx.strokeRect(curX, horizonY - build.h, build.w, build.h);
                curX += build.w + 2;
            });
            curX += 40;
        }

        // Draw horizon overlay glow line
        ctx.strokeStyle = "#00f0ff";
        ctx.shadowBlur = 8;
        ctx.shadowColor = "#00f0ff";
        ctx.beginPath();
        ctx.moveTo(0, horizonY);
        ctx.lineTo(canvas.width, horizonY);
        ctx.stroke();

        ctx.restore();
    }

    function draw3DHorse(horse) {
        // Rel Z from camera
        const relZ = horse.z - playerZ;

        // Skip drawing if horse is behind player camera view
        if (relZ < -60) return;

        // Perspective scale factor
        const scale = focalLength / (relZ + focalLength);

        // Convert world Z & X lane coordinates to screen coordinates
        const screenY = horizonY + (canvas.height - horizonY) * scale;
        const roadWidth = roadWidthAtBottom * scale;
        const screenX = canvas.width / 2 + horse.x * roadWidth;

        // Clip if off screen
        if (screenY > canvas.height + 60 || screenX < -100 || screenX > canvas.width + 100) return;

        // Collision blink effect for player horse
        if (horse.isPlayer && invulnFrames > 0 && Math.floor(invulnFrames / 4) % 2 === 0) {
            return; // skip drawing this frame (blink)
        }

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);

        // --- Render Horse inside Scaled Context (centered at 0, 0) ---
        
        // 1. Footprint ground shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.ellipse(0, 15, 30, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Horse body stroke neon styling
        ctx.strokeStyle = horse.color;
        ctx.lineWidth = 3.5;
        ctx.shadowBlur = 10;
        ctx.shadowColor = horse.color;

        // 3. Draw cyber horse components
        ctx.beginPath();

        // Capsule Body
        ctx.ellipse(-8, -2, 22, 10, 0, 0, Math.PI * 2);

        // Neck
        ctx.moveTo(8, -5);
        ctx.lineTo(18, -20);

        // Head
        ctx.lineTo(28, -18);
        ctx.lineTo(24, -10);
        ctx.lineTo(13, -7);

        // Ears
        ctx.moveTo(17, -21);
        ctx.lineTo(20, -28);
        ctx.lineTo(22, -20);

        ctx.stroke();

        // Turn off glow blur for inner details
        ctx.shadowBlur = 0;
        ctx.lineWidth = 3;

        // 4. Draw articulated Running Legs
        const swing = Math.sin(horse.legPhase);
        const swingOpp = -Math.sin(horse.legPhase);

        // Back leg 1
        drawLeg(-18, 5, swing, horse.color);
        // Back leg 2
        drawLeg(-14, 5, swingOpp, horse.color, true);

        // Front leg 1
        drawLeg(5, 5, swingOpp + 0.3, horse.color);
        // Front leg 2
        drawLeg(10, 5, swing + 0.3, horse.color, true);

        // 5. Tail
        ctx.beginPath();
        ctx.moveTo(-28, -5);
        const tailWhip = Math.cos(horse.legPhase * 2) * 5;
        ctx.quadraticCurveTo(-38, -10 + tailWhip, -45, -3 + tailWhip);
        ctx.stroke();

        // 6. Jockey/Rider outline (adds giant arcade character depth)
        ctx.fillStyle = "#0c0f17";
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        // rider hunched forward
        ctx.moveTo(-10, -10);
        ctx.quadraticCurveTo(-14, -26, 0, -28); // back
        ctx.lineTo(8, -23); // neck
        ctx.lineTo(4, -12); // chest
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Helmet/Visor
        ctx.fillStyle = horse.color;
        ctx.beginPath();
        ctx.arc(1, -29, 4, 0, Math.PI * 2);
        ctx.fill();

        // 7. Horse tag number
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px monospace";
        ctx.fillText(horse.number, -14, 2);

        ctx.restore();
    }

    function drawLeg(startX, startY, swing, color, isSecondary) {
        ctx.save();
        ctx.strokeStyle = color;
        if (isSecondary) ctx.strokeStyle = color + "99"; // opacity leg behind
        ctx.lineWidth = 3.5;

        const thigh = 14;
        const shin = 11;

        const jointX = startX + Math.sin(swing) * 9;
        const jointY = startY + Math.cos(swing) * 9 + 4;

        const hoofX = jointX + Math.sin(swing - 0.4) * shin;
        const hoofY = jointY + Math.cos(swing - 0.4) * shin;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(jointX, jointY);
        ctx.lineTo(hoofX, hoofY);
        ctx.stroke();
        ctx.restore();
    }

    /* ==========================================================================
       PARTICLE SYSTEMS (SPARKS / DUST)
       ========================================================================== */
    function createSparks(z, x, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                type: "spark",
                z: z,
                x: x + (Math.random() * 0.4 - 0.2),
                y: 10 + Math.random() * 15,
                vz: -100 - Math.random() * 300,
                vx: (Math.random() * 2 - 1) * 3,
                vy: -80 - Math.random() * 120, // bounce up
                color: color,
                alpha: 1.0,
                decay: 2.0 + Math.random() * 3.0,
                size: 2 + Math.random() * 3
            });
        }
    }

    function createDust(z, x, color, count) {
        for (let i = 0; i < count; i++) {
            particles.push({
                type: "dust",
                z: z,
                x: x,
                y: 15 + Math.random() * 5,
                vz: -200 - Math.random() * 100,
                vx: (Math.random() * 2 - 1) * 0.5,
                vy: -5 - Math.random() * 15, // float up slightly
                color: "rgba(255, 255, 255, 0.15)",
                alpha: 0.6,
                decay: 1.0 + Math.random() * 2.0,
                size: 4 + Math.random() * 6
            });
        }
    }

    function renderParticles() {
        const now = performance.now();
        particles.forEach((p, idx) => {
            // Apply physics
            p.z += p.vz * 0.016;
            p.x += p.vx * 0.016;
            p.y += p.vy * 0.016;
            p.alpha -= p.decay * 0.016;

            // Gravity effect on spark bounces
            if (p.type === "spark") {
                p.vy += 450 * 0.016; // pull down
            }

            if (p.alpha <= 0) {
                particles.splice(idx, 1);
                return;
            }

            // Draw particle
            const relZ = p.z - playerZ;
            if (relZ < -30 || relZ > 1000) return;

            const scale = focalLength / (relZ + focalLength);
            const screenY = horizonY + (canvas.height - horizonY) * scale + (p.y * scale);
            const roadWidth = roadWidthAtBottom * scale;
            const screenX = canvas.width / 2 + p.x * roadWidth;

            if (screenX > 0 && screenX < canvas.width && screenY > horizonY && screenY < canvas.height) {
                ctx.save();
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.alpha;
                ctx.beginPath();
                ctx.arc(screenX, screenY, p.size * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
        ctx.globalAlpha = 1.0;
    }

    /* ==========================================================================
       UI INTERFACE UPDATES & LEADERBOARD
       ========================================================================== */
    function updateHUD() {
        // HUD Overlay elements
        const spFill = document.getElementById("derby-hud-sp-fill");
        const stFill = document.getElementById("derby-hud-st-fill");
        const distEl = document.getElementById("derby-hud-dist");
        const rankEl = document.getElementById("derby-hud-rank");

        // Stamina bar width
        if (stFill) stFill.style.width = `${playerStamina}%`;

        // Speed bar width (percentage of 500 max speed)
        if (spFill) {
            const spPct = Math.min(100, (playerSpeed / 480) * 100);
            spFill.style.width = `${spPct}%`;
        }

        // Distance remaining in meters (convert world Z to meters, e.g. Z/20)
        if (distEl) {
            const meters = Math.max(0, Math.ceil((TRACK_LENGTH - playerZ) / 20));
            distEl.textContent = `${meters}m`;
        }

        // Current Rank
        if (rankEl) {
            let suffix = "th";
            if (playerRank === 1) suffix = "st";
            if (playerRank === 2) suffix = "nd";
            if (playerRank === 3) suffix = "rd";
            rankEl.textContent = `${playerRank}/${HORSES.length}`;
        }
    }

    function handleRaceFinish() {
        raceState = "finished";
        finishTime = (performance.now() - raceStartTime) / 1000;
        
        // Let remaining NPCs finish
        setTimeout(() => {
            // Force finish all who haven't
            HORSES.forEach(h => {
                if (!h.finished) {
                    h.finished = true;
                    h.time = finishTime + 5 + Math.random() * 5;
                    finishOrder.push(h);
                }
            });

            // Stop animations
            cancelAnimationFrame(animationFrameId);
            stopRaceAudio();

            // Evaluate game outcome & Show leaderboard
            showFinalLeaderboard();
        }, 3000);
    }

    function showFinalLeaderboard() {
        const boardBody = document.getElementById("derby-leaderboard-body");
        const statusText = document.getElementById("derby-result-status");
        
        if (!boardBody) return;
        boardBody.innerHTML = "";

        // Sort finished horses by time
        const sorted = [...finishOrder].sort((a, b) => a.time - b.time);
        
        // Find player final standing
        const playerFinalRank = sorted.findIndex(h => h.isPlayer) + 1;

        // Victory fanfares
        if (playerFinalRank === 1) {
            if (statusText) {
                statusText.textContent = "🏆 CHAMPION! 🏆";
                statusText.className = "derby-result-status win";
            }
            playSynthesizedSound("win");
        } else if (playerFinalRank <= 3) {
            if (statusText) {
                statusText.textContent = `🎉 POSISI KE-${playerFinalRank}! 🎉`;
                statusText.className = "derby-result-status win";
            }
            playSynthesizedSound("win");
        } else {
            if (statusText) {
                statusText.textContent = "BALAPAN SELESAI";
                statusText.className = "derby-result-status lose";
            }
            playSynthesizedSound("lose");
        }

        // Fill leaderboard rows
        sorted.forEach((horse, idx) => {
            const row = document.createElement("tr");
            if (horse.isPlayer) {
                row.className = "player-row";
            }

            row.innerHTML = `
                <td>${idx + 1}</td>
                <td><span style="color: ${horse.color}; font-weight: bold;">■</span> ${horse.name}</td>
                <td>#${horse.number}</td>
                <td>${horse.time.toFixed(2)}s</td>
            `;
            boardBody.appendChild(row);
        });

        // Show Overlay Screen
        showScreen("leaderboard");
    }

    /* ==========================================================================
       ARCADE MENU ARTWORK DRAWING
       ========================================================================== */
    function drawMenuBackground() {
        if (!ctx) return;
        ctx.fillStyle = "#05080e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, "#05070e");
        skyGrad.addColorStop(0.7, "#180625");
        skyGrad.addColorStop(1, "#360028");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, horizonY);

        drawSynthwaveSun();
        drawCitySilhouette();

        // Draw grid floor perspective lines (static menu layout)
        ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
        ctx.lineWidth = 1;
        
        // horizontal pavement lines
        for (let y = horizonY; y < canvas.height; y += 15) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }

        // vanishing perspective lines
        for (let x = -300; x <= canvas.width + 300; x += 100) {
            ctx.beginPath();
            ctx.moveTo(canvas.width / 2, horizonY);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }

        // Render stationary logo horse outline
        ctx.save();
        ctx.translate(canvas.width / 2, 240);
        ctx.scale(1.8, 1.8);
        ctx.strokeStyle = "#00f0ff";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "#00f0ff";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(-8, -2, 20, 10, 0, 0, Math.PI * 2);
        ctx.moveTo(8, -5);
        ctx.lineTo(18, -20);
        ctx.lineTo(28, -18);
        ctx.lineTo(24, -10);
        ctx.lineTo(13, -7);
        ctx.stroke();
        ctx.restore();
    }
})();
