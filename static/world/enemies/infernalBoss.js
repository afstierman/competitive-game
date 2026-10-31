import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';
import { CONFIG } from '../../config.js';
import { findOpenPosition } from '../world.js';

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

const ARENA_RADIUS = 600;
const BOSS_RADIUS = 42;
const INTRO_TIME = 1.8;
const HIT_KEY = 'infernal-boss';
const NAME = BOSS.name.toUpperCase();
const TAU = Math.PI * 2;

const RING_COLORS = {
  fire: '249, 115, 22',
  amber: '251, 191, 36',
  magma: '239, 68, 68',
  white: '254, 243, 199'
};

const EMBERS = Array.from({ length: 65 }, (_, i) => {
  const a = Math.sin(i * 73.1) * 43758.5453;
  const b = Math.sin(i * 19.4 + 2.1) * 24634.6345;
  const c = Math.sin(i * 31.2 + 1.5) * 15731.7431;
  const r1 = a - Math.floor(a);
  const r2 = b - Math.floor(b);
  const r3 = c - Math.floor(c);
  return { angle: r1 * TAU, dist: Math.sqrt(r2) * (ARENA_RADIUS - 26), size: 1 + r3 * 1.8, phase: r1 * 10 };
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

function addRing(x, y, size, color, duration = 0.6) {
  boss.effects.push({ x, y, size, color, timer: duration, max: duration });
}

function nextCooldown() {
  const scale = boss.enraged ? ENRAGE.cooldownScale : 1;
  return rand(BOSS.attackDelay.min, BOSS.attackDelay.max) * scale;
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
    y: centerY - 80,
    centerX,
    centerY,
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | chase | dashWindup | dashing | geyserWindup | novaWindup | recover
    timer: INTRO_TIME,
    lastAttack: null,
    attackCooldown: 0,
    enraged: false,
    facing: Math.PI / 2,
    dashTarget: { x: 0, y: 0 },
    puddles: [],
    geysers: [],
    projectiles: [],
    effects: [],
    hitFlash: 0,
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  addRing(boss.x, boss.y, 3.5, 'fire', 1.0);

  if (player) {
    const spawn = findOpenPosition(centerX, centerY + 160, CONFIG.playerRadius);
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
  boss.puddles = [];
  boss.geysers = [];
  boss.projectiles = [];
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

  const range = shot ? player.slingshotShotRange : 85;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.4;

  const dx = boss.x - player.x;
  const dy = boss.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > range + BOSS_RADIUS) return;
  if (distance > BOSS_RADIUS) {
    const slack = Math.asin(BOSS_RADIUS / distance);
    if (Math.abs(angleDifference(Math.atan2(dy, dx), attackAngle)) > tolerance + slack) return;
  }

  const baseDamage = (shot ? player.slingshotDamage : player.swordDamage) ?? 1;
  player.attackHitEnemies.add(HIT_KEY);
  if (shot) player.slingshotShotActive = false;

  boss.hp -= baseDamage;
  boss.hitFlash = 0.12;
  addRing(boss.x, boss.y, 0.9, 'amber', 0.25);
  if (boss.hp <= 0) defeatBoss(player);
}

export function damageInfernalBoss(player, swingAngle) {
  if (!boss || boss.defeated) return;
  applyDamage(player, swingAngle);
}

function hurtPlayer(player, amount, onDeath, message) {
  if (player.enemyDamageCooldown > 0) return;
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.85;
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

function pickAttack() {
  const options = ['dash', 'geyser', 'nova'].filter(t => t !== boss.lastAttack);
  return options[Math.floor(Math.random() * options.length)];
}

function startAttack(player, toPlayer) {
  const type = pickAttack();
  boss.lastAttack = type;
  if (type === 'dash') {
    boss.state = 'dashWindup';
    boss.timer = DASH.windup;
    boss.facing = toPlayer;
  } else if (type === 'geyser') {
    boss.state = 'geyserWindup';
    boss.timer = GEYSER.windup;
    
    // Target active prediction lines around player
    const count = boss.enraged ? GEYSER.countPhaseTwo : GEYSER.count;
    boss.geysers = [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TAU;
      const dist = rand(40, 220);
      const gx = Math.max(boss.centerX - ARENA_RADIUS + 50, Math.min(boss.centerX + ARENA_RADIUS - 50, player.x + Math.cos(angle) * dist));
      const gy = Math.max(boss.centerY - ARENA_RADIUS + 50, Math.min(boss.centerY + ARENA_RADIUS - 50, player.y + Math.sin(angle) * dist));
      boss.geysers.push({
        x: gx,
        y: gy,
        timer: GEYSER.warnTime,
        active: false,
        duration: GEYSER.eruptionTime
      });
    }
  } else {
    boss.state = 'novaWindup';
    boss.timer = NOVA.windup;
  }
}

function endAttack() {
  boss.state = 'chase';
  boss.attackCooldown = nextCooldown();
}

export function updateInfernalBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);

  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(e => e.timer > 0);

  for (const puddle of boss.puddles) puddle.life -= dt;
  boss.puddles = boss.puddles.filter(p => p.life > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 18) {
      addRing(boss.x + rand(-50, 50), boss.y + rand(-50, 50), rand(0.8, 1.8), Math.random() < 0.5 ? 'magma' : 'amber', 0.5);
    }
    if (boss.defeatTimer <= 0) boss = null;
    return;
  }

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
    addRing(boss.x, boss.y, 4.0, 'magma', 1.0);
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const speed = BOSS.movementSpeed * (boss.enraged ? ENRAGE.speedScale : 1);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'chase';
      boss.attackCooldown = nextCooldown();
    }
  } else if (boss.state === 'chase') {
    boss.facing = toPlayer;
    if (distance > 70) {
      boss.x += Math.cos(toPlayer) * speed * dt;
      boss.y += Math.sin(toPlayer) * speed * dt;
      keepInArena(BOSS_RADIUS + 20);
    }

    boss.attackCooldown -= dt;
    if (boss.attackCooldown <= 0) {
      startAttack(player, toPlayer);
    }
  } else if (boss.state === 'dashWindup') {
    boss.timer -= dt;
    boss.facing = toPlayer;
    if (boss.timer <= 0) {
      boss.state = 'dashing';
      boss.timer = DASH.duration;
      // Lock dash vector toward player position at trigger moment + extra distance
      const aimDist = Math.min(distance + 250, 600);
      boss.dashTarget.x = boss.x + Math.cos(boss.facing) * aimDist;
      boss.dashTarget.y = boss.y + Math.sin(boss.facing) * aimDist;
      addRing(boss.x, boss.y, 3.0, 'magma', 0.5);
    }
  } else if (boss.state === 'dashing') {
    boss.timer -= dt;
    const moveStep = DASH.speed * dt;
    boss.x += Math.cos(boss.facing) * moveStep;
    boss.y += Math.sin(boss.facing) * moveStep;
    keepInArena(BOSS_RADIUS + 10);

    // Leave a damaging magma trail behind during dash
    if (Math.random() < 0.4) {
      boss.puddles.push({ x: boss.x, y: boss.y, radius: 28, life: DASH.trailDuration });
    }

    if (Math.hypot(player.x - boss.x, player.y - boss.y) < BOSS_RADIUS + 18) {
      hurtPlayer(player, DASH.damage, onDeath, 'Run down by Pyraxis’s molten charge!');
      if (!boss) return;
    }

    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = DASH.recover;
    }
  } else if (boss.state === 'geyserWindup') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = GEYSER.recover;
    }
  } else if (boss.state === 'novaWindup') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'releasingNova';
      // Fire expanding flame rings from boss position
      for (let r = 1; r <= NOVA.rings; r++) {
        const ringDelay = (r - 1) * 0.25;
        const count = 8 + r * 4;
        for (let i = 0; i < count; i++) {
          const angle = (i * TAU) / count;
          boss.projectiles.push({
            x: boss.x,
            y: boss.y,
            vx: Math.cos(angle) * NOVA.ringSpeed,
            vy: Math.sin(angle) * NOVA.ringSpeed,
            delay: ringDelay,
            life: 4.0,
            active: false
          });
        }
      }
      addRing(boss.x, boss.y, 4.2, 'white', 0.8);
      boss.state = 'recover';
      boss.timer = NOVA.recover;
    }
  } else if (boss.state === 'recover') {
    boss.timer -= dt;
    if (boss.timer <= 0) endAttack();
  }

  // Update geysers
  for (const g of boss.geysers) {
    if (!g.active) {
      g.timer -= dt;
      if (g.timer <= 0) {
        g.active = true;
        addRing(g.x, g.y, 2.2, 'magma', 0.4);
      }
    } else {
      g.duration -= dt;
      if (Math.hypot(player.x - g.x, player.y - g.y) < GEYSER.radius + 10) {
        hurtPlayer(player, GEYSER.damage, onDeath, 'Blasted into ashes by a Magma Geyser!');
        if (!boss) return;
      }
    }
  }
  boss.geysers = boss.geysers.filter(g => !g.active || g.duration > 0);

  // Update projectiles (Nova rings)
  for (const p of boss.projectiles) {
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    p.active = true;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (Math.hypot(player.x - p.x, player.y - p.y) < NOVA.radius + 10) {
      p.life = 0;
      hurtPlayer(player, NOVA.damage, onDeath, 'Incinerated by Pyraxis’s Supernova Flame!');
      if (!boss) return;
    }
  }
  boss.projectiles = boss.projectiles.filter(p => p.life > 0);

  // Update puddle hazards on floor
  for (const p of boss.puddles) {
    if (Math.hypot(player.x - p.x, player.y - p.y) < p.radius + 8) {
      hurtPlayer(player, 4, onDeath, 'Melted in Pyraxis’s residual magma trails!');
      if (!boss) return;
    }
  }

  // Direct contact damage check
  if (Math.hypot(player.x - boss.x, player.y - boss.y) < BOSS_RADIUS + 12) {
    pushPlayer(player, boss.x, boss.y, 35);
    hurtPlayer(player, BOSS.contactDamage, onDeath, 'Trampled by the Molten Core Drake!');
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
  ctx.fillStyle = `rgba(${color}, ${fade * 0.18})`;
  ctx.beginPath();
  ctx.arc(x, y, (14 + t * 45) * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${color}, ${fade})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, (12 + t * 45) * s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawArena(ctx, player, time) {
  const centerX = boss.centerX - player.cameraX;
  const centerY = boss.centerY - player.cameraY;
  ctx.save();
  const fill = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, ARENA_RADIUS);
  fill.addColorStop(0, 'rgba(154, 52, 18, 0.4)');
  fill.addColorStop(1, 'rgba(40, 10, 2, 0.55)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.fill();

  for (const ember of EMBERS) {
    const pulse = 0.4 + Math.sin(time / 350 + ember.phase) * 0.4;
    ctx.fillStyle = `rgba(251, 146, 60, ${Math.max(0.1, pulse)})`;
    ctx.fillRect(centerX + Math.cos(ember.angle) * ember.dist, centerY + Math.sin(ember.angle) * ember.dist, ember.size, ember.size);
  }

  // Draw floor puddles
  for (const p of boss.puddles) {
    const px = p.x - player.cameraX;
    const py = p.y - player.cameraY;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw geyser warnings & eruptions
  for (const g of boss.geysers) {
    const gx = g.x - player.cameraX;
    const gy = g.y - player.cameraY;
    if (!g.active) {
      const p = 1 - g.timer / GEYSER.warnTime;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + p * 0.3})`;
      ctx.beginPath();
      ctx.arc(gx, gy, GEYSER.radius * p, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gx, gy, GEYSER.radius, 0, TAU);
      ctx.stroke();
    } else {
      const pillar = ctx.createLinearGradient(gx, gy + GEYSER.radius, gx, gy - 180);
      pillar.addColorStop(0, 'rgba(249, 115, 22, 0.9)');
      pillar.addColorStop(1, 'rgba(254, 243, 199, 0)');
      ctx.fillStyle = pillar;
      ctx.beginPath();
      ctx.arc(gx, gy, GEYSER.radius + 6, 0, TAU);
      ctx.fill();
    }
  }

  ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBossSprite(ctx, player, canvas, time) {
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  if (x < -200 || y < -200 || x > canvas.width + 200 || y > canvas.height + 200) return;

  const flash = boss.hitFlash > 0;
  let alpha = 1;
  let scale = 1;
  if (boss.defeated) {
    const p = Math.max(0, boss.defeatTimer / BOSS.deathTime);
    alpha = Math.max(0.15, p);
    scale = 0.3 + p * 0.7;
  } else if (boss.state === 'intro') {
    const p = 1 - boss.timer / INTRO_TIME;
    alpha = Math.min(1, p * 2);
    scale = 0.4 + p * 0.6;
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.rotate(boss.facing);

  // Aura glow
  const aura = ctx.createRadialGradient(0, 0, 15, 0, 0, 110);
  aura.addColorStop(0, 'rgba(249, 115, 22, 0.5)');
  aura.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 110, 0, TAU);
  ctx.fill();

  // Drake body
  const bodyGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, BOSS_RADIUS);
  if (flash) {
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(1, '#fef3c7');
  } else {
    bodyGrad.addColorStop(0, '#ea580c');
    bodyGrad.addColorStop(0.7, '#7c2d12');
    bodyGrad.addColorStop(1, '#290505');
  }
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 24;
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, BOSS_RADIUS, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Fierce glowing dragon eyes
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(22, -10, 5, 0, TAU);
  ctx.arc(22, 10, 5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawProjectiles(ctx, player) {
  for (const p of boss.projectiles) {
    if (!p.active) continue;
    const px = p.x - player.cameraX;
    const py = p.y - player.cameraY;
    ctx.save();
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, NOVA.radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

function drawHud(ctx, canvas, time) {
  const barWidth = Math.min(560, canvas.width - 80);
  const barX = (canvas.width - barWidth) / 2;
  const barY = 24;
  ctx.save();
  ctx.fillStyle = 'rgba(20, 6, 2, 0.9)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 44);
  ctx.fillStyle = '#291008';
  ctx.fillRect(barX, barY + 12, barWidth, 14);
  ctx.fillStyle = boss.enraged ? '#f97316' : '#ea580c';
  ctx.fillRect(barX, barY + 12, barWidth * healthRatio(), 14);
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY + 12, barWidth, 14);
  if (!boss.enraged) {
    const tick = barX + barWidth * ENRAGE.threshold;
    ctx.beginPath();
    ctx.moveTo(tick, barY + 9);
    ctx.lineTo(tick, barY + 29);
    ctx.stroke();
  }
  ctx.fillStyle = '#fffbeb';
  ctx.font = 'bold 15px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(NAME, canvas.width / 2, barY + 7);
  ctx.restore();
}

export function drawInfernalBoss(ctx, player, canvas, time) {
  if (!boss) return;
  drawArena(ctx, player, time);
  drawBossSprite(ctx, player, canvas, time);
  drawProjectiles(ctx, player);
  for (const effect of boss.effects) drawEffect(ctx, effect, player);
  if (!boss.defeated) drawHud(ctx, canvas, time);
}