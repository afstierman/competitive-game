import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const BOSS = ENEMIES_CONFIG.voidBoss;
const ENRAGE = {
  threshold: 0.5,
  speedScale: 1.3,
  cooldownScale: 0.7,
  ...(BOSS.enrage || {})
};
const SENT = BOSS.sentinels;
const BEAM = BOSS.beam;
const GRID = BOSS.grid;
const SPIRAL = BOSS.spiral;
const ARENA_RADIUS = 600;
const CORE_RADIUS = 46;
const SHIELD_RADIUS = SENT.orbitRadius + 24;
const INTRO_TIME = 1.8;
const HIT_KEY = 'void-boss';
const NAME = BOSS.name.toUpperCase();
const TAU = Math.PI * 2;

const RING_COLORS = {
  void: '192, 132, 252',
  cyan: '103, 232, 249',
  magenta: '232, 121, 249',
  white: '245, 243, 255'
};

// Fixed star layout so the arena background does not flicker
const STARS = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 91.7) * 43758.5453;
  const b = Math.sin(i * 12.9 + 4.1) * 24634.6345;
  const c = Math.sin(i * 37.3 + 1.7) * 15731.7431;
  const r1 = a - Math.floor(a);
  const r2 = b - Math.floor(b);
  const r3 = c - Math.floor(c);
  return { angle: r1 * TAU, dist: Math.sqrt(r2) * (ARENA_RADIUS - 24), size: 1 + r3 * 1.8, phase: r1 * 10 };
});

let boss = null;

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function healthRatio() {
  return boss ? Math.max(0, boss.hp) / boss.maxHp : 0;
}

function coreY() {
  return boss.y + Math.sin(boss.elapsed * 1.6) * 5;
}

function addRing(x, y, size, color, duration = 0.6) {
  boss.effects.push({ x, y, size, color, timer: duration, max: duration });
}

function nextCooldown() {
  const scale = boss.enraged ? ENRAGE.cooldownScale : 1;
  return rand(BOSS.attackDelay.min, BOSS.attackDelay.max) * scale;
}

function livingSentinels() {
  return boss.sentinels.filter(sentinel => sentinel.alive);
}

function sentinelWorld(sentinel) {
  const angle = sentinel.angle + boss.orbitAngle;
  const radius = SENT.orbitRadius * (1 + Math.sin(boss.elapsed * 2 + sentinel.angle) * 0.05);
  return {
    x: boss.x + Math.cos(angle) * radius,
    y: coreY() + Math.sin(angle) * radius,
    radius: SENT.radius,
    sentinel
  };
}

function spawnSentinels() {
  const hp = SENT.health + (boss.enraged ? SENT.enragedHealthBonus : 0);
  boss.sentinels = Array.from({ length: SENT.count }, (_, i) => ({
    angle: (i * TAU) / SENT.count,
    hp,
    maxHp: hp,
    alive: true,
    flash: 0,
    spawn: 0.6
  }));
}

export function resetVoidBoss() {
  boss = null;
}

export function isVoidBossActive() {
  return Boolean(boss);
}

export function startVoidBoss(worldX, worldY, player, canvas) {
  if (boss) return;
  const centerX = worldX;
  const centerY = worldY;
  const startX = centerX - 40;
  const startY = centerY - 100;
  boss = {
    x: startX,
    y: startY,
    centerX,
    centerY,
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | drift | beamWindup | beaming | gridCast | spiralWindup | spiraling | recover | overloaded
    timer: INTRO_TIME,
    lastAttack: null,
    attackCooldown: 0,
    enraged: false,
    sentinels: [],
    orbitAngle: 0,
    eyeAngle: Math.atan2(centerY + 145 - startY, centerX + 165 - startX),
    beamBase: 0,
    beamDir: 1,
    beamElapsed: 0,
    beamCount: BEAM.count,
    beamSweep: BEAM.sweep,
    spiralAngle: 0,
    spiralDir: 1,
    spiralAcc: 0,
    spiralElapsed: 0,
    spiralFlipped: false,
    spiralArms: SPIRAL.arms,
    waves: [],
    bolts: [],
    effects: [],
    hitFlash: 0,
    shieldFlash: 0,
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  spawnSentinels();
  addRing(startX, startY, 3, 'void', 0.9);

  if (player) {
    player.x = centerX + 165;
    player.y = centerY + 145;
    if (canvas) {
      player.cameraX = player.x - canvas.width / 2;
      player.cameraY = player.y - canvas.height / 2;
    }
    player.isAttacking = false;
    player.slashTimer = 0;
    player.slingshotShotActive = false;
    player.attackHitEnemies.clear();
  }
  window.dispatchEvent(new CustomEvent('void-boss-summoned', {
    detail: { x: centerX, y: centerY }
  }));
}

function defeatBoss(player) {
  boss.defeated = true;
  boss.defeatTimer = BOSS.deathTime;
  boss.bolts = [];
  boss.waves = [];
  boss.sentinels = [];
  player.cycles += BOSS.reward;
  window.dispatchEvent(new CustomEvent('void-boss-defeated', {
    detail: { x: boss.x, y: boss.y }
  }));
}

// Breaking the last sentinel cancels whatever the boss is doing and exposes the core
function overload() {
  boss.state = 'overloaded';
  boss.timer = SENT.overloadTime;
  boss.beamElapsed = 0;
  addRing(boss.x, coreY(), 3.4, 'white', 0.8);
  addRing(boss.x, coreY(), 2.2, 'magenta', 0.6);
}

function damageSentinel(sentinel, amount) {
  const pos = sentinelWorld(sentinel);
  sentinel.hp -= amount;
  sentinel.flash = 0.15;
  addRing(pos.x, pos.y, 0.7, 'cyan', 0.25);
  if (sentinel.hp > 0) return;
  sentinel.alive = false;
  addRing(pos.x, pos.y, 1.8, 'magenta', 0.55);
  addRing(pos.x, pos.y, 1.1, 'white', 0.4);
  if (livingSentinels().length === 0) overload();
}

function applyDamage(player, angle) {
  if (!boss || boss.defeated || boss.state === 'intro') return;
  const shot = player.activeWeapon === 'slingshot';
  if (shot && !player.slingshotShotActive) return;
  if (player.attackHitEnemies.has(HIT_KEY)) return;

  const range = shot ? player.slingshotShotRange : 78;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.36;

  // Sentinels are checked first so they can always be picked off
  const targets = [
    ...livingSentinels().map(sentinelWorld),
    { x: boss.x, y: coreY(), radius: CORE_RADIUS, core: true }
  ];
  let hit = null;
  for (const circle of targets) {
    const dx = circle.x - player.x;
    const dy = circle.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > range + circle.radius) continue;
    if (distance > circle.radius) {
      const slack = Math.asin(circle.radius / distance);
      if (Math.abs(angleDifference(Math.atan2(dy, dx), attackAngle)) > tolerance + slack) continue;
    }
    hit = circle;
    break;
  }
  if (!hit) return;

  const baseDamage = (shot ? player.slingshotDamage : player.swordDamage) ?? 1;
  player.attackHitEnemies.add(HIT_KEY);
  if (shot) player.slingshotShotActive = false;

  if (hit.sentinel) {
    damageSentinel(hit.sentinel, baseDamage);
    return;
  }

  const shielded = boss.state !== 'overloaded';
  boss.hp -= baseDamage * (shielded ? BOSS.shieldMultiplier : BOSS.overloadMultiplier);
  boss.hitFlash = 0.1;
  if (shielded) boss.shieldFlash = 0.25;
  addRing(hit.x, hit.y, shielded ? 0.6 : 1.1, shielded ? 'cyan' : 'magenta', 0.25);
  if (boss.hp <= 0) defeatBoss(player);
}

export function damageVoidBoss(player, swingAngle) {
  if (!boss || boss.defeated) return;
  applyDamage(player, swingAngle);
}

function hurtPlayer(player, amount, onDeath, message) {
  if (player.enemyDamageCooldown > 0) return;
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.9;
  if (player.hp <= 0) onDeath?.(message);
}

function pushPlayer(player, fromX, fromY, distance) {
  const angle = Math.atan2(player.y - fromY, player.x - fromX);
  player.x += Math.cos(angle) * distance;
  player.y += Math.sin(angle) * distance;
}

function keepInArena(margin) {
  const dx = boss.x - boss.centerX;
  const dy = boss.y - boss.centerY;
  const distance = Math.hypot(dx, dy);
  const limit = ARENA_RADIUS - margin;
  if (distance > limit) {
    boss.x = boss.centerX + dx / distance * limit;
    boss.y = boss.centerY + dy / distance * limit;
  }
}

function buildWaves(player) {
  const size = GRID.cellSize;
  const span = Math.ceil(GRID.reach / size);
  const pi = Math.round((player.x - boss.centerX) / size);
  const pj = Math.round((player.y - boss.centerY) / size);
  // The first wave always targets the cells the player is standing on, so they have to move
  const startParity = (((pi + pj) % 2) + 2) % 2;
  const count = boss.enraged ? GRID.wavesPhaseTwo : GRID.waves;
  boss.waves = [];
  for (let k = 0; k < count; k++) {
    const parity = (startParity + k) % 2;
    const cells = [];
    for (let i = pi - span; i <= pi + span; i++) {
      for (let j = pj - span; j <= pj + span; j++) {
        if ((((i + j) % 2) + 2) % 2 !== parity) continue;
        const cx = boss.centerX + i * size;
        const cy = boss.centerY + j * size;
        if (Math.hypot(cx - player.x, cy - player.y) > GRID.reach) continue;
        if (Math.hypot(cx - boss.centerX, cy - boss.centerY) > ARENA_RADIUS - 30) continue;
        cells.push({ x: cx, y: cy });
      }
    }
    boss.waves.push({ cells, t: -k * GRID.waveGap, warn: GRID.warn, detonated: false, flash: 0 });
  }
  const count2 = boss.waves.length;
  return (count2 - 1) * GRID.waveGap + GRID.warn + GRID.blast;
}

function pickAttack() {
  const options = ['beams', 'grid', 'spiral'].filter(type => type !== boss.lastAttack);
  return options[Math.floor(Math.random() * options.length)];
}

function startAttack(player, toPlayer) {
  const type = pickAttack();
  boss.lastAttack = type;
  if (type === 'beams') {
    boss.state = 'beamWindup';
    boss.timer = BEAM.windup;
    boss.beamBase = toPlayer;
    boss.beamDir = Math.random() < 0.5 ? -1 : 1;
    boss.beamCount = boss.enraged ? BEAM.countPhaseTwo : BEAM.count;
    boss.beamSweep = BEAM.sweep * (boss.enraged ? 1.2 : 1);
    boss.beamElapsed = 0;
  } else if (type === 'grid') {
    boss.state = 'gridCast';
    boss.timer = buildWaves(player);
    addRing(boss.x, coreY(), 2.4, 'cyan', 0.6);
  } else {
    boss.state = 'spiralWindup';
    boss.timer = SPIRAL.windup;
  }
}

function endAttack() {
  boss.state = 'drift';
  boss.attackCooldown = nextCooldown();
}

function beamAngles() {
  const base = boss.beamBase + (boss.state === 'beaming' ? boss.beamDir * boss.beamSweep * boss.beamElapsed : 0);
  return Array.from({ length: boss.beamCount }, (_, k) => base + (k * TAU) / boss.beamCount);
}

export function updateVoidBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  boss.shieldFlash = Math.max(0, boss.shieldFlash - dt);
  boss.orbitAngle += SENT.orbitSpeed * (boss.enraged ? ENRAGE.speedScale : 1) * dt;
  for (const sentinel of boss.sentinels) {
    sentinel.flash = Math.max(0, sentinel.flash - dt);
    sentinel.spawn = Math.max(0, sentinel.spawn - dt);
  }
  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(effect => effect.timer > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 16) {
      addRing(boss.x + rand(-50, 50), coreY() + rand(-50, 50), rand(0.7, 1.6), Math.random() < 0.5 ? 'magenta' : 'cyan', 0.55);
    }
    if (boss.defeatTimer <= 0) boss = null;
    return;
  }

  // Resolve player attacks here so the fight never depends on the aggregator's swing block
  if (player.isAttacking && player.slashTimer > 0) {
    const swingProgress = 1 - player.slashTimer / 150;
    const easedProgress = 1 - (1 - swingProgress) * (1 - swingProgress);
    applyDamage(player, player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2));
  }
  if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
    applyDamage(player, 0);
  }
  if (!boss || boss.defeated) return;

  if (!boss.enraged && healthRatio() < ENRAGE.threshold) {
    boss.enraged = true;
    addRing(boss.x, coreY(), 3.4, 'magenta', 0.9);
  }

  const dx = player.x - boss.x;
  const dy = player.y - coreY();
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const speed = BOSS.movementSpeed * (boss.enraged ? ENRAGE.speedScale : 1);
  boss.eyeAngle += angleDifference(toPlayer, boss.eyeAngle) * Math.min(1, dt * 6);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'drift';
      boss.attackCooldown = nextCooldown();
    }
  } else if (boss.state === 'drift') {
    if (distance > 170) {
      const step = Math.min(distance - 170, speed * dt);
      boss.x += dx / distance * step;
      boss.y += dy / distance * step;
      keepInArena(CORE_RADIUS + 60);
    }
    boss.attackCooldown -= dt;
    if (boss.attackCooldown <= 0) startAttack(player, toPlayer);
  } else if (boss.state === 'beamWindup') {
    boss.timer -= dt;
    // The beams track the player until just before they fire, then lock
    if (boss.timer > BEAM.lockTime) boss.beamBase = toPlayer;
    if (boss.timer <= 0) {
      boss.state = 'beaming';
      boss.timer = BEAM.duration;
      boss.beamElapsed = 0;
      addRing(boss.x, coreY(), 2.2, 'magenta', 0.5);
    }
  } else if (boss.state === 'beaming') {
    boss.timer -= dt;
    boss.beamElapsed += dt;
    for (const angle of beamAngles()) {
      const along = (player.x - boss.x) * Math.cos(angle) + (player.y - coreY()) * Math.sin(angle);
      const across = Math.abs(-(player.x - boss.x) * Math.sin(angle) + (player.y - coreY()) * Math.cos(angle));
      if (along > 0 && along < BEAM.length && across < BEAM.width / 2 + 12) {
        hurtPlayer(player, BEAM.damage, onDeath, 'Vaporized by the Null Singularity!');
        if (!boss) return;
        break;
      }
    }
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = BEAM.recover;
    }
  } else if (boss.state === 'gridCast') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = GRID.recover;
    }
  } else if (boss.state === 'spiralWindup') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'spiraling';
      boss.timer = SPIRAL.duration;
      boss.spiralAngle = rand(0, TAU);
      boss.spiralDir = Math.random() < 0.5 ? -1 : 1;
      boss.spiralAcc = 0;
      boss.spiralElapsed = 0;
      boss.spiralFlipped = false;
      boss.spiralArms = boss.enraged ? SPIRAL.armsPhaseTwo : SPIRAL.arms;
    }
  } else if (boss.state === 'spiraling') {
    boss.timer -= dt;
    boss.spiralElapsed += dt;
    // Enraged spirals reverse halfway through
    if (boss.enraged && !boss.spiralFlipped && boss.spiralElapsed > SPIRAL.duration / 2) {
      boss.spiralDir *= -1;
      boss.spiralFlipped = true;
      addRing(boss.x, coreY(), 2.4, 'cyan', 0.5);
    }
    boss.spiralAngle += boss.spiralDir * SPIRAL.turn * dt;
    boss.spiralAcc += dt * SPIRAL.rate;
    while (boss.spiralAcc >= 1) {
      boss.spiralAcc -= 1;
      for (let arm = 0; arm < boss.spiralArms; arm++) {
        const angle = boss.spiralAngle + (arm * TAU) / boss.spiralArms;
        boss.bolts.push({
          x: boss.x + Math.cos(angle) * 30,
          y: coreY() + Math.sin(angle) * 30,
          vx: Math.cos(angle) * SPIRAL.speed,
          vy: Math.sin(angle) * SPIRAL.speed,
          life: SPIRAL.life,
          spin: rand(0, TAU)
        });
      }
    }
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = SPIRAL.recover;
    }
  } else if (boss.state === 'recover') {
    boss.timer -= dt;
    if (boss.timer <= 0) endAttack();
  } else if (boss.state === 'overloaded') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      spawnSentinels();
      addRing(boss.x, coreY(), 3, 'void', 0.7);
      endAttack();
    }
  }

  // Checkerboard waves resolve on their own timers, even if the boss was interrupted
  for (const wave of boss.waves) {
    wave.t += dt;
    if (!wave.detonated && wave.t >= wave.warn) {
      wave.detonated = true;
      wave.flash = GRID.blast;
      const half = GRID.cellSize / 2 + 4;
      const standing = wave.cells.some(c => Math.abs(player.x - c.x) < half && Math.abs(player.y - c.y) < half);
      for (const c of wave.cells) addRing(c.x, c.y, 0.5, 'magenta', 0.3);
      if (standing) {
        hurtPlayer(player, GRID.damage, onDeath, 'Erased by the Null Singularity!');
        if (!boss) return;
      }
    }
    if (wave.detonated) wave.flash -= dt;
  }
  boss.waves = boss.waves.filter(wave => !wave.detonated || wave.flash > 0);

  // Spiral bolts
  for (const bolt of boss.bolts) {
    bolt.x += bolt.vx * dt;
    bolt.y += bolt.vy * dt;
    bolt.life -= dt;
    bolt.spin += dt * 6;
    if (Math.hypot(bolt.x - boss.centerX, bolt.y - boss.centerY) > ARENA_RADIUS + 40) bolt.life = 0;
    if (bolt.life > 0 && Math.hypot(bolt.x - player.x, bolt.y - player.y) < SPIRAL.radius + 12) {
      bolt.life = 0;
      addRing(bolt.x, bolt.y, 0.7, 'void', 0.3);
      hurtPlayer(player, SPIRAL.damage, onDeath, 'Deleted by the Null Singularity!');
      if (!boss) return;
    }
  }
  boss.bolts = boss.bolts.filter(bolt => bolt.life > 0);

  // Touching the core hurts
  if (Math.hypot(player.x - boss.x, player.y - coreY()) < CORE_RADIUS + 12) {
    pushPlayer(player, boss.x, coreY(), 40);
    hurtPlayer(player, BOSS.contactDamage, onDeath, 'Crushed by the Null Singularity!');
    if (!boss) return;
  }

  const px = player.x - boss.centerX;
  const py = player.y - boss.centerY;
  const pDistance = Math.hypot(px, py);
  const limit = ARENA_RADIUS - 24;
  if (pDistance > limit) {
    player.x = boss.centerX + px / pDistance * limit;
    player.y = boss.centerY + py / pDistance * limit;
  }
  player.cameraX = player.x - canvas.width / 2;
  player.cameraY = player.y - canvas.height / 2;
}

// ---------- Drawing ----------

function drawEffect(ctx, effect, player) {
  const t = 1 - effect.timer / effect.max;
  const fade = 1 - t;
  const color = RING_COLORS[effect.color];
  const x = effect.x - player.cameraX;
  const y = effect.y - player.cameraY;
  const s = effect.size;
  ctx.save();
  ctx.fillStyle = `rgba(${color}, ${fade * 0.14})`;
  ctx.beginPath();
  ctx.arc(x, y, (10 + t * 40) * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${color}, ${fade})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, (8 + t * 40) * s, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + 0.3;
    const inner = (10 + t * 28) * s;
    const size = 3 * fade * s + 0.5;
    ctx.fillStyle = `rgba(${color}, ${fade})`;
    ctx.fillRect(x + Math.cos(angle) * (inner + 6 * s) - size / 2, y + Math.sin(angle) * (inner + 6 * s) - size / 2, size, size);
  }
  ctx.restore();
}

function drawArena(ctx, player, time) {
  const centerX = boss.centerX - player.cameraX;
  const centerY = boss.centerY - player.cameraY;
  ctx.save();
  const fill = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, ARENA_RADIUS);
  fill.addColorStop(0, 'rgba(76, 29, 149, 0.34)');
  fill.addColorStop(1, 'rgba(12, 4, 30, 0.42)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.fill();

  for (const star of STARS) {
    const twinkle = 0.35 + Math.sin(time / 500 + star.phase) * 0.3;
    ctx.fillStyle = `rgba(233, 213, 255, ${Math.max(0.05, twinkle)})`;
    ctx.fillRect(centerX + Math.cos(star.angle) * star.dist, centerY + Math.sin(star.angle) * star.dist, star.size, star.size);
  }

  ctx.lineWidth = 2;
  ctx.setLineDash([22, 18]);
  [200, 360, 520].forEach((radius, index) => {
    ctx.strokeStyle = `rgba(167, 139, 250, ${0.12 + index * 0.02})`;
    ctx.lineDashOffset = (index % 2 ? 1 : -1) * time / 60;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, TAU);
    ctx.stroke();
  });

  ctx.strokeStyle = 'rgba(192, 132, 252, 0.8)';
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 28; i++) {
    const angle = i * TAU / 28;
    const fx = centerX + Math.cos(angle) * (ARENA_RADIUS - 10);
    const fy = centerY + Math.sin(angle) * (ARENA_RADIUS - 10);
    const lift = Math.sin(time / 400 + i) * 2;
    ctx.fillStyle = i % 2 ? '#5b21b6' : '#7c3aed';
    ctx.beginPath();
    ctx.moveTo(fx, fy - 11 + lift);
    ctx.lineTo(fx + 6, fy + lift);
    ctx.lineTo(fx, fy + 11 + lift);
    ctx.lineTo(fx - 6, fy + lift);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGrid(ctx, player, canvas) {
  const size = GRID.cellSize;
  const next = boss.waves.find(wave => !wave.detonated);
  ctx.save();
  for (const wave of boss.waves) {
    for (const cell of wave.cells) {
      const cx = cell.x - player.cameraX;
      const cy = cell.y - player.cameraY;
      if (cx < -size || cy < -size - 160 || cx > canvas.width + size || cy > canvas.height + size) continue;

      if (!wave.detonated) {
        if (wave.t < 0) continue;
        const p = Math.min(1, wave.t / wave.warn);
        const rgb = wave === next ? '239, 68, 68' : '167, 139, 250';
        ctx.fillStyle = `rgba(${rgb}, ${0.06 + p * 0.2})`;
        ctx.fillRect(cx - size / 2 + 3, cy - size / 2 + 3, size - 6, size - 6);
        ctx.strokeStyle = `rgba(${rgb}, ${0.35 + p * 0.55})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - size / 2 + 3, cy - size / 2 + 3, size - 6, size - 6);
        const inner = (size - 10) * p;
        ctx.fillStyle = `rgba(${rgb}, ${0.15 + p * 0.3})`;
        ctx.fillRect(cx - inner / 2, cy - inner / 2, inner, inner);
      } else {
        const p = Math.max(0, wave.flash / GRID.blast);
        const pillar = ctx.createLinearGradient(cx, cy + size / 2, cx, cy - 160);
        pillar.addColorStop(0, `rgba(232, 121, 249, ${p * 0.75})`);
        pillar.addColorStop(1, 'rgba(232, 121, 249, 0)');
        ctx.fillStyle = pillar;
        ctx.fillRect(cx - size / 2 + 10, cy - 160, size - 20, 160 + size / 2);
        ctx.fillStyle = `rgba(250, 232, 255, ${p * 0.85})`;
        ctx.fillRect(cx - size / 2 + 3, cy - size / 2 + 3, size - 6, size - 6);
      }
    }
  }
  ctx.restore();
}

function drawBeams(ctx, player, time) {
  if (boss.state !== 'beamWindup' && boss.state !== 'beaming') return;
  const x = boss.x - player.cameraX;
  const y = coreY() - player.cameraY;
  const windup = boss.state === 'beamWindup';
  const length = BEAM.length;
  const width = BEAM.width;

  ctx.save();
  ctx.translate(x, y);
  for (const angle of beamAngles()) {
    ctx.save();
    ctx.rotate(angle);
    if (windup) {
      const p = 1 - boss.timer / BEAM.windup;
      ctx.fillStyle = `rgba(232, 121, 249, ${0.05 + p * 0.13})`;
      ctx.fillRect(0, -width / 2, length, width);
      ctx.strokeStyle = `rgba(244, 114, 182, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -time / 20;
      ctx.strokeRect(0, -width / 2, length, width);
      ctx.setLineDash([]);
    } else {
      const ramp = Math.min(1, boss.beamElapsed / 0.12);
      const flicker = (0.85 + Math.sin(time / 30) * 0.15) * ramp;
      const body = ctx.createLinearGradient(0, 0, length, 0);
      body.addColorStop(0, `rgba(244, 114, 182, ${0.95 * flicker})`);
      body.addColorStop(1, `rgba(168, 85, 247, ${0.5 * flicker})`);
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = 24;
      ctx.fillStyle = body;
      ctx.fillRect(0, -width / 2, length, width);
      ctx.shadowBlur = 0;
      ctx.fillStyle = `rgba(103, 232, 249, ${0.9 * flicker})`;
      ctx.fillRect(0, -width * 0.24, length, width * 0.48);
      ctx.fillStyle = `rgba(255, 255, 255, ${flicker})`;
      ctx.fillRect(0, -width * 0.08, length, width * 0.16);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * flicker})`;
      ctx.beginPath();
      ctx.arc(length, 0, width * 0.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawSentinel(ctx, sentinel, player, time) {
  const pos = sentinelWorld(sentinel);
  const x = pos.x - player.cameraX;
  const y = pos.y - player.cameraY;
  const bx = boss.x - player.cameraX;
  const by = coreY() - player.cameraY;
  const grow = 1 - sentinel.spawn / 0.6;
  const flash = sentinel.flash > 0;

  ctx.save();
  ctx.strokeStyle = `rgba(192, 132, 252, ${0.22 + Math.sin(time / 120 + sentinel.angle) * 0.1})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -time / 40;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.translate(x, y);
  ctx.scale(grow, grow);
  ctx.rotate(time / 500 + sentinel.angle);
  const crystal = ctx.createLinearGradient(-14, -22, 14, 22);
  if (flash) {
    crystal.addColorStop(0, '#ffffff');
    crystal.addColorStop(1, '#e9d5ff');
  } else {
    crystal.addColorStop(0, '#22d3ee');
    crystal.addColorStop(0.5, '#7c3aed');
    crystal.addColorStop(1, '#4c1d95');
  }
  ctx.shadowColor = '#a855f7';
  ctx.shadowBlur = 16;
  ctx.fillStyle = crystal;
  ctx.strokeStyle = '#ede9fe';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(14, 0);
  ctx.lineTo(0, 22);
  ctx.lineTo(-14, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(237, 233, 254, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -22);
  ctx.lineTo(0, 22);
  ctx.moveTo(-14, 0);
  ctx.lineTo(14, 0);
  ctx.stroke();
  ctx.restore();

  // Health ring stays upright
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.9)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 27, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0, sentinel.hp) / sentinel.maxHp);
  ctx.stroke();
  ctx.restore();
}

function drawDisk(ctx, time, speedScale, front) {
  const rings = [
    { rx: 100, ry: 28, color: '#c084fc', width: 5, dash: [34, 14], speed: 1 },
    { rx: 80, ry: 22, color: '#e879f9', width: 3.5, dash: [22, 10], speed: -1.3 },
    { rx: 64, ry: 17, color: '#67e8f9', width: 2.5, dash: [14, 8], speed: 1.7 }
  ];
  for (const ring of rings) {
    ctx.strokeStyle = ring.color;
    ctx.lineWidth = ring.width;
    ctx.setLineDash(ring.dash);
    ctx.lineDashOffset = -time * 0.05 * ring.speed * speedScale;
    ctx.beginPath();
    ctx.ellipse(0, 0, ring.rx, ring.ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawSingularity(ctx, player, canvas, time) {
  const state = boss.state;
  const x = boss.x - player.cameraX;
  const y = coreY() - player.cameraY;
  if (x < -220 || y < -220 || x > canvas.width + 220 || y > canvas.height + 220) return;

  const overloaded = state === 'overloaded';
  const casting = state === 'beamWindup' || state === 'beaming' || state === 'spiralWindup' || state === 'gridCast';
  const flash = boss.hitFlash > 0;
  const shielded = livingSentinels().length > 0 && !boss.defeated;

  let alpha = 1;
  let scale = 1;
  if (boss.defeated) {
    const p = Math.max(0, boss.defeatTimer / BOSS.deathTime);
    alpha = Math.max(0.15, p);
    scale = 0.3 + p * 0.7;
  } else if (state === 'intro') {
    const p = 1 - boss.timer / INTRO_TIME;
    alpha = Math.min(1, p * 2);
    scale = 0.4 + p * 0.6;
  }

  const tint = overloaded ? '232, 121, 249' : casting ? '103, 232, 249' : '168, 85, 247';
  const pulse = 1 + Math.sin(time / 180) * 0.06 + (overloaded ? Math.sin(time / 40) * 0.05 : 0);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x + (overloaded ? Math.sin(time / 28) * 2 : 0), y);
  ctx.scale(scale, scale);

  // Outer glow
  const aura = ctx.createRadialGradient(0, 0, 20, 0, 0, 150 * pulse);
  aura.addColorStop(0, `rgba(${tint}, 0.4)`);
  aura.addColorStop(1, `rgba(${tint}, 0)`);
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 150 * pulse, 0, TAU);
  ctx.fill();

  // Shield bubble while any sentinel is alive
  if (shielded) {
    const glow = 0.1 + boss.shieldFlash * 1.4;
    ctx.fillStyle = `rgba(192, 132, 252, ${glow})`;
    ctx.strokeStyle = `rgba(216, 180, 254, ${0.3 + boss.shieldFlash * 2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, SHIELD_RADIUS, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(216, 180, 254, 0.14)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const a = time / 3000 + k * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 30, Math.sin(a) * 30);
      ctx.lineTo(Math.cos(a) * SHIELD_RADIUS, Math.sin(a) * SHIELD_RADIUS);
      ctx.stroke();
    }
  }

  // Accretion disk, back half
  ctx.save();
  ctx.rotate(-0.35 + Math.sin(time / 2200) * 0.06);
  ctx.lineCap = 'round';
  drawDisk(ctx, time, casting ? 2 : 1, false);
  ctx.restore();

  // Core sphere
  const core = ctx.createRadialGradient(-10, -12, 4, 0, 0, CORE_RADIUS);
  if (flash) {
    core.addColorStop(0, '#ffffff');
    core.addColorStop(1, '#ddd6fe');
  } else {
    core.addColorStop(0, '#1e1038');
    core.addColorStop(0.65, '#07030f');
    core.addColorStop(1, '#000000');
  }
  ctx.shadowColor = `rgb(${tint})`;
  ctx.shadowBlur = overloaded ? 34 : 20;
  ctx.fillStyle = core;
  ctx.strokeStyle = overloaded ? '#f0abfc' : '#a855f7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, CORE_RADIUS * pulse, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Eye: a closed slit while shielded, wide open when overloaded
  const lookX = Math.cos(boss.eyeAngle) * 9;
  const lookY = Math.sin(boss.eyeAngle) * 9;
  let open = 0.12;
  if (overloaded) open = 1;
  else if (casting) open = 0.6;
  const eyeColor = overloaded ? '#fdf4ff' : casting ? '#67e8f9' : '#7c3aed';
  ctx.save();
  ctx.translate(lookX, lookY);
  ctx.fillStyle = '#030208';
  ctx.strokeStyle = eyeColor;
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = open > 0.5 ? 18 : 8;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 3 + open * 17, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (open > 0.3) {
    ctx.fillStyle = eyeColor;
    ctx.globalAlpha = alpha * (overloaded ? 0.7 + Math.sin(time / 50) * 0.3 : 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, 4 + open * 8, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#030208';
    ctx.fillRect(-1.5, -(3 + open * 9), 3, 6 + open * 18);
  }
  ctx.restore();

  // Accretion disk, front half
  ctx.save();
  ctx.rotate(-0.35 + Math.sin(time / 2200) * 0.06);
  ctx.lineCap = 'round';
  drawDisk(ctx, time, casting ? 2 : 1, true);
  ctx.restore();

  ctx.restore();
}

function drawBolts(ctx, player, time) {
  for (const bolt of boss.bolts) {
    const x = bolt.x - player.cameraX;
    const y = bolt.y - player.cameraY;
    const speed = Math.hypot(bolt.vx, bolt.vy) || 1;
    ctx.save();
    ctx.lineCap = 'round';
    const trail = ctx.createLinearGradient(x - bolt.vx / speed * 28, y - bolt.vy / speed * 28, x, y);
    trail.addColorStop(0, 'rgba(168, 85, 247, 0)');
    trail.addColorStop(1, 'rgba(192, 132, 252, 0.6)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(x - bolt.vx / speed * 28, y - bolt.vy / speed * 28);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.translate(x, y);
    ctx.rotate(bolt.spin);
    ctx.shadowColor = '#c084fc';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#7c3aed';
    ctx.strokeStyle = '#e9d5ff';
    ctx.lineWidth = 2;
    const r = SPIRAL.radius + 2;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f5f3ff';
    ctx.fillRect(-2, -2, 4, 4);
    ctx.restore();
  }
}

function drawHud(ctx, canvas, time) {
  const barWidth = Math.min(560, canvas.width - 80);
  const barX = (canvas.width - barWidth) / 2;
  const barY = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 50);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(barX, barY + 14, barWidth, 14);
  ctx.fillStyle = boss.enraged ? '#e879f9' : '#a855f7';
  ctx.fillRect(barX, barY + 14, barWidth * healthRatio(), 14);
  ctx.strokeStyle = '#e9d5ff';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY + 14, barWidth, 14);
  if (!boss.enraged) {
    const tick = barX + barWidth * ENRAGE.threshold;
    ctx.beginPath();
    ctx.moveTo(tick, barY + 11);
    ctx.lineTo(tick, barY + 31);
    ctx.stroke();
  }
  ctx.fillStyle = '#f5f3ff';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(NAME, canvas.width / 2, barY + 9);

  // One pip per sentinel
  const alive = boss.sentinels.filter(sentinel => sentinel.alive).length;
  for (let k = 0; k < SENT.count; k++) {
    const px = canvas.width / 2 + (k - (SENT.count - 1) / 2) * 16;
    const py = barY + 36;
    ctx.fillStyle = k < alive ? '#67e8f9' : '#312e4a';
    ctx.beginPath();
    ctx.moveTo(px, py - 5);
    ctx.lineTo(px + 4, py);
    ctx.lineTo(px, py + 5);
    ctx.lineTo(px - 4, py);
    ctx.closePath();
    ctx.fill();
  }

  ctx.font = 'bold 14px monospace';
  if (boss.state === 'overloaded') {
    ctx.fillStyle = `rgba(250, 232, 255, ${0.6 + Math.sin(time / 90) * 0.4})`;
    ctx.fillText('>> OVERLOADED! HIT THE CORE! <<', canvas.width / 2, barY + 66);
  } else if (alive > 0 && boss.state !== 'intro') {
    ctx.fillStyle = 'rgba(216, 180, 254, 0.85)';
    ctx.fillText('>> SHATTER THE SENTINELS <<', canvas.width / 2, barY + 66);
  }
  ctx.restore();
}

export function drawVoidBoss(ctx, player, canvas, time) {
  if (!boss) return;
  drawArena(ctx, player, time);
  drawGrid(ctx, player, canvas);
  drawBeams(ctx, player, time);
  drawSingularity(ctx, player, canvas, time);
  for (const sentinel of boss.sentinels) {
    if (sentinel.alive) drawSentinel(ctx, sentinel, player, time);
  }
  drawBolts(ctx, player, time);
  for (const effect of boss.effects) drawEffect(ctx, effect, player);
  if (!boss.defeated) drawHud(ctx, canvas, time);
}