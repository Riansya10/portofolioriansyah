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
            color: "#6b4d31",
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
            name: "DUSK STALLION",
            color: "#503826",
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
            name: "SAND SHADOW",
            color: "#a1826f",
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
            name: "BRONZE GLIDE",
            color: "#7f5c3d",
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
            name: "ASHEN BREEZE",
            color: "#4b3a2f",
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
            name: "MOONSTRIDE",
            color: "#2f241d",
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
            gameActive = true;
            resetGameState();
            showScreen("start");
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
            // Cowboy-style click / hoof tap for countdown
            osc.type = "square";
            osc.frequency.setValueAtTime(220, now);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc.start(now);
            osc.stop(now + 0.12);

            const click = audioCtx.createBufferSource();
            const clickBuf = audioCtx.createBuffer(1, audioCtx.sampleRate * 0.03, audioCtx.sampleRate);
            const clickData = clickBuf.getChannelData(0);
            for (let i = 0; i < clickData.length; i++) {
                clickData[i] = (Math.random() * 2 - 1) * Math.exp(-10 * i / clickData.length);
            }
            click.buffer = clickBuf;
            const clickGain = audioCtx.createGain();
            clickGain.gain.setValueAtTime(0.08, now);
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
            click.connect(clickGain);
            clickGain.connect(audioCtx.destination);
            click.start(now);
        } 
        else if (type === "go") {
            // Starter pistol / western shiver
            osc.type = "triangle";
            osc.frequency.setValueAtTime(180, now);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.start(now);
            osc.stop(now + 0.25);

            const pistol = audioCtx.createBufferSource();
            const bufferSize = audioCtx.sampleRate * 0.05;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-15 * i / bufferSize);
            }
            pistol.buffer = buffer;
            const pistolGain = audioCtx.createGain();
            pistolGain.gain.setValueAtTime(0.12, now);
            pistolGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            pistol.connect(pistolGain);
            pistolGain.connect(audioCtx.destination);
            pistol.start(now);
        }
        else if (type === "whip") {
            // Horse whip crack: sharp noise burst with quick decay
            const bufferSize = audioCtx.sampleRate * 0.06;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-10 * i / bufferSize);
            }

            const noiseNode = audioCtx.createBufferSource();
            noiseNode.buffer = buffer;

            const filter = audioCtx.createBiquadFilter();
            filter.type = "bandpass";
            filter.frequency.setValueAtTime(1400, now);
            filter.Q.setValueAtTime(4.0, now);

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.18, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

            noiseNode.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noiseNode.start(now);
        }
        else if (type === "crash") {
            // Hoof stomp / impact thud
            osc.type = "sine";
            osc.frequency.setValueAtTime(90, now);
            gain.gain.setValueAtTime(0.24, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);

            const bufferSize = audioCtx.sampleRate * 0.18;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-8 * i / bufferSize);
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;
            const lowpass = audioCtx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(220, now);
            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0.12, now);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            noise.connect(lowpass);
            lowpass.connect(noiseGain);
            noiseGain.connect(audioCtx.destination);
            noise.start(now);
        }
        else if (type === "win") {
            // Western victory motif
            const melody = [220.00, 246.94, 196.00, 261.63, 293.66];
            melody.forEach((freq, idx) => {
                const noteOsc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                noteOsc.type = "triangle";
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.14);
                noteOsc.connect(noteGain);
                noteGain.connect(audioCtx.destination);
                noteGain.gain.setValueAtTime(0.14, now + idx * 0.14);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.22);
                noteOsc.start(now + idx * 0.14);
                noteOsc.stop(now + idx * 0.14 + 0.22);
            });
        }
        else if (type === "lose") {
            // Slow western tumble
            const melody = [196.00, 185.00, 174.61, 164.81];
            melody.forEach((freq, idx) => {
                const noteOsc = audioCtx.createOscillator();
                const noteGain = audioCtx.createGain();
                noteOsc.type = "triangle";
                noteOsc.frequency.setValueAtTime(freq, now + idx * 0.2);
                noteOsc.connect(noteGain);
                noteGain.connect(audioCtx.destination);
                noteGain.gain.setValueAtTime(0.12, now + idx * 0.2);
                noteGain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.2 + 0.28);
                noteOsc.start(now + idx * 0.2);
                noteOsc.stop(now + idx * 0.2 + 0.28);
            });
        }

    }

    function startRaceAudio() {
        if (!audioCtx) return;
        if (audioCtx.state === "suspended") {
            audioCtx.resume();
        }

        const now = audioCtx.currentTime;

        // Soft western wind ambience
        const bufferSize = audioCtx.sampleRate * 2.0;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }

        crowdCheerSource = audioCtx.createBufferSource();
        crowdCheerSource.buffer = buffer;
        crowdCheerSource.loop = true;

        const lowpass = audioCtx.createBiquadFilter();
        lowpass.type = "lowpass";
        lowpass.frequency.setValueAtTime(240, now);
        lowpass.Q.setValueAtTime(0.7, now);

        crowdCheerGain = audioCtx.createGain();
        crowdCheerGain.gain.setValueAtTime(0.03, now); // gentle wind

        crowdCheerSource.connect(lowpass);
        lowpass.connect(crowdCheerGain);
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
                createSparks(playerZ, playerX, "#d79b6d", 3);
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
            createDust(playerZ - 15, playerX + (Math.random() * 0.2 - 0.1), "#d2ac76", 2);
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
            if (horse.id === 1) baseSpeed = 252; // Western pace
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
                createDust(horse.z - 15, horse.x, "#d2ac76", 1);
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
                    createSparks(playerZ + 10, playerX, "#d18c4b", 12);
                    createSparks(playerZ + 10, playerX, "#f8e2c5", 6);
                }
            }
        });
    }

    function calculateRanks() {
        // Sort horses by distance (descending)
        const sorted = [...HORSES].sort((a, b) => b.z - a.z);
        playerRank = sorted.findIndex(h => h.isPlayer) + 1;
    }

    function getRoadCurveAtZ(z) {
        // Smooth sweeping curves for racetrack sections
        const mainCurve = Math.sin(z / 1200) * 0.8;
        const smallSway = Math.sin(z / 700) * 0.24;
        return mainCurve + smallSway;
    }

    /* ==========================================================================
       CANVAS PSEUDO-3D RENDER ENGINE
       ========================================================================== */
    function renderFrame() {
        // Clear canvas
        ctx.fillStyle = "#2c1b0f";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Sky (sunset desert sky)
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, "#3d2413");
        skyGrad.addColorStop(0.5, "#a66e3b");
        skyGrad.addColorStop(1, "#e2b47a");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, horizonY);

        // Draw Western Sun
        drawSynthwaveSun();

        // Draw Desert Horizon
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

            // Lane coordinate calculations with track curvature
            const w1 = roadWidthAtBottom * scale1;
            const w2 = roadWidthAtBottom * scale2;
            const curve1 = getRoadCurveAtZ(worldZ);
            const curve2 = getRoadCurveAtZ(worldZ + segmentLength);
            const x1 = canvas.width / 2 + curve1 * w1;
            const x2 = canvas.width / 2 + curve2 * w2;

            const isEven = i % 2 === 0;
            
            // Dry desert earth and sandy track edges
            ctx.fillStyle = isEven ? "#3c2718" : "#4f3624";
            ctx.fillRect(0, Math.floor(y2), canvas.width, Math.ceil(y1 - y2));

            // Road polygons
            ctx.fillStyle = "#4a382c";
            ctx.beginPath();
            ctx.moveTo(x1 - w1, y1);
            ctx.lineTo(x2 - w2, y2);
            ctx.lineTo(x2 + w2, y2);
            ctx.lineTo(x1 + w1, y1);
            ctx.fill();

            // Dusty roadside markers
            const rumbleW1 = w1 * 0.05;
            const rumbleW2 = w2 * 0.05;
            ctx.fillStyle = "#d9c29c";

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

            // Center lane stripes (subtle desert markers)
            if (isEven) {
                ctx.strokeStyle = "rgba(242, 206, 161, 0.22)";
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

            // Draw Finish Line Banner on Road if visible
            const finishSegIdx = Math.floor(TRACK_LENGTH / segmentLength);
            if (i === finishSegIdx) {
                ctx.fillStyle = "#f4e0b3"; // faded finish line
                ctx.shadowBlur = 8;
                ctx.shadowColor = "rgba(244, 224, 179, 0.45)";
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
        ctx.shadowBlur = 20;
        ctx.shadowColor = "rgba(244, 171, 90, 0.5)";

        // Warm desert sun gradient
        const sunGrad = ctx.createLinearGradient(centerX, centerY - rad, centerX, centerY + rad);
        sunGrad.addColorStop(0, "#ffe5a8");
        sunGrad.addColorStop(0.55, "#ffad56");
        sunGrad.addColorStop(1, "#c36a2c");
        ctx.fillStyle = sunGrad;

        ctx.beginPath();
        ctx.arc(centerX, centerY, rad, Math.PI, 0); // half circle above horizon
        ctx.fill();

        ctx.restore();

        // Light desert haze lines
        ctx.fillStyle = "rgba(44, 27, 11, 0.08)";
        for (let y = centerY - rad + 4; y < centerY; y += 8) {
            const lineH = 1.8 * ((y - (centerY - rad)) / rad);
            ctx.fillRect(centerX - rad - 10, y, rad * 2 + 20, lineH);
        }
    }

    function drawCitySilhouette() {
        ctx.save();
        ctx.fillStyle = "#2a180f";
        ctx.strokeStyle = "rgba(190, 140, 90, 0.18)";
        ctx.lineWidth = 1;

        // Draw desert mesa horizon silhouette
        const mesas = [
            {x: 80, w: 90, h: 36, top: 18},
            {x: 220, w: 70, h: 48, top: 14},
            {x: 340, w: 110, h: 30, top: 10},
            {x: 490, w: 80, h: 42, top: 16},
            {x: 610, w: 60, h: 34, top: 12},
            {x: 700, w: 90, h: 40, top: 20}
        ];

        mesas.forEach(mesa => {
            ctx.fillRect(mesa.x, horizonY - mesa.h, mesa.w, mesa.h);
            ctx.fillRect(mesa.x + mesa.w * 0.35, horizonY - mesa.h - mesa.top, mesa.w * 0.3, mesa.top);
        });

        // Draw distant cactus silhouettes
        const cacti = [120, 260, 420, 560, 740];
        cacti.forEach(x => {
            ctx.fillRect(x, horizonY - 18, 6, 18);
            ctx.fillRect(x - 6, horizonY - 14, 5, 6);
            ctx.fillRect(x + 7, horizonY - 14, 5, 6);
        });

        // Draw horizon overlay line
        ctx.strokeStyle = "rgba(244, 194, 122, 0.36)";
        ctx.shadowBlur = 6;
        ctx.shadowColor = "rgba(244, 194, 122, 0.45)";
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
        const curveOffset = getRoadCurveAtZ(horse.z);
        const screenX = canvas.width / 2 + (horse.x + curveOffset) * roadWidth;

        // Clip if off screen
        if (screenY > canvas.height + 60 || screenX < -120 || screenX > canvas.width + 120) return;

        // Collision blink effect for player horse
        if (horse.isPlayer && invulnFrames > 0 && Math.floor(invulnFrames / 4) % 2 === 0) {
            return; // skip drawing this frame (blink)
        }

        ctx.save();
        ctx.translate(screenX, screenY);
        ctx.scale(scale, scale);
        const sizeScale = horse.isPlayer ? 1.55 : 1.25;

        // 1. Ground shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 20 * sizeScale, 50 * sizeScale, 14 * sizeScale, 0, 0, Math.PI * 2);
        ctx.fill();

        // 2. Horse body silhouette
        ctx.fillStyle = horse.color;
        ctx.strokeStyle = "#24170f";
        ctx.lineWidth = 3 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(22 * sizeScale, 6 * sizeScale);
        ctx.quadraticCurveTo(8 * sizeScale, 12 * sizeScale, 0, 24 * sizeScale);
        ctx.quadraticCurveTo(-18 * sizeScale, 44 * sizeScale, -34 * sizeScale, 36 * sizeScale);
        ctx.quadraticCurveTo(-44 * sizeScale, 28 * sizeScale, -44 * sizeScale, 18 * sizeScale);
        ctx.quadraticCurveTo(-44 * sizeScale, 10 * sizeScale, -36 * sizeScale, 8 * sizeScale);
        ctx.quadraticCurveTo(-24 * sizeScale, 4 * sizeScale, -14 * sizeScale, -6 * sizeScale);
        ctx.quadraticCurveTo(-8 * sizeScale, -16 * sizeScale, 6 * sizeScale, -24 * sizeScale);
        ctx.quadraticCurveTo(18 * sizeScale, -32 * sizeScale, 28 * sizeScale, -20 * sizeScale);
        ctx.quadraticCurveTo(32 * sizeScale, -12 * sizeScale, 28 * sizeScale, 2 * sizeScale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 3. Body shading details
        ctx.strokeStyle = "rgba(0,0,0,0.16)";
        ctx.lineWidth = 1.6 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(-8 * sizeScale, 10 * sizeScale);
        ctx.quadraticCurveTo(-16 * sizeScale, 18 * sizeScale, -8 * sizeScale, 24 * sizeScale);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(10 * sizeScale, 0 * sizeScale);
        ctx.quadraticCurveTo(0, 10 * sizeScale, -8 * sizeScale, 14 * sizeScale);
        ctx.stroke();

        // 4. Neck and head
        ctx.beginPath();
        ctx.moveTo(28 * sizeScale, 2 * sizeScale);
        ctx.quadraticCurveTo(34 * sizeScale, -16 * sizeScale, 20 * sizeScale, -28 * sizeScale);
        ctx.quadraticCurveTo(14 * sizeScale, -34 * sizeScale, 2 * sizeScale, -30 * sizeScale);
        ctx.quadraticCurveTo(8 * sizeScale, -28 * sizeScale, 14 * sizeScale, -20 * sizeScale);
        ctx.quadraticCurveTo(16 * sizeScale, -14 * sizeScale, 22 * sizeScale, -12 * sizeScale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#23170f";
        ctx.beginPath();
        ctx.arc(26 * sizeScale, -16 * sizeScale, 3.5 * sizeScale, 0, Math.PI * 2);
        ctx.fill();

        // 5. Mane detail
        ctx.strokeStyle = "#1e130b";
        ctx.lineWidth = 3.5 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(18 * sizeScale, -6 * sizeScale);
        ctx.bezierCurveTo(12 * sizeScale, -20 * sizeScale, 6 * sizeScale, -30 * sizeScale, -8 * sizeScale, -38 * sizeScale);
        ctx.stroke();

        ctx.lineWidth = 2.2 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(22 * sizeScale, -4 * sizeScale);
        ctx.quadraticCurveTo(12 * sizeScale, -16 * sizeScale, 4 * sizeScale, -26 * sizeScale);
        ctx.stroke();

        // 6. Tail
        ctx.strokeStyle = "#24170f";
        ctx.lineWidth = 4.2 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(-36 * sizeScale, 16 * sizeScale);
        const tailWhip = Math.cos(horse.legPhase * 1.6) * 8;
        ctx.bezierCurveTo(-52 * sizeScale, 20 * sizeScale + tailWhip, -58 * sizeScale, 38 * sizeScale + tailWhip, -44 * sizeScale, 52 * sizeScale + tailWhip);
        ctx.stroke();

        ctx.lineWidth = 2.2 * sizeScale;
        ctx.beginPath();
        ctx.moveTo(-36 * sizeScale, 20 * sizeScale);
        ctx.quadraticCurveTo(-50 * sizeScale, 34 * sizeScale + tailWhip, -42 * sizeScale, 44 * sizeScale + tailWhip);
        ctx.stroke();

        // 7. Legs
        const swing = Math.sin(horse.legPhase);
        const swingOpp = Math.sin(horse.legPhase + Math.PI / 2);
        drawLeg(-18, 18, swing * 0.9, horse.color, false, true, sizeScale);
        drawLeg(4, 16, swingOpp * 0.9, horse.color, false, true, sizeScale);
        drawLeg(-18, 4, swingOpp + 0.4, horse.color, true, false, sizeScale);
        drawLeg(10, 2, swing + 0.4, horse.color, true, false, sizeScale);

        // 8. Saddle and race number
        ctx.fillStyle = "#5c381d";
        ctx.beginPath();
        ctx.ellipse(-2 * sizeScale, -2 * sizeScale, 14 * sizeScale, 7 * sizeScale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#2b180c";
        ctx.stroke();

        ctx.fillStyle = "#e7d5b8";
        ctx.fillRect(-10 * sizeScale, -2 * sizeScale, 20 * sizeScale, 8 * sizeScale);
        ctx.fillStyle = "#2b1c13";
        ctx.font = `bold ${8 * sizeScale}px monospace`;
        ctx.fillText(horse.number, -4 * sizeScale, 4 * sizeScale);

        ctx.restore();
    }

    function drawLeg(startX, startY, swing, color, isSecondary, isRear, sizeScale = 1) {
        ctx.save();
        const legColor = isSecondary ? "rgba(25, 18, 14, 0.8)" : "#2a1d14";
        ctx.strokeStyle = legColor;
        ctx.fillStyle = legColor;
        ctx.lineWidth = (isRear ? 5 : 4) * sizeScale;

        const offsetX = startX * sizeScale;
        const offsetY = startY * sizeScale;
        const thigh = (isRear ? 22 : 16) * sizeScale;
        const shin = (isRear ? 16 : 12) * sizeScale;

        const kneeX = offsetX + Math.sin(swing) * (thigh * 0.45);
        const kneeY = offsetY + Math.cos(swing) * (thigh * 0.35) + (isRear ? 4 : 2) * sizeScale;
        const hoofX = kneeX + Math.sin(swing - 0.35) * shin;
        const hoofY = kneeY + Math.cos(swing - 0.35) * shin;

        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY);
        ctx.lineTo(kneeX, kneeY);
        ctx.lineTo(hoofX, hoofY);
        ctx.stroke();

        // Knee joint detail
        ctx.fillStyle = "rgba(0,0,0,0.2)";
        ctx.beginPath();
        ctx.arc(kneeX, kneeY, 2.5 * sizeScale, 0, Math.PI * 2);
        ctx.fill();

        // Hoof block
        ctx.fillStyle = "#1f140d";
        ctx.beginPath();
        ctx.ellipse(hoofX, hoofY, 3.5 * sizeScale, 2.5 * sizeScale, 0, 0, Math.PI * 2);
        ctx.fill();

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
                color: color || "rgba(210, 160, 90, 0.22)",
                alpha: 0.5,
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
        ctx.fillStyle = "#2f1e10";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        skyGrad.addColorStop(0, "#3d2413");
        skyGrad.addColorStop(0.7, "#b47b45");
        skyGrad.addColorStop(1, "#e2b47a");
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, canvas.width, horizonY);

        drawSynthwaveSun();
        drawCitySilhouette();

        // Draw floor perspective lines (static menu layout)
        ctx.strokeStyle = "rgba(244, 214, 175, 0.14)";
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
        ctx.strokeStyle = "rgba(244, 214, 175, 0.85)";
        ctx.shadowBlur = 15;
        ctx.shadowColor = "rgba(244, 214, 175, 0.45)";
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
