import { createPlayer, startPlayerAttack, updatePlayer, drawPlayer } from './player.js';
import { CONFIG } from './config.js';
import { drawWorld, getBiomeAtPosition } from './world/world.js';
import { isNearShop } from './world/shop.js';
import { drawEnemies, resetEnemies, updateEnemies } from './world/enemies.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('start-screen');
  const launchBtn = document.getElementById('launch-btn');
  const posEl = document.getElementById('ui-pos');
  const hpEl = document.getElementById('ui-hp');
  const shopPanel = document.getElementById('shop-panel');
  const shopCyclesEl = document.getElementById('shop-cycles');
  const shopStatusEl = document.getElementById('shop-status');
  const healButton = document.getElementById('buy-heal');
  const healthButton = document.getElementById('buy-health');
  const almanacPanel = document.getElementById('almanac-panel');
  const almanacToggle = document.getElementById('almanac-toggle');

  let cyclesEl = document.getElementById('ui-cycles');
  let biomeEl = document.getElementById('ui-biome');

  const statsContainer = document.querySelector('.stats');
  if (statsContainer) {
    if (!cyclesEl) {
      const span = document.createElement('span');
      span.innerHTML = 'CYCLES: <strong id="ui-cycles">0</strong>';
      statsContainer.appendChild(span);
      cyclesEl = document.getElementById('ui-cycles');
    }
    if (!biomeEl) {
      const span = document.createElement('span');
      span.innerHTML = 'SECTOR: <strong id="ui-biome">Mossy Overgrowth</strong>';
      statsContainer.insertBefore(span, statsContainer.firstChild);
      biomeEl = document.getElementById('ui-biome');
    }
  }
  if (biomeEl) biomeEl.textContent = '';

  let isRunning = false;
  let player = createPlayer();
  let shopOpen = false;
  let almanacOpen = false;
  const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  const keys = {};

  let currentBiomeName = '';
  let bannerText = '';
  let bannerTimer = 0;

  function refreshShop() {
    const healthUpgradeCost = 10 * (2 ** Math.max(0, player.maxHp - CONFIG.maxHp));
    shopCyclesEl.textContent = player.cycles;
    healButton.textContent = 'Heal 1 heart · 10 cycles';
    healthButton.textContent = `+1 max health · ${healthUpgradeCost} cycles`;
    healButton.disabled = player.cycles < 10 || player.hp >= player.maxHp;
    healthButton.disabled = player.cycles < healthUpgradeCost || player.maxHp >= 10;
  }

  function setShopOpen(open) {
    shopOpen = open;
    shopPanel.classList.toggle('hidden', !open);
    if (open) {
      shopStatusEl.textContent = 'Welcome, explorer!';
      refreshShop();
    }
  }

  function setAlmanacOpen(open) {
    almanacOpen = open;
    almanacPanel.classList.toggle('hidden', !open);
    almanacToggle.setAttribute('aria-expanded', String(open));
  }

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'e' && !keys.e && isRunning && !almanacOpen && isNearShop(player.x, player.y)) {
      setShopOpen(!shopOpen);
      e.preventDefault();
    } else if (key === 'escape' && shopOpen) {
      setShopOpen(false);
    } else if (key === 'escape' && almanacOpen) {
      setAlmanacOpen(false);
    }
    keys[key] = true;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  document.getElementById('shop-close').addEventListener('click', () => setShopOpen(false));
  almanacToggle.addEventListener('click', () => {
    if (almanacOpen) {
      setAlmanacOpen(false);
    } else {
      setShopOpen(false);
      setAlmanacOpen(true);
    }
  });
  document.getElementById('almanac-close').addEventListener('click', () => setAlmanacOpen(false));
  healButton.addEventListener('click', () => {
    if (player.cycles < 10 || player.hp >= player.maxHp) return;
    player.cycles -= 10;
    player.hp++;
    shopStatusEl.textContent = 'One heart restored. Take care!';
    refreshShop();
  });
  healthButton.addEventListener('click', () => {
    const healthUpgradeCost = 10 * (2 ** Math.max(0, player.maxHp - CONFIG.maxHp));
    if (player.cycles < healthUpgradeCost || player.maxHp >= 10) return;
    player.cycles -= healthUpgradeCost;
    player.maxHp++;
    player.hp++;
    shopStatusEl.textContent = 'A little sturdier! Max health increased.';
    refreshShop();
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || !isRunning || shopOpen || almanacOpen) return;
    startPlayerAttack(player);
  });

  function triggerGameOver(reason) {
    isRunning = false;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <h2 style="color:#f87171;">SYSTEM TERMINATED</h2>
      <p>${reason}<br>Extracted Cycles: <b>${player.cycles}</b></p>
      <button id="launch-btn">RESTART SIMULATION</button>
    `;
    document.getElementById('launch-btn').addEventListener('click', startNewRun);
  }

  function startNewRun() {
    player = createPlayer();
    resetEnemies();
    setShopOpen(false);
    setAlmanacOpen(false);
    overlay.classList.add('hidden');
    isRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  launchBtn.addEventListener('click', startNewRun);

  let lastTime = 0;

  function renderBiomeBanner(dt) {
    if (bannerTimer <= 0) return;
    bannerTimer -= dt;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 7, 18, 0.72)';
    ctx.fillRect(0, 16, canvas.width, 60);

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 16, canvas.width, 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ENTERING SECTOR: ${bannerText.toUpperCase()}`, canvas.width / 2, 52);
    ctx.restore();
  }

  function loop(timestamp) {
    if (!isRunning) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (!shopOpen && !almanacOpen) {
      updatePlayer(player, keys, dt, canvas, timestamp, triggerGameOver, mouse);
      updateEnemies(player, dt, timestamp, canvas, triggerGameOver);
    }
    if (!isRunning) return;

    const activeBiome = getBiomeAtPosition(player.x, player.y);

    if (activeBiome.name !== currentBiomeName) {
      currentBiomeName = activeBiome.name;
      bannerText = currentBiomeName;
      bannerTimer = currentBiomeName ? 3.0 : 0;
      if (biomeEl) {
        biomeEl.textContent = currentBiomeName;
        if (currentBiomeName) biomeEl.style.color = activeBiome.crystal.color;
      }
    }

    posEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    hpEl.textContent = `${'♥'.repeat(player.hp)}${'♡'.repeat(player.maxHp - player.hp)}`;
    if (cyclesEl) cyclesEl.textContent = player.cycles;
    if (shopOpen) refreshShop();

    drawWorld(ctx, canvas, player, timestamp);
    drawEnemies(ctx, player, canvas, timestamp);
    drawPlayer(ctx, player, mouse, canvas);
    if (isNearShop(player.x, player.y) && !shopOpen) {
      ctx.fillStyle = 'rgba(3, 7, 18, 0.85)';
      ctx.fillRect(canvas.width / 2 - 98, canvas.height / 2 + 42, 196, 28);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Press E to browse the shop', canvas.width / 2, canvas.height / 2 + 61);
    }
    renderBiomeBanner(dt);

    requestAnimationFrame(loop);
  }

  drawWorld(ctx, canvas, player, performance.now());
  drawEnemies(ctx, player, canvas, performance.now());
  drawPlayer(ctx, player, mouse, canvas);
});
