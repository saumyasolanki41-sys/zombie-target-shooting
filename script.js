(() => {
  "use strict";

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


  let keys = {};

  let mouse = {
    x: W / 2,
    y: H / 2,
    down: false
  };

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

 

  const SPRITE_FRAME_W = 128;
  const SPRITE_FRAME_H = 128;
  const SPRITE_FRAMES = 4;

  const SPRITES = {};

  function loadSprites() {
    SPRITES.player = new Image();
    SPRITES.player.src = "player_sheet.png";

    SPRITES.zombie = new Image();
    SPRITES.zombie.src = "zombie_sheet.png";
  }

  loadSprites();

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

  function startSelectedLevel() {
    if (selectedLevel > unlockedLevel) return;

    ensureAudio();

    resetGame();

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

  let keys = {};
  let mouse = {
    x: W / 2,
    y: H / 2,
    down: false
  };

  /* =========================
     CONTROLS
  ========================= */

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();

    keys[k] = true;

    if (k === 'r') reload();

    if (k === ' ') {
      shoot();
      e.preventDefault();
    }

    if (k === '1' || k === '2' || k === '3') {
      switchWeaponBySlot(parseInt(k, 10));
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();

    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });

  canvas.addEventListener('mousedown', () => {
    mouse.down = true;
  });

  canvas.addEventListener('mouseup', () => {
    mouse.down = false;
  });

  /* =========================
     IMAGE / SPRITE HELPERS
  ========================= */

  function svgToImage(svg, w, h) {
    const img = new Image();

    img.src =
      'data:image/svg+xml;charset=utf-8,' +
      encodeURIComponent(svg);

    img.width = w;
    img.height = h;

    return img;
  }

    // Pickups

  function buildSprites() {

    SPRITES.player = new Image();
    SPRITES.player.src = 'Soldier.jpeg';

    SPRITES.zombie_normal = new Image();
    SPRITES.zombie_normal.src = 'Zombie.jpeg';

    SPRITES.zombie_fast = SPRITES.zombie_normal;
    SPRITES.zombie_tank = SPRITES.zombie_normal;

    const iconWrap = inner =>
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${inner}</svg>`;

    /* SHOTGUN ICON */

    SPRITES.icon_weapon_shotgun = svgToImage(
      iconWrap(`
        <rect x="4" y="14" width="22" height="4" rx="1.5" fill="#2a2a2a"/>
        <rect x="4" y="19" width="22" height="4" rx="1.5" fill="#2a2a2a"/>
        <rect x="22" y="13" width="6" height="12" rx="2" fill="#6b4a2a"/>
      `),
      32,
      32
    );

    /* SMG ICON */

    SPRITES.icon_weapon_smg = svgToImage(
      iconWrap(`
        <rect x="6" y="15" width="18" height="4" rx="1.5" fill="#2a2a2a"/>
        <rect x="10" y="19" width="5" height="8" fill="#2a2a2a"/>
        <rect x="20" y="10" width="4" height="6" fill="#2a2a2a"/>
      `),
      32,
      32
    );

    /* HEALTH ICON */

    SPRITES.icon_health = svgToImage(
      iconWrap(`
        <rect x="13" y="6" width="6" height="20" rx="2" fill="#fff"/>
        <rect x="6" y="13" width="20" height="6" rx="2" fill="#fff"/>
      `),
      32,
      32
    );

    /* AMMO ICON */

    SPRITES.icon_ammo = svgToImage(
      iconWrap(`
        <rect x="13" y="4" width="6" height="14" rx="2" fill="#e0d090"/>
        <rect x="12" y="17" width="8" height="10" rx="1.5" fill="#8a7440"/>
      `),
      32,
      32
    );

    /* SPEED ICON */

    SPRITES.icon_speed = svgToImage(
      iconWrap(`
        <path d="M17 3 L8 18 H14 L12 29 L24 13 H17 Z" fill="#fff"/>
      `),
      32,
      32
    );

    /* DAMAGE ICON */

    SPRITES.icon_damage = svgToImage(
      iconWrap(`
        <path d="M16 3 L20 13 L30 14 L22 21 L25 31 L16 25 L7 31 L10 21 L2 14 L12 13 Z" fill="#fff"/>
      `),
      32,
      32
    );

    /* =========================
       GROUND TILE
    ========================= */

    const tile = document.createElement('canvas');

    tile.width = 128;
    tile.height = 128;

    const tctx = tile.getContext('2d');

    tctx.fillStyle = '#3a3a38';
    tctx.fillRect(0, 0, 128, 128);

    for (let i = 0; i < 260; i++) {

      const x = Math.random() * 128;
      const y = Math.random() * 128;

      tctx.fillStyle =
        Math.random() < 0.5
          ? 'rgba(60,60,58,0.5)'
          : 'rgba(20,20,20,0.5)';

      const s = 1 + Math.random() * 2.5;

      tctx.fillRect(x, y, s, s);
    }

    for (let i = 0; i < 8; i++) {

      tctx.strokeStyle = 'rgba(10,10,10,0.5)';
      tctx.lineWidth = 1;

      tctx.beginPath();

      let x = Math.random() * 128;
      let y = Math.random() * 128;

      tctx.moveTo(x, y);

      for (let j = 0; j < 4; j++) {

        x += (Math.random() - 0.5) * 30;
        y += (Math.random() - 0.5) * 30;

        tctx.lineTo(x, y);
      }

      tctx.stroke();
    }

    tctx.strokeStyle = 'rgba(0,0,0,0.25)';
    tctx.lineWidth = 2;

    tctx.strokeRect(0, 0, 128, 128);

    tctx.beginPath();

    tctx.moveTo(64, 0);
    tctx.lineTo(64, 128);

    tctx.moveTo(0, 64);
    tctx.lineTo(128, 64);

    tctx.stroke();

    for (let i = 0; i < 4; i++) {

      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const r = 6 + Math.random() * 14;

      tctx.fillStyle = 'rgba(15,15,15,0.15)';

      tctx.beginPath();
      tctx.arc(x, y, r, 0, Math.PI * 2);
      tctx.fill();
    }

    SPRITES.groundTile = tile;
  }

  buildSprites();

  /* =========================
     IMAGE LOADING
  ========================= */

  startBtn.disabled = true;
  startBtn.textContent = 'LOADING...';

  const uniqueImages = [
    ...new Set(
      Object.values(SPRITES).filter(
        v => v instanceof Image
      )
    )
  ];

  Promise.all(
    uniqueImages.map(img =>
      img.complete
        ? Promise.resolve()
        : new Promise(resolve => {
            img.onload = resolve;
            img.onerror = resolve;
          })
    )
  ).then(() => {

    startBtn.disabled = false;
    startBtn.textContent = 'START GAME';

  });

  /* =========================
     AUDIO
  ========================= */

  let actx = null;

  function ensureAudio() {

    if (!actx) {

      try {

        actx = new (
          window.AudioContext ||
          window.webkitAudioContext
        )();

      } catch (e) {

        actx = null;
      }
    }
  }

  function tone(
    freq,
    dur,
    type = 'sine',
    vol = 0.2,
    startDelay = 0,
    slideTo = null
  ) {

    if (!actx) return;

    const t0 =
      actx.currentTime + startDelay;

    const osc = actx.createOscillator();
    const gain = actx.createGain();

    osc.type = type;

    osc.frequency.setValueAtTime(
      freq,
      t0
    );

    if (slideTo) {

      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, slideTo),
        t0 + dur
      );
    }

    gain.gain.setValueAtTime(
      vol,
      t0
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t0 + dur
    );

    osc.connect(gain);
    gain.connect(actx.destination);

    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noiseBurst(
    dur,
    vol = 0.2,
    startDelay = 0
  ) {

    if (!actx) return;

    const t0 =
      actx.currentTime + startDelay;

    const bufferSize =
      actx.sampleRate * dur;

    const buffer =
      actx.createBuffer(
        1,
        bufferSize,
        actx.sampleRate
      );

    const data =
      buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {

      data[i] =
        (Math.random() * 2 - 1) *
        (1 - i / bufferSize);
    }

    const src =
      actx.createBufferSource();

    src.buffer = buffer;

    const gain =
      actx.createGain();

    gain.gain.setValueAtTime(
      vol,
      t0
    );

    gain.gain.exponentialRampToValueAtTime(
      0.001,
      t0 + dur
    );

    src.connect(gain);
    gain.connect(actx.destination);

    src.start(t0);
  }

  const sfx = {

    shoot: w => {

      if (w === 'shotgun') {

        noiseBurst(0.18, 0.3);
        tone(
          140,
          0.12,
          'square',
          0.15
        );

      } else if (w === 'smg') {

        tone(
          320,
          0.05,
          'square',
          0.12
        );

      } else {

        tone(
          420,
          0.06,
          'square',
          0.15
        );
      }
    },

    hit: () =>
      tone(
        180,
        0.06,
        'triangle',
        0.12,
        0,
        100
      ),

    zombieDeath: () =>
      tone(
        220,
        0.25,
        'sawtooth',
        0.15,
        0,
        60
      ),

    reload: () => {

      tone(
        500,
        0.05,
        'square',
        0.08,
        0
      );

      tone(
        650,
        0.05,
        'square',
        0.08,
        0.12
      );
    },

    pickupWeapon: () => {

      tone(
        500,
        0.08,
        'sine',
        0.15,
        0
      );

      tone(
        750,
        0.08,
        'sine',
        0.15,
        0.08
      );

      tone(
        1000,
        0.1,
        'sine',
        0.15,
        0.16
      );
    },

    pickupBuff: () => {

      tone(
        600,
        0.08,
        'sine',
        0.12,
        0
      );

      tone(
        900,
        0.1,
        'sine',
        0.12,
        0.09
      );
    },

    hurt: () =>
      tone(
        120,
        0.15,
        'sawtooth',
        0.18,
        0,
        50
      ),

    waveStart: () => {

      tone(
        200,
        0.3,
        'triangle',
        0.15,
        0
      );

      tone(
        260,
        0.3,
        'triangle',
        0.15,
        0.12
      );

      tone(
        320,
        0.4,
        'triangle',
        0.15,
        0.24
      );
    },

    empty: () =>
      tone(
        150,
        0.05,
        'square',
        0.08
      )
  };

  /* =========================
     WEAPONS
  ========================= */

  const WEAPONS = {

    pistol: {
      key: 'pistol',
      name: 'Pistol',
      fireDelay: 9,
      dmg: 12,
      spread: 0.05,
      pellets: 1,
      maxAmmo: 12,
      reloadTime: 55,
      bulletSpeed: 11,
      color: '#ffe27a'
    },

    shotgun: {
      key: 'shotgun',
      name: 'Shotgun',
      fireDelay: 34,
      dmg: 9,
      spread: 0.38,
      pellets: 5,
      maxAmmo: 6,
      reloadTime: 75,
      bulletSpeed: 10,
      color: '#ff9a4a'
    },

    smg: {
      key: 'smg',
      name: 'SMG',
      fireDelay: 5,
      dmg: 7,
      spread: 0.14,
      pellets: 1,
      maxAmmo: 30,
      reloadTime: 65,
      bulletSpeed: 12,
      color: '#9adfff'
    }

  };

  const WEAPON_ORDER = [
    'pistol',
    'shotgun',
    'smg'
  ];

  /* =========================
     GAME VARIABLES
  ========================= */

  let player;
  let bullets;
  let zombies;
  let particles;
  let floaters;
  let pickups;

  let score;
  let wave;
  let spawnLeft;
  let spawnTimer;
  let running;
  let gameOver;

  let shootCooldown = 0;
  let zombiesPerWave;
  let pickupSpawnTimer;

  /* =========================
     RESET GAME
  ========================= */

  function resetGame() {

    player = {

      x: W / 2,
      y: H / 2,
      r: 14,

      baseSpeed: 3.2,

      hp: 100,
      maxHp: 100,

      angle: 0,
      invuln: 0,

      weapons: {

        pistol: {
          owned: true,
          ammo: 12
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

      currentWeapon: 'pistol',

      reloading: false,
      reloadTime: 0,

      speedBoost: 0,
      damageBoost: 0,
      shield: 0
    };

    bullets = [];
    zombies = [];
    particles = [];
    floaters = [];
    pickups = [];

    score = 0;

    wave = 1;

    zombiesPerWave = 6;

    spawnLeft = zombiesPerWave;

    spawnTimer = 0;

    pickupSpawnTimer = 240;

    shootCooldown = 0;

    running = true;
    gameOver = false;

    updateHUD();

    showWaveBanner();
  }

  /* =========================
     WAVE BANNER
  ========================= */

  function showWaveBanner() {

    waveBanner.textContent =
      `WAVE ${wave}`;

    waveBanner.style.opacity = '1';

    sfx.waveStart();

    setTimeout(() => {

      waveBanner.style.opacity = '0';

    }, 1200);
  }

  /* =========================
     SPAWN ZOMBIE
  ========================= */

  function spawnZombie() {

    const edge =
      Math.floor(Math.random() * 4);

    let x;
    let y;

    if (edge === 0) {

      x = Math.random() * W;
      y = -30;

    } else if (edge === 1) {

      x = W + 30;
      y = Math.random() * H;

    } else if (edge === 2) {

      x = Math.random() * W;
      y = H + 30;

    } else {

      x = -30;
      y = Math.random() * H;
    }

    const typeRoll =
      Math.random();

    let type = 'normal';

    if (
      wave >= 3 &&
      typeRoll < 0.15
    ) {
      type = 'fast';
    }

    if (
      wave >= 4 &&
      typeRoll > 0.92
    ) {
      type = 'tank';
    }

    let hp = 30;
    let speed = 1.0 + wave * 0.08;
    let r = 13;
    let color = '#5a8f4a';
    let dmg = 10;

    if (type === 'fast') {

      hp = 18;
      speed = 2.2 + wave * 0.08;
      r = 11;
      color = '#a3854a';
      dmg = 7;
    }

    if (type === 'tank') {

      hp = 90;
      speed = 0.7 + wave * 0.05;
      r = 18;
      color = '#4a5a6f';
      dmg = 18;
    }

    zombies.push({

      x,
      y,

      hp,
      maxHp: hp,

      speed,
      r,

      color,
      dmg,
      type,

      wobble:
        Math.random() * Math.PI * 2,

      hitFlash: 0
    });
  }

  /* =========================
     PICKUP POSITION
  ========================= */

  function randomPickupSpot() {

    let x;
    let y;
    let tries = 0;

    do {

      x =
        40 +
        Math.random() * (W - 80);

      y =
        40 +
        Math.random() * (H - 80);

      tries++;

    } while (
      Math.hypot(
        x - player.x,
        y - player.y
      ) < 120 &&
      tries < 20
    );

    return {
      x,
      y
    };
  }

  /* =========================
     SPAWN PICKUP
  ========================= */

  function spawnPickup() {

    const { x, y } =
      randomPickupSpot();

    const roll =
      Math.random();

    let type;

    if (
      roll < 0.22 &&
      !player.weapons.shotgun.owned
    ) {

      type = 'weapon_shotgun';

    } else if (
      roll < 0.44 &&
      !player.weapons.smg.owned
    ) {

      type = 'weapon_smg';

    } else if (roll < 0.60) {

      type = 'health';

    } else if (roll < 0.76) {

      type = 'ammo';

    } else if (roll < 0.88) {

      type = 'speed';

    } else {

      type = 'damage';
    }

    pickups.push({

      x,
      y,

      type,

      r: 12,

      life: 600,

      bob:
        Math.random() *
        Math.PI *
        2
    });
  }

  /* =========================
     SWITCH WEAPON
  ========================= */

  function switchWeaponBySlot(slot) {

    const key =
      WEAPON_ORDER[slot - 1];

    if (
      key &&
      player.weapons[key].owned &&
      player.currentWeapon !== key &&
      !player.reloading
    ) {

      player.currentWeapon = key;

      updateHUD();
    }

  /* =========================
     RELOAD
  ========================= */

  function reload() {

    if (
      gameOver ||
      player.reloading
    ) {
      return;
    }

    const w =
      WEAPONS[player.currentWeapon];

    const pw =
      player.weapons[player.currentWeapon];

    if (
      pw.ammo === w.maxAmmo
    ) {
      return;
    }

    player.reloading = true;

    player.reloadTime =
      w.reloadTime;

    sfx.reload();
  }

  /* =========================
     SHOOT
  ========================= */

  function shoot() {

    if (
      gameOver ||
      player.reloading ||
      shootCooldown > 0
    ) {
      return;
    }

    const wkey =
      player.currentWeapon;

    const w =
      WEAPONS[wkey];

    const pw =
      player.weapons[wkey];

    if (pw.ammo <= 0) {

      sfx.empty();

      reload();

      return;
    }

    pw.ammo--;

    shootCooldown =
      w.fireDelay;

    sfx.shoot(wkey);

    const dmgMult =
      player.damageBoost > 0
        ? 2
        : 1;

    for (
      let i = 0;
      i < w.pellets;
      i++
    ) {

      const spread =
        (Math.random() - 0.5) *
        w.spread;

      const a =
        player.angle + spread;

      bullets.push({

        x:
          player.x +
          Math.cos(a) * 20,

        y:
          player.y +
          Math.sin(a) * 20,

        vx:
          Math.cos(a) *
          w.bulletSpeed,

        vy:
          Math.sin(a) *
          w.bulletSpeed,

        life: 55,

        dmg:
          w.dmg * dmgMult,

        color: w.color
      });
    }

    for (
      let i = 0;
      i < 3;
      i++
    ) {

      particles.push({

        x:
          player.x +
          Math.cos(player.angle) * 22,

        y:
          player.y +
          Math.sin(player.angle) * 22,

        vx:
          Math.cos(player.angle) * 2 +
          (Math.random() - 0.5) * 2,

        vy:
          Math.sin(player.angle) * 2 +
          (Math.random() - 0.5) * 2,

        life: 12,

        color: '#f0d060',

        size: 3
      });
    }

    if (pw.ammo === 0) {
      reload();
    }
  }

  /* =========================
     UPDATE HUD
  ========================= */

  function updateHUD() {

    scoreVal.textContent =
      score;

    waveVal.textContent =
      wave;

    zombieCount.textContent =
      zombies.length + spawnLeft;

    healthBarFill.style.width =
      Math.max(
        0,
        player.hp /
        player.maxHp *
        100
      ) + '%';

    const pw =
      player.weapons[
        player.currentWeapon
      ];

    ammoVal.textContent =
      player.reloading
        ? '...'
        : pw.ammo;

    ammoMaxVal.textContent =
      WEAPONS[
        player.currentWeapon
      ].maxAmmo;

    /* WEAPON HUD */

    weaponRow.innerHTML =
      WEAPON_ORDER.map((k, i) => {

        const w =
          WEAPONS[k];

        const owned =
          player.weapons[k].owned;

        const active =
          k === player.currentWeapon;

        if (owned) {

          return `
            <span class="wpn ${active ? 'active' : ''}">
              ${i + 1}: ${w.name}
            </span>
          `;
        }

        return `
          <span class="wpn locked">
            ${i + 1}: LOCKED
          </span>
        `;

      }).join('');

    /* BUFF HUD */

    const buffs = [];

    if (player.speedBoost > 0) {
      buffs.push('SPEED');
    }

    if (player.damageBoost > 0) {
      buffs.push('DAMAGE x2');
    }

    if (player.shield > 0) {
      buffs.push('SHIELD');
    }

    buffRow.textContent =
      buffs.length
        ? buffs.join(' · ')
        : '';
  }

  /* =========================
     FLOATING TEXT
  ========================= */

  function addFloater(
    text,
    x,
    y,
    color
  ) {

    floaters.push({

      text,
      x,
      y,

      life: 40,

      color
    });
  }

  /* =========================
     DAMAGE PLAYER
  ========================= */

  function damagePlayer(amount) {

    if (
      player.invuln > 0 ||
      player.shield > 0
    ) {
      return;
    }

    player.hp -= amount;

    player.invuln = 30;

    sfx.hurt();

    if (player.hp <= 0) {

      player.hp = 0;

      endGame();
    }
  }

  /* =========================
     GAME OVER
  ========================= */

  function endGame() {

    running = false;

    gameOver = true;

    overlay.style.display =
      'flex';

    startScreen.innerHTML = `
      <h1 style="color:#c94b4b;">
        YOU DIED
      </h1>

      <p>
        Final Score: ${score}
      </p>

      <p>
        Reached Wave: ${wave}
      </p>

      <button id="restartBtn">
        TRY AGAIN
      </button>
    `;

    document
      .getElementById('restartBtn')
      .addEventListener(
        'click',
        () => {

          ensureAudio();

          overlay.style.display =
            'none';

          resetGame();

          loop();
        }
      );
  }

  /* =========================
     UPDATE GAME
  ========================= */

  function update() {

    if (!running) {
      return;
    }

    /* BUFF TIMERS */

    if (player.speedBoost > 0) {
      player.speedBoost--;
    }

    if (player.damageBoost > 0) {
      player.damageBoost--;
    }

    if (player.shield > 0) {
      player.shield--;
    }

    /* =========================
       PLAYER MOVEMENT
    ========================= */

    let dx = 0;
    let dy = 0;

    if (
      keys['w'] ||
      keys['arrowup']
    ) {
      dy -= 1;
    }

    if (
      keys['s'] ||
      keys['arrowdown']
    ) {
      dy += 1;
    }

    if (
      keys['a'] ||
      keys['arrowleft']
    ) {
      dx -= 1;
    }

    if (
      keys['d'] ||
      keys['arrowright']
    ) {
      dx += 1;
    }

    const mag =
      Math.hypot(dx, dy);

    const speed =
      player.baseSpeed *
      (
        player.speedBoost > 0
          ? 1.6
          : 1
      );

    if (mag > 0) {

      player.x +=
        dx / mag * speed;

      player.y +=
        dy / mag * speed;
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

    /* =========================
       TIMERS
    ========================= */

    if (player.invuln > 0) {
      player.invuln--;
    }

    if (shootCooldown > 0) {
      shootCooldown--;
    }

    /* =========================
       RELOAD
    ========================= */

    if (player.reloading) {

      player.reloadTime--;

      if (player.reloadTime <= 0) {

        player.reloading = false;

        player.weapons[
          player.currentWeapon
        ].ammo =
          WEAPONS[
            player.currentWeapon
          ].maxAmmo;
      }
    }

    /* =========================
       SHOOT
    ========================= */

    if (mouse.down) {
      shoot();
    }

    /* =========================
       ZOMBIE WAVE SYSTEM
    ========================= */

    if (spawnLeft > 0) {

      spawnTimer--;

      if (spawnTimer <= 0) {

        spawnZombie();

        spawnLeft--;

        spawnTimer =
          Math.max(
            15,
            45 - wave * 2
          );
      }

    } else if (
      zombies.length === 0
    ) {

      /* NEXT WAVE */

      wave++;

      zombiesPerWave =
        Math.round(
          zombiesPerWave * 1.25 + 1
        );

      spawnLeft =
        zombiesPerWave;

      spawnTimer = 30;

      showWaveBanner();

      player.hp =
        Math.min(
          player.maxHp,
          player.hp + 15
        );
    }

    /* =========================
       PICKUPS
    ========================= */

    pickupSpawnTimer--;

    if (
      pickupSpawnTimer <= 0 &&
      pickups.length < 3
    ) {

      spawnPickup();

      pickupSpawnTimer =
        360 +
        Math.random() * 180;
    }

    for (
      let i = pickups.length - 1;
      i >= 0;
      i--
    ) {

      const p =
        pickups[i];

      p.life--;

      p.bob += 0.08;

      if (p.life <= 0) {

        pickups.splice(i, 1);

        continue;
      }

      if (
        Math.hypot(
          player.x - p.x,
          player.y - p.y
        ) <
        player.r + p.r
      ) {

        applyPickup(p);

        pickups.splice(i, 1);
      }
    }

    /* =========================
       BULLETS
    ========================= */

    for (
      let i = bullets.length - 1;
      i >= 0;
      i--
    ) {

      const b =
        bullets[i];

      b.x += b.vx;
      b.y += b.vy;

      b.life--;

      if (
        b.life <= 0 ||
        b.x < 0 ||
        b.x > W ||
        b.y < 0 ||
        b.y > H
      ) {

        bullets.splice(i, 1);

        continue;
      }

      /* BULLET-ZOMBIE COLLISION */

      for (
        let j = zombies.length - 1;
        j >= 0;
        j--
      ) {

        const z =
          zombies[j];

        if (
          Math.hypot(
            b.x - z.x,
            b.y - z.y
          ) < z.r
        ) {

          z.hp -= b.dmg;

          z.hitFlash = 6;

          sfx.hit();

          for (
            let k = 0;
            k < 4;
            k++
          ) {

            particles.push({

              x: b.x,
              y: b.y,

              vx:
                (Math.random() - 0.5) * 4,

              vy:
                (Math.random() - 0.5) * 4,

              life: 16,

              color: '#c94b4b',

              size: 2.5
            });
          }

          bullets.splice(i, 1);

          /* ZOMBIE DEATH */

          if (z.hp <= 0) {

            const pts =
              z.type === 'tank'
                ? 30
                : z.type === 'fast'
                  ? 15
                  : 10;

            score += pts;

            addFloater(
              '+' + pts,
              z.x,
              z.y,
              '#e0d090'
            );

            sfx.zombieDeath();

            for (
              let k = 0;
              k < 10;
              k++
            ) {

              particles.push({

                x: z.x,
                y: z.y,

                vx:
                  (Math.random() - 0.5) * 5,

                vy:
                  (Math.random() - 0.5) * 5,

                life: 24,

                color: z.color,

                size: 3.5
              });
            }

            zombies.splice(j, 1);
          }

          break;
        }
      }
    }

    /* =========================
       ZOMBIE MOVEMENT
    ========================= */

    for (const z of zombies) {

      const a =
        Math.atan2(
          player.y - z.y,
          player.x - z.x
        );

      z.wobble += 0.2;

      const wob =
        Math.sin(z.wobble) * 0.15;

      z.x +=
        Math.cos(a + wob) *
        z.speed;

      z.y +=
        Math.sin(a + wob) *
        z.speed;

      if (z.hitFlash > 0) {
        z.hitFlash--;
      }

      /* ZOMBIE-PLAYER COLLISION */

      if (
        Math.hypot(
          player.x - z.x,
          player.y - z.y
        ) <
        player.r + z.r - 4
      ) {

        damagePlayer(
          z.dmg * 0.16
        );
      }
    }

    /* =========================
       PARTICLES
    ========================= */

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

      if (p.life <= 0) {

        particles.splice(i, 1);
      }
    }

    /* =========================
       FLOATERS
    ========================= */

    for (
      let i = floaters.length - 1;
      i >= 0;
      i--
    ) {

      const f =
        floaters[i];

      f.y -= 0.6;

      f.life--;

      if (f.life <= 0) {

        floaters.splice(i, 1);
      }
    }

    if (buffRow) {

      const buffs = [];

      if (
        player.speedBoost > 0
      ) {

        buffs.push(
          "SPEED"
        );

  /* =========================
     APPLY PICKUP
  ========================= */

  function applyPickup(p) {

    if (
      p.type === 'weapon_shotgun'
    ) {

      player.weapons.shotgun.owned =
        true;

      player.weapons.shotgun.ammo =
        WEAPONS.shotgun.maxAmmo;

      player.currentWeapon =
        'shotgun';

      addFloater(
        'SHOTGUN!',
        p.x,
        p.y,
        '#ff9a4a'
      );

      sfx.pickupWeapon();

    } else if (
      p.type === 'weapon_smg'
    ) {

      player.weapons.smg.owned =
        true;

      player.weapons.smg.ammo =
        WEAPONS.smg.maxAmmo;

      player.currentWeapon =
        'smg';

      addFloater(
        'SMG!',
        p.x,
        p.y,
        '#9adfff'
      );

      sfx.pickupWeapon();

    } else if (
      p.type === 'health'
    ) {

      player.hp =
        Math.min(
          player.maxHp,
          player.hp + 35
        );

      addFloater(
        '+35 HP',
        p.x,
        p.y,
        '#7fbf3f'
      );

      sfx.pickupBuff();

    } else if (
      p.type === 'ammo'
    ) {

      for (
        const k of WEAPON_ORDER
      ) {

        if (
          player.weapons[k].owned
        ) {

          player.weapons[k].ammo =
            WEAPONS[k].maxAmmo;
        }
      }

      addFloater(
        'AMMO+',
        p.x,
        p.y,
        '#e0d090'
      );

      sfx.pickupBuff();

    } else if (
      p.type === 'speed'
    ) {

      player.speedBoost = 300;

      addFloater(
        'SPEED!',
        p.x,
        p.y,
        '#9adfff'
      );

      sfx.pickupBuff();

    } else if (
      p.type === 'damage'
    ) {

      player.damageBoost = 300;

      addFloater(
        'DAMAGE x2!',
        p.x,
        p.y,
        '#ff6a6a'
      );

      sfx.pickupBuff();
    }

    updateHUD();
  }

  /* =========================
     DRAW PLAYER
  ========================= */

  function drawPlayer() {

    ctx.save();

    ctx.translate(
      player.x,
      player.y
    );

    if (
      player.invuln > 0 &&
      Math.floor(player.invuln / 4) % 2 === 0
    ) {

      ctx.globalAlpha = 0.4;
    }

    if (player.shield > 0) {

      ctx.beginPath();

      ctx.arc(
        0,
        0,
        player.r + 9,
        0,
        Math.PI * 2
      );

      ctx.strokeStyle =
        'rgba(154,223,255,0.7)';

      ctx.lineWidth = 2;

      ctx.stroke();
    }

    ctx.rotate(
      player.angle
    );

    const img =
      SPRITES.player;

    if (
      img &&
      img.complete &&
      img.naturalWidth
    ) {

      const w = 44;

      const h =
        w *
        (
          img.naturalHeight /
          img.naturalWidth
        );

      ctx.drawImage(
        img,
        -w / 2,
        -h / 2,
        w,
        h
      );
    }

  }

  /* =========================
     DRAW ZOMBIE
  ========================= */

  function drawZombie(z) {

    ctx.save();

    ctx.translate(
      z.x,
      z.y
    );

    const a =
      Math.atan2(
        player.y - z.y,
        player.x - z.x
      );

    ctx.rotate(a);

    let filter = '';

    if (z.type === 'fast') {

      filter =
        'hue-rotate(-25deg) saturate(1.4) ';
    }

    if (z.type === 'tank') {

      filter =
        'hue-rotate(180deg) saturate(1.1) brightness(0.85) ';
    }

    if (z.hitFlash > 0) {

      filter +=
        'brightness(2.2)';
    }

    if (filter) {

      ctx.filter =
        filter.trim();
    }

    const img =
      SPRITES.zombie_normal;

    if (
      img &&
      img.complete &&
      img.naturalWidth
    ) {

      const w =
        z.r * 3.1;

      const h =
        w *
        (
          img.naturalHeight /
          img.naturalWidth
        );

      ctx.drawImage(
        img,
        -w / 2,
        -h / 2,
        w,
        h
      );
    }

    ctx.filter = 'none';

    ctx.restore();

    /* HEALTH BAR */

    if (z.hp < z.maxHp) {

      const w =
        z.r * 2;

      ctx.fillStyle =
        '#200';

      ctx.fillRect(
        z.x - w / 2,
        z.y - z.r - 10,
        w,
        4
      );

      ctx.fillStyle =
        '#7fbf3f';

      ctx.fillRect(
        z.x - w / 2,
        z.y - z.r - 10,
        w *
          (z.hp / z.maxHp),
        4
      );
    }
  }

  /* =========================
     PICKUP STYLES
  ========================= */

  const PICKUP_STYLE = {

    weapon_shotgun: {
      color: '#ff9a4a'
    },

    weapon_smg: {
      color: '#9adfff'
    },

    health: {
      color: '#7fbf3f'
    },

    ammo: {
      color: '#e0d090'
    },

    speed: {
      color: '#5ad0ff'
    },

    damage: {
      color: '#ff6a6a'
    }

  };

  /* =========================
     DRAW PICKUP
  ========================= */

  function drawPickup(p) {

    const style =
      PICKUP_STYLE[p.type];

    const bobY =
      Math.sin(p.bob) * 3;

    ctx.save();

    ctx.translate(
      p.x,
      p.y + bobY
    );

    ctx.beginPath();

    ctx.arc(
      0,
      0,
      p.r,
      0,
      Math.PI * 2
    );

    ctx.fillStyle =
      style.color;

    ctx.globalAlpha = 0.85;

    ctx.fill();

    ctx.globalAlpha = 1;

    ctx.strokeStyle =
      'rgba(255,255,255,0.6)';

    ctx.lineWidth = 1.5;

    ctx.stroke();

    const icon =
      SPRITES[
        'icon_' + p.type
      ];

    const s =
      p.r * 1.3;

    if (
      icon &&
      icon.complete
    ) {

      ctx.drawImage(
        icon,
        -s / 2,
        -s / 2,
        s,
        s
      );
    }

    ctx.restore();
  }

  /* =========================
     MINIMAP
  ========================= */

  function drawMinimap() {

    mmCtx.clearRect(
      0,
      0,
      MM,
      MM
    );

    mmCtx.fillStyle =
      'rgba(20,30,20,0.4)';

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

    /* PICKUPS */

    for (const p of pickups) {

      mmCtx.fillStyle =
        PICKUP_STYLE[
          p.type
        ].color;

      mmCtx.fillRect(
        p.x * sx - 2,
        p.y * sy - 2,
        4,
        4
      );
    }

    /* ZOMBIES */

    for (const z of zombies) {

      mmCtx.fillStyle =
        z.type === 'tank'
          ? '#8090b0'
          : z.type === 'fast'
            ? '#d0a860'
            : '#7fbf5f';

      mmCtx.beginPath();

      mmCtx.arc(
        z.x * sx,
        z.y * sy,
        2,
        0,
        Math.PI * 2
      );

      mmCtx.fill();
    }

    /* PLAYER */

    mmCtx.fillStyle =
      '#3f9fff';

    mmCtx.beginPath();

    mmCtx.arc(
      player.x * sx,
      player.y * sy,
      3.5,
      0,
      Math.PI * 2
    );

    mmCtx.fill();
  }

  /* =========================
     DRAW GAME
  ========================= */

  function draw() {

    ctx.clearRect(
      0,
      0,
      W,
      H
    );

    if (
      !groundPattern &&
      SPRITES.groundTile
    ) {

      groundPattern =
        ctx.createPattern(
          SPRITES.groundTile,
          'repeat'
        );
    }

    ctx.fillStyle =
      groundPattern ||
      '#3a3a38';

    ctx.fillRect(
      0,
      0,
      W,
      H
    );

    /* DARK EDGE EFFECT */

    const grad =
      ctx.createRadialGradient(
        W / 2,
        H / 2,
        H / 3,
        W / 2,
        H / 2,
        H * 0.75
      );

    grad.addColorStop(
      0,
      'rgba(0,0,0,0)'
    );

    grad.addColorStop(
      1,
      'rgba(0,0,0,0.55)'
    );

    /* PICKUPS */

    for (const p of pickups) {
      drawPickup(p);
    }

    /* ZOMBIES */

    for (const z of zombies) {
      drawZombie(z);
    }

    /* BULLETS */

    for (const b of bullets) {

      ctx.fillStyle =
        b.color;

      ctx.beginPath();

      ctx.arc(
        b.x,
        b.y,
        3,
        0,
        Math.PI * 2
      );

      ctx.fill();
    }

    /* PLAYER */

    drawPlayer();

    /* PARTICLES */

    for (const p of particles) {

      ctx.globalAlpha =
        Math.max(
          0,
          p.life / 24
        );

      ctx.fillStyle =
        p.color;

      ctx.beginPath();

      ctx.arc(
        p.x,
        p.y,
        p.size,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.globalAlpha = 1;
    }

    /* FLOATING TEXT */

    ctx.font =
      'bold 14px Courier New';

    ctx.textAlign =
      'center';

    for (const f of floaters) {

      ctx.globalAlpha =
        Math.max(
          0,
          f.life / 40
        );

      ctx.fillStyle =
        f.color;

      ctx.fillText(
        f.text,
        f.x,
        f.y
      );

      ctx.globalAlpha = 1;
    }
  );

    /* VIGNETTE */

    ctx.fillStyle =
      grad;

    ctx.fillRect(
      0,
      0,
      W,
      H
    );

  gameStarted = false;

  /* =========================
     GAME LOOP
  ========================= */

  function loop() {

    update();

    draw();

    if (running) {

      requestAnimationFrame(
        loop
      );
    }
  }

  /* =========================
     START GAME BUTTON
  ========================= */

  startBtn.addEventListener(
    'click',
    () => {

      ensureAudio();

      overlay.style.display =
        'none';

      resetGame();

      loop();
    }
  );

})();
