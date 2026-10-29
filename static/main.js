import { ARENA, BUG, DROP, PING, PLAYER, RUN_SECONDS } from './config.js';

const canvas = document.querySelector('#arena');
const ctx = canvas.getContext('2d');
const overlay = document.querySelector('#overlay');
const startButton = document.querySelector('#start');
const timerEl = document.querySelector('#timer');
const cyclesEl = document.querySelector('#cycles');
const killsEl = document.querySelector('#kills');
const healthEl = document.querySelector('#health');
const keys = Object.create(null);
const pointer = { x: ARENA.width / 2 + 100, y: ARENA.height / 2, down: false };

let player, bugs, shots, drops, elapsed, cycles, kills, spawnClock, fireClock;
let active = false, previous = 0, animationId = 0;

function resetRun() {
  player = { x: ARENA.width / 2, y: ARENA.height / 2, health: PLAYER.maxHealth, invulnerable: 0, facing: 0 };
  bugs = []; shots = []; drops = [];
  elapsed = 0; cycles = 0; kills = 0; spawnClock = 0; fireClock = 0;
  active = true;
  overlay.classList.add('hidden');
  updateHud();
  previous = performance.now();
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(frame);
}

function updateHud() {
  timerEl.textContent = Math.max(0, RUN_SECONDS - elapsed).toFixed(1);
  cyclesEl.textContent = String(cycles);
  killsEl.textContent = String(kills);
  healthEl.textContent = Array.from({ length: PLAYER.maxHealth }, (_, i) => i < player.health ? '♥' : '♡').join(' ');
}

function gameOver(reason, extracted = false) {
  active = false;
  const retained = extracted ? cycles : Math.floor(cycles / 2);
  overlay.innerHTML = `<p class="eyebrow">${extracted ? 'RUN COMPLETE' : 'PROCESS TERMINATED'}</p><h2>${extracted ? 'Successful extraction.' : 'StackOverflowError'}</h2><p>${reason}<br>CPU cycles recovered: <b>${retained}</b> / ${cycles} · Bugs eliminated: <b>${kills}</b></p><button id="start">${extracted ? 'RUN AGAIN' : 'RETRY'}</button>`;
  overlay.classList.remove('hidden');
  overlay.querySelector('button').addEventListener('click', resetRun, { once: true });
  draw();
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: (event.clientX - rect.left) * ARENA.width / rect.width, y: (event.clientY - rect.top) * ARENA.height / rect.height };
}

window.addEventListener('keydown', event => {
  if (['w','a','s','d','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) event.preventDefault();
  keys[event.key.toLowerCase()] = true;
});
window.addEventListener('keyup', event => { keys[event.key.toLowerCase()] = false; });
window.addEventListener('blur', () => { for (const key of Object.keys(keys)) keys[key] = false; pointer.down = false; });
canvas.addEventListener('pointermove', event => Object.assign(pointer, canvasPoint(event)));
canvas.addEventListener('pointerdown', event => { if (event.button === 0) { Object.assign(pointer, canvasPoint(event)); pointer.down = true; } });
window.addEventListener('pointerup', event => { if (event.button === 0) pointer.down = false; });
canvas.addEventListener('contextmenu', event => event.preventDefault());
startButton.addEventListener('click', resetRun);

function spawnBug() {
  const side = Math.floor(Math.random() * 4);
  bugs.push({
    x: side === 0 ? -18 : side === 1 ? ARENA.width + 18 : Math.random() * ARENA.width,
    y: side === 2 ? -18 : side === 3 ? ARENA.height + 18 : Math.random() * ARENA.height,
    health: BUG.health, attack: null, hitFlash: 0,
  });
}

function firePing() {
  const dx = pointer.x - player.x, dy = pointer.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  const length = Math.min(distance, PING.range);
  const vx = dx / distance * PING.projectileSpeed, vy = dy / distance * PING.projectileSpeed;
  shots.push({ x: player.x, y: player.y, vx, vy, left: length });
  player.facing = Math.atan2(dy, dx);
}

function damagePlayer() {
  if (player.invulnerable > 0) return;
  player.health--;
  player.invulnerable = PLAYER.invulnerability;
  if (player.health <= 0) gameOver('The runtime was overwhelmed by bugs.');
}

function update(dt) {
  elapsed += dt;
  if (elapsed >= RUN_SECONDS) { elapsed = RUN_SECONDS; updateHud(); gameOver('You survived the full arena run.', true); return; }
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  let mx = Number(keys.d || keys.arrowright) - Number(keys.a || keys.arrowleft);
  let my = Number(keys.s || keys.arrowdown) - Number(keys.w || keys.arrowup);
  const magnitude = Math.hypot(mx, my) || 1;
  player.x = Math.max(PLAYER.radius, Math.min(ARENA.width - PLAYER.radius, player.x + mx / magnitude * PLAYER.speed * dt));
  player.y = Math.max(PLAYER.radius, Math.min(ARENA.height - PLAYER.radius, player.y + my / magnitude * PLAYER.speed * dt));
  player.facing = Math.atan2(pointer.y - player.y, pointer.x - player.x);

  const spawnEvery = Math.max(BUG.spawnEnd, BUG.spawnStart - elapsed / RUN_SECONDS * (BUG.spawnStart - BUG.spawnEnd));
  spawnClock += dt;
  while (spawnClock >= spawnEvery) { spawnClock -= spawnEvery; spawnBug(); }
  fireClock -= dt;
  if (pointer.down && fireClock <= 0) { firePing(); fireClock = PLAYER.fireInterval; }

  for (const bug of bugs) {
    bug.hitFlash = Math.max(0, bug.hitFlash - dt);
    if (bug.attack) {
      bug.attack.time -= dt;
      if (bug.attack.time <= 0) {
        if (Math.hypot(player.x - bug.attack.x, player.y - bug.attack.y) < 44) damagePlayer();
        bug.attack = null;
      }
      continue;
    }
    const dx = player.x - bug.x, dy = player.y - bug.y, distance = Math.hypot(dx, dy) || 1;
    if (distance < 82) bug.attack = { x: player.x, y: player.y, time: 0.65, total: 0.65 };
    else { bug.x += dx / distance * BUG.speed * dt; bug.y += dy / distance * BUG.speed * dt; }
  }

  for (const shot of shots) {
    const step = Math.min(shot.left, PING.projectileSpeed * dt);
    shot.x += shot.vx / PING.projectileSpeed * step;
    shot.y += shot.vy / PING.projectileSpeed * step;
    shot.left -= step;
    for (const bug of bugs) {
      if (bug.health > 0 && Math.hypot(shot.x - bug.x, shot.y - bug.y) < BUG.radius + 4) {
        bug.health -= PING.damage; bug.hitFlash = 0.09; shot.left = -1;
        if (bug.health <= 0) { kills++; drops.push({ x: bug.x, y: bug.y, amount: DROP.cycles }); }
        break;
      }
    }
  }
  shots = shots.filter(shot => shot.left > 0 && shot.x > -8 && shot.x < ARENA.width + 8 && shot.y > -8 && shot.y < ARENA.height + 8);
  bugs = bugs.filter(bug => bug.health > 0);
  for (const drop of drops) {
    if (Math.hypot(player.x - drop.x, player.y - drop.y) < PLAYER.radius + DROP.radius + 2) { cycles += drop.amount; drop.collected = true; }
  }
  drops = drops.filter(drop => !drop.collected);
  updateHud();
}

function drawGrid() {
  ctx.strokeStyle = '#14212a'; ctx.lineWidth = 1;
  for (let x = 0; x <= ARENA.width; x += 40) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, ARENA.height); ctx.stroke(); }
  for (let y = 0; y <= ARENA.height; y += 40) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(ARENA.width, y + .5); ctx.stroke(); }
}

function draw() {
  ctx.clearRect(0, 0, ARENA.width, ARENA.height);
  ctx.fillStyle = '#0b1117'; ctx.fillRect(0, 0, ARENA.width, ARENA.height); drawGrid();
  for (const drop of drops) {
    ctx.fillStyle = '#f6c85f'; ctx.beginPath(); ctx.arc(drop.x, drop.y, DROP.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#31250e'; ctx.font = 'bold 9px ui-monospace,monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('+', drop.x, drop.y + .5);
  }
  for (const shot of shots) { ctx.strokeStyle = '#78f4cb'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(shot.x, shot.y); ctx.lineTo(shot.x - shot.vx * .018, shot.y - shot.vy * .018); ctx.stroke(); }
  for (const bug of bugs) {
    if (bug.attack) {
      ctx.strokeStyle = `rgba(255,104,122,${.55 + .35 * Math.sin(performance.now() / 75)})`;
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bug.attack.x, bug.attack.y, 44, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff687a'; ctx.beginPath(); ctx.arc(bug.attack.x, bug.attack.y, 3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = bug.hitFlash ? '#fff' : '#ff687a'; ctx.beginPath(); ctx.arc(bug.x, bug.y, BUG.radius, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#541e2c'; ctx.beginPath(); ctx.arc(bug.x, bug.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#425159'; ctx.fillRect(bug.x - 13, bug.y - 20, 26, 3);
    ctx.fillStyle = '#ff8794'; ctx.fillRect(bug.x - 13, bug.y - 20, 26 * bug.health / BUG.health, 3);
  }
  ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.facing);
  ctx.strokeStyle = 'rgba(109,242,193,.13)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(PING.range, 0); ctx.stroke();
  ctx.fillStyle = '#6df2c1'; ctx.beginPath(); ctx.arc(0, 0, PLAYER.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#09231a'; ctx.fillRect(3, -3, 9, 6); ctx.restore();
  ctx.strokeStyle = '#9bffe0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(pointer.x, pointer.y, 7, 0, Math.PI * 2); ctx.moveTo(pointer.x - 12, pointer.y); ctx.lineTo(pointer.x + 12, pointer.y); ctx.moveTo(pointer.x, pointer.y - 12); ctx.lineTo(pointer.x, pointer.y + 12); ctx.stroke();
  if (player.invulnerable > 0 && Math.floor(performance.now() / 80) % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.beginPath(); ctx.arc(player.x, player.y, PLAYER.radius + 4, 0, Math.PI * 2); ctx.fill(); }
}

function frame(now) {
  if (!active) return;
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  update(dt);
  draw();
  if (active) animationId = requestAnimationFrame(frame);
}

draw();
