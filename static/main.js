import { createPlayer, updatePlayer, drawPlayer } from './player.js';
import { drawWorld, getBiomeAtDistance } from './world/world.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('start-screen');
  const launchBtn = document.getElementById('launch-btn');
  const posEl = document.getElementById('ui-pos');
  const hpEl = document.getElementById('ui-hp');

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

  let isRunning = false;
  let player = createPlayer();
  const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  const keys = {};

  let currentBiomeName = '';
  let bannerText = '';
  let bannerTimer = 0;

  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
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
    ctx.fillStyle = `rgba(3, 7, 18, ${Math.min(1, bannerTimer)})`;
    ctx.fillRect(0, canvas.height / 2 - 40, canvas.width, 80);

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, canvas.height / 2 - 40, canvas.width, 80);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ENTERING SECTOR: ${bannerText.toUpperCase()}`, canvas.width / 2, canvas.height / 2 + 6);
    ctx.restore();
  }

  function loop(timestamp) {
    if (!isRunning) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    updatePlayer(player, keys, dt, canvas, timestamp, triggerGameOver);
    if (!isRunning) return;

    const currentDist = Math.hypot(player.x, player.y);
    const activeBiome = getBiomeAtDistance(currentDist);

    if (activeBiome.name !== currentBiomeName) {
      currentBiomeName = activeBiome.name;
      bannerText = currentBiomeName;
      bannerTimer = 3.0;
      if (biomeEl) {
        biomeEl.textContent = currentBiomeName;
        biomeEl.style.color = activeBiome.crystal.color;
      }
    }

    posEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    hpEl.textContent = '♥'.repeat(player.hp);
    if (cyclesEl) cyclesEl.textContent = player.cycles;

    drawWorld(ctx, canvas, player, timestamp);
    drawPlayer(ctx, player, mouse, canvas);
    renderBiomeBanner(dt);

    requestAnimationFrame(loop);
  }

  drawWorld(ctx, canvas, player, performance.now());
  drawPlayer(ctx, player, mouse, canvas);
});