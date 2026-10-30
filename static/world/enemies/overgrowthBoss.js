import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const BOSS = ENEMIES_CONFIG.overgrowthBoss;
const ENRAGE = {
  threshold: 0.5,
  speedScale: 1.35,
  cooldownScale: 0.7,
  ...(BOSS.enrage || {})
};
const CHARGE = BOSS.charge;
const SPIT = BOSS.spit;
const LEAP = BOSS.leap;
const ARENA_RADIUS = 600;
const BODY_RADIUS = 34;
const INTRO_TIME = 1.4;
const HIT_KEY = 'overgrowth-boss';
const NAME = 'MOSSBACK BEETLE';
const TAU = Math.PI * 2;

const RING_COLORS = {
  fire: '253, 186, 116',
  leaf: '190, 242, 100',
  dust: '214, 211, 209'
};
const MOSS_PATCHES = [[-26, 14, 5], [-6, 24, 4], [-32, 26, 3.5], [10, 11, 3.5], [-14, 9, 3]];
const FLOWERS = [[-12, 18], [8, 22], [-30, 12]];

// Hit circles along the beetle's body: [distance forward of center, radius]
const HIT_CIRCLES = [[-26, 26], [2, 30], [30, 22], [52, 15]];

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

function bodyCircles() {
  const cos = Math.cos(boss.angle);
  const sin = Math.sin(boss.angle);
  return HIT_CIRCLES.map(([offset, radius]) => ({
    x: boss.x + cos * offset,
    y: boss.y + sin * offset,
    radius
  }));
}

function addRing(x, y, size, color, duration = 0.6) {
  boss.effects.push({ x, y, size, color, timer: duration, max: duration });
}

function nextCooldown() {
  const scale = boss.enraged ? ENRAGE.cooldownScale : 1;
  return rand(BOSS.attackDelay.min, BOSS.attackDelay.max) * scale;
}

export function resetOvergrowthBoss() {
  boss = null;
}

export function isOvergrowthBossActive() {
  return Boolean(boss);
}

export function startOvergrowthBoss(worldX, worldY, player, canvas) {
  if (boss) return;
  const centerX = worldX;
  const centerY = worldY;
  const startX = centerX - 60;
  const startY = centerY - 40;
  boss = {
    x: startX,
    y: startY,
    centerX,
    centerY,
    angle: Math.atan2(centerY + 145 - startY, centerX + 165 - startX),
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | chase | chargeWindup | charging | spitWindup | spitRecover | leapWindup | airborne | stunned
    timer: INTRO_TIME,
    attackAngle: 0,
    attackCooldown: 0,
    lastAttack: null,
    enraged: false,
    crashed: false,
    leapFromX: startX,
    leapFromY: startY,
    leapTargetX: startX,
    leapTargetY: startY,
    walk: 0,
    hitFlash: 0,
    projectiles: [],
    effects: [],
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  addRing(startX, startY, 3, 'leaf', 0.9);

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
  window.dispatchEvent(new CustomEvent('overgrowth-boss-summoned', {
    detail: { x: centerX, y: centerY }
  }));
}

function defeatBoss(player) {
  boss.defeated = true;
  boss.defeatTimer = BOSS.deathTime;
  boss.projectiles = [];
  player.cycles += BOSS.reward;
  window.dispatchEvent(new CustomEvent('overgrowth-boss-defeated', {
    detail: { x: boss.x, y: boss.y }
  }));
}

function applyDamage(player, angle) {
  if (!boss || boss.defeated) return;
  if (boss.state === 'intro' || boss.state === 'airborne') return;
  const shot = player.activeWeapon === 'slingshot';
  if (shot && !player.slingshotShotActive) return;
  if (player.attackHitEnemies.has(HIT_KEY)) return;

  const range = shot ? player.slingshotShotRange : 78;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.36;

  let hit = null;
  for (const circle of bodyCircles()) {
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

  const multiplier = boss.state === 'stunned' ? BOSS.stunMultiplier : BOSS.shellMultiplier;
  const baseDamage = (shot ? player.slingshotDamage : player.swordDamage) ?? 1;
  boss.hp -= baseDamage * multiplier;
  boss.hitFlash = 0.1;
  player.attackHitEnemies.add(HIT_KEY);
  if (shot) player.slingshotShotActive = false;
  addRing(hit.x, hit.y, boss.state === 'stunned' ? 1 : 0.5, boss.state === 'stunned' ? 'fire' : 'dust', 0.25);

  if (boss.hp <= 0) defeatBoss(player);
}

// Still exported so an aggregator can call it. The boss also resolves attacks itself in update.
export function damageOvergrowthBoss(player, swingAngle) {
  if (!boss || boss.defeated) return;
  applyDamage(player, swingAngle);
}

function hurtPlayer(player, amount, onDeath, message) {
  if (player.enemyDamageCooldown > 0) return;
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.9;
  if (player.hp <= 0) onDeath?.(message);
}

function turn(target, dt, scale = 1) {
  const diff = angleDifference(target, boss.angle);
  const max = BOSS.turnRate * scale * dt;
  boss.angle += Math.max(-max, Math.min(max, diff));
}

// Pulls the boss back inside the arena. Returns true if it had to be moved.
function keepInArena(margin) {
  const dx = boss.x - boss.centerX;
  const dy = boss.y - boss.centerY;
  const distance = Math.hypot(dx, dy);
  const limit = ARENA_RADIUS - margin;
  if (distance > limit) {
    boss.x = boss.centerX + dx / distance * limit;
    boss.y = boss.centerY + dy / distance * limit;
    return true;
  }
  return false;
}

function fireSpit(player) {
  const mouthX = boss.x + Math.cos(boss.angle) * (BODY_RADIUS + 10);
  const mouthY = boss.y + Math.sin(boss.angle) * (BODY_RADIUS + 10);
  const baseAngle = Math.atan2(player.y - mouthY, player.x - mouthX);
  const count = boss.enraged ? SPIT.shotsPhaseTwo : SPIT.shots;
  for (let i = 0; i < count; i++) {
    const angle = baseAngle + (i - (count - 1) / 2) * SPIT.spread;
    boss.projectiles.push({
      x: mouthX,
      y: mouthY,
      vx: Math.cos(angle) * SPIT.speed,
      vy: Math.sin(angle) * SPIT.speed,
      radius: SPIT.radius,
      damage: SPIT.damage,
      life: SPIT.life
    });
  }
  addRing(mouthX, mouthY, 0.7, 'leaf', 0.3);
}

function ringBurst() {
  const offset = Math.random() * TAU;
  for (let i = 0; i < LEAP.ringShots; i++) {
    const angle = offset + i * TAU / LEAP.ringShots;
    boss.projectiles.push({
      x: boss.x,
      y: boss.y,
      vx: Math.cos(angle) * SPIT.speed * 0.85,
      vy: Math.sin(angle) * SPIT.speed * 0.85,
      radius: SPIT.radius,
      damage: SPIT.damage,
      life: SPIT.life
    });
  }
}

function pickAttack() {
  const options = ['charge', 'spit', 'leap'].filter(type => type !== boss.lastAttack);
  return options[Math.floor(Math.random() * options.length)];
}

function startAttack(toPlayer) {
  const type = pickAttack();
  boss.lastAttack = type;
  if (type === 'charge') {
    boss.state = 'chargeWindup';
    boss.timer = CHARGE.windup;
    boss.attackAngle = toPlayer;
  } else if (type === 'spit') {
    boss.state = 'spitWindup';
    boss.timer = SPIT.windup;
  } else {
    boss.state = 'leapWindup';
    boss.timer = LEAP.windup;
  }
}

function endAttack() {
  boss.state = 'chase';
  boss.attackCooldown = nextCooldown();
}

export function updateOvergrowthBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(effect => effect.timer > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 12) {
      addRing(boss.x + rand(-36, 36), boss.y + rand(-28, 28), rand(0.7, 1.4), 'fire', 0.55);
    }
    if (boss.defeatTimer <= 0) boss = null;
    return;
  }

  // Resolve player attacks here so the fight never depends on the aggregator's swing block
  if (player.isAttacking && player.slashTimer > 0) {
    const swingProgress = 1 - player.slashTimer / 150;
    const easedProgress = 1 - (1 - swingProgress) * (1 - swingProgress);
    const swingAngle = player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2);
    applyDamage(player, swingAngle);
  }
  if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
    applyDamage(player, 0);
  }
  if (!boss || boss.defeated) return;

  if (!boss.enraged && healthRatio() < ENRAGE.threshold) {
    boss.enraged = true;
    addRing(boss.x, boss.y, 3, 'fire', 0.8);
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const toPlayer = Math.atan2(dy, dx);
  const speed = BOSS.movementSpeed * (boss.enraged ? ENRAGE.speedScale : 1);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'chase';
      boss.attackCooldown = nextCooldown();
    }
  } else if (boss.state === 'chase') {
    turn(toPlayer, dt, 1);
    boss.x += Math.cos(boss.angle) * speed * dt;
    boss.y += Math.sin(boss.angle) * speed * dt;
    boss.walk += speed * dt * 0.09;
    keepInArena(BODY_RADIUS + 8);
    boss.attackCooldown -= dt;
    if (boss.attackCooldown <= 0) startAttack(toPlayer);
  } else if (boss.state === 'chargeWindup') {
    boss.timer -= dt;
    // Tracks the player until just before the dash, then locks
    if (boss.timer > CHARGE.lockTime) boss.attackAngle = toPlayer;
    turn(boss.attackAngle, dt, 3);
    if (boss.timer <= 0) {
      boss.state = 'charging';
      boss.timer = CHARGE.duration;
      addRing(boss.x, boss.y, 1.2, 'dust', 0.4);
    }
  } else if (boss.state === 'charging') {
    boss.timer -= dt;
    turn(boss.attackAngle, dt, 6);
    boss.x += Math.cos(boss.attackAngle) * CHARGE.speed * dt;
    boss.y += Math.sin(boss.attackAngle) * CHARGE.speed * dt;
    boss.walk += dt * 30;
    if (keepInArena(BODY_RADIUS + 10)) {
      // Slammed into the arena wall: stunned for longer
      boss.state = 'stunned';
      boss.timer = CHARGE.recover + CHARGE.wallStunBonus;
      boss.crashed = true;
      addRing(boss.x, boss.y, 2.4, 'dust', 0.7);
      addRing(boss.x, boss.y, 1.6, 'leaf', 0.5);
    } else if (boss.timer <= 0) {
      boss.state = 'stunned';
      boss.timer = CHARGE.recover;
    }
  } else if (boss.state === 'stunned') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.crashed = false;
      endAttack();
    }
  } else if (boss.state === 'spitWindup') {
    boss.timer -= dt;
    turn(toPlayer, dt, 2);
    if (boss.timer <= 0) {
      fireSpit(player);
      boss.state = 'spitRecover';
      boss.timer = SPIT.recover;
    }
  } else if (boss.state === 'spitRecover') {
    boss.timer -= dt;
    turn(toPlayer, dt, 1);
    boss.x += Math.cos(boss.angle) * speed * 0.4 * dt;
    boss.y += Math.sin(boss.angle) * speed * 0.4 * dt;
    boss.walk += speed * dt * 0.04;
    keepInArena(BODY_RADIUS + 8);
    if (boss.timer <= 0) endAttack();
  } else if (boss.state === 'leapWindup') {
    boss.timer -= dt;
    turn(toPlayer, dt, 3);
    if (boss.timer <= 0) {
      // Lands where the player was standing at takeoff
      const tx = player.x - boss.centerX;
      const ty = player.y - boss.centerY;
      const td = Math.hypot(tx, ty) || 1;
      const limit = ARENA_RADIUS - BODY_RADIUS - 10;
      const clamp = td > limit ? limit / td : 1;
      boss.leapFromX = boss.x;
      boss.leapFromY = boss.y;
      boss.leapTargetX = boss.centerX + tx * clamp;
      boss.leapTargetY = boss.centerY + ty * clamp;
      boss.state = 'airborne';
      boss.timer = LEAP.airTime;
    }
  } else if (boss.state === 'airborne') {
    boss.timer -= dt;
    const progress = Math.min(1, 1 - boss.timer / LEAP.airTime);
    boss.x = boss.leapFromX + (boss.leapTargetX - boss.leapFromX) * progress;
    boss.y = boss.leapFromY + (boss.leapTargetY - boss.leapFromY) * progress;
    boss.angle = Math.atan2(boss.leapTargetY - boss.leapFromY, boss.leapTargetX - boss.leapFromX);
    if (boss.timer <= 0) {
      boss.x = boss.leapTargetX;
      boss.y = boss.leapTargetY;
      addRing(boss.x, boss.y, LEAP.radius / 30, 'dust', 0.6);
      addRing(boss.x, boss.y, LEAP.radius / 45, 'leaf', 0.45);
      if (Math.hypot(player.x - boss.x, player.y - boss.y) < LEAP.radius + 12) {
        hurtPlayer(player, LEAP.damage, onDeath, 'Squashed by the Mossback Beetle!');
        if (!boss) return;
      }
      if (boss.enraged) ringBurst();
      boss.state = 'stunned';
      boss.timer = LEAP.recover;
    }
  }

  // Acid shots
  for (const projectile of boss.projectiles) {
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.life -= dt;
    if (Math.hypot(projectile.x - player.x, projectile.y - player.y) < projectile.radius + 12) {
      hurtPlayer(player, projectile.damage, onDeath, 'Dissolved by the Mossback Beetle!');
      if (!boss) return;
      projectile.life = 0;
    }
  }
  boss.projectiles = boss.projectiles.filter(projectile => projectile.life > 0);

  // Touching the body hurts, except while it is in the air or intro
  if (boss.state !== 'intro' && boss.state !== 'airborne'
    && bodyCircles().some(c => Math.hypot(player.x - c.x, player.y - c.y) < c.radius + 12)) {
    const charging = boss.state === 'charging';
    hurtPlayer(
      player,
      charging ? CHARGE.damage : BOSS.contactDamage,
      onDeath,
      charging ? 'Trampled by the Mossback Beetle!' : 'Caught by the Mossback Beetle!'
    );
    if (!boss) return;
  }

  const px = player.x - boss.centerX;
  const py = player.y - boss.centerY;
  const distance = Math.hypot(px, py);
  const limit = ARENA_RADIUS - 24;
  if (distance > limit) {
    player.x = boss.centerX + px / distance * limit;
    player.y = boss.centerY + py / distance * limit;
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
  ctx.fillStyle = `rgba(${color}, ${fade * 0.12})`;
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
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
    ctx.lineTo(x + Math.cos(angle) * (inner + 8 * fade * s), y + Math.sin(angle) * (inner + 8 * fade * s));
    ctx.stroke();
  }
  ctx.restore();
}

function drawTelegraphs(ctx, player, time) {
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;

  if (boss.state === 'chargeWindup') {
    const progress = 1 - boss.timer / CHARGE.windup;
    const length = CHARGE.speed * CHARGE.duration + BODY_RADIUS;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(boss.attackAngle);
    const lane = ctx.createLinearGradient(0, 0, length, 0);
    lane.addColorStop(0, `rgba(250, 204, 21, ${0.18 + progress * 0.3})`);
    lane.addColorStop(1, 'rgba(250, 204, 21, 0.05)');
    ctx.fillStyle = lane;
    ctx.fillRect(0, -CHARGE.laneWidth / 2, length, CHARGE.laneWidth);
    ctx.strokeStyle = `rgba(254, 240, 138, ${0.35 + progress * 0.5})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, -CHARGE.laneWidth / 2, length, CHARGE.laneWidth);
    ctx.fillStyle = `rgba(254, 240, 138, ${0.3 + progress * 0.4})`;
    for (let k = 0; k < 6; k++) {
      const cx = (time / 3 + k * 70) % length;
      ctx.beginPath();
      ctx.moveTo(cx, -8);
      ctx.lineTo(cx + 12, 0);
      ctx.lineTo(cx, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  if (boss.state === 'spitWindup') {
    const count = boss.enraged ? SPIT.shotsPhaseTwo : SPIT.shots;
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(190, 242, 100, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    for (let k = 0; k < count; k++) {
      const angle = boss.angle + (k - (count - 1) / 2) * SPIT.spread;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 50, Math.sin(angle) * 50);
      ctx.lineTo(Math.cos(angle) * 320, Math.sin(angle) * 320);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (boss.state === 'leapWindup' || boss.state === 'airborne') {
    const airborne = boss.state === 'airborne';
    const progress = airborne
      ? 1 - boss.timer / LEAP.airTime
      : 1 - boss.timer / LEAP.windup;
    const tx = (airborne ? boss.leapTargetX : player.x) - player.cameraX;
    const ty = (airborne ? boss.leapTargetY : player.y) - player.cameraY;
    ctx.save();
    ctx.translate(tx, ty);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.08 + progress * 0.22})`;
    ctx.strokeStyle = `rgba(252, 165, 165, ${0.35 + progress * 0.5})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time / 30;
    ctx.beginPath();
    ctx.arc(0, 0, LEAP.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(254, 202, 202, ${0.15 + progress * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, 0, LEAP.radius * progress, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawBeetle(ctx, player, canvas, time) {
  const state = boss.state;
  const airborne = state === 'airborne';
  const stunned = state === 'stunned';
  const windup = state === 'chargeWindup' || state === 'spitWindup' || state === 'leapWindup';
  const charging = state === 'charging';
  const flash = boss.hitFlash > 0;

  let lift = 0;
  if (airborne) {
    const progress = Math.max(0, Math.min(1, 1 - boss.timer / LEAP.airTime));
    lift = Math.sin(progress * Math.PI) * 110;
  }

  let open = 0;
  if (stunned) open = 0.42 + Math.sin(time / 120) * 0.04;
  else if (state === 'leapWindup') open = 0.55 * (1 - boss.timer / LEAP.windup);
  else if (airborne) open = 0.6;
  const wings = open > 0.3 && !stunned;

  let alpha = 1;
  if (boss.defeated) alpha = Math.max(0, boss.defeatTimer / BOSS.deathTime);
  else if (state === 'intro') alpha = Math.min(1, (1 - boss.timer / INTRO_TIME) * 2);

  let shake = 0;
  if (windup) shake = Math.sin(time / 25) * 1.4;
  if (boss.defeated) shake = Math.sin(time / 18) * 3;

  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  if (x < -140 || y < -200 || x > canvas.width + 140 || y > canvas.height + 140) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Ground shadow stays put while the beetle is airborne
  const shadowScale = 1 - lift / 320;
  ctx.fillStyle = `rgba(0, 0, 0, ${0.35 * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 46 * shadowScale, 17 * shadowScale, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x + shake, y - lift);
  ctx.rotate(boss.angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Legs
  const reach = airborne ? 0.5 : 1;
  for (let k = 0; k < 3; k++) {
    const legX = 22 - k * 16;
    for (const side of [-1, 1]) {
      const swing = Math.sin(boss.walk + k * 1.9 + (side > 0 ? Math.PI : 0)) * 6;
      const kneeX = legX + swing * 0.5 + (k - 1) * 6;
      const footX = legX + swing * 1.4 + (k - 1) * 10;
      ctx.beginPath();
      ctx.moveTo(legX, side * 18);
      ctx.lineTo(kneeX, side * (18 + 16 * reach));
      ctx.lineTo(footX, side * (18 + 26 * reach));
      ctx.strokeStyle = '#0f1a02';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.strokeStyle = '#4d7c0f';
      ctx.lineWidth = 3.5;
      ctx.stroke();
    }
  }

  // Wings
  if (wings) {
    const flap = Math.sin(time / 35) * 0.12;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(-2, side * 16);
      ctx.rotate(side * (0.35 + flap));
      ctx.fillStyle = 'rgba(217, 249, 157, 0.32)';
      ctx.strokeStyle = 'rgba(236, 252, 203, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(-16, side * 26, 38, 12, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-40, side * 26);
      ctx.lineTo(8, side * 26);
      ctx.moveTo(-28, side * 20);
      ctx.lineTo(-4, side * 31);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Abdomen under the shell. Glows when the shell is popped open.
  if (open > 0.05) {
    const core = ctx.createRadialGradient(-8, 0, 2, -8, 0, 34);
    if (stunned) {
      core.addColorStop(0, '#fef3c7');
      core.addColorStop(0.45, '#f97316');
      core.addColorStop(1, '#7c2d12');
      ctx.shadowColor = '#fb923c';
      ctx.shadowBlur = 20;
    } else {
      core.addColorStop(0, '#365314');
      core.addColorStop(1, '#1a2e05');
    }
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(-8, 0, 34, 22, 0, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  // Shell halves, hinged at the front so they swing open
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(24, 0);
    ctx.rotate(-side * open * 0.7);
    ctx.translate(-24, 0);
    ctx.fillStyle = flash ? '#f7fee7' : '#3f6212';
    ctx.strokeStyle = '#0f1a02';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(-8, side * 16, 40, 19, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (!flash) {
      ctx.fillStyle = 'rgba(163, 230, 53, 0.22)';
      ctx.beginPath();
      ctx.ellipse(-4, side * 12, 30, 8, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(15, 26, 2, 0.55)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) {
        const ridgeX = -30 + k * 14;
        ctx.beginPath();
        ctx.moveTo(ridgeX, side * 3);
        ctx.quadraticCurveTo(ridgeX - 3, side * 18, ridgeX + 2, side * 33);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(132, 204, 22, 0.75)';
      for (const [mx, my, mr] of MOSS_PATCHES) {
        ctx.beginPath();
        ctx.arc(mx, side * my, mr, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#fde047';
      for (const [fx, fy] of FLOWERS) {
        ctx.beginPath();
        ctx.arc(fx, side * fy, 1.7, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  // Head
  let jaw = 0.3 + Math.sin(time / 220) * 0.1;
  if (windup) jaw = 1;
  else if (charging) jaw = 0;
  else if (stunned) jaw = 0.7;
  let eye = '#fde047';
  if (windup || charging) eye = '#ef4444';
  else if (stunned) eye = '#6b7280';

  ctx.save();
  ctx.translate(40, 0);
  const wobble = Math.sin(time / 150) * 3;
  ctx.strokeStyle = '#4d7c0f';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(8, side * 7);
    ctx.quadraticCurveTo(22, side * 20 + wobble, 32, side * 17 + wobble * 1.4);
    ctx.stroke();
  }
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(8, side * 6);
    ctx.quadraticCurveTo(24, side * (10 + jaw * 10), 32, side * (3 + jaw * 7));
    ctx.strokeStyle = '#0f1a02';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 3.5;
    ctx.stroke();
  }
  ctx.fillStyle = flash ? '#f7fee7' : '#1a2e05';
  ctx.strokeStyle = '#0f1a02';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 13, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = eye;
  ctx.shadowColor = eye;
  ctx.shadowBlur = stunned ? 0 : 10;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(5, side * 7, 3.6, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (state === 'spitWindup') {
    const progress = 1 - boss.timer / SPIT.windup;
    ctx.shadowColor = '#bef264';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#d9f99d';
    ctx.beginPath();
    ctx.arc(24, 0, 3 + progress * 8, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.restore();

  ctx.restore();

  // Dizzy stars while the shell is open
  if (stunned && !boss.defeated) {
    ctx.save();
    ctx.fillStyle = '#fde047';
    for (let k = 0; k < 3; k++) {
      const a = time / 300 + k * TAU / 3;
      const sx = x + Math.cos(a) * 30;
      const sy = y - 46 + Math.sin(a) * 9;
      ctx.beginPath();
      for (let p = 0; p < 10; p++) {
        const r = p % 2 === 0 ? 5 : 2;
        const sa = p * Math.PI / 5 - Math.PI / 2;
        const px = sx + Math.cos(sa) * r;
        const py = sy + Math.sin(sa) * r;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawArena(ctx, player) {
  const centerX = boss.centerX - player.cameraX;
  const centerY = boss.centerY - player.cameraY;
  ctx.save();
  ctx.fillStyle = 'rgba(54, 83, 20, .12)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(163,230,53,.78)';
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 28; i++) {
    const angle = i * TAU / 28;
    const fx = centerX + Math.cos(angle) * (ARENA_RADIUS - 10);
    const fy = centerY + Math.sin(angle) * (ARENA_RADIUS - 10);
    ctx.fillStyle = i % 2 ? '#365314' : '#4d7c0f';
    ctx.fillRect(fx - 4, fy - 7, 8, 14);
  }
  ctx.restore();
}

function drawHud(ctx, canvas, time) {
  const barWidth = Math.min(560, canvas.width - 80);
  const barX = (canvas.width - barWidth) / 2;
  const barY = 24;
  const fraction = healthRatio();
  ctx.save();
  ctx.fillStyle = 'rgba(3,7,18,.88)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 48);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(barX, barY + 14, barWidth, 14);
  ctx.fillStyle = boss.enraged ? '#f97316' : '#84cc16';
  ctx.fillRect(barX, barY + 14, barWidth * fraction, 14);
  ctx.strokeStyle = '#bef264';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY + 14, barWidth, 14);
  if (!boss.enraged) {
    const tick = barX + barWidth * ENRAGE.threshold;
    ctx.beginPath();
    ctx.moveTo(tick, barY + 11);
    ctx.lineTo(tick, barY + 31);
    ctx.stroke();
  }
  ctx.fillStyle = '#ecfccb';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(NAME, canvas.width / 2, barY + 9);

  if (boss.state === 'stunned') {
    ctx.fillStyle = `rgba(253, 224, 71, ${0.6 + Math.sin(time / 90) * 0.4})`;
    ctx.font = 'bold 14px monospace';
    ctx.fillText(boss.crashed ? '>> CRASHED! HIT IT! <<' : '>> SHELL OPEN! HIT IT! <<', canvas.width / 2, barY + 62);
  }
  ctx.restore();
}

export function drawOvergrowthBoss(ctx, player, canvas, time) {
  if (!boss) return;
  drawArena(ctx, player);
  if (!boss.defeated) drawTelegraphs(ctx, player, time);
  drawBeetle(ctx, player, canvas, time);

  for (const projectile of boss.projectiles) {
    const x = projectile.x - player.cameraX;
    const y = projectile.y - player.cameraY;
    ctx.save();
    ctx.fillStyle = '#a3e635';
    ctx.shadowColor = '#84cc16';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(x, y, projectile.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ecfccb';
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, projectile.radius * 0.35, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const effect of boss.effects) drawEffect(ctx, effect, player);
  if (!boss.defeated) drawHud(ctx, canvas, time);
}