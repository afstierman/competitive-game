import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';
import { CONFIG } from '../../config.js';
import { findOpenPosition } from '../world.js';

const BOSS = ENEMIES_CONFIG.infernalBoss;
const ENRAGE = {
  threshold: 0.4,
  speedScale: 1.45,
  cooldownScale: 0.55,
  ...(BOSS.enrage || {})
};
const DASH = BOSS.dash;
const GEYSER = BOSS.geyser;
const NOVA = BOSS.nova;

const ARENA_RADIUS = 600;
const BOSS_RADIUS = 46;
const INTRO_TIME = 2.0;
const HIT_KEY = 'infernal-boss';
const NAME = BOSS.name.toUpperCase();
const TAU = Math.PI * 2;

const RING_COLORS = {
  fire: '249, 115, 22',
  amber: '251, 191, 36',
  magma: '239, 68, 68',
  white: '254, 243, 199',
  plasma: '244, 63, 94'
};

const EMBERS = Array.from({ length: 80 }, (_, i) => {
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
    y: centerY - 100,
    centerX,
    centerY,
    hp: BOSS.health,
    maxHp: BOSS.health,
    state: 'intro', // intro | strafe | diveWindup | diving | bombWindup | vortexWindup | recover
    timer: INTRO_TIME,
    lastAttack: null,
    attackCooldown: 0,
    enraged: false,
    facing: Math.PI / 2,
    strafeAngle: 0,
    diveTarget: { x: centerX, y: centerY },
    shockwaves: [],
    magmaPuddles: [],
    clusterBombs: [],
    orbitOrbs: [],
    effects: [],
    hitFlash: 0,
    elapsed: 0,
    defeated: false,
    defeatTimer: 0
  };
  addRing(boss.x, boss.y, 4.0, 'plasma', 1.2);

  if (player) {
    const spawn = findOpenPosition(centerX, centerY + 180, CONFIG.playerRadius);
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
  boss.shockwaves = [];
  boss.magmaPuddles = [];
  boss.clusterBombs = [];
  boss.orbitOrbs = [];
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

  const range = shot ? player.slingshotShotRange : 88;
  const attackAngle = shot ? player.slingshotShotAngle : angle;
  const tolerance = shot ? 0.055 : 0.42;

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
  boss.hitFlash = 0.14;
  addRing(boss.x, boss.y, 1.1, 'plasma', 0.28);
  if (boss.hp <= 0) defeatBoss(player);
}

export function damageInfernalBoss(player, swingAngle) {
  if (!boss || boss.defeated) return;
  applyDamage(player, swingAngle);
}

function hurtPlayer(player, amount, onDeath, message) {
  if (player.enemyDamageCooldown > 0) return;
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.8;
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
  const options = ['dive', 'bombs', 'vortex'].filter(t => t !== boss.lastAttack);
  return options[Math.floor(Math.random() * options.length)];
}

function startAttack(player, toPlayer) {
  const type = pickAttack();
  boss.lastAttack = type;
  if (type === 'dive') {
    boss.state = 'diveWindup';
    boss.timer = DASH.windup;
    boss.facing = toPlayer;
  } else if (type === 'bombs') {
    boss.state = 'bombWindup';
    boss.timer = GEYSER.windup;
    
    // Scatter cluster bomb targets around the arena and near the player
    const count = boss.enraged ? GEYSER.countPhaseTwo : GEYSER.count;
    boss.clusterBombs = [];
    for (let i = 0; i < count + 2; i++) {
      const angle = Math.random() * TAU;
      const dist = rand(60, 280);
      const bx = Math.max(boss.centerX - ARENA_RADIUS + 60, Math.min(boss.centerX + ARENA_RADIUS - 60, player.x + Math.cos(angle) * dist));
      const by = Math.max(boss.centerY - ARENA_RADIUS + 60, Math.min(boss.centerY + ARENA_RADIUS - 60, player.y + Math.sin(angle) * dist));
      boss.clusterBombs.push({
        x: bx,
        y: by,
        timer: GEYSER.warnTime,
        exploded: false,
        radius: GEYSER.radius
      });
    }
  } else {
    boss.state = 'vortexWindup';
    boss.timer = NOVA.windup;
  }
}

function endAttack() {
  boss.state = 'strafe';
  boss.attackCooldown = nextCooldown();
}

export function updateInfernalBoss(player, dt, canvas, onDeath) {
  if (!boss) return;
  boss.elapsed += dt;
  boss.hitFlash = Math.max(0, boss.hitFlash - dt);

  for (const effect of boss.effects) effect.timer -= dt;
  boss.effects = boss.effects.filter(e => e.timer > 0);

  for (const p of boss.magmaPuddles) p.life -= dt;
  boss.magmaPuddles = boss.magmaPuddles.filter(p => p.life > 0);

  if (boss.defeated) {
    boss.defeatTimer -= dt;
    if (Math.random() < dt * 20) {
      addRing(boss.x + rand(-60, 60), boss.y + rand(-60, 60), rand(1.0, 2.2), Math.random() < 0.5 ? 'plasma' : 'amber', 0.6);
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
    addRing(boss.x, boss.y, 4.5, 'plasma', 1.2);
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const distance = Math.hypot(dx, dy);
  const toPlayer = Math.atan2(dy, dx);
  const speed = BOSS.movementSpeed * (boss.enraged ? ENRAGE.speedScale : 1);

  if (boss.state === 'intro') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'strafe';
      boss.attackCooldown = nextCooldown();
    }
  } else if (boss.state === 'strafe') {
    // Dynamic organic circling & weaving around player rather than mindless direct chase
    boss.strafeAngle += dt * 1.5;
    const targetX = player.x + Math.cos(boss.strafeAngle) * 220;
    const targetY = player.y + Math.sin(boss.strafeAngle) * 220;
    const tdx = targetX - boss.x;
    const tdy = targetY - boss.y;
    const tDist = Math.hypot(tdx, tdy);
    
    boss.facing = toPlayer;
    if (tDist > 5) {
      boss.x += (tdx / tDist) * speed * dt;
      boss.y += (tdy / tDist) * speed * dt;
      keepInArena(BOSS_RADIUS + 20);
    }

    boss.attackCooldown -= dt;
    if (boss.attackCooldown <= 0) {
      startAttack(player, toPlayer);
    }
  } else if (boss.state === 'diveWingup') {
    boss.timer -= dt;
    boss.facing = toPlayer;
    if (boss.timer <= 0) {
      boss.state = 'diving';
      boss.timer = DASH.duration;
      // High-speed devastating comet impact dive directly locking player location
      boss.diveTarget.x = player.x;
      boss.diveTarget.y = player.y;
      addRing(boss.x, boss.y, 3.5, 'plasma', 0.6);
    }
  } else if (boss.state === 'diving') {
    boss.timer -= dt;
    const tdx = boss.diveTarget.x - boss.x;
    const tdy = boss.diveTarget.y - boss.y;
    const tDist = Math.hypot(tdx, tdy);
    const moveStep = Math.min(tDist, DASH.speed * dt);
    
    if (tDist > 5) {
      boss.x += (tdx / tDist) * moveStep;
      boss.y += (tdy / tDist) * moveStep;
    }

    if (boss.timer <= 0 || tDist < 10) {
      // Trigger massive shockwave ring blast on impact
      addRing(boss.x, boss.y, 5.0, 'white', 0.8);
      boss.shockwaves.push({ x: boss.x, y: boss.y, radius: 20, maxRadius: 280, speed: 380, life: 0.8 });
      
      // Leave scorching pool
      boss.magmaPuddles.push({ x: boss.x, y: boss.y, radius: 42, life: 4.5 });

      if (Math.hypot(player.x - boss.x, player.y - boss.y) < 70) {
        hurtPlayer(player, DASH.damage, onDeath, 'Crushed beneath Pyraxis’s molten comet impact!');
        if (!boss) return;
      }

      boss.state = 'recover';
      boss.timer = DASH.recover;
    }
  } else if (boss.state === 'bombWindup') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'recover';
      boss.timer = GEYSER.recover;
    }
  } else if (boss.state === 'vortexWindup') {
    boss.timer -= dt;
    if (boss.timer <= 0) {
      boss.state = 'releasingVortex';
      // Summon orbiting magma claws/fireballs around the boss that expand outward
      const count = 10;
      for (let i = 0; i < count; i++) {
        const angle = (i * TAU) / count;
        boss.orbitOrbs.push({
          angle: angle,
          dist: 50,
          speed: 2.5,
          expansion: 80,
          life: 4.5,
          radius: NOVA.radius
        });
      }
      addRing(boss.x, boss.y, 4.8, 'amber', 0.9);
      boss.state = 'recover';
      boss.timer = NOVA.recover;
    }
  } else if (boss.state === 'recover') {
    boss.timer -= dt;
    if (boss.timer <= 0) endAttack();
  }

  // Update Shockwaves
  for (const sw of boss.shockwaves) {
    sw.radius += sw.speed * dt;
    sw.life -= dt;
    const pDist = Math.hypot(player.x - sw.x, player.y - sw.y);
    if (Math.abs(pDist - sw.radius) < 18 && player.enemyDamageCooldown <= 0) {
      hurtPlayer(player, NOVA.damage, onDeath, 'Swept off your feet by Pyraxis’s ground shockwave!');
      if (!boss) return;
    }
  }
  boss.shockwaves = boss.shockwaves.filter(sw => sw.life > 0 && sw.radius < sw.maxRadius);

  // Update Cluster Bombs
  for (const b of boss.clusterBombs) {
    if (!b.exploded) {
      b.timer -= dt;
      if (b.timer <= 0) {
        b.exploded = true;
        addRing(b.x, b.y, 2.5, 'magma', 0.5);
        boss.magmaPuddles.push({ x: b.x, y: b.y, radius: b.radius, life: 3.5 });
        if (Math.hypot(player.x - b.x, player.y - b.y) < b.radius + 12) {
          hurtPlayer(player, GEYSER.damage, onDeath, 'Blasted to cinders by a falling magma cluster bomb!');
          if (!boss) return;
        }
      }
    }
  }
  boss.clusterBombs = boss.clusterBombs.filter(b => !b.exploded);

  // Update Orbiting Vortex Orbs
  for (const orb of boss.orbitOrbs) {
    orb.angle += orb.speed * dt;
    orb.dist += orb.expansion * dt;
    orb.life -= dt;
    const ox = boss.x + Math.cos(orb.angle) * orb.dist;
    const oy = boss.y + Math.sin(orb.angle) * orb.dist;
    if (Math.hypot(player.x - ox, player.y - oy) < orb.radius + 10) {
      orb.life = 0;
      hurtPlayer(player, 6, onDeath, 'Torn apart by Pyraxis’s infernal vortex rings!');
      if (!boss) return;
    }
  }
  boss.orbitOrbs = boss.orbitOrbs.filter(orb => orb.life > 0);

  // Update Puddles
  for (const p of boss.magmaPuddles) {
    if (Math.hypot(player.x - p.x, player.y - p.y) < p.radius + 6) {
      hurtPlayer(player, 5, onDeath, 'Melted into slag in Pyraxis’s molten pools!');
      if (!boss) return;
    }
  }

  // Direct contact damage check
  if (Math.hypot(player.x - boss.x, player.y - boss.y) < BOSS_RADIUS + 12) {
    pushPlayer(player, boss.x, boss.y, 40);
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
  ctx.fillStyle = `rgba(${color}, ${fade * 0.2})`;
  ctx.beginPath();
  ctx.arc(x, y, (16 + t * 50) * s, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = `rgba(${color}, ${fade})`;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, (14 + t * 50) * s, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawArena(ctx, player, time) {
  const centerX = boss.centerX - player.cameraX;
  const centerY = boss.centerY - player.cameraY;
  ctx.save();
  const fill = ctx.createRadialGradient(centerX, centerY, 20, centerX, centerY, ARENA_RADIUS);
  fill.addColorStop(0, 'rgba(127, 29, 29, 0.45)');
  fill.addColorStop(1, 'rgba(30, 9, 3, 0.65)');
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.fill();

  for (const ember of EMBERS) {
    const pulse = 0.4 + Math.sin(time / 300 + ember.phase) * 0.45;
    ctx.fillStyle = `rgba(244, 63, 94, ${Math.max(0.12, pulse)})`;
    ctx.fillRect(centerX + Math.cos(ember.angle) * ember.dist, centerY + Math.sin(ember.angle) * ember.dist, ember.size, ember.size);
  }

  // Draw Magma Puddles
  for (const p of boss.magmaPuddles) {
    const px = p.x - player.cameraX;
    const py = p.y - player.cameraY;
    ctx.fillStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.beginPath();
    ctx.arc(px, py, p.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Draw Shockwaves
  for (const sw of boss.shockwaves) {
    const sx = sw.x - player.cameraX;
    const sy = sw.y - player.cameraY;
    const alpha = Math.max(0, sw.life / 0.8);
    ctx.strokeStyle = `rgba(254, 243, 199, ${alpha})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(sx, sy, sw.radius, 0, TAU);
    ctx.stroke();
  }

  // Draw Cluster Bomb indicators
  for (const b of boss.clusterBombs) {
    const bx = b.x - player.cameraX;
    const by = b.y - player.cameraY;
    if (!b.exploded) {
      const p = 1 - b.timer / GEYSER.warnTime;
      ctx.fillStyle = `rgba(244, 63, 94, ${0.12 + p * 0.35})`;
      ctx.beginPath();
      ctx.arc(bx, by, b.radius * p, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, b.radius, 0, TAU);
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(244, 63, 94, 0.95)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(centerX, centerY, ARENA_RADIUS, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBossSprite(ctx, player, canvas, time) {
  const x = boss.x - player.cameraX;
  const y = boss.y - player.cameraY;
  if (x < -220 || y < -220 || x > canvas.width + 220 || y > canvas.height + 220) return;

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

  // Dynamic Aura Glow
  const aura = ctx.createRadialGradient(0, 0, 15, 0, 0, 130);
  aura.addColorStop(0, 'rgba(244, 63, 94, 0.6)');
  aura.addColorStop(1, 'rgba(239, 68, 68, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 130, 0, TAU);
  ctx.fill();

  // Majestic/Fierce Drake Body
  const bodyGrad = ctx.createRadialGradient(-12, -12, 6, 0, 0, BOSS_RADIUS);
  if (flash) {
    bodyGrad.addColorStop(0, '#ffffff');
    bodyGrad.addColorStop(1, '#fef3c7');
  } else {
    bodyGrad.addColorStop(0, '#f43f5e');
    bodyGrad.addColorStop(0.65, '#9f1239');
    bodyGrad.addColorStop(1, '#180308');
  }
  ctx.shadowColor = '#f43f5e';
  ctx.shadowBlur = 28;
  ctx.fillStyle = bodyGrad;
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(0, 0, BOSS_RADIUS, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Draconic Horns / Crest spikes
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.moveTo(-10, -BOSS_RADIUS - 4);
  ctx.lineTo(0, -BOSS_RADIUS - 16);
  ctx.lineTo(10, -BOSS_RADIUS - 4);
  ctx.fill();

  // Glowing Eyes
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.arc(24, -11, 5.5, 0, TAU);
  ctx.arc(24, 11, 5.5, 0, TAU);
  ctx.fill();

  ctx.restore();
}

function drawProjectiles(ctx, player) {
  for (const orb of boss.orbitOrbs) {
    const ox = boss.x + Math.cos(orb.angle) * orb.dist - player.cameraX;
    const oy = boss.y + Math.sin(orb.angle) * orb.dist - player.cameraY;
    ctx.save();
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#9f1239';
    ctx.strokeStyle = '#fef3c7';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ox, oy, orb.radius, 0, TAU);
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
  ctx.fillStyle = 'rgba(25, 5, 8, 0.92)';
  ctx.fillRect(barX - 10, barY - 8, barWidth + 20, 44);
  ctx.fillStyle = '#38040e';
  ctx.fillRect(barX, barY + 12, barWidth, 14);
  ctx.fillStyle = boss.enraged ? '#f43f5e' : '#9f1239';
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