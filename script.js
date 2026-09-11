(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const mmCanvas = document.getElementById('minimap');
  const mmCtx = mmCanvas.getContext('2d');
  const MM = 130;

  const overlay = document.getElementById('overlay');
  const startScreen = document.getElementById('startScreen');
  const startBtn = document.getElementById('startBtn');
  const waveBanner = document.getElementById('waveBanner');

  const scoreVal = document.getElementById('scoreVal');
  const waveVal = document.getElementById('waveVal');
  const zombieCount = document.getElementById('zombieCount');
  const healthBarFill = document.getElementById('healthBarFill');
  const ammoVal = document.getElementById('ammoVal');
  const ammoMaxVal = document.getElementById('ammoMaxVal');
  const weaponRow = document.getElementById('weaponRow');
  const buffRow = document.getElementById('buffRow');

  let keys = {};
  let mouse = { x: W/2, y: H/2, down: false };

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'r') reload();
    if (k === ' ') { shoot(); e.preventDefault(); }
    if (k === '1' || k === '2' || k === '3') switchWeaponBySlot(parseInt(k,10));
  });
  window.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  canvas.addEventListener('mouseup', () => { mouse.down = false; });
