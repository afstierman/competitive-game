import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const BOSS = ENEMIES_CONFIG.abyssBoss;
const ENRAGE = {
  threshold: 0.5,
  speedScale: 1.3,
  cooldownScale: 0.7,
  ...(BOSS.enrage || {})
};
const BUBBLES = BOSS.bubbles;
const PULL = BOSS.pull;
const DIVE = BOSS.dive;
const ARENA_RADIUS = 600;
const BODY_RADIUS = 46;
const MOUTH_OFFSET = 62;
const LURE_RADIUS = 13;
const INTRO_TIME = 1.6;
const HIT_KEY = 'abyss-boss';
const NAME = BOSS.name.toUpperCase();
const TAU = Math.PI * 2;

// No damage can land while the boss is in one of these states
const INVULNERABLE = new Set(['intro', 'diving', 'submerged']);

const RING_COLORS = {
  foam: '224, 242, 254',
  water: '56, 189, 248',
  glow: '103, 232, 249',
  danger: '252, 165, 165'
};

// Hit circles along the body: [distance forward of center, radius]
const HIT_CIRCLES = [[-46, 32], [-8, 46], [34, 32], [58, 20]];
const SPOTS = [[-40, -24], [-24, -34], [-8, -38], [10, -34], [-40, 24], [-24, 34], [-8, 38], [10, 34], [-26, 0], [-4, -14], [-4, 14]];

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

function addRing(x, y, size, color, duration = 0.6) {
  boss.effects.push({ x, y, size, color, timer: duration, max: duration });
}

function nextCooldown() {
  const scale = boss.enraged ? ENRAGE.cooldownScale : 1;
  return rand(BOSS.attackDelay.min, BOSS.attackDelay.max) * scale;
}

function mouthWorld() {
  return {
    x: boss.x + Math.cos(boss.angle) * MOUTH_OFFSET,
    y: boss.y + Math.sin(boss.angle) * MOUTH_OFFSET
  };
}

// The lure sways on its stalk. Draw and hitbox both use this so they always match.
function lureLocal() {
  const t = boss.elapsed;
  return { x: 96 + Math.sin(t * 2.1) * 6, y: Math.sin(t * 1.5) * 18 };
}

function lureWorld() {
  const local = lureLocal();
  const cos = Math.cos(boss.angle);
  const sin = Math.sin(boss.angle);
  return {
    x: boss.x + cos * local.x - sin * local.y,
    y: boss.y + sin * local.x + cos * local.y,
    radius: LURE_RADIUS,
    lure: true
  };
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

function clampToArena(x, y, margin) {
  const dx = x - boss.centerX;
  const dy = y - boss.centerY;
  const distance = Math.hypot(dx, dy);
  const limit = ARENA_RADIUS - margin;
  if (distance > limit) {
    return { x: boss.centerX + dx / distance * limit, y: boss.centerY + dy / distance * limit };
  }
  return { x, y };
}

export function resetAbyssBoss() {
  boss = null;
}

export function isAbyssBossActive() {
  return Boolean(boss);
}

export function startAbyssBoss(worldX, worldY, player, canvas) {
  if (boss) return;
  const centerX = worldX;
  const centerY = worldY;
  const startX = centerX - 40;
  const startY = centerY - 90;
  boss = {
    x: startX,
    y: startY,
    centerX,
    centerY,
    angle: Math.atan2(centerY + 145 - startY, centerX + 165 - startX),
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | swim | bubbleWindup | bubbleRecover | pullWindup | pulling | diving | submerged | stunned
    timer: INTRO_TIME,
    lastAttack: null,
    attackCooldown: 0,
    enraged: false,
    locked: false,
    targetX: startX,
    targetY: startY,
    swim: 0,
    hitFlash: 0,
    lureFlash: 0,
    snap: 0,
    bubbles: [],
    zones: [],
    effects: [],
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  addRing(startX, startY, 3, 'water', 0.9);

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
  window.dispatchEvent(new CustomEvent('abyss-boss-summoned', {
    detail: { x: centerX, y: centerY }
  }));
}

function defeatBoss(player) {
  boss.defeated = true;
  boss.defeatTimer = BOSS.deathTime;
  boss.bubbles = [];
  boss.zones = [];
  player.cycles += BOSS.reward;
  window.dispatchEvent(new CustomEvent('abyss-boss-defeated', {
    detail: { x: boss.x, y: boss.y }
  }));
}

function interruptPull() {
  boss.state = 'stunned';
  boss.timer = PULL.interruptStun;
  boss.snap = 0;
  const lure = lureWorld();
  addRing(lure.x, lure.y, 1.6, 'glow', 0.5);
  addRing(boss.x, boss.y, 2.2, 'foam', 0.6);
}

function applyDamage(player, angle) {
  if (!boss || boss.defeated) return;
  if (INVULNERABLE.has(boss.state)) return;
  const shot = player.activeWeapon === 'slingshot';
  if (shot && !player.slingshotShotActive) return;
  if (player.attackHitEnemies.has(HIT_KEY)) return;

  const range = shot ? player.slingshotShotRange : 78;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.36;

  let hit = null;
  // The lure is checked first so a swing that touches it always counts as a lure hit
  for (const circle of [lureWorld(), ...bodyCircles()]) {
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

  let multiplier = hit.lure ? BOSS.lureMultiplier : BOSS.bodyMultiplier;
  if (boss.state === 'stunned') multiplier = Math.max(multiplier, BOSS.stunMultiplier);
  const baseDamage = (shot ? player.slingshotDamage : player.swordDamage) ?? 1;
  boss.hp -= baseDamage * multiplier;
  boss.hitFlash = 0.1;
  if (hit.lure) boss.lureFlash = 0.25;
  player.attackHitEnemies.add(HIT_KEY);
  if (shot) player.slingshotShotActive = false;
  addRing(hit.x, hit.y, hit.lure ? 1 : 0.5, hit.lure ? 'glow' : 'foam', 0.25);

  // Hitting the lure breaks the whirlpool
  if (hit.lure && (boss.state === 'pullWindup' || boss.state === 'pulling')) interruptPull();

  if (boss.hp <= 0) defeatBoss(player);
}

export function damageAbyssBoss(player, swingAngle) {
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

function turn(target, dt, scale = 1) {
  const diff = angleDifference(target, boss.angle);
  const max = BOSS.turnRate * scale * dt;
  boss.angle += Math.max(-max, Math.min(max, diff));
}

function keepInArena(margin) {
  const point = clampToArena(boss.x, boss.y, margin);
  const moved = point.x !== boss.x || point.y !== boss.y;
  boss.x = point.x;
  boss.y = point.y;
  return moved;
}

function fireBubbles(player) {
  const mouth = mouthWorld();
  const base = Math.atan2(player.y - mouth.y, player.x - mouth.x);
  const count = boss.enraged ? BUBBLES.countPhaseTwo : BUBBLES.count;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = base + t * BUBBLES.spread;
    const speed = BUBBLES.speed * rand(0.75, 1.1);
    boss.bubbles.push({
      x: mouth.x,
      y: mouth.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rand(BUBBLES.minLife, BUBBLES.maxLife),
      wobble: rand(0, TAU),
      done: false
    });
  }
  addRing(mouth.x, mouth.y, 0.8, 'foam', 0.3);
}

function popBubble(bubble, player, onDeath) {
  bubble.done = true;
  addRing(bubble.x, bubble.y, BUBBLES.popRadius / 30, 'foam', 0.4);
  addRing(bubble.x, bubble.y, BUBBLES.popRadius / 45, 'water', 0.3);
  if (Math.hypot(player.x - bubble.x, player.y - bubble.y) < BUBBLES.popRadius + 12) {
    hurtPlayer(player, BUBBLES.damage, onDeath, 'Popped by the Abyssal Lurker!');
  }
}

function pickAttack() {
  const options = ['bubbles', 'pull', 'dive'].filter(type => type !== boss.lastAttack);
  return options[Math.floor(Math.random() * options.length)];
}

function startAttack() {
  const type = pickAttack();
  boss.lastAttack = type;
  if (type === 'bubbles') {
    boss.state = 'bubbleWindup';
    boss.timer = BUBBLES.windup;
  } else if (type === 'pull') {
    boss.state = 'pullWindup';
    boss.timer = PULL.windup;
  } else {
    boss.state = 'diving';
    boss.timer = DIVE.sinkTime;
    boss.locked = false;
    addRing(boss.x, boss.y, 2.4, 'foam', 0.7);
  }
}

function endAttack() {
  boss.state = 'swim';
  boss.attackCooldown = nextCooldown();
}

function erupt(player, onDeath) {
  boss.x = boss.targetX;
  boss.y = boss.targetY;
  boss.state = 'stunned';
  boss.timer = DIVE.stun;
  boss.snap = 0;
  boss.angle = Math.atan2(player.y - boss.y, player.x - boss.x);
  addRing(boss.x, boss.y, DIVE.radius / 28, 'foam', 0.7);
  addRing(boss.x, boss.y, DIVE.radius / 45, 'water', 0.55);

  if (boss.enraged) {
    const offset = rand(0, TAU);
    for (let i = 0; i < DIVE.satellites; i++) {
      const angle = offset + i * TAU / DIVE.satellites;
      const point = clampToArena(
        boss.x + Math.cos(angle) * DIVE.satelliteDistance,
        boss.y + Math.sin(angle) * DIVE.satelliteDistance,
        DIVE.satelliteRadius
      );
      const delay = DIVE.satelliteDelay + i * DIVE.satelliteStagger;
      boss.zones.push({ x: point.x, y: point.y, radius: DIVE.satelliteRadius, delay, max: delay, done: false });
    }
  }

  if (Math.hypot(player.x - boss.x, player.y - boss.y) < DIVE.radius + 12) {
    pushPlayer(player, boss.x, boss.y, DIVE.knockback);
    hurtPlayer(player, DIVE.damage, onDeath, 'Crushed by the Abyssal Lurker!');
  }
}

export function updateAbyssBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  boss.lureFlash = Math.max(0, boss.lureFlash - dt);
  boss.snap = Math.max(0, boss.snap - dt);
  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(effect => effect.timer > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 14) {
      addRing(boss.x + rand(-50, 50), boss.y + rand(-34, 34), rand(0.7, 1.5), Math.random() < 0.5 ? 'foam' : 'water', 0.55);
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
    addRing(boss.x, boss.y, 3, 'glow', 0.8);
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const speedScale = boss.enraged ? ENRAGE.speedScale : 1;
  const speed = BOSS.movementSpeed * speedScale;
  boss.swim += dt * (boss.state === 'swim' ? 6 : 3);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'swim';
      boss.attackCooldown = nextCooldown();
    }
  } else if (boss.state === 'swim') {
    turn(toPlayer, dt, 1);
    if (distance > 120) {
      boss.x += Math.cos(boss.angle) * speed * dt;
      boss.y += Math.sin(boss.angle) * speed * dt;
      keepInArena(BODY_RADIUS + 50);
    }
    boss.attackCooldown -= dt;
    if (boss.attackCooldown <= 0) startAttack();
  } else if (boss.state === 'bubbleWindup') {
    boss.timer -= dt;
    turn(toPlayer, dt, 2);
    if (boss.timer <= 0) {
      fireBubbles(player);
      boss.state = 'bubbleRecover';
      boss.timer = BUBBLES.recover;
    }
  } else if (boss.state === 'bubbleRecover') {
    boss.timer -= dt;
    turn(toPlayer, dt, 1);
    if (boss.timer <= 0) endAttack();
  } else if (boss.state === 'pullWindup') {
    boss.timer -= dt;
    turn(toPlayer, dt, 2.5);
    if (boss.timer <= 0) {
      boss.state = 'pulling';
      boss.timer = PULL.duration;
    }
  } else if (boss.state === 'pulling') {
    boss.timer -= dt;
    turn(toPlayer, dt, 1.5);
    const mouth = mouthWorld();
    const pdx = mouth.x - player.x;
    const pdy = mouth.y - player.y;
    const pd = Math.hypot(pdx, pdy);
    if (pd < PULL.range && pd > 8) {
      const step = Math.min(pd, PULL.speed * speedScale * dt);
      player.x += pdx / pd * step;
      player.y += pdy / pd * step;
    }
    if (boss.timer <= 0) {
      // The chomp: big damage if the player never got away
      addRing(mouth.x, mouth.y, PULL.chompRadius / 30, 'foam', 0.4);
      if (Math.hypot(player.x - mouth.x, player.y - mouth.y) < PULL.chompRadius + 12) {
        pushPlayer(player, mouth.x, mouth.y, 50);
        hurtPlayer(player, PULL.chompDamage, onDeath, 'Swallowed by the Abyssal Lurker!');
        if (!boss) return;
      }
      boss.state = 'stunned';
      boss.timer = PULL.stunAfter;
      boss.snap = 0.35;
    }
  } else if (boss.state === 'diving') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'submerged';
      boss.timer = DIVE.trackTime + DIVE.warnTime;
      boss.locked = false;
    }
  } else if (boss.state === 'submerged') {
    boss.timer -= dt;
    turn(toPlayer, dt, 4);
    if (!boss.locked) {
      if (boss.timer <= DIVE.warnTime) {
        // Lock the landing spot; from here it only drifts to that point
        const point = clampToArena(player.x, player.y, 30);
        boss.targetX = point.x;
        boss.targetY = point.y;
        boss.locked = true;
      } else if (distance > 1) {
        const step = Math.min(distance, DIVE.trackSpeed * speedScale * dt);
        boss.x += dx / distance * step;
        boss.y += dy / distance * step;
      }
    } else {
      const blend = Math.min(1, dt * 7);
      boss.x += (boss.targetX - boss.x) * blend;
      boss.y += (boss.targetY - boss.y) * blend;
    }
    if (boss.timer <= 0) {
      erupt(player, onDeath);
      if (!boss) return;
    }
  } else if (boss.state === 'stunned') {
    boss.timer -= dt;
    if (boss.timer <= 0) endAttack();
  }

  // Bubble mines: they pop on touch or when their timer runs out
  for (const bubble of boss.bubbles) {
    const drag = Math.max(0, 1 - BUBBLES.friction * dt);
    bubble.vx *= drag;
    bubble.vy *= drag;
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.life -= dt;
    const touching = Math.hypot(player.x - bubble.x, player.y - bubble.y) < BUBBLES.radius + 12;
    if (touching || bubble.life <= 0) {
      popBubble(bubble, player, onDeath);
      if (!boss) return;
    }
  }
  boss.bubbles = boss.bubbles.filter(bubble => !bubble.done);

  // Delayed geysers from the enraged dive
  for (const zone of boss.zones) {
    zone.delay -= dt;
    if (zone.delay <= 0) {
      zone.done = true;
      addRing(zone.x, zone.y, zone.radius / 30, 'foam', 0.5);
      if (Math.hypot(player.x - zone.x, player.y - zone.y) < zone.radius + 12) {
        hurtPlayer(player, DIVE.satelliteDamage, onDeath, 'Blasted by the Abyssal Lurker!');
        if (!boss) return;
      }
    }
  }
  boss.zones = boss.zones.filter(zone => !zone.done);

  // Touching the body hurts, except while it is under the surface
  if (!INVULNERABLE.has(boss.state)
    && bodyCircles().some(c => Math.hypot(player.x - c.x, player.y - c.y) < c.radius + 12)) {
    hurtPlayer(player, BOSS.contactDamage, onDeath, 'Caught by the Abyssal Lurker!');
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

function quad(p0, p1, p2, t) {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  };
}

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
    ctx.arc(x + Math.cos(angle) * (inner + 6 * s), y + Math.sin(angle) * (inner + 6 * s), 2.5 * fade * s + 0.5, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

function drawZone(ctx, zone, player) {
  const p = 1 - zone.delay / zone.max;
  const x = zone.x - player.cameraX;
  const y = zone.y - player.cameraY;
  ctx.save();
  ctx.fillStyle = `rgba(239, 68, 68, ${0.08 + p * 0.22})`;
  ctx.strokeStyle = `rgba(252, 165, 165, ${0.35 + p * 0.5})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, zone.radius, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = `rgba(254, 202, 202, ${0.15 + p * 0.3})`;
  ctx.beginPath();
  ctx.arc(x, y, zone.radius * p, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawTelegraphs(ctx, player, time) {
  const state = boss.state;

  if (state === 'bubbleWindup') {
    const progress = 1 - boss.timer / BUBBLES.windup;
    const mouth = mouthWorld();
    const mx = mouth.x - player.cameraX;
    const my = mouth.y - player.cameraY;
    const base = Math.atan2(player.y - mouth.y, player.x - mouth.x);
    const count = boss.enraged ? BUBBLES.countPhaseTwo : BUBBLES.count;
    ctx.save();
    ctx.translate(mx, my);
    ctx.fillStyle = `rgba(56, 189, 248, ${0.05 + progress * 0.14})`;
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.25 + progress * 0.4})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 330, base - BUBBLES.spread / 2, base + BUBBLES.spread / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([5, 8]);
    for (let k = 0; k < count; k++) {
      const angle = base + (count === 1 ? 0 : k / (count - 1) - 0.5) * BUBBLES.spread;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 30, Math.sin(angle) * 30);
      ctx.lineTo(Math.cos(angle) * 250, Math.sin(angle) * 250);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (state === 'pullWindup' || state === 'pulling') {
    const pulling = state === 'pulling';
    const progress = pulling ? 1 : 1 - boss.timer / PULL.windup;
    const mouth = mouthWorld();
    const mx = mouth.x - player.cameraX;
    const my = mouth.y - player.cameraY;
    ctx.save();
    ctx.translate(mx, my);
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(125, 211, 252, ${0.2 + progress * 0.25})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(0, 0, PULL.range, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    // Spinning whirlpool arcs
    ctx.lineWidth = 4;
    for (let k = 0; k < 4; k++) {
      const radius = PULL.range * (0.3 + k * 0.2);
      const start = time / (320 - k * 40) + k * 1.7;
      ctx.strokeStyle = `rgba(186, 230, 253, ${(0.2 + progress * 0.35) * (1 - k * 0.15)})`;
      ctx.beginPath();
      ctx.arc(0, 0, radius, start, start + 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, radius, start + Math.PI, start + Math.PI + 1.5);
      ctx.stroke();
    }
    if (pulling) {
      const chompProgress = 1 - boss.timer / PULL.duration;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.05 + chompProgress * 0.25})`;
      ctx.strokeStyle = `rgba(252, 165, 165, ${0.4 + chompProgress * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, PULL.chompRadius, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  if (state === 'submerged' && boss.locked) {
    const progress = 1 - boss.timer / DIVE.warnTime;
    const x = boss.targetX - player.cameraX;
    const y = boss.targetY - player.cameraY;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = `rgba(239, 68, 68, ${0.08 + progress * 0.24})`;
    ctx.strokeStyle = `rgba(252, 165, 165, ${0.35 + progress * 0.5})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -time / 30;
    ctx.beginPath();
    ctx.arc(0, 0, DIVE.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(254, 202, 202, ${0.15 + progress * 0.3})`;
    ctx.beginPath();
    ctx.arc(0, 0, DIVE.radius * progress, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  for (const zone of boss.zones) drawZone(ctx, zone, player);

  // Bubbles about to pop show their blast radius
  for (const bubble of boss.bubbles) {
    if (bubble.life > 0.8) continue;
    const p = 1 - bubble.life / 0.8;
    ctx.save();
    ctx.translate(bubble.x - player.cameraX, bubble.y - player.cameraY);
    ctx.strokeStyle = `rgba(252, 165, 165, ${0.3 + p * 0.5})`;
    ctx.fillStyle = `rgba(239, 68, 68, ${0.05 + p * 0.15})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, BUBBLES.popRadius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawSubmerged(ctx, x, y, time) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(2, 12, 24, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 0, 58, 32, 0, 0, TAU);
  ctx.fill();
  for (let k = 0; k < 3; k++) {
    const p = (time / 600 + k / 3) % 1;
    ctx.strokeStyle = `rgba(186, 230, 253, ${(1 - p) * 0.55})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30 + p * 55, 16 + p * 30, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.rotate(boss.angle);
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.5)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-18, -10);
  ctx.lineTo(-80, -34);
  ctx.moveTo(-18, 10);
  ctx.lineTo(-80, 34);
  ctx.stroke();
  ctx.restore();
}

function drawAnglerfish(ctx, player, canvas, time) {
  const state = boss.state;
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  if (x < -200 || y < -200 || x > canvas.width + 200 || y > canvas.height + 200) return;

  if (state === 'submerged') {
    drawSubmerged(ctx, x, y, time);
    return;
  }

  const diving = state === 'diving';
  const stunned = state === 'stunned';
  const pulling = state === 'pulling';
  const windup = state === 'bubbleWindup' || state === 'pullWindup';
  const flash = boss.hitFlash > 0;
  const sinkProgress = diving ? Math.max(0, Math.min(1, 1 - boss.timer / DIVE.sinkTime)) : 0;

  let alpha = 1;
  if (boss.defeated) alpha = Math.max(0, boss.defeatTimer / BOSS.deathTime);
  else if (state === 'intro') alpha = Math.min(1, (1 - boss.timer / INTRO_TIME) * 2);
  else if (diving) alpha = 1 - sinkProgress * 0.9;
  const scale = diving ? 1 - sinkProgress * 0.25 : 1;

  let shake = 0;
  if (windup) shake = Math.sin(time / 25) * 1.4;
  else if (stunned) shake = Math.sin(time / 40) * 1.2;
  if (boss.defeated) shake = Math.sin(time / 18) * 3;
  const bob = stunned ? 0 : Math.sin(time / 500) * 2;

  let open = 0.25 + Math.sin(time / 260) * 0.08;
  if (windup) open = 0.9;
  else if (pulling) open = 1;
  else if (state === 'bubbleRecover') open = 0.5;
  else if (stunned) open = boss.snap > 0 ? 0 : 0.65;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Water ripple and shadow under the body
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(x, y + 34, 92 + Math.sin(time / 300) * 3, 30, 0, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 36, 74, 24, 0, 0, TAU);
  ctx.fill();

  ctx.translate(x + shake, y + bob);
  ctx.scale(scale, scale);
  ctx.rotate(boss.angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Tail
  const wag = Math.sin(boss.swim) * 0.28;
  ctx.fillStyle = flash ? '#e0f2fe' : '#0c3558';
  ctx.strokeStyle = '#031321';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(-62, 0, 26, 16, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(-80, 0);
  ctx.rotate(wag);
  ctx.fillStyle = flash ? '#e0f2fe' : '#124a75';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-18, -12, -48, -34);
  ctx.lineTo(-36, 0);
  ctx.lineTo(-48, 34);
  ctx.quadraticCurveTo(-18, 12, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.5)';
  ctx.lineWidth = 1.5;
  for (const ray of [-22, -10, 10, 22]) {
    ctx.beginPath();
    ctx.moveTo(-4, ray * 0.15);
    ctx.lineTo(-38, ray);
    ctx.stroke();
  }
  ctx.restore();

  // Pectoral fins
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(-4, side * 38);
    ctx.rotate(side * (0.5 + Math.sin(boss.swim + (side > 0 ? 1.5 : 0)) * 0.22));
    ctx.fillStyle = flash ? '#e0f2fe' : 'rgba(30, 96, 145, 0.9)';
    ctx.strokeStyle = '#031321';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-12, side * 14, 26, 11, side * 0.5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Body
  const bodyGradient = ctx.createRadialGradient(10, -14, 6, -6, 0, 66);
  if (flash) {
    bodyGradient.addColorStop(0, '#ffffff');
    bodyGradient.addColorStop(1, '#bae6fd');
  } else {
    bodyGradient.addColorStop(0, '#1d5f8a');
    bodyGradient.addColorStop(0.55, '#0c2f4f');
    bodyGradient.addColorStop(1, '#050f1b');
  }
  ctx.fillStyle = bodyGradient;
  ctx.strokeStyle = '#020a12';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(-6, 0, 62, 44, 0, 0, TAU);
  ctx.fill();
  ctx.stroke();

  // Dorsal ridge and gills
  ctx.fillStyle = '#0a2740';
  for (let k = 0; k < 6; k++) {
    const rx = -52 + k * 13;
    ctx.beginPath();
    ctx.moveTo(rx, -4);
    ctx.lineTo(rx + 6, 0);
    ctx.lineTo(rx, 4);
    ctx.lineTo(rx - 6, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(2, 10, 18, 0.7)';
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(-20 + k * 5, side * 28, 10, side > 0 ? 0.3 : -2.8, side > 0 ? 2.8 : -0.3);
      ctx.stroke();
    }
  }

  // Bioluminescent spots
  if (!flash) {
    ctx.fillStyle = '#67e8f9';
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 6;
    SPOTS.forEach(([sx, sy], index) => {
      ctx.globalAlpha = alpha * (0.45 + Math.sin(time / 300 + index) * 0.35);
      ctx.beginPath();
      ctx.arc(sx, sy, 2.4, 0, TAU);
      ctx.fill();
    });
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 0;
  }

  // Eyes
  const eye = (windup || pulling) ? '#ef4444' : stunned ? '#6b7280' : '#fde68a';
  ctx.fillStyle = eye;
  ctx.shadowColor = eye;
  ctx.shadowBlur = stunned ? 0 : 10;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(26, side * 30, 6, 0, TAU);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#0b1220';
  for (const side of [-1, 1]) {
    ctx.fillRect(25, side * 30 - 4, 2.4, 8);
  }

  // Mouth cavity
  ctx.fillStyle = '#02070d';
  ctx.beginPath();
  ctx.ellipse(66, 0, 24, 6 + open * 18, 0, 0, TAU);
  ctx.fill();
  if (windup || pulling) {
    ctx.fillStyle = `rgba(103, 232, 249, ${0.2 + open * 0.25})`;
    ctx.beginPath();
    ctx.ellipse(66, 0, 14, 3 + open * 10, 0, 0, TAU);
    ctx.fill();
  }

  // Jaws and teeth
  for (const side of [-1, 1]) {
    const p0 = { x: 40, y: side * 20 };
    const p1 = { x: 70, y: side * (32 + open * 10) };
    const p2 = { x: 92, y: side * (6 + open * 24) };
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y);
    ctx.strokeStyle = '#031321';
    ctx.lineWidth = 15;
    ctx.stroke();
    ctx.strokeStyle = flash ? '#e0f2fe' : '#1d5f8a';
    ctx.lineWidth = 10;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    for (let k = 0; k < 6; k++) {
      const t = 0.3 + k * 0.12;
      const point = quad(p0, p1, p2, t);
      const next = quad(p0, p1, p2, t + 0.04);
      const tx = next.x - point.x;
      const ty = next.y - point.y;
      const length = Math.hypot(tx, ty) || 1;
      const ux = tx / length;
      const uy = ty / length;
      ctx.beginPath();
      ctx.moveTo(point.x - ux * 3, point.y - uy * 3);
      ctx.lineTo(point.x + ux * 3, point.y + uy * 3);
      ctx.lineTo(point.x + ux * 0.5, point.y - side * (8 + (k % 2) * 3));
      ctx.closePath();
      ctx.fill();
    }
  }

  // Stalk and lure
  const lure = lureLocal();
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.quadraticCurveTo(64, -26 + lure.y * 0.5, lure.x, lure.y);
  ctx.strokeStyle = '#041525';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.strokeStyle = '#1e6091';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const lureColor = stunned ? '90, 140, 170' : (windup || pulling) ? '253, 224, 71' : '103, 232, 249';
  const pulse = 1 + Math.sin(time / 140) * 0.12 + boss.lureFlash * 2.4;
  const glow = ctx.createRadialGradient(lure.x, lure.y, 0, lure.x, lure.y, 38 * pulse);
  glow.addColorStop(0, `rgba(${lureColor}, 0.95)`);
  glow.addColorStop(0.4, `rgba(${lureColor}, 0.28)`);
  glow.addColorStop(1, `rgba(${lureColor}, 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(lure.x, lure.y, 38 * pulse, 0, TAU);
  ctx.fill();
  ctx.fillStyle = boss.lureFlash > 0 ? '#ffffff' : `rgb(${lureColor})`;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(lure.x, lure.y, 9, 0, TAU);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Water droplets circling the head while it is beached
  if (stunned && !boss.defeated) {
    ctx.save();
    ctx.fillStyle = '#7dd3fc';
    for (let k = 0; k < 4; k++) {
      const a = time / 260 + k * TAU / 4;
      const sx = x + Math.cos(a) * 34;
      const sy = y - 62 + Math.sin(a) * 9;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 7);
      ctx.quadraticCurveTo(sx + 5, sy + 1, sx, sy + 5);
      ctx.quadraticCurveTo(sx - 5, sy + 1, sx, sy - 7);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawBubbles(ctx, player, time) {
  for (const bubble of boss.bubbles) {
    const x = bubble.x - player.cameraX;
    const y = bubble.y - player.cameraY + Math.sin(time / 180 + bubble.wobble) * 3;
    const r = BUBBLES.radius * (1 + Math.sin(time / 120 + bubble.wobble) * 0.06);
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.ellipse(x, y + 16, r * 0.8, r * 0.3, 0, 0, TAU);
    ctx.fill();
    const body = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r);
    body.addColorStop(0, 'rgba(224, 242, 254, 0.75)');
    body.addColorStop(0.7, 'rgba(56, 189, 248, 0.35)');
    body.addColorStop(1, 'rgba(14, 116, 144, 0.6)');
    ctx.fillStyle = body;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawArena(ctx, player, time) {
  const centerX = boss.centerX - player.cameraX;
  const centerY = boss.centerY - player.cameraY;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 47, 73, 0.28)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 3;
  for (let k = 0; k < 4; k++) {
    const r = (time / 25 + k * 150) % ARENA_RADIUS;
    ctx.globalAlpha = 0.2 * (1 - r / ARENA_RADIUS);
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, TAU);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.78)';
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
    const sway = Math.sin(time / 500 + i) * 2;
    ctx.fillStyle = i % 2 ? '#155e75' : '#0e7490';
    ctx.fillRect(fx - 4 + sway, fy - 8, 8, 16);
  }
  ctx.restore();
}

function drawHud(ctx, canvas, time) {
  const barWidth = Math.min(560, canvas.width - 80);
  const barX = (canvas.width - barWidth) / 2;
  const barY = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(3, 7, 18, 0.88)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 48);
  ctx.fillStyle = '#1f2937';
  ctx.fillRect(barX, barY + 14, barWidth, 14);
  ctx.fillStyle = boss.enraged ? '#f472b6' : '#22d3ee';
  ctx.fillRect(barX, barY + 14, barWidth * healthRatio(), 14);
  ctx.strokeStyle = '#bae6fd';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY + 14, barWidth, 14);
  if (!boss.enraged) {
    const tick = barX + barWidth * ENRAGE.threshold;
    ctx.beginPath();
    ctx.moveTo(tick, barY + 11);
    ctx.lineTo(tick, barY + 31);
    ctx.stroke();
  }
  ctx.fillStyle = '#e0f2fe';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(NAME, canvas.width / 2, barY + 9);

  const blink = 0.6 + Math.sin(time / 90) * 0.4;
  ctx.font = 'bold 14px monospace';
  if (boss.state === 'stunned') {
    ctx.fillStyle = `rgba(253, 224, 71, ${blink})`;
    ctx.fillText('>> BEACHED! HIT IT! <<', canvas.width / 2, barY + 62);
  } else if (boss.state === 'pullWindup' || boss.state === 'pulling') {
    ctx.fillStyle = `rgba(253, 224, 71, ${blink})`;
    ctx.fillText('>> HIT THE LURE TO BREAK FREE! <<', canvas.width / 2, barY + 62);
  }
  ctx.restore();
}

export function drawAbyssBoss(ctx, player, canvas, time) {
  if (!boss) return;
  drawArena(ctx, player, time);
  if (!boss.defeated) drawTelegraphs(ctx, player, time);
  drawAnglerfish(ctx, player, canvas, time);
  drawBubbles(ctx, player, time);
  for (const effect of boss.effects) drawEffect(ctx, effect, player);
  if (!boss.defeated) drawHud(ctx, canvas, time);
}