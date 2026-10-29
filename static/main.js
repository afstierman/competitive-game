import { createPlayer, updatePlayer, drawPlayer } from './player.js';
import { drawWorld } from './world.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('start-screen');
  const launchBtn = document.getElementById('launch-btn');
  const posEl = document.getElementById('ui-pos');
  const hpEl = document.getElementById('ui-hp');

  // Let's also grab or create a cycles HUD element if needed, or update pos/hp
  let cyclesEl = document.getElementById('ui-cycles');
  if (!cyclesEl) {
    // Fallback if index.html hasn't added cycles display yet
    const statsContainer = document.querySelector('.stats');
    if (statsContainer) {
      const span = document.createElement('span');
      span.innerHTML = 'CYCLES: <strong id="ui-cycles">0</strong>';
      statsContainer.appendChild(span);
      cyclesEl = document.getElementById('ui-cycles');
    }
  }

  let isRunning = false;
  const player = createPlayer();
  const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  const keys = {};

  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  launchBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    isRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });

  let lastTime = 0;

  function loop(timestamp) {
    if (!isRunning) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    updatePlayer(player, keys, dt, canvas);

    posEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    hpEl.textContent = '♥'.repeat(player.hp);
    if (cyclesEl) cyclesEl.textContent = player.cycles;

    drawWorld(ctx, canvas, player);
    drawPlayer(ctx, player, mouse, canvas);

    requestAnimationFrame(loop);
  }

  // Initial preview render under menu overlay
  drawWorld(ctx, canvas, player);
  drawPlayer(ctx, player, mouse, canvas);
});