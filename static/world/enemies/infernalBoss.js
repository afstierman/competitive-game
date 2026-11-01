import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';
import { CONFIG } from '../../config.js';
import { checkCollision } from '../world.js';
import { getTileEnvironment } from '../generation.js';

const BOSS = ENEMIES_CONFIG.infernalBoss;
const ENRAGE = {
  threshold: 0.4,
  speedScale: 1.4,
  cooldownScale: 0.6,
  ...(BOSS.enrage || {})
};
const DASH = BOSS.dash;
const GEYSER = BOSS.geyser;
const NOVA = BOSS.nova;

// Optional config keys. Every one has a default, so the config works without them.
const EXPOSED_MULTIPLIER = BOSS.exposedMultiplier ?? 2;
const DASH_LOCK = DASH.lockTime ?? 0.25;
const DASH_LANE_WIDTH = DASH.laneWidth ?? 70;
const TRAIL_RADIUS = DASH.trailRadius ?? 28;
const TRAIL_DAMAGE = DASH.trailDamage ?? Math.max(2, Math.round(DASH.damage * 0.4));
const GEYSER_STAGGER = GEYSER.stagger ?? 0.14;
const GEYSER_PUDDLE_LIFE = GEYSER.puddleLife ?? 2.5;
const NOVA_GAP = NOVA.gapWidth ?? 0.85;
const NOVA_RING_GAP = NOVA.ringGap ?? 0.5;
const NOVA_RINGS_ENRAGED = NOVA.ringsPhaseTwo ?? NOVA.rings + 2;

const ARENA_RADIUS = 600;
const BOSS_RADIUS = 46;
const INTRO_TIME = 2.2;
const ROAR_TIME = 1.4;
const HIT_KEY = 'infernal-boss';
const NAME = BOSS.name.toUpperCase();
const TAU = Math.PI * 2;

// Hit circles along the drake: [distance forward of center, radius]
const HIT_CIRCLES = [[-72, 16], [-40, 28], [-6, 42], [34, 32], [72, 20]];

const RING_COLORS = {
  fire: '249, 115, 22',
  amber: '251, 191, 36',
  plasma: '244, 63, 94',
  white: '254, 243, 199'
};

// Fixed layouts so the arena never flickers
const CRACKS = Array.from({ length: 16 }, (_, i) => {
  const points = [];
  let radius = 70 + (i % 3) * 30;
  let angle = i * TAU / 16 + Math.sin(i * 7.3) * 0.2;
  while (radius < ARENA_RADIUS - 40) {
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    radius += 46 + Math.abs(Math.sin(i * 3.1 + radius)) * 30;
    angle += Math.sin(i * 5.7 + radius * 0.05) * 0.18;
  }
  return points;
});

const EMBERS = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 64.2) * 43758.5453;
  const b = Math.sin(i * 22.1 + 1.4) * 24634.6345;
  const c = Math.sin(i * 35.8 + 2.7) * 15731.7431;
  const r1 = a - Math.floor(a);
  const r2 = b - Math.floor(b);
  const r3 = c - Math.floor(c);
  return { angle: r1 * TAU, dist: Math.sqrt(r2) * (ARENA_RADIUS - 28), size: 1 + r3 * 2.2, phase: r1 * 14 };
});

let boss = null;

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function healthRatio() {
  return boss ? Math.max(0, boss.hp) / boss.maxHp : 0;
}

function addRing(x, y, size, color, duration = 0.6) {
  boss.effects.push({ x, y, size, color, timer: duration, max: duration });
}

function addPuddle(x, y, radius, life, damage) {
  boss.puddles.push({ x, y, radius, life, max: life, damage });
}

function nextCooldown() {
  const scale = boss.enraged ? ENRAGE.cooldownScale : 1;
  return rand(BOSS.attackDelay.min, BOSS.attackDelay.max) * scale;
}

function clampToArena(x, y, margin) {
  const dx = x - boss.centerX;
  const dy = y - boss.centerY;
  const distance = Math.hypot(dx, dy);
  const limit = ARENA_RADIUS - margin;
  if (distance > limit) {
    return { x: boss.centerX + dx / distance * limit, y: boss.centerY + dy / distance * limit, clamped: true };
  }
  return { x, y, clamped: false };
}

// Returns true if the boss had to be pulled back inside the arena
function keepInArena(margin) {
  const point = clampToArena(boss.x, boss.y, margin);
  boss.x = point.x;
  boss.y = point.y;
  return point.clamped;
}

function faceToward(angle, dt, rate) {
  boss.facing += angleDifference(angle, boss.facing) * Math.min(1, dt * rate);
}

function bossCircles() {
  const cos = Math.cos(boss.facing);
  const sin = Math.sin(boss.facing);
  return HIT_CIRCLES.map(([offset, radius]) => ({
    x: boss.x + cos * offset,
    y: boss.y + sin * offset,
    radius
  }));
}

// Deals damage to the player. Returns false if the boss was cleared (player death reset the game),
// so every caller can stop touching boss state right away.
function strike(player, amount, onDeath, message) {
  if (player.enemyDamageCooldown > 0) return true;
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.8;
  if (player.hp <= 0) onDeath?.(message);
  return Boolean(boss);
}

// Pushes the player without shoving them into a wall or rock
function pushPlayer(player, fromX, fromY, distance) {
  const angle = Math.atan2(player.y - fromY, player.x - fromX);
  const nextX = player.x + Math.cos(angle) * distance;
  const nextY = player.y + Math.sin(angle) * distance;
  if (!checkCollision(nextX, nextY + 17, CONFIG.playerRadius)) {
    player.x = nextX;
    player.y = nextY;
  }
}

function isLavaAt(x, y) {
  const bodyY = y + 17;
  const radius = CONFIG.playerRadius;
  const points = [
    [x, bodyY],
    [x - radius, bodyY],
    [x + radius, bodyY],
    [x, bodyY - radius],
    [x, bodyY + radius]
  ];
  return points.some(([px, py]) => getTileEnvironment(
    Math.floor(px / CONFIG.tileSize),
    Math.floor(py / CONFIG.tileSize)
  )?.type === 'lava_pool');
}

function findOpenSpot(x, y) {
  const isSafe = (px, py) => !checkCollision(px, py + 17, CONFIG.playerRadius) && !isLavaAt(px, py);
  if (isSafe(x, y)) return { x, y };

  // Search the arena for a clear landing point, checking the full player footprint
  // so the introduction cannot place them on a lava-pool edge.
  for (let distance = 16; distance <= ARENA_RADIUS - CONFIG.playerRadius; distance += 16) {
    const samples = Math.max(12, Math.ceil((Math.PI * 2 * distance) / 16));
    for (let index = 0; index < samples; index++) {
      const angle = (index / samples) * TAU;
      const px = x + Math.cos(angle) * distance;
      const py = y + Math.sin(angle) * distance;
      if (Math.hypot(px - boss.centerX, py - boss.centerY) > ARENA_RADIUS - CONFIG.playerRadius) continue;
      if (isSafe(px, py)) return { x: px, y: py };
    }
  }

  return { x, y };
}

export function resetInfernalBoss() {
  boss = null;
}

export function isInfernalBossActive() {
  return Boolean(boss);
}

export function startInfernalBoss(worldX, worldY, player, canvas) {
  if (boss) return;
  const centerX = worldX;
  const centerY = worldY;
  boss = {
    x: centerX,
    y: centerY - 90,
    centerX,
    centerY,
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | stalk | dashWindup | dashing | geyserWindup | geyserCast | novaWindup | novaCast | recover | roar
    timer: INTRO_TIME,
    lastAttack: null,
    attackCooldown: 0,
    enraged: false,
    pendingRoar: false,
    exposed: false,
    facing: Math.PI / 2,
    strafeAngle: rand(0, TAU),
    strafeDir: Math.random() < 0.5 ? -1 : 1,
    strafeTimer: rand(2, 4),
    dashAngle: 0,
    dashesLeft: 0,
    dashHit: false,
    lastTrailX: centerX,
    lastTrailY: centerY,
    sparkTimer: 0,
    novaT: 0,
    novaSpawned: 0,
    novaTotal: 0,
    novaDir: 1,
    novaX: centerX,
    novaY: centerY,
    geysers: [],
    rings: [],
    puddles: [],
    effects: [],
    hitFlash: 0,
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  addRing(boss.x, boss.y, 4, 'plasma', 1.2);

  if (player) {
    const spawn = findOpenSpot(centerX + 120, centerY + 170);
    player.x = spawn.x;
    player.y = spawn.y;
    if (canvas) {
      player.cameraX = player.x - canvas.width / 2;
      player.cameraY = player.y - canvas.height / 2;
    }
    player.isAttacking = false;
    player.slashTimer = 0;
    player.slingshotShotActive = false;
    player.attackHitEnemies.clear();
  }
  window.dispatchEvent(new CustomEvent('infernal-boss-summoned', {
    detail: { x: centerX, y: centerY }
  }));
}

function defeatBoss(player) {
  boss.defeated = true;
  boss.defeatTimer = BOSS.deathTime;
  boss.geysers = [];
  boss.rings = [];
  boss.puddles = [];
  player.cycles += BOSS.reward;
  window.dispatchEvent(new CustomEvent('infernal-boss-defeated', {
    detail: { x: boss.x, y: boss.y }
  }));
}

function applyDamage(player, angle) {
  if (!boss || boss.defeated || boss.state === 'intro') return;
  const shot = player.activeWeapon === 'slingshot';
  if (shot && !player.slingshotShotActive) return;
  if (player.attackHitEnemies.has(HIT_KEY)) return;

  const range = shot ? player.slingshotShotRange : 80;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.38;

  let hit = null;
  for (const circle of bossCircles()) {
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
  boss.hp -= baseDamage * (boss.exposed ? EXPOSED_MULTIPLIER : 1);
  boss.hitFlash = 0.1;
  player.attackHitEnemies.add(HIT_KEY);
  if (shot) player.slingshotShotActive = false;
  addRing(hit.x, hit.y, boss.exposed ? 1.2 : 0.6, boss.exposed ? 'white' : 'plasma', 0.28);
  if (boss.hp <= 0) defeatBoss(player);
}

export function damageInfernalBoss(player, swingAngle) {
  if (!boss || boss.defeated) return;
  applyDamage(player, swingAngle);
}

function startAttack(toPlayer) {
  const options = ['dash', 'geyser', 'nova'].filter(type => type !== boss.lastAttack);
  const type = options[Math.floor(Math.random() * options.length)];
  const tempo = boss.enraged ? 0.85 : 1;
  boss.lastAttack = type;
  if (type === 'dash') {
    boss.state = 'dashWindup';
    boss.timer = DASH.windup * tempo;
    boss.dashAngle = toPlayer;
    boss.dashesLeft = boss.enraged ? 1 : 0;
  } else if (type === 'geyser') {
    boss.state = 'geyserWindup';
    boss.timer = GEYSER.windup * tempo;
  } else {
    boss.state = 'novaWindup';
    boss.timer = NOVA.windup * tempo;
  }
}

function endAttack() {
  if (boss.pendingRoar) {
    startRoar();
    return;
  }
  boss.state = 'stalk';
  boss.attackCooldown = nextCooldown();
}

function startRoar() {
  boss.pendingRoar = false;
  boss.enraged = true;
  boss.state = 'roar';
  boss.timer = ROAR_TIME;
  addRing(boss.x, boss.y, 5, 'plasma', 1.1);
  addRing(boss.x, boss.y, 3.4, 'amber', 0.8);
}

function startDash() {
  boss.state = 'dashing';
  boss.timer = DASH.duration;
  boss.dashHit = false;
  boss.facing = boss.dashAngle;
  boss.lastTrailX = boss.x;
  boss.lastTrailY = boss.y;
  boss.sparkTimer = 0;
  addRing(boss.x, boss.y, 3, 'plasma', 0.5);
}

function finishDash() {
  addRing(boss.x, boss.y, 4, 'white', 0.7);
  addRing(boss.x, boss.y, 2.6, 'plasma', 0.5);
  addPuddle(boss.x, boss.y, TRAIL_RADIUS * 1.5, DASH.trailDuration, TRAIL_DAMAGE);
  if (boss.dashesLeft > 0) {
    // Enraged: chains straight into a second dash
    boss.dashesLeft--;
    boss.state = 'dashWindup';
    boss.timer = 0.5;
  } else {
    boss.state = 'recover';
    boss.timer = DASH.recover;
  }
}

function buildGeysers(player) {
  const count = boss.enraged ? GEYSER.countPhaseTwo : GEYSER.count;
  const margin = GEYSER.radius + 10;
  const spots = [clampToArena(player.x, player.y, margin)];
  for (let i = 1; i < count; i++) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const angle = rand(0, TAU);
      const distance = rand(80, 320);
      const spot = clampToArena(player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance, margin);
      if (spots.every(other => Math.hypot(other.x - spot.x, other.y - spot.y) > GEYSER.radius * 1.5)) {
        spots.push(spot);
        break;
      }
    }
  }
  boss.geysers = spots.map((spot, index) => ({
    x: spot.x,
    y: spot.y,
    t: -index * GEYSER_STAGGER,
    erupted: false
  }));
  return (spots.length - 1) * GEYSER_STAGGER + GEYSER.warnTime + GEYSER.eruptionTime;
}

function spawnNovaRing(player) {
  const dx = player.x - boss.novaX;
  const dy = player.y - boss.novaY;
  const distance = Math.max(60, Math.hypot(dx, dy));
  const toPlayer = Math.atan2(dy, dx);
  const gapHalf = NOVA_GAP * (boss.enraged ? 0.78 : 1) / 2;
  // The gap sits just beside the player, so standing still gets you hit but a short sidestep is enough
  const extra = Math.min(0.55, 55 / distance);
  boss.novaDir *= -1;
  boss.rings.push({
    x: boss.novaX,
    y: boss.novaY,
    radius: 40,
    speed: NOVA.ringSpeed * (boss.enraged ? 1.12 : 1),
    gap: toPlayer + boss.novaDir * (gapHalf + extra),
    gapHalf,
    hit: false,
    maxRadius: Math.hypot(boss.novaX - boss.centerX, boss.novaY - boss.centerY) + ARENA_RADIUS + 40
  });
  addRing(boss.novaX, boss.novaY, 2.2, 'amber', 0.4);
}

export function updateInfernalBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(effect => effect.timer > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 22) {
      addRing(boss.x + rand(-70, 70), boss.y + rand(-50, 50), rand(1, 2.4), Math.random() < 0.5 ? 'plasma' : 'amber', 0.6);
    }
    if (boss.defeatTimer <= 0) boss = null;
    return;
  }

  for (const puddle of boss.puddles) puddle.life -= dt;
  boss.puddles = boss.puddles.filter(puddle => puddle.life > 0);

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

  // Enrage waits for a safe moment so it never cuts an attack in half
  if (!boss.enraged && !boss.pendingRoar && healthRatio() < ENRAGE.threshold) boss.pendingRoar = true;

  boss.exposed = boss.state === 'recover';

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const speed = BOSS.movementSpeed * (boss.enraged ? ENRAGE.speedScale : 1);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'stalk';
      boss.attackCooldown = nextCooldown();
      addRing(boss.x, boss.y, 5, 'white', 0.8);
      addRing(boss.x, boss.y, 3.4, 'plasma', 0.6);
    }
  } else if (boss.state === 'stalk') {
    if (boss.pendingRoar) {
      startRoar();
    } else {
      boss.strafeTimer -= dt;
      if (boss.strafeTimer <= 0) {
        boss.strafeDir *= -1;
        boss.strafeTimer = rand(2, 4);
      }
      boss.strafeAngle += boss.strafeDir * dt * 0.9 * (boss.enraged ? 1.3 : 1);
      const target = clampToArena(
        player.x + Math.cos(boss.strafeAngle) * 230,
        player.y + Math.sin(boss.strafeAngle) * 230,
        BOSS_RADIUS + 30
      );
      const tdx = target.x - boss.x;
      const tdy = target.y - boss.y;
      const tDistance = Math.hypot(tdx, tdy);
      if (tDistance > 4) {
        const step = Math.min(tDistance, speed * dt);
        boss.x += tdx / tDistance * step;
        boss.y += tdy / tDistance * step;
      }
      keepInArena(BOSS_RADIUS + 20);
      faceToward(toPlayer, dt, 6);
      boss.attackCooldown -= dt;
      if (boss.attackCooldown <= 0) startAttack(toPlayer);
    }
  } else if (boss.state === 'dashWindup') {
    boss.timer -= dt;
    // Tracks the player until just before the dash, then locks
    if (boss.timer > DASH_LOCK) boss.dashAngle = toPlayer;
    faceToward(boss.dashAngle, dt, 10);
    if (boss.timer <= 0) startDash();
  } else if (boss.state === 'dashing') {
    boss.timer -= dt;
    boss.facing = boss.dashAngle;
    boss.x += Math.cos(boss.dashAngle) * DASH.speed * dt;
    boss.y += Math.sin(boss.dashAngle) * DASH.speed * dt;
    const hitWall = keepInArena(BOSS_RADIUS + 12);
    if (Math.hypot(boss.x - boss.lastTrailX, boss.y - boss.lastTrailY) >= TRAIL_RADIUS * 1.1) {
      addPuddle(boss.x, boss.y, TRAIL_RADIUS, DASH.trailDuration, TRAIL_DAMAGE);
      boss.lastTrailX = boss.x;
      boss.lastTrailY = boss.y;
    }
    boss.sparkTimer -= dt;
    if (boss.sparkTimer <= 0) {
      addRing(boss.x, boss.y, 0.8, 'fire', 0.3);
      boss.sparkTimer = 0.06;
    }
    if (boss.timer <= 0 || hitWall) finishDash();
  } else if (boss.state === 'geyserWindup') {
    boss.timer -= dt;
    faceToward(toPlayer, dt, 6);
    if (boss.timer <= 0) {
      boss.state = 'geyserCast';
      boss.timer = buildGeysers(player);
      addRing(boss.x, boss.y, 2.6, 'amber', 0.5);
    }
  } else if (boss.state === 'geyserCast') {
    boss.timer -= dt;
    faceToward(toPlayer, dt, 4);
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = GEYSER.recover;
    }
  } else if (boss.state === 'novaWindup') {
    boss.timer -= dt;
    faceToward(toPlayer, dt, 4);
    if (boss.timer <= 0) {
      boss.state = 'novaCast';
      boss.novaT = 0;
      boss.novaSpawned = 0;
      boss.novaTotal = boss.enraged ? NOVA_RINGS_ENRAGED : NOVA.rings;
      boss.novaDir = Math.random() < 0.5 ? -1 : 1;
      boss.novaX = boss.x;
      boss.novaY = boss.y;
    }
  } else if (boss.state === 'novaCast') {
    boss.novaT += dt;
    faceToward(toPlayer, dt, 4);
    while (boss.novaSpawned < boss.novaTotal && boss.novaT >= boss.novaSpawned * NOVA_RING_GAP) {
      spawnNovaRing(player);
      boss.novaSpawned++;
    }
    if (boss.novaSpawned >= boss.novaTotal && boss.novaT >= (boss.novaTotal - 1) * NOVA_RING_GAP + 0.55) {
      boss.state = 'recover';
      boss.timer = NOVA.recover;
    }
  } else if (boss.state === 'recover') {
    boss.timer -= dt;
    faceToward(toPlayer, dt, 3);
    if (boss.timer <= 0) endAttack();
  } else if (boss.state === 'roar') {
    boss.timer -= dt;
    faceToward(toPlayer, dt, 4);
    if (Math.random() < dt * 14) addRing(boss.x + rand(-60, 60), boss.y + rand(-40, 40), rand(1, 2), 'plasma', 0.5);
    // The roar shoves you back so you cannot hug him through the transition
    if (distance < 260) pushPlayer(player, boss.x, boss.y, 150 * dt);
    if (boss.timer <= 0) {
      boss.state = 'stalk';
      boss.attackCooldown = 0.6;
    }
  }

  // Geysers resolve on their own timers
  for (const geyser of boss.geysers) {
    geyser.t += dt;
    if (!geyser.erupted && geyser.t >= GEYSER.warnTime) {
      geyser.erupted = true;
      addRing(geyser.x, geyser.y, GEYSER.radius / 28, 'white', 0.5);
      addRing(geyser.x, geyser.y, GEYSER.radius / 40, 'fire', 0.4);
      if (boss.enraged) addPuddle(geyser.x, geyser.y, GEYSER.radius * 0.7, GEYSER_PUDDLE_LIFE, TRAIL_DAMAGE);
      if (Math.hypot(player.x - geyser.x, player.y - geyser.y) < GEYSER.radius + 12) {
        if (!strike(player, GEYSER.damage, onDeath, 'Erupted into ash by Pyraxis!')) return;
      }
    }
  }
  boss.geysers = boss.geysers.filter(geyser => geyser.t < GEYSER.warnTime + GEYSER.eruptionTime);

  // Nova rings
  for (const ring of boss.rings) {
    ring.radius += ring.speed * dt;
    if (ring.hit) continue;
    const rdx = player.x - ring.x;
    const rdy = player.y - ring.y;
    const rDistance = Math.hypot(rdx, rdy);
    if (Math.abs(rDistance - ring.radius) < NOVA.radius + CONFIG.playerRadius * 0.6) {
      const inGap = Math.abs(angleDifference(Math.atan2(rdy, rdx), ring.gap)) <= ring.gapHalf;
      if (!inGap) {
        ring.hit = true;
        if (!strike(player, NOVA.damage, onDeath, 'Torn apart by a Pyraxis shockwave!')) return;
      }
    }
  }
  boss.rings = boss.rings.filter(ring => ring.radius < ring.maxRadius);

  // Lava on the ground
  for (const puddle of boss.puddles) {
    if (Math.hypot(player.x - puddle.x, player.y - puddle.y) < puddle.radius + 8) {
      if (!strike(player, puddle.damage, onDeath, 'Melted in the lava Pyraxis left behind!')) return;
      break;
    }
  }

  // Touching the drake
  if (boss.state !== 'intro'
    && bossCircles().some(circle => Math.hypot(player.x - circle.x, player.y - circle.y) < circle.radius + 12)) {
    if (boss.state === 'dashing') {
      if (!boss.dashHit && player.enemyDamageCooldown <= 0) {
        boss.dashHit = true;
        pushPlayer(player, boss.x, boss.y, 70);
        if (!strike(player, DASH.damage, onDeath, 'Run down by Pyraxis!')) return;
      }
    } else {
      pushPlayer(player, boss.x, boss.y, 40);
      if (!strike(player, BOSS.contactDamage, onDeath, 'Trampled by Pyraxis!')) return;
    }
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
  ctx.fillStyle = `rgba(${color}, ${fade * 0.18})`;
  ctx.beginPath();
  ctx.arc(x, y, (14 + t * 46) * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${color}, ${fade})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, (12 + t * 46) * s, 0, TAU);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + 0.3;
    const inner = (12 + t * 30) * s;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * (inner + 9 * fade * s), y + Math.sin(angle) * (inner + 9 * fade * s));
    ctx.stroke();
  }
  ctx.restore();
}

function drawArena(ctx, player, time) {
  const cx = boss.centerX - player.cameraX;
  const cy = boss.centerY - player.cameraY;
  ctx.save();
  const fill = ctx.createRadialGradient(cx, cy, 20, cx, cy, ARENA_RADIUS);
  fill.addColorStop(0, 'rgba(127, 29, 29, 0.42)');
  fill.addColorStop(0.7, 'rgba(60, 12, 8, 0.5)');
  fill.addColorStop(1, 'rgba(24, 6, 3, 0.62)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(cx, cy, ARENA_RADIUS, 0, TAU);
  ctx.fill();

  // Glowing lava cracks across the floor
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 8;
  CRACKS.forEach((points, i) => {
    ctx.strokeStyle = `rgba(251, 146, 60, ${0.28 + Math.sin(time / 700 + i) * 0.14})`;
    ctx.beginPath();
    points.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(cx + px, cy + py);
      else ctx.lineTo(cx + px, cy + py);
    });
    ctx.stroke();
  });
  ctx.shadowBlur = 0;

  // Rising embers
  for (const ember of EMBERS) {
    const rise = (time / 18 + ember.phase * 40) % 90;
    ctx.fillStyle = `rgba(251, 113, 133, ${Math.max(0, 0.7 - rise / 90)})`;
    ctx.fillRect(
      cx + Math.cos(ember.angle) * ember.dist,
      cy + Math.sin(ember.angle) * ember.dist - rise,
      ember.size,
      ember.size
    );
  }

  // Rim of fire
  ctx.strokeStyle = `rgba(244, 63, 94, ${0.85 + Math.sin(time / 200) * 0.1})`;
  ctx.lineWidth = 6;
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(cx, cy, ARENA_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  for (let i = 0; i < 40; i++) {
    const angle = i * TAU / 40;
    const fx = cx + Math.cos(angle) * ARENA_RADIUS;
    const fy = cy + Math.sin(angle) * ARENA_RADIUS;
    const flame = 12 + Math.sin(time / 130 + i * 1.7) * 6;
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillStyle = '#1c0508';
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.lineTo(0, -22);
    ctx.lineTo(8, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = i % 2 ? 'rgba(249, 115, 22, 0.8)' : 'rgba(251, 191, 36, 0.8)';
    ctx.beginPath();
    ctx.moveTo(-4, -18);
    ctx.lineTo(0, -18 - flame);
    ctx.lineTo(4, -18);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawPuddles(ctx, player, time) {
  for (const puddle of boss.puddles) {
    const x = puddle.x - player.cameraX;
    const y = puddle.y - player.cameraY;
    const fade = Math.min(1, puddle.life / 1);
    const r = puddle.radius * (1 + Math.sin(time / 120 + puddle.x) * 0.05);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.8);
    ctx.globalAlpha = fade;
    const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
    glow.addColorStop(0, '#fef3c7');
    glow.addColorStop(0.45, '#f97316');
    glow.addColorStop(1, 'rgba(127, 29, 29, 0.6)');
    ctx.fillStyle = glow;
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
    for (let i = 0; i < 3; i++) {
      const phase = (time / 500 + i * 0.37 + puddle.x * 0.01) % 1;
      ctx.globalAlpha = fade * (1 - phase);
      ctx.beginPath();
      ctx.arc(Math.cos(i * 2.4) * r * 0.5, Math.sin(i * 2.4) * r * 0.4, 1.5 + phase * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawDashLane(ctx, player, time) {
  if (boss.state !== 'dashWindup') return;
  const total = boss.dashesLeft > 0 && boss.timer <= 0.5 ? 0.5 : DASH.windup;
  const p = clamp(1 - boss.timer / total, 0, 1);
  const length = DASH.speed * DASH.duration + BOSS_RADIUS;
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(boss.dashAngle);
  const lane = ctx.createLinearGradient(0, 0, length, 0);
  lane.addColorStop(0, `rgba(239, 68, 68, ${0.2 + p * 0.3})`);
  lane.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
  ctx.fillStyle = lane;
  ctx.fillRect(0, -DASH_LANE_WIDTH / 2, length, DASH_LANE_WIDTH);
  ctx.strokeStyle = `rgba(253, 186, 116, ${0.35 + p * 0.55})`;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, -DASH_LANE_WIDTH / 2, length, DASH_LANE_WIDTH);
  ctx.fillStyle = `rgba(254, 215, 170, ${0.3 + p * 0.4})`;
  for (let k = 0; k < 7; k++) {
    const cx = (time / 2 + k * 60) % length;
    ctx.beginPath();
    ctx.moveTo(cx, -9);
    ctx.lineTo(cx + 13, 0);
    ctx.lineTo(cx, 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGeyserWarnings(ctx, player, time) {
  for (const geyser of boss.geysers) {
    if (geyser.t < 0 || geyser.t >= GEYSER.warnTime) continue;
    const p = geyser.t / GEYSER.warnTime;
    const x = geyser.x - player.cameraX;
    const y = geyser.y - player.cameraY;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.82);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.08 + p * 0.22})`;
    ctx.strokeStyle = `rgba(253, 186, 116, ${0.4 + p * 0.55})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = -time / 25;
    ctx.beginPath();
    ctx.arc(0, 0, GEYSER.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(254, 215, 170, ${0.15 + p * 0.35})`;
    ctx.beginPath();
    ctx.arc(0, 0, GEYSER.radius * p, 0, TAU);
    ctx.fill();
    ctx.restore();
    // Heat shimmer rising from the spot
    ctx.fillStyle = `rgba(251, 146, 60, ${0.3 + p * 0.4})`;
    for (let k = 0; k < 4; k++) {
      const rise = ((time / 14 + k * 17) % 40);
      ctx.fillRect(x + (k - 1.5) * 10, y - rise, 2, 2);
    }
  }
}

function drawGeyserBlasts(ctx, player) {
  for (const geyser of boss.geysers) {
    if (geyser.t < GEYSER.warnTime) continue;
    const q = Math.min(1, (geyser.t - GEYSER.warnTime) / GEYSER.eruptionTime);
    const fade = 1 - q;
    const x = geyser.x - player.cameraX;
    const y = geyser.y - player.cameraY;
    const height = 250 * Math.min(1, q / 0.25);
    const width = GEYSER.radius * (1.3 - q * 0.6);
    ctx.save();
    const pillar = ctx.createLinearGradient(x, y, x, y - height);
    pillar.addColorStop(0, `rgba(254, 243, 199, ${0.95 * fade})`);
    pillar.addColorStop(0.35, `rgba(251, 146, 60, ${0.85 * fade})`);
    pillar.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = pillar;
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 20;
    ctx.fillRect(x - width / 2, y - height, width, height);
    ctx.shadowBlur = 0;
    ctx.fillStyle = `rgba(255, 251, 235, ${0.9 * fade})`;
    ctx.beginPath();
    ctx.ellipse(x, y, GEYSER.radius * (1 + q * 0.3), GEYSER.radius * 0.8 * (1 + q * 0.3), 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(254, 215, 170, ${fade})`;
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + geyser.x;
      const rise = q * (80 + (k % 3) * 40);
      ctx.fillRect(x + Math.cos(a) * width * 0.8, y - height * 0.4 - rise * Math.abs(Math.sin(a)), 3, 3);
    }
    ctx.restore();
  }
}

function drawNovaCharge(ctx, player, time) {
  if (boss.state !== 'novaWindup' && boss.state !== 'roar') return;
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  const p = boss.state === 'roar' ? 1 - boss.timer / ROAR_TIME : 1 - boss.timer / (NOVA.windup * (boss.enraged ? 0.85 : 1));
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = `rgba(253, 186, 116, ${0.3 + p * 0.5})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = time / 20;
  ctx.beginPath();
  ctx.arc(0, 0, 70 + p * 40, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  // Embers sucked toward the chest
  for (let k = 0; k < 14; k++) {
    const a = k * TAU / 14 + time / 400;
    const r = 190 * (1 - ((p * 2 + k / 14) % 1));
    ctx.fillStyle = `rgba(254, 215, 170, ${0.4 + p * 0.5})`;
    ctx.fillRect(Math.cos(a) * r, Math.sin(a) * r, 3, 3);
  }
  ctx.restore();
}

function drawRings(ctx, player) {
  for (const ring of boss.rings) {
    const x = ring.x - player.cameraX;
    const y = ring.y - player.cameraY;
    const start = ring.gap + ring.gapHalf;
    const end = ring.gap - ring.gapHalf + TAU;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.55)';
    ctx.lineWidth = NOVA.radius * 2;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, ring.radius, start, end);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.95)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, ring.radius, start, end);
    ctx.stroke();
    // Bright markers on both edges of the safe lane
    ctx.strokeStyle = 'rgba(165, 243, 252, 0.95)';
    ctx.lineWidth = 3;
    for (const edge of [ring.gap - ring.gapHalf, ring.gap + ring.gapHalf]) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(edge) * (ring.radius - 16), y + Math.sin(edge) * (ring.radius - 16));
      ctx.lineTo(x + Math.cos(edge) * (ring.radius + 16), y + Math.sin(edge) * (ring.radius + 16));
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawWing(ctx, side, spread, time, flash) {
  const reach = 62 + spread * 78;
  const fwd = 26 - spread * 22;
  const root = { x: 4, y: side * 28 };
  const elbow = { x: 22, y: side * (46 + spread * 18) };
  const tips = [
    { x: fwd + 40, y: side * reach * 0.92 },
    { x: fwd - 4, y: side * (reach + 18) },
    { x: -30 - spread * 6, y: side * reach * 0.88 },
    { x: -64, y: side * reach * 0.5 }
  ];

  const membrane = ctx.createLinearGradient(0, side * 30, 0, side * (reach + 18));
  if (flash) {
    membrane.addColorStop(0, '#fff7ed');
    membrane.addColorStop(1, '#fecdd3');
  } else {
    membrane.addColorStop(0, '#4c0519');
    membrane.addColorStop(1, 'rgba(190, 18, 60, 0.7)');
  }
  ctx.fillStyle = membrane;
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.lineTo(elbow.x, elbow.y);
  tips.forEach(tip => ctx.lineTo(tip.x, tip.y));
  ctx.lineTo(-34, side * 26);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Lava veins in the membrane
  ctx.strokeStyle = `rgba(251, 146, 60, ${0.45 + Math.sin(time / 260 + side) * 0.2})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  tips.forEach(tip => {
    ctx.moveTo(-6, side * 30);
    ctx.lineTo(tip.x * 0.85, tip.y * 0.82);
  });
  ctx.stroke();

  // Bones
  ctx.lineCap = 'round';
  for (const tip of tips) {
    ctx.strokeStyle = '#12030a';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(elbow.x, elbow.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(root.x, root.y);
  ctx.lineTo(elbow.x, elbow.y);
  ctx.stroke();
  ctx.strokeStyle = '#9f1239';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawTail(ctx, time, flash) {
  const sway = Math.sin(time / 420) * 0.5;
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    pts.push({
      x: -40 - t * 118,
      y: Math.sin(time / 260 - t * 3.4 + sway) * (4 + t * 22),
      w: 20 * (1 - t) + 3
    });
  }
  ctx.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    ctx.strokeStyle = '#12030a';
    ctx.lineWidth = b.w + 5;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = flash ? '#fff7ed' : (i % 2 ? '#6b0f2a' : '#8a1538');
    ctx.lineWidth = b.w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.fillStyle = '#fbbf24';
  for (let i = 2; i < pts.length - 1; i += 2) {
    const p = pts[i];
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - p.w * 0.5);
    ctx.lineTo(p.x - 4, p.y);
    ctx.lineTo(p.x, p.y + p.w * 0.5);
    ctx.lineTo(p.x + 4, p.y);
    ctx.closePath();
    ctx.fill();
  }
  // Flame at the tail tip
  const tip = pts[pts.length - 1];
  const flame = 1 + Math.sin(time / 70) * 0.2;
  const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 30 * flame);
  glow.addColorStop(0, 'rgba(254, 243, 199, 0.95)');
  glow.addColorStop(0.4, 'rgba(249, 115, 22, 0.6)');
  glow.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 30 * flame, 0, TAU);
  ctx.fill();
}

function drawBody(ctx, time, flash, exposed) {
  const body = ctx.createRadialGradient(-6, -10, 6, 0, 0, 54);
  if (flash) {
    body.addColorStop(0, '#ffffff');
    body.addColorStop(1, '#fed7aa');
  } else {
    body.addColorStop(0, '#9f1239');
    body.addColorStop(0.55, '#4c0519');
    body.addColorStop(1, '#12030a');
  }
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 20;
  ctx.fillStyle = body;
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(0, 0, 50, 38, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Armor plates
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 4; k++) {
    const px = -32 + k * 19;
    ctx.strokeStyle = '#12030a';
    ctx.beginPath();
    ctx.moveTo(px, -30);
    ctx.quadraticCurveTo(px + 9, 0, px, 30);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(253, 164, 175, 0.3)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(px + 2, -28);
    ctx.quadraticCurveTo(px + 10, 0, px + 2, 28);
    ctx.stroke();
    ctx.lineWidth = 2.5;
  }

  // Dorsal spines
  ctx.fillStyle = '#2a0612';
  ctx.strokeStyle = '#f97316';
  ctx.lineWidth = 1.2;
  for (let k = 0; k < 6; k++) {
    const sx = -36 + k * 13;
    ctx.beginPath();
    ctx.moveTo(sx, -6);
    ctx.lineTo(sx + 5, 0);
    ctx.lineTo(sx, 6);
    ctx.lineTo(sx - 5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Molten core. It swells and blazes white when exposed.
  const pulse = 1 + Math.sin(time / (exposed ? 60 : 200)) * (exposed ? 0.18 : 0.08);
  const radius = (exposed ? 18 : 10) * pulse;
  const core = ctx.createRadialGradient(10, 0, 0, 10, 0, radius * 2.4);
  core.addColorStop(0, exposed ? 'rgba(255, 251, 235, 1)' : 'rgba(253, 186, 116, 0.95)');
  core.addColorStop(0.35, exposed ? 'rgba(253, 224, 71, 0.9)' : 'rgba(249, 115, 22, 0.7)');
  core.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(10, 0, radius * 2.4, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(253, 186, 116, ${exposed ? 0.95 : 0.55})`;
  ctx.lineWidth = exposed ? 2.5 : 1.5;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = exposed ? 14 : 6;
  for (let k = 0; k < 7; k++) {
    const a = k * TAU / 7 + 0.4;
    ctx.beginPath();
    ctx.moveTo(10 + Math.cos(a) * radius, Math.sin(a) * radius);
    ctx.lineTo(10 + Math.cos(a + 0.2) * (radius + 14 + (k % 2) * 8), Math.sin(a + 0.2) * (radius + 14 + (k % 2) * 8));
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
}

function drawHead(ctx, time, flash, jaw, eyeColor, mouthFire) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Neck
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 24;
  ctx.beginPath();
  ctx.moveTo(34, 0);
  ctx.lineTo(66, 0);
  ctx.stroke();
  ctx.strokeStyle = flash ? '#fff7ed' : '#7f1d3a';
  ctx.lineWidth = 18;
  ctx.stroke();

  // Horns
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(70, side * 10);
    ctx.quadraticCurveTo(56, side * 28, 36, side * 34);
    ctx.strokeStyle = '#12030a';
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  // Lower jaw
  ctx.save();
  ctx.translate(72, 4);
  ctx.rotate(jaw * 0.5);
  ctx.fillStyle = flash ? '#fff7ed' : '#5b0f26';
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(16, 5, 20, 6.5, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // Skull and snout
  const skull = ctx.createRadialGradient(78, -6, 2, 80, 0, 28);
  if (flash) {
    skull.addColorStop(0, '#ffffff');
    skull.addColorStop(1, '#fed7aa');
  } else {
    skull.addColorStop(0, '#be123c');
    skull.addColorStop(1, '#4c0519');
  }
  ctx.fillStyle = skull;
  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(80, 0, 24, 15, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(100, -1, 15, 8, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Teeth
  ctx.fillStyle = '#fef3c7';
  for (let k = 0; k < 4; k++) {
    const tx = 92 + k * 5;
    ctx.beginPath();
    ctx.moveTo(tx, 5);
    ctx.lineTo(tx + 2.5, 11 + jaw * 2);
    ctx.lineTo(tx + 5, 5);
    ctx.closePath();
    ctx.fill();
  }

  // Eyes
  ctx.fillStyle = eyeColor;
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = 12;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(86, side * 8, 5, 2.8, side * 0.3, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#12030a';
  for (const side of [-1, 1]) ctx.fillRect(85, side * 8 - 2, 1.8, 4);

  // Fire building in the mouth
  if (mouthFire > 0.02) {
    const r = 6 + mouthFire * 16;
    const fire = ctx.createRadialGradient(112, 0, 0, 112, 0, r * 2);
    fire.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
    fire.addColorStop(0.4, 'rgba(251, 146, 60, 0.75)');
    fire.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = fire;
    ctx.beginPath();
    ctx.arc(112, 0, r * 2, 0, TAU);
    ctx.fill();
    for (let k = 0; k < 6; k++) {
      const drift = ((time / 12 + k * 13) % 40) * mouthFire;
      ctx.fillStyle = `rgba(253, 186, 116, ${0.7 - drift / 60})`;
      ctx.beginPath();
      ctx.arc(114 + drift, Math.sin(k * 2.1 + time / 90) * 6, 2.4, 0, TAU);
      ctx.fill();
    }
  }
}

function drawDrake(ctx, player, canvas, time) {
  const state = boss.state;
  const x = boss.x - player.cameraX;
  const baseY = boss.y - player.cameraY;
  if (x < -280 || baseY < -300 || x > canvas.width + 280 || baseY > canvas.height + 280) return;

  const flash = boss.hitFlash > 0;
  const exposed = boss.exposed;
  const windup = state === 'dashWindup' || state === 'geyserWindup' || state === 'novaWindup';

  let alpha = 1;
  let scale = 1;
  let lift = 0;
  let shake = 0;
  if (boss.defeated) {
    const p = Math.max(0, boss.defeatTimer / BOSS.deathTime);
    alpha = Math.max(0.1, p);
    scale = 0.5 + p * 0.5;
    shake = Math.sin(time / 16) * 4;
  } else if (state === 'intro') {
    const p = 1 - boss.timer / INTRO_TIME;
    const ease = 1 - Math.pow(1 - p, 3);
    alpha = Math.min(1, p * 3);
    lift = (1 - ease) * 190;
  } else if (windup) {
    shake = Math.sin(time / 24) * 1.6;
  } else if (state === 'roar') {
    shake = Math.sin(time / 20) * 2.5;
  }
  const bob = state === 'dashing' ? 0 : Math.sin(time / 380) * 3;

  let spread = 0.5 + Math.sin(time / (boss.enraged ? 140 : 220)) * 0.2;
  if (state === 'geyserWindup' || state === 'novaWindup' || state === 'roar') spread = 1.05 + Math.sin(time / 45) * 0.04;
  else if (state === 'dashWindup') spread = 0.9;
  else if (state === 'dashing') spread = 0.1;
  else if (state === 'recover') spread = 0.3;
  else if (state === 'intro') spread = 0.9 + Math.sin(time / 90) * 0.2;

  let jaw = 0.2 + Math.sin(time / 260) * 0.08;
  if (state === 'geyserWindup' || state === 'novaWindup' || state === 'roar') jaw = 1;
  else if (state === 'dashWindup') jaw = 0.7;
  else if (state === 'dashing') jaw = 0.05;
  else if (state === 'recover') jaw = 0.45;

  let mouthFire = boss.enraged ? 0.15 : 0;
  if (state === 'geyserWindup') mouthFire = 1 - boss.timer / (GEYSER.windup * (boss.enraged ? 0.85 : 1));
  else if (state === 'novaWindup') mouthFire = 1 - boss.timer / (NOVA.windup * (boss.enraged ? 0.85 : 1));
  else if (state === 'roar') mouthFire = 1;
  else if (state === 'novaCast') mouthFire = 0.7;
  mouthFire = clamp(mouthFire, 0, 1);

  let eyeColor = boss.enraged ? '#fecdd3' : '#fde047';
  if (windup || state === 'roar') eyeColor = '#ff2d2d';
  else if (state === 'dashing') eyeColor = '#ffffff';

  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow stays on the ground while he hovers
  const shadowScale = (1 - lift / 400) * scale;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * (1 - lift / 300)})`;
  ctx.beginPath();
  ctx.ellipse(x, baseY + 48, 92 * shadowScale, 26 * shadowScale, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x + shake, baseY - lift + bob);
  ctx.scale(scale, scale);

  // Heat aura
  const auraSize = boss.enraged ? 190 : 150;
  const aura = ctx.createRadialGradient(0, 0, 20, 0, 0, auraSize);
  aura.addColorStop(0, `rgba(244, 63, 94, ${boss.enraged ? 0.5 : 0.35})`);
  aura.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, auraSize, 0, TAU);
  ctx.fill();

  ctx.rotate(boss.facing);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (state === 'dashing') {
    ctx.strokeStyle = 'rgba(253, 186, 116, 0.45)';
    ctx.lineWidth = 4;
    for (let k = -2; k <= 2; k++) {
      ctx.beginPath();
      ctx.moveTo(-50, k * 14);
      ctx.lineTo(-150 - Math.abs(k) * 10, k * 14);
      ctx.stroke();
    }
  }

  // Back to front: tail, rear legs, wings, body, front legs, neck and head
  drawTail(ctx, time, flash);

  ctx.strokeStyle = '#12030a';
  ctx.lineWidth = 7;
  for (const side of [-1, 1]) {
    const stride = Math.sin(time / 140 + (side > 0 ? Math.PI : 0)) * (state === 'stalk' ? 5 : 1);
    ctx.beginPath();
    ctx.moveTo(-14, side * 30);
    ctx.lineTo(-22 + stride, side * 50);
    ctx.lineTo(-10 + stride, side * 60);
    ctx.stroke();
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = '#12030a';
    ctx.lineWidth = 7;
  }

  drawWing(ctx, -1, spread, time, flash);
  drawWing(ctx, 1, spread, time, flash);
  drawBody(ctx, time, flash, exposed);

  for (const side of [-1, 1]) {
    const stride = Math.sin(time / 140 + (side > 0 ? 0 : Math.PI)) * (state === 'stalk' ? 5 : 1);
    ctx.strokeStyle = '#12030a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(26, side * 28);
    ctx.lineTo(34 + stride, side * 46);
    ctx.lineTo(48 + stride, side * 52);
    ctx.stroke();
    ctx.strokeStyle = '#9f1239';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(48 + stride, side * 52);
    ctx.lineTo(56 + stride, side * 55);
    ctx.stroke();
  }

  drawHead(ctx, time, flash, jaw, eyeColor, mouthFire);
  ctx.restore();
}

function drawHud(ctx, canvas, time) {
  const barWidth = Math.min(600, canvas.width - 80);
  const barX = (canvas.width - barWidth) / 2;
  const barY = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(25, 5, 8, 0.92)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 66);
  ctx.strokeStyle = '#7f1d1d';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX - 10, barY - 8, barWidth + 20, 66);
  ctx.fillStyle = '#38040e';
  ctx.fillRect(barX, barY + 14, barWidth, 16);
  const fill = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
  fill.addColorStop(0, boss.enraged ? '#f43f5e' : '#9f1239');
  fill.addColorStop(1, boss.enraged ? '#fb923c' : '#e11d48');
  ctx.fillStyle = fill;
  ctx.fillRect(barX, barY + 14, barWidth * healthRatio(), 16);
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY + 14, barWidth, 16);
  if (!boss.enraged) {
    const tick = barX + barWidth * ENRAGE.threshold;
    ctx.beginPath();
    ctx.moveTo(tick, barY + 11);
    ctx.lineTo(tick, barY + 33);
    ctx.stroke();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fffbeb';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(NAME, canvas.width / 2, barY + 9);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#fda4af';
  ctx.fillText(BOSS.title, canvas.width / 2, barY + 46);

  const blink = 0.6 + Math.sin(time / 90) * 0.4;
  ctx.font = 'bold 14px monospace';
  if (boss.state === 'roar') {
    ctx.fillStyle = `rgba(253, 186, 116, ${blink})`;
    ctx.fillText('>> PYRAXIS IS ENRAGED! <<', canvas.width / 2, barY + 78);
  } else if (boss.exposed) {
    ctx.fillStyle = `rgba(253, 224, 71, ${blink})`;
    ctx.fillText('>> CORE EXPOSED! HIT HIM! <<', canvas.width / 2, barY + 78);
  } else if (boss.rings.length > 0) {
    ctx.fillStyle = `rgba(165, 243, 252, ${blink})`;
    ctx.fillText('>> FIND THE GAP! <<', canvas.width / 2, barY + 78);
  }

  if (boss.state === 'intro') {
    const alpha = clamp(Math.min((INTRO_TIME - boss.timer) * 2.5, boss.timer * 2.5), 0, 1);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#fffbeb';
    ctx.font = 'bold 44px monospace';
    ctx.fillText(NAME, canvas.width / 2, 190);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fda4af';
    ctx.font = '17px monospace';
    ctx.fillText(BOSS.title, canvas.width / 2, 220);
  }
  ctx.restore();
}

export function drawInfernalBoss(ctx, player, canvas, time) {
  if (!boss) return;
  drawArena(ctx, player, time);
  drawPuddles(ctx, player, time);
  if (!boss.defeated) {
    drawDashLane(ctx, player, time);
    drawGeyserWarnings(ctx, player, time);
  }
  drawDrake(ctx, player, canvas, time);
  drawNovaCharge(ctx, player, time);
  drawRings(ctx, player);
  drawGeyserBlasts(ctx, player);
  for (const effect of boss.effects) drawEffect(ctx, effect, player);
  if (!boss.defeated) drawHud(ctx, canvas, time);
}
