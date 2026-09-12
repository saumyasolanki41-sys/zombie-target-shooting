(() => {
  "use strict";

  // =========================================================
  // CANVAS + HTML ELEMENTS
  // =========================================================

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  let W = canvas.width;
  let H = canvas.height;

  const mmCanvas = document.getElementById("minimap");
  const mmCtx = mmCanvas.getContext("2d");
  const MM = 130;

  const overlay = document.getElementById("overlay");
  const startScreen = document.getElementById("startScreen");
  const startBtn = document.getElementById("startBtn");
  const waveBanner = document.getElementById("waveBanner");

  const scoreVal = document.getElementById("scoreVal");
  const waveVal = document.getElementById("waveVal");
  const zombieCount = document.getElementById("zombieCount");
  const healthBarFill = document.getElementById("healthBarFill");
  const ammoVal = document.getElementById("ammoVal");
  const ammoMaxVal = document.getElementById("ammoMaxVal");
  const weaponRow = document.getElementById("weaponRow");
  const buffRow = document.getElementById("buffRow");

  // =========================================================
  // INPUT
  // =========================================================

  let keys = {};

  let mouse = {
    x: W / 2,
    y: H / 2,
    down: false
  };

  // =========================================================
  // LEVEL SYSTEM
  // =========================================================

  let selectedLevel = 1;

  const MAX_LEVEL = 10;
  const PROGRESS_KEY = "zombie-attack-unlocked-v1";
  let unlockedLevel = 1;
  try {
    const saved = Number(localStorage.getItem(PROGRESS_KEY));
    if (Number.isInteger(saved)) unlockedLevel = Math.max(1, Math.min(MAX_LEVEL, saved));
  } catch (_) { /* Storage can be unavailable in embedded demos. */ }
  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, String(unlockedLevel)); } catch (_) {}
  }
  function completeLevel() {
    running = false; gameStarted = false; mouse.down = false; keys = {};
    unlockedLevel = Math.max(unlockedLevel, Math.min(MAX_LEVEL, selectedLevel + 1));
    saveProgress();
    waveBanner.style.opacity = "0";
    const screen = document.createElement("div");
    screen.id = "levelCompleteScreen";
    const box = document.createElement("div");
    box.innerHTML = '<div class="sector-tag">SECTOR SECURED</div><h1>' +
      (selectedLevel === MAX_LEVEL ? 'YOU SURVIVED' : 'LEVEL ' + selectedLevel + ' COMPLETE') +
      '</h1><p>' + (selectedLevel === MAX_LEVEL ? 'All 10 levels cleared.' : 'Level ' + (selectedLevel + 1) + ' is now unlocked.') +
      '</p><p>Score: ' + score + '</p>';
    if (selectedLevel < MAX_LEVEL) {
      const next = document.createElement("button");
      next.textContent = "PLAY LEVEL " + (selectedLevel + 1);
      next.addEventListener("click", () => { screen.remove(); selectedLevel++; startSelectedLevel(); });
      box.appendChild(next);
    }
    const menu = document.createElement("button");
    menu.textContent = "LEVEL SELECT";
    menu.addEventListener("click", () => { screen.remove(); showLevelSelect(); });
    box.appendChild(menu); screen.appendChild(box); document.body.appendChild(screen);
  }

  // =========================================================
  // GAME STATE
  // =========================================================

  let player;
  let bullets = [];
  let zombies = [];
  let particles = [];
  let floaters = [];
  let pickups = [];

  let score = 0;
  let wave = 1;

  let spawnLeft = 0;
  let spawnTimer = 0;

  let zombiesPerWave = 6;

  let pickupSpawnTimer = 240;

  let shootCooldown = 0;

  let running = false;
  let gameOver = false;
  let paused = false;
  let gameStarted = false;

  let animationFrameId = null;

  // =========================================================
  // SPRITE SHEET
  // =========================================================

  const SPRITE_FRAME_W = 128;
  const SPRITE_FRAME_H = 128;
  const SPRITE_FRAMES = 4;

  /*
      PLAYER SPRITE SHEET

      4 columns:
      0 = DOWN
      1 = UP
      2 = LEFT
      3 = RIGHT

      3 rows:
      0 = IDLE
      1 = WALK
      2 = SHOOT
  */

  /*
      ZOMBIE SPRITE SHEET

      4 columns:
      0 = DOWN
      1 = UP
      2 = LEFT
      3 = RIGHT

      3 rows:
      0 = IDLE
      1 = WALK
      2 = ATTACK
  */

  const SPRITES = {};

  function loadSprites() {
    SPRITES.player = new Image();
    SPRITES.player.src = "player_sheet.png";

    SPRITES.zombie = new Image();
    SPRITES.zombie.src = "zombie_sheet.png";
  }

  loadSprites();

  // =========================================================
  // DIRECTION
  // =========================================================

  function directionFromAngle(angle) {
    const deg = angle * 180 / Math.PI;

    if (deg >= -45 && deg < 45) {
      return 3; // RIGHT
    }

    if (deg >= 45 && deg < 135) {
      return 0; // DOWN
    }

    if (deg >= -135 && deg < -45) {
      return 1; // UP
    }

    return 2; // LEFT
  }

  // =========================================================
  // WEAPONS
  // =========================================================

  const WEAPONS = {

    pistol: {
      name: "Pistol",
      fireDelay: 12,
      damage: 12,
      spread: 0.04,
      pellets: 1,
      maxAmmo: 12,
      reloadTime: 55,
      bulletSpeed: 12,
      color: "#ffe27a"
    },

    shotgun: {
      name: "Shotgun",
      fireDelay: 35,
      damage: 9,
      spread: 0.4,
      pellets: 5,
      maxAmmo: 6,
      reloadTime: 75,
      bulletSpeed: 10,
      color: "#ff9a4a"
    },

    smg: {
      name: "SMG",
      fireDelay: 5,
      damage: 7,
      spread: 0.14,
      pellets: 1,
      maxAmmo: 30,
      reloadTime: 65,
      bulletSpeed: 13,
      color: "#9adfff"
    }

  };

  const WEAPON_ORDER = [
    "pistol",
    "shotgun",
    "smg"
  ];

  // =========================================================
  // AUDIO
  // =========================================================

  let audioContext = null;

  function ensureAudio() {

    if (!audioContext) {

      try {

        audioContext =
          new (
            window.AudioContext ||
            window.webkitAudioContext
          )();

      } catch (e) {

        audioContext = null;

      }

    }

  }

  function tone(
    frequency,
    duration,
    type = "sine",
    volume = 0.15
  ) {

    if (!audioContext) return;

    const oscillator =
      audioContext.createOscillator();

    const gain =
      audioContext.createGain();

    oscillator.type = type;

    oscillator.frequency.value =
      frequency;

    gain.gain.value =
      volume;

    oscillator.connect(gain);

    gain.connect(
      audioContext.destination
    );

    oscillator.start();

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + duration
    );

    oscillator.stop(
      audioContext.currentTime + duration
    );

  }

  const sfx = {

    shoot() {
      tone(420, 0.06, "square", 0.12);
    },

    hit() {
      tone(180, 0.05, "triangle", 0.1);
    },

    death() {
      tone(100, 0.2, "sawtooth", 0.1);
    },

    reload() {
      tone(500, 0.05, "square", 0.08);

      setTimeout(() => {
        tone(700, 0.05, "square", 0.08);
      }, 100);
    },

    pickup() {
      tone(600, 0.08, "sine", 0.12);

      setTimeout(() => {
        tone(900, 0.08, "sine", 0.12);
      }, 80);
    },

    hurt() {
      tone(100, 0.15, "sawtooth", 0.15);
    }

  };

  // =========================================================
  // LEVEL SELECT SCREEN
  // =========================================================

  function showLevelSelect() {

    const old =
      document.getElementById(
        "levelSelectScreen"
      );

    if (old) {
      old.remove();
    }

    overlay.style.display = "flex";

    const screen =
      document.createElement("div");

    screen.id =
      "levelSelectScreen";

    screen.style.position =
      "fixed";

    screen.style.inset =
      "0";

    screen.style.zIndex =
      "9999";

    screen.style.display =
      "flex";

    screen.style.alignItems =
      "center";

    screen.style.justifyContent =
      "center";

    screen.style.background =
      "rgba(0,0,0,0.88)";

    const box =
      document.createElement("div");

    box.style.width =
      "min(600px,90%)";

    box.style.padding =
      "35px";

    box.style.textAlign =
      "center";

    box.style.background =
      "#101820";

    box.style.border =
      "2px solid #e0d090";

    box.style.borderRadius =
      "15px";

    box.innerHTML = `

      <h1 style="
        color:#e0d090;
        font-family:Courier New;
        margin-bottom:30px;
      ">
        SELECT LEVEL
      </h1>

      <div id="levelButtons"
        style="
          display:grid;
          grid-template-columns:
          repeat(2,1fr);
          gap:15px;
        ">
      </div>

      <button id="levelBack"
        style="
          margin-top:25px;
          padding:12px 35px;
          cursor:pointer;
          background:#263442;
          color:white;
          border:1px solid #777;
          border-radius:8px;
          font-weight:bold;
        ">
        BACK
      </button>
    `;

    screen.appendChild(box);

    document.body.appendChild(screen);

    const levelButtons =
      document.getElementById(
        "levelButtons"
      );

    for (
      let i = 1;
      i <= MAX_LEVEL;
      i++
    ) {

      const button =
        document.createElement("button");

      button.textContent =
        `LEVEL ${i} — ${i > unlockedLevel ? "LOCKED" : i < unlockedLevel ? "CLEARED" : "PLAY"}`;
      button.disabled = i > unlockedLevel;

      button.style.padding =
        "15px";

      button.style.cursor =
        "pointer";

      button.style.borderRadius =
        "8px";

      button.style.border =
        "1px solid #777";

      button.style.background =
        "#263442";

      button.style.color =
        "#fff";

      button.style.font =
        "bold 15px Courier New";

      button.addEventListener(
        "click",
        () => {

          if (i > unlockedLevel) return;
          selectedLevel = i;

          screen.remove();

          overlay.style.display =
            "none";

          startSelectedLevel();

        }
      );

      levelButtons.appendChild(
        button
      );

    }

    document
      .getElementById("levelBack")
      .addEventListener(
        "click",
        () => {

          screen.remove();

          startScreen.style.display =
            "block";

        }
      );

  }

  // =========================================================
  // START SELECTED LEVEL
  // =========================================================

  function startSelectedLevel() {
    if (selectedLevel > unlockedLevel) return;

    ensureAudio();

    resetGame();

    /*
      Selected level directly decides
      starting wave.

      Level 1 = Wave 1
      Level 2 = Wave 4
      Level 3 = Wave 7
      ...
    */

    wave =
      (selectedLevel - 1) * 3 + 1;

    zombiesPerWave =
      6 +
      (selectedLevel - 1) * 3;

    spawnLeft =
      zombiesPerWave;

    spawnTimer = 30;

    running = true;

    gameOver = false;

    paused = false;

    gameStarted = true;

    overlay.style.display =
      "none";

    showLevelBanner();

    startLoop();

  }

  // =========================================================
  // RESET GAME
  // =========================================================

  function resetGame() {

    player = {

      x: W / 2,

      y: H / 2,

      r: 15,

      speed: 3.2,

      hp: 100,

      maxHp: 100,

      angle: 0,

      invuln: 0,

      weapons: {

        pistol: {
          owned: true,
          ammo:
            WEAPONS.pistol.maxAmmo
        },

        shotgun: {
          owned: false,
          ammo: 0
        },

        smg: {
          owned: false,
          ammo: 0
        }

      },

      currentWeapon:
        "pistol",

      reloading: false,

      reloadTime: 0,

      speedBoost: 0,

      damageBoost: 0,

      shield: 0,

      animFrame: 0,

      animTimer: 0,

      animRow: 0

    };

    bullets = [];

    zombies = [];

    particles = [];

    floaters = [];

    pickups = [];

    score = 0;

    shootCooldown = 0;

    pickupSpawnTimer = 240;

    updateHUD();

  }

  // =========================================================
  // LEVEL DISPLAY
  // =========================================================

  function getLevel() {

    return Math.min(
      MAX_LEVEL,
      Math.floor(
        (wave - 1) / 3
      ) + 1
    );

  }

  function showLevelBanner() {

    const currentLevel =
      getLevel();

    if (!waveBanner) return;

    waveBanner.textContent =
      `LEVEL ${currentLevel}`;

    waveBanner.style.opacity =
      "1";

    setTimeout(() => {

      if (!paused) {

        waveBanner.style.opacity =
          "0";

      }

    }, 1500);

  }

  function showWaveBanner() {

    if (!waveBanner) return;

    const currentLevel =
      getLevel();

    const levelChanged =
      wave > 1 &&
      (wave - 1) % 3 === 0;

    waveBanner.textContent =
      levelChanged
        ? `LEVEL ${currentLevel}`
        : `WAVE ${wave}`;

    waveBanner.style.opacity =
      "1";

    setTimeout(() => {

      if (!paused) {

        waveBanner.style.opacity =
          "0";

      }

    }, 1200);

  }

  // =========================================================
  // PAUSE MENU
  // =========================================================

  let pauseOverlay = null;

  function createPauseMenu() {

    pauseOverlay =
      document.createElement("div");

    pauseOverlay.id =
      "pauseOverlay";

    pauseOverlay.style.position =
      "fixed";

    pauseOverlay.style.inset =
      "0";

    pauseOverlay.style.zIndex =
      "10000";

    pauseOverlay.style.display =
      "none";

    pauseOverlay.style.alignItems =
      "center";

    pauseOverlay.style.justifyContent =
      "center";

    pauseOverlay.style.background =
      "rgba(0,0,0,.75)";

    const box =
      document.createElement("div");

    box.style.background =
      "#111820";

    box.style.padding =
      "35px";

    box.style.width =
      "300px";

    box.style.textAlign =
      "center";

    box.style.borderRadius =
      "15px";

    box.style.border =
      "1px solid #777";

    box.innerHTML = `

      <h1 style="
        color:#e0d090;
        font-family:Courier New;
      ">
        PAUSED
      </h1>

      <button id="resumeBtn"
        style="
          width:100%;
          padding:13px;
          margin:8px 0;
          cursor:pointer;
        ">
        RESUME
      </button>

      <button id="quitBtn"
        style="
          width:100%;
          padding:13px;
          margin:8px 0;
          cursor:pointer;
        ">
        QUIT TO MENU
      </button>

    `;

    pauseOverlay.appendChild(box);

    document.body.appendChild(
      pauseOverlay
    );

    document
      .getElementById("resumeBtn")
      .addEventListener(
        "click",
        resumeGame
      );

    document
      .getElementById("quitBtn")
      .addEventListener(
        "click",
        quitToMenu
      );

  }

  createPauseMenu();

  // =========================================================
  // PAUSE
  // =========================================================

  function pauseGame() {

    if (
      !gameStarted ||
      gameOver ||
      paused
    ) {
      return;
    }

    paused = true;

    mouse.down = false;

    keys = {};

    pauseOverlay.style.display =
      "flex";

  }

  // =========================================================
  // RESUME
  // =========================================================

  function resumeGame() {

    if (
      !gameStarted ||
      gameOver ||
      !paused
    ) {
      return;
    }

    paused = false;

    pauseOverlay.style.display =
      "none";

  }

  // =========================================================
  // QUIT TO MENU
  // =========================================================

  function quitToMenu() {

    running = false;

    paused = false;

    gameStarted = false;

    gameOver = false;

    mouse.down = false;

    keys = {};

    if (animationFrameId) {

      cancelAnimationFrame(
        animationFrameId
      );

      animationFrameId = null;

    }

    pauseOverlay.style.display =
      "none";

    overlay.style.display =
      "flex";

    startScreen.style.display =
      "block";

  }

  // =========================================================
  // KEYBOARD
  // =========================================================

  window.addEventListener(
    "keydown",
    e => {

      if (e.key === "Escape") {

        e.preventDefault();

        if (paused) {

          resumeGame();

        } else {

          pauseGame();

        }

        return;

      }

      if (paused) return;

      const key =
        e.key.toLowerCase();

      keys[key] = true;

      if (key === "r") {

        reload();

      }

      if (key === " ") {

        shoot();

        e.preventDefault();

      }

      if (
        key === "1" ||
        key === "2" ||
        key === "3"
      ) {

        switchWeapon(
          Number(key)
        );

      }

    }
  );

  window.addEventListener(
    "keyup",
    e => {

      keys[
        e.key.toLowerCase()
      ] = false;

    }
  );

  // =========================================================
  // MOUSE
  // =========================================================

  canvas.addEventListener(
    "mousemove",
    e => {

      const rect =
        canvas.getBoundingClientRect();

      mouse.x =
        (e.clientX - rect.left) * W / rect.width;

      mouse.y =
        (e.clientY - rect.top) * H / rect.height;

    }
  );

  canvas.addEventListener(
    "mousedown",
    () => {

      if (!paused) {

        mouse.down = true;

      }

    }
  );

  window.addEventListener(
    "mouseup",
    () => {

      mouse.down = false;

    }
  );

  // =========================================================
  // SWITCH WEAPON
  // =========================================================

  function switchWeapon(slot) {

    const weapon =
      WEAPON_ORDER[
        slot - 1
      ];

    if (!weapon) return;

    if (
      player.weapons[weapon].owned &&
      !player.reloading
    ) {

      player.currentWeapon =
        weapon;

      updateHUD();

    }

  }

  // =========================================================
  // RELOAD
  // =========================================================

  function reload() {

    if (
      !gameStarted ||
      paused ||
      gameOver ||
      player.reloading
    ) {

      return;

    }

    const weapon =
      WEAPONS[
        player.currentWeapon
      ];

    const data =
      player.weapons[
        player.currentWeapon
      ];

    if (
      data.ammo >=
      weapon.maxAmmo
    ) {

      return;

    }

    player.reloading =
      true;

    player.reloadTime =
      weapon.reloadTime;

    sfx.reload();

  }

  // =========================================================
  // SHOOT
  // =========================================================

  function shoot() {

    if (
      paused ||
      gameOver ||
      !gameStarted ||
      player.reloading ||
      shootCooldown > 0
    ) {

      return;

    }

    const weaponName =
      player.currentWeapon;

    const weapon =
      WEAPONS[weaponName];

    const data =
      player.weapons[
        weaponName
      ];

    if (data.ammo <= 0) {

      reload();

      return;

    }

    data.ammo--;

    shootCooldown =
      weapon.fireDelay;

    player.animRow = 2;

    player.animFrame = 0;

    player.animTimer = 0;

    sfx.shoot();

    const damageMultiplier =
      player.damageBoost > 0
        ? 2
        : 1;

    for (
      let i = 0;
      i < weapon.pellets;
      i++
    ) {

      const spread =
        (Math.random() - 0.5) *
        weapon.spread;

      const angle =
        player.angle +
        spread;

      bullets.push({

        x:
          player.x +
          Math.cos(angle) *
          20,

        y:
          player.y +
          Math.sin(angle) *
          20,

        vx:
          Math.cos(angle) *
          weapon.bulletSpeed,

        vy:
          Math.sin(angle) *
          weapon.bulletSpeed,

        life: 60,

        damage:
          weapon.damage *
          damageMultiplier,

        color:
          weapon.color

      });

    }

    for (
      let i = 0;
      i < 5;
      i++
    ) {

      particles.push({

        x:
          player.x +
          Math.cos(player.angle) *
          22,

        y:
          player.y +
          Math.sin(player.angle) *
          22,

        vx:
          (Math.random() - 0.5) * 3,

        vy:
          (Math.random() - 0.5) * 3,

        life: 15,

        size: 3,

        color: "#f0d060"

      });

    }

    if (data.ammo <= 0) {

      reload();

    }

  }

  // =========================================================
  // SPAWN ZOMBIE
  // =========================================================

  function spawnZombie() {

    const edge =
      Math.floor(
        Math.random() * 4
      );

    let x;
    let y;

    if (edge === 0) {

      x = Math.random() * W;
      y = -40;

    } else if (edge === 1) {

      x = W + 40;
      y = Math.random() * H;

    } else if (edge === 2) {

      x = Math.random() * W;
      y = H + 40;

    } else {

      x = -40;
      y = Math.random() * H;

    }

    const currentLevel =
      getLevel();

    const difficulty =
      1 +
      (currentLevel - 1) *
      0.15;

    const roll =
      Math.random();

    let type =
      "normal";

    if (
      wave >= 3 &&
      roll < 0.18
    ) {

      type = "fast";

    }

    if (
      wave >= 4 &&
      roll > 0.90
    ) {

      type = "tank";

    }

    let hp;
    let speed;
    let radius;
    let damage;

    if (type === "normal") {

      hp =
        Math.round(
          30 * difficulty
        );

      speed =
        1 +
        wave * 0.06 +
        currentLevel * 0.04;

      radius = 15;

      damage =
        8 * difficulty;

    }

    if (type === "fast") {

      hp =
        Math.round(
          18 * difficulty
        );

      speed =
        2.1 +
        wave * 0.07;

      radius = 12;

      damage =
        6 * difficulty;

    }

    if (type === "tank") {

      hp =
        Math.round(
          90 * difficulty
        );

      speed =
        0.65 +
        wave * 0.03;

      radius = 20;

      damage =
        16 * difficulty;

    }

    zombies.push({

      x,
      y,

      hp,
      maxHp: hp,

      speed,

      r: radius,

      damage,

      type,

      angle: 0,

      animFrame: 0,

      animTimer: 0,

      animRow: 1,

      hitFlash: 0,

      wobble:
        Math.random() *
        Math.PI *
        2

    });

  }

  // =========================================================
  // SPAWN PICKUP
  // =========================================================

  function spawnPickup() {

    const types = [
      "health",
      "ammo",
      "speed",
      "damage"
    ];

    if (
      !player.weapons.shotgun.owned
    ) {

      types.push(
        "weapon_shotgun"
      );

    }

    if (
      !player.weapons.smg.owned
    ) {

      types.push(
        "weapon_smg"
      );

    }

    const type =
      types[
        Math.floor(
          Math.random() *
          types.length
        )
      ];

    pickups.push({

      x:
        50 +
        Math.random() *
        (W - 100),

      y:
        50 +
        Math.random() *
        (H - 100),

      type,

      r: 14,

      life: 700,

      bob: 0

    });

  }

  // =========================================================
  // APPLY PICKUP
  // =========================================================

  function applyPickup(
    pickup
  ) {

    if (
      pickup.type ===
      "weapon_shotgun"
    ) {

      player.weapons
        .shotgun
        .owned = true;

      player.weapons
        .shotgun
        .ammo =
        WEAPONS
          .shotgun
          .maxAmmo;

      player.currentWeapon =
        "shotgun";

      sfx.pickup();

    }

    else if (
      pickup.type ===
      "weapon_smg"
    ) {

      player.weapons
        .smg
        .owned = true;

      player.weapons
        .smg
        .ammo =
        WEAPONS
          .smg
          .maxAmmo;

      player.currentWeapon =
        "smg";

      sfx.pickup();

    }

    else if (
      pickup.type ===
      "health"
    ) {

      player.hp =
        Math.min(
          player.maxHp,
          player.hp + 35
        );

      sfx.pickup();

    }

    else if (
      pickup.type ===
      "ammo"
    ) {

      for (
        const weapon of
        WEAPON_ORDER
      ) {

        if (
          player.weapons[
            weapon
          ].owned
        ) {

          player.weapons[
            weapon
          ].ammo =
            WEAPONS[
              weapon
            ].maxAmmo;

        }

      }

      sfx.pickup();

    }

    else if (
      pickup.type ===
      "speed"
    ) {

      player.speedBoost =
        400;

      sfx.pickup();

    }

    else if (
      pickup.type ===
      "damage"
    ) {

      player.damageBoost =
        400;

      sfx.pickup();

    }

    updateHUD();

  }

  // =========================================================
  // PLAYER DAMAGE
  // =========================================================

  function damagePlayer(
    amount
  ) {

    if (
      player.invuln > 0 ||
      player.shield > 0
    ) {

      return;

    }

    player.hp -= amount;

    player.invuln = 30;

    sfx.hurt();

    if (
      player.hp <= 0
    ) {

      player.hp = 0;

      endGame();

    }

  }

  // =========================================================
  // UPDATE PLAYER
  // =========================================================

  function updatePlayer() {

    let dx = 0;
    let dy = 0;

    if (
      keys["w"] ||
      keys["arrowup"]
    ) {

      dy--;

    }

    if (
      keys["s"] ||
      keys["arrowdown"]
    ) {

      dy++;

    }

    if (
      keys["a"] ||
      keys["arrowleft"]
    ) {

      dx--;

    }

    if (
      keys["d"] ||
      keys["arrowright"]
    ) {

      dx++;

    }

    const length =
      Math.hypot(dx, dy);

    let speed =
      player.speed;

    if (
      player.speedBoost > 0
    ) {

      speed *= 1.6;

    }

    if (length > 0) {

      player.x +=
        (dx / length) *
        speed;

      player.y +=
        (dy / length) *
        speed;

      player.animRow = 1;

    } else {

      player.animRow = 0;

    }

    player.x =
      Math.max(
        player.r,
        Math.min(
          W - player.r,
          player.x
        )
      );

    player.y =
      Math.max(
        player.r,
        Math.min(
          H - player.r,
          player.y
        )
      );

    player.angle =
      Math.atan2(
        mouse.y - player.y,
        mouse.x - player.x
      );

    player.animTimer++;

    if (
      player.animTimer >= 6
    ) {

      player.animTimer = 0;

      player.animFrame++;

      if (
        player.animFrame >=
        SPRITE_FRAMES
      ) {

        player.animFrame = 0;

      }

    }

  }

  // =========================================================
  // UPDATE ZOMBIES
  // =========================================================

  function updateZombies() {

    for (
      let i = zombies.length - 1;
      i >= 0;
      i--
    ) {

      const zombie =
        zombies[i];

      const angle =
        Math.atan2(
          player.y - zombie.y,
          player.x - zombie.x
        );

      zombie.angle =
        angle;

      zombie.wobble +=
        0.15;

      const wobble =
        Math.sin(
          zombie.wobble
        ) * 0.12;

      zombie.x +=
        Math.cos(
          angle + wobble
        ) *
        zombie.speed;

      zombie.y +=
        Math.sin(
          angle + wobble
        ) *
        zombie.speed;

      const distance =
        Math.hypot(
          player.x -
          zombie.x,

          player.y -
          zombie.y
        );

      if (
        distance <
        player.r +
        zombie.r +
        8
      ) {

        zombie.animRow = 2;

        damagePlayer(
          zombie.damage *
          0.15
        );

      } else {

        zombie.animRow = 1;

      }

      zombie.animTimer++;

      if (
        zombie.animTimer >= 7
      ) {

        zombie.animTimer = 0;

        zombie.animFrame++;

        if (
          zombie.animFrame >=
          SPRITE_FRAMES
        ) {

          zombie.animFrame = 0;

        }

      }

      if (
        zombie.hitFlash > 0
      ) {

        zombie.hitFlash--;

      }

    }

  }

  // =========================================================
  // UPDATE BULLETS
  // =========================================================

  function updateBullets() {

    for (
      let i = bullets.length - 1;
      i >= 0;
      i--
    ) {

      const bullet =
        bullets[i];

      bullet.x +=
        bullet.vx;

      bullet.y +=
        bullet.vy;

      bullet.life--;

      if (
        bullet.life <= 0 ||
        bullet.x < 0 ||
        bullet.x > W ||
        bullet.y < 0 ||
        bullet.y > H
      ) {

        bullets.splice(
          i,
          1
        );

        continue;

      }

      let hit = false;

      for (
        let j = zombies.length - 1;
        j >= 0;
        j--
      ) {

        const zombie =
          zombies[j];

        const distance =
          Math.hypot(
            bullet.x -
            zombie.x,

            bullet.y -
            zombie.y
          );

        if (
          distance <
          zombie.r
        ) {

          zombie.hp -=
            bullet.damage;

          zombie.hitFlash =
            6;

          sfx.hit();

          bullets.splice(
            i,
            1
          );

          hit = true;

          for (
            let k = 0;
            k < 4;
            k++
          ) {

            particles.push({

              x: bullet.x,

              y: bullet.y,

              vx:
                (Math.random() -
                0.5) * 4,

              vy:
                (Math.random() -
                0.5) * 4,

              life: 18,

              size: 3,

              color:
                "#c94b4b"

            });

          }

          if (
            zombie.hp <= 0
          ) {

            let points = 10;

            if (
              zombie.type ===
              "fast"
            ) {

              points = 15;

            }

            if (
              zombie.type ===
              "tank"
            ) {

              points = 30;

            }

            score += points;

            floaters.push({

              text:
                "+" + points,

              x:
                zombie.x,

              y:
                zombie.y,

              life: 40

            });

            sfx.death();

            zombies.splice(
              j,
              1
            );

          }

          break;

        }

      }

      if (hit) continue;

    }

  }

  // =========================================================
  // UPDATE PICKUPS
  // =========================================================

  function updatePickups() {

    pickupSpawnTimer--;

    if (
      pickupSpawnTimer <= 0 &&
      pickups.length < 3
    ) {

      spawnPickup();

      pickupSpawnTimer =
        400 +
        Math.random() *
        200;

    }

    for (
      let i = pickups.length - 1;
      i >= 0;
      i--
    ) {

      const pickup =
        pickups[i];

      pickup.life--;

      pickup.bob += 0.08;

      if (
        pickup.life <= 0
      ) {

        pickups.splice(
          i,
          1
        );

        continue;

      }

      const distance =
        Math.hypot(
          player.x -
          pickup.x,

          player.y -
          pickup.y
        );

      if (
        distance <
        player.r +
        pickup.r
      ) {

        applyPickup(
          pickup
        );

        pickups.splice(
          i,
          1
        );

      }

    }

  }

  // =========================================================
  // UPDATE PARTICLES
  // =========================================================

  function updateParticles() {

    for (
      let i = particles.length - 1;
      i >= 0;
      i--
    ) {

      const p =
        particles[i];

      p.x += p.vx;

      p.y += p.vy;

      p.vx *= 0.9;

      p.vy *= 0.9;

      p.life--;

      if (
        p.life <= 0
      ) {

        particles.splice(
          i,
          1
        );

      }

    }

  }

  // =========================================================
  // UPDATE FLOATERS
  // =========================================================

  function updateFloaters() {

    for (
      let i = floaters.length - 1;
      i >= 0;
      i--
    ) {

      const f =
        floaters[i];

      f.y -= 0.6;

      f.life--;

      if (
        f.life <= 0
      ) {

        floaters.splice(
          i,
          1
        );

      }

    }

  }

  // =========================================================
  // WAVE SYSTEM
  // =========================================================

  function updateWave() {

    if (
      spawnLeft > 0
    ) {

      spawnTimer--;

      if (
        spawnTimer <= 0
      ) {

        spawnZombie();

        spawnLeft--;

        spawnTimer =
          Math.max(
            15,
            45 - wave * 2
          );

      }

    }

    else if (
      zombies.length === 0
    ) {

      if (wave % 3 === 0) { completeLevel(); return; }
      wave++;

      zombiesPerWave =
        Math.round(
          zombiesPerWave *
          1.25 +
          1
        );

      spawnLeft =
        zombiesPerWave;

      spawnTimer = 30;

      player.hp =
        Math.min(
          player.maxHp,
          player.hp + 15
        );

      showWaveBanner();

    }

  }

  // =========================================================
  // UPDATE
  // =========================================================

  function update() {

    if (
      !running ||
      paused ||
      gameOver
    ) {

      return;

    }

    if (
      player.speedBoost > 0
    ) {

      player.speedBoost--;

    }

    if (
      player.damageBoost > 0
    ) {

      player.damageBoost--;

    }

    if (
      player.shield > 0
    ) {

      player.shield--;

    }

    if (
      player.invuln > 0
    ) {

      player.invuln--;

    }

    if (
      shootCooldown > 0
    ) {

      shootCooldown--;

    }

    if (
      player.reloading
    ) {

      player.reloadTime--;

      if (
        player.reloadTime <= 0
      ) {

        player.reloading =
          false;

        player.weapons[
          player.currentWeapon
        ].ammo =
          WEAPONS[
            player.currentWeapon
          ].maxAmmo;

      }

    }

    updatePlayer();

    if (mouse.down) {

      shoot();

    }

    updateWave();

    updateBullets();

    updateZombies();

    updatePickups();

    updateParticles();

    updateFloaters();

    updateHUD();

  }

  // =========================================================
  // DRAW PLAYER
  // =========================================================

  function drawPlayer() {

    ctx.save();

    ctx.translate(
      player.x,
      player.y
    );

    if (
      player.invuln > 0 &&
      Math.floor(
        player.invuln / 4
      ) % 2 === 0
    ) {

      ctx.globalAlpha = 0.45;

    }

    const image =
      SPRITES.player;

    if (
      image &&
      image.complete &&
      image.naturalWidth
    ) {

      const direction =
        directionFromAngle(
          player.angle
        );

      const sx =
        direction *
        SPRITE_FRAME_W;

      const sy =
        player.animRow *
        SPRITE_FRAME_H;

      ctx.drawImage(

        image,

        sx,
        sy,

        SPRITE_FRAME_W,
        SPRITE_FRAME_H,

        -41,
        -41,

        82,
        82

      );

    }

    ctx.restore();

  }

  // =========================================================
  // DRAW ZOMBIE
  // =========================================================

  function drawZombie(
    zombie
  ) {

    ctx.save();

    ctx.translate(
      zombie.x,
      zombie.y
    );

    const direction =
      directionFromAngle(
        zombie.angle
      );

    if (
      zombie.hitFlash > 0
    ) {

      ctx.filter =
        "brightness(2)";

    }

    const image =
      SPRITES.zombie;

    if (
      image &&
      image.complete &&
      image.naturalWidth
    ) {

      const sx =
        direction *
        SPRITE_FRAME_W;

      const sy =
        zombie.animRow *
        SPRITE_FRAME_H;

      let size =
        zombie.r * 4;

      if (size < 60) {
        size = 60;
      }

      ctx.drawImage(

        image,

        sx,
        sy,

        SPRITE_FRAME_W,
        SPRITE_FRAME_H,

        -size / 2,
        -size / 2,

        size,
        size

      );

    }

    ctx.restore();

    // HP BAR

    if (
      zombie.hp <
      zombie.maxHp
    ) {

      const width =
        zombie.r * 2.5;

      ctx.fillStyle =
        "#250000";

      ctx.fillRect(

        zombie.x -
        width / 2,

        zombie.y -
        zombie.r -
        10,

        width,

        4

      );

      ctx.fillStyle =
        "#7fbf3f";

      ctx.fillRect(

        zombie.x -
        width / 2,

        zombie.y -
        zombie.r -
        10,

        width *
        (
          zombie.hp /
          zombie.maxHp
        ),

        4

      );

    }

  }

  // =========================================================
  // DRAW PICKUP
  // =========================================================

  function drawPickup(
    pickup
  ) {

    const colors = {

      health: "#7fbf3f",

      ammo: "#e0d090",

      speed: "#5ad0ff",

      damage: "#ff6a6a",

      weapon_shotgun:
        "#ff9a4a",

      weapon_smg:
        "#9adfff"

    };

    const y =
      pickup.y +
      Math.sin(
        pickup.bob
      ) * 4;

    ctx.save();

    ctx.beginPath();

    ctx.arc(
      pickup.x,
      y,
      pickup.r,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      colors[
        pickup.type
      ];

    ctx.fill();

    ctx.strokeStyle =
      "#ffffff";

    ctx.stroke();

    ctx.fillStyle =
      "#111";

    ctx.font =
      "bold 12px Arial";

    ctx.textAlign =
      "center";

    let text = "?";

    if (
      pickup.type ===
      "health"
    ) text = "+";

    if (
      pickup.type ===
      "ammo"
    ) text = "A";

    if (
      pickup.type ===
      "speed"
    ) text = "S";

    if (
      pickup.type ===
      "damage"
    ) text = "D";

    if (
      pickup.type ===
      "weapon_shotgun"
    ) text = "SG";

    if (
      pickup.type ===
      "weapon_smg"
    ) text = "SMG";

    ctx.fillText(
      text,
      pickup.x,
      y + 4
    );

    ctx.restore();

  }

  // =========================================================
  // DRAW MINIMAP
  // =========================================================

  function drawMinimap() {

    mmCtx.clearRect(
      0,
      0,
      MM,
      MM
    );

    mmCtx.fillStyle =
      "rgba(0,0,0,.45)";

    mmCtx.fillRect(
      0,
      0,
      MM,
      MM
    );

    const sx =
      MM / W;

    const sy =
      MM / H;

    for (
      const zombie of zombies
    ) {

      mmCtx.fillStyle =
        "#7fbf5f";

      mmCtx.beginPath();

      mmCtx.arc(

        zombie.x * sx,

        zombie.y * sy,

        2,

        0,

        Math.PI * 2

      );

      mmCtx.fill();

    }

    mmCtx.fillStyle =
      "#4aa3ff";

    mmCtx.beginPath();

    mmCtx.arc(

      player.x * sx,

      player.y * sy,

      4,

      0,

      Math.PI * 2

    );

    mmCtx.fill();

  }

  // =========================================================
  // DRAW
  // =========================================================

  function draw() {

    ctx.clearRect(
      0,
      0,
      W,
      H
    );

    ctx.drawImage(groundCanvas, 0, 0);

    // Pickups

    for (
      const pickup of pickups
    ) {

      drawPickup(
        pickup
      );

    }

    // Zombies

    for (
      const zombie of zombies
    ) {

      drawZombie(
        zombie
      );

    }

    // Bullets

    for (
      const bullet of bullets
    ) {

      ctx.fillStyle =
        bullet.color;

      ctx.beginPath();

      ctx.arc(

        bullet.x,

        bullet.y,

        3,

        0,

        Math.PI * 2

      );

      ctx.fill();

    }

    // Player

    drawPlayer();

    // Particles

    for (
      const particle of particles
    ) {

      ctx.globalAlpha =
        Math.max(
          0,
          particle.life / 20
        );

      ctx.fillStyle =
        particle.color;

      ctx.beginPath();

      ctx.arc(

        particle.x,

        particle.y,

        particle.size,

        0,

        Math.PI * 2

      );

      ctx.fill();

    }

    ctx.globalAlpha = 1;

    // Floaters

    ctx.textAlign =
      "center";

    ctx.font =
      "bold 14px Courier New";

    for (
      const floater of floaters
    ) {

      ctx.globalAlpha =
        floater.life / 40;

      ctx.fillStyle =
        "#e0d090";

      ctx.fillText(

        floater.text,

        floater.x,

        floater.y

      );

    }

    ctx.globalAlpha = 1;

    drawMinimap();

  }

  // =========================================================
  // HUD
  // =========================================================

  function updateHUD() {

    if (!player) return;

    if (scoreVal) {

      scoreVal.textContent =
        score;

    }

    if (waveVal) {

      waveVal.textContent = selectedLevel + " / " + ((wave - 1) % 3 + 1) + " of 3";

    }

    if (zombieCount) {

      zombieCount.textContent =
        zombies.length +
        spawnLeft;

    }

    if (healthBarFill) {

      healthBarFill.style.width =
        Math.max(
          0,
          player.hp /
          player.maxHp *
          100
        ) + "%";

    }

    const weapon =
      WEAPONS[
        player.currentWeapon
      ];

    const weaponData =
      player.weapons[
        player.currentWeapon
      ];

    if (ammoVal) {

      ammoVal.textContent =
        player.reloading
          ? "..."
          : weaponData.ammo;

    }

    if (ammoMaxVal) {

      ammoMaxVal.textContent =
        weapon.maxAmmo;

    }

    if (weaponRow) {

      weaponRow.innerHTML =
        WEAPON_ORDER
          .map(
            (name, index) => {

              if (
                !player
                  .weapons[
                    name
                  ].owned
              ) {

                return "";

              }

              const active =
                player.currentWeapon ===
                name
                  ? "active"
                  : "";

              return `
                <span class="wpn ${active}">
                  ${index + 1}:${WEAPONS[name].name}
                </span>
              `;

            }
          )
          .join("");

    }

    if (buffRow) {

      const buffs = [];

      if (
        player.speedBoost > 0
      ) {

        buffs.push(
          "SPEED"
        );

      }

      if (
        player.damageBoost > 0
      ) {

        buffs.push(
          "DAMAGE x2"
        );

      }

      buffRow.textContent =
        buffs.join(" · ");

    }

  }

  // =========================================================
  // GAME OVER
  // =========================================================

  function endGame() {

    running = false;

    gameOver = true;

    gameStarted = false;

    paused = false;

    mouse.down = false;

    overlay.style.display =
      "flex";

    startScreen.style.display =
      "block";

    startScreen.innerHTML = `

      <h1 style="
        color:#c94b4b;
        font-family:Courier New;
      ">
        YOU DIED
      </h1>

      <p>
        FINAL SCORE:
        ${score}
      </p>

      <p>
        LEVEL:
        ${getLevel()}
      </p>

      <p>
        WAVE:
        ${wave}
      </p>

      <button id="restartBtn">
        TRY AGAIN
      </button>

    `;

    document
      .getElementById(
        "restartBtn"
      )
      .addEventListener(
        "click",
        () => {

          showLevelSelect();

        }
      );

  }

  // =========================================================
  // GAME LOOP
  // =========================================================

  function gameLoop() {

    update();

    draw();

    if (running) {

      animationFrameId =
        requestAnimationFrame(
          gameLoop
        );

    }

  }

  function startLoop() {

    if (
      animationFrameId
    ) {

      cancelAnimationFrame(
        animationFrameId
      );

      animationFrameId =
        null;

    }

    gameLoop();

  }

  // =========================================================
  // START GAME BUTTON
  // =========================================================

  startBtn.addEventListener(
    "click",
    () => {

      ensureAudio();

      overlay.style.display =
        "flex";

      startScreen.style.display =
        "none";

      showLevelSelect();

    }
  );

  // =========================================================
  // INITIAL STATE
  // =========================================================

  running = false;

  gameStarted = false;

  paused = false;

  gameOver = false;

  // Cache the scenery so detailed ground is painted only when the arena resizes.
  const groundCanvas = document.createElement("canvas");
  function buildGround() {
    groundCanvas.width = W; groundCanvas.height = H;
    const g = groundCanvas.getContext("2d");
    let seed = 7331;
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.fillStyle = "#26392c"; g.fillRect(0, 0, W, H);
    for (let i=0; i<W*H/170; i++) {
      g.fillStyle = ["#344735", "#1c3027", "#42503a", "#293c2a"][i%4];
      g.fillRect(rand()*W, rand()*H, 1+rand()*4, 1+rand()*7);
    }
    const roadX = W*.27, roadW = W*.46;
    g.fillStyle = "#596054"; g.fillRect(roadX-13,0,roadW+26,H);
    g.fillStyle = "#303837"; g.fillRect(roadX,0,roadW,H);
    for (let i=0; i<W*H/240; i++) {
      g.fillStyle = i%2 ? "#424947" : "#252e2c";
      g.fillRect(roadX+rand()*roadW,rand()*H,rand()*3+1,rand()*2+1);
    }
    g.strokeStyle="#bca85b"; g.lineWidth=3; g.setLineDash([28,32]);
    g.beginPath(); g.moveTo(W/2-4,0); g.lineTo(W/2-4,H); g.stroke();
    g.beginPath(); g.moveTo(W/2+4,0); g.lineTo(W/2+4,H); g.stroke(); g.setLineDash([]);
    g.strokeStyle="#929784"; g.lineWidth=2;
    for (const x of [roadX+10,roadX+roadW-10]) { g.beginPath(); g.moveTo(x,0); g.lineTo(x,H); g.stroke(); }
    // Cracks, faded crossing stripes, and drainage covers are ground details.
    g.globalAlpha=.2; g.fillStyle="#d5d2b3";
    for (let x=roadX+25;x<roadX+roadW-25;x+=30) g.fillRect(x,H*.72,16,55);
    g.globalAlpha=1;
    for (let i=0;i<45;i++) {
      let x=rand()*W,y=rand()*H; g.strokeStyle="#121f1c";g.lineWidth=1;g.beginPath();g.moveTo(x,y);
      for(let j=0;j<5;j++){x+=rand()*24-12;y+=rand()*19;g.lineTo(x,y);}g.stroke();
    }
    for(const x of [roadX-10,roadX+roadW+2]) for(let y=70;y<H;y+=190){
      g.fillStyle="#17211f";g.fillRect(x,y,8,30);g.fillStyle="#6a7261";
      for(let j=3;j<28;j+=5)g.fillRect(x+1,y+j,6,1);
    }
    const shade=g.createRadialGradient(W/2,H/2,H*.15,W/2,H/2,Math.max(W,H)*.65);
    shade.addColorStop(0,"#07110a00");shade.addColorStop(1,"#07110a99");g.fillStyle=shade;g.fillRect(0,0,W,H);
  }
  function resizeArena() {
    const rect=canvas.getBoundingClientRect();
    W=canvas.width=Math.max(320,Math.round(rect.width));
    H=canvas.height=Math.max(320,Math.round(rect.height));
    if(player){player.x=Math.max(20,Math.min(W-20,player.x));player.y=Math.max(20,Math.min(H-20,player.y));}
    buildGround();
    if(player) draw(); else ctx.drawImage(groundCanvas,0,0);
  }
  const fullscreenBtn=document.getElementById("fullscreenBtn");
  fullscreenBtn.addEventListener("click", async () => {
    try {
      if(document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch (_) { fullscreenBtn.textContent="USE BROWSER FULLSCREEN"; }
  });
  document.addEventListener("fullscreenchange",()=>{fullscreenBtn.textContent=document.fullscreenElement ? "EXIT FULLSCREEN" : "FULLSCREEN";});
  window.addEventListener("resize",resizeArena);
  window.addEventListener("blur",()=>{keys={};mouse.down=false;if(gameStarted)pauseGame();});
  resizeArena();

})();
