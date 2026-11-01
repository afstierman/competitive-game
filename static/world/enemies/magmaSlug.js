import { CONFIG } from '../../config.js';
import { checkCollision, getObstacleAvoidanceAngle } from '../world.js';
import { getTileEnvironment } from '../generation.js';
import { isInsideShopSector } from '../shop.js';
import { ENEMIES_CONFIG, damageAfterArmor, despawnDistantEnemies, isSlingshotHit } from './enemiesConfig.js';

const SLUG_CONFIG = ENEMIES_CONFIG.magmaSlug;
const SPAWN = SLUG_CONFIG.spawnRate;
const SPEED = SLUG_CONFIG.movementSpeed;
const SPIT = SLUG_CONFIG.spit;
const FAR_SECTION_INNER_RADIUS = CONFIG.biomes[2].maxDistance;
const FAR_SECTION_OUTER_RADIUS = CONFIG.biomes[3]?.maxDistance ?? Infinity;
const HIT_RADIUS = 16;
const ARC_HEIGHT = 70;

const slugs = new Map();
let globs = [];
let puddles = [];
let nextId = 0;
let spawnTimer = SPAWN.initialDelay;
let totalKills = 0;

export function getMagmaSlugKills() { return totalKills; }

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function inFarSection(x, y) {
  const distance = Math.hypot(x, y);
  return distance > FAR_SECTION_INNER_RADIUS && distance < FAR_SECTION_OUTER_RADIUS;
}

function isLavaAt(x, y) {
  return getTileEnvironment(Math.floor(x / CONFIG.tileSize), Math.floor(y / CONFIG.tileSize))?.type === 'lava_pool';
}

// Returns false if the player died
function hurtPlayer(player, amount, message, onDeath) {
  player.hp -= damageAfterArmor(player, amount);
  player.enemyDamageCooldown = 0.9;
  if (player.hp <= 0 && typeof onDeath === 'function') {
    onDeath(message);
    return false;
  }
  return true;
}

function trySpawnNearPlayer(player) {
  const searchRadius = 650;
  for (let attempt = 0; attempt < 40; attempt++) {
    const x = player.x + (Math.random() * 2 - 1) * searchRadius;
    const y = player.y + (Math.random() * 2 - 1) * searchRadius;
    const distance = Math.hypot(x, y);
    if (distance <= FAR_SECTION_INNER_RADIUS + 20 || distance >= FAR_SECTION_OUTER_RADIUS - 20) continue;
    if (Math.hypot(x - player.x, y - player.y) < 240) continue;
    if (!isLavaAt(x, y)) continue;

    const tileX = Math.floor(x / CONFIG.tileSize);
    const tileY = Math.floor(y / CONFIG.tileSize);
    const inHub = Math.abs(tileX) < CONFIG.world.hubSafeZoneTiles && Math.abs(tileY) < CONFIG.world.hubSafeZoneTiles;
    if (inHub || isInsideShopSector(x, y)) continue;
    if (checkCollision(x, y, 9)) continue;

    const id = `magma-slug-${nextId++}`;
    slugs.set(id, {
      id,
      kind: 'magmaSlug',
      x,
      y,
      hp: SLUG_CONFIG.health,
      maxHp: SLUG_CONFIG.health,
      state: 'roam',            // roam | charge | recover
      stateTimer: 0,
      spitCooldown: randomBetween(1, 2),
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: randomBetween(1, 2.2),
      contactCooldown: 0,
      facing: 1,
      onLava: true,
      hitFlash: 0,
      walkTimer: Math.random() * Math.PI * 2,
      alive: true
    });
    return true;
  }
  return false;
}

function moveSlug(slug, angle, speed, dt) {
  angle = getObstacleAvoidanceAngle(slug.x, slug.y, angle, speed * dt, 9, undefined, slug);
  const nextX = slug.x + Math.cos(angle) * speed * dt;
  const nextY = slug.y + Math.sin(angle) * speed * dt;
  if (!checkCollision(nextX, slug.y, 9)) slug.x = nextX;
  if (!checkCollision(slug.x, nextY, 9)) slug.y = nextY;
}

function fireGlobs(slug, player, toPlayer) {
  const perpendicular = toPlayer + Math.PI / 2;
  for (let i = 0; i < SPIT.globs; i++) {
    const offset = (i - (SPIT.globs - 1) / 2) * SPIT.spreadDistance;
    const duration = SPIT.flightTime + i * SPIT.globStagger;
    globs.push({
      startX: slug.x + Math.cos(toPlayer) * 14,
      startY: slug.y + Math.sin(toPlayer) * 14 - 6,
      targetX: player.x + Math.cos(perpendicular) * offset,
      targetY: player.y + Math.sin(perpendicular) * offset,
      timer: duration,
      duration
    });
  }
}

function addPuddle(x, y, radius, duration) {
  puddles.push({ x, y, radius, timer: duration, max: duration });
}

function applySlash(player, swingAngle) {
  if (player.activeWeapon === 'slingshot') {
    if (!player.slingshotShotActive) return;
    for (const slug of slugs.values()) {
      if (!slug.alive || player.attackHitEnemies.has(slug.id) || !isSlingshotHit(player, slug.x, slug.y, slug.isChasing, CONFIG.enemyChaseRange)) continue;
      slug.hp -= player.slingshotDamage;
      slug.hitFlash = 0.12;
      player.attackHitEnemies.add(slug.id);
      if (slug.hp <= 0) {
        slug.alive = false;
        player.cycles += 6;
        totalKills++;
        for (let i = 0; i < 4; i++) {
          const angle = i * Math.PI / 2 + Math.PI / 4;
          addPuddle(slug.x + Math.cos(angle) * 34, slug.y + Math.sin(angle) * 34, SPIT.puddleRadius * 0.8, SPIT.puddleDuration * 0.75);
        }
      }
      return;
    }
    return;
  }
  if (swingAngle === null) return;
  for (const slug of slugs.values()) {
    if (!slug.alive || player.attackHitEnemies.has(slug.id)) continue;
    const dx = slug.x - player.x;
    const dy = slug.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 80 + HIT_RADIUS) continue;

    if (distance > HIT_RADIUS) {
      const angle = Math.atan2(dy, dx);
      const slack = Math.asin(HIT_RADIUS / distance);
      if (Math.abs(angleDifference(angle, swingAngle)) >= 0.34 + slack) continue;
    }

    slug.hp -= player.swordDamage;
    slug.hitFlash = 0.12;
    player.attackHitEnemies.add(slug.id);
    if (slug.hp <= 0) {
      slug.alive = false;
      player.cycles += 6;
      totalKills++;
      // Death eruption: leaves a ring of lava puddles
      for (let i = 0; i < 4; i++) {
        const angle = i * Math.PI / 2 + Math.PI / 4;
        addPuddle(slug.x + Math.cos(angle) * 34, slug.y + Math.sin(angle) * 34, SPIT.puddleRadius * 0.8, SPIT.puddleDuration * 0.75);
      }
    }
  }
}

export function resetMagmaSlugs(preserveProgress = false) {
  slugs.clear();
  globs = [];
  puddles = [];
  nextId = 0;
  spawnTimer = SPAWN.initialDelay;
  if (!preserveProgress) totalKills = 0;
}

export function damageMagmaSlugs(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateMagmaSlugs(player, dt, onDeath) {
  despawnDistantEnemies(slugs, player);
  if (inFarSection(player.x, player.y)) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const slug of slugs.values()) {
        if (slug.alive) livingCount++;
      }
      if (livingCount < SPAWN.maxAlive) trySpawnNearPlayer(player);
      spawnTimer = randomBetween(SPAWN.minInterval, SPAWN.maxInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, SPAWN.initialDelay);
  }

  // Globs in flight
  for (const glob of globs) {
    glob.timer -= dt;
    if (glob.timer <= 0) {
      addPuddle(glob.targetX, glob.targetY, SPIT.puddleRadius, SPIT.puddleDuration);
      const hitDistance = Math.hypot(player.x - glob.targetX, player.y - glob.targetY);
      if (hitDistance < SPIT.impactRadius + CONFIG.playerRadius && player.enemyDamageCooldown === 0) {
        if (!hurtPlayer(player, SLUG_CONFIG.damage, 'Burned by a magma slug!', onDeath)) return false;
      }
    }
  }
  globs = globs.filter(glob => glob.timer > 0);

  // Lingering puddles
  for (const puddle of puddles) {
    puddle.timer -= dt;
    if (puddle.timer > 0
      && player.enemyDamageCooldown === 0
      && Math.hypot(player.x - puddle.x, player.y - puddle.y) < puddle.radius) {
      if (!hurtPlayer(player, SPIT.puddleDamage, 'Burned by lava!', onDeath)) return false;
    }
  }
  puddles = puddles.filter(puddle => puddle.timer > 0);

  for (const [id, slug] of slugs) {
    if (!slug.alive) {
      slugs.delete(id);
      continue;
    }

    slug.spitCooldown = Math.max(0, slug.spitCooldown - dt);
    slug.contactCooldown = Math.max(0, slug.contactCooldown - dt);
    slug.hitFlash = Math.max(0, slug.hitFlash - dt);
    slug.onLava = isLavaAt(slug.x, slug.y);

    const dx = player.x - slug.x;
    const dy = player.y - slug.y;
    const distance = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    slug.isChasing = (slug.state === 'roam' && distance < CONFIG.enemyChaseRange) || slug.state === 'charge';

    if (slug.state === 'roam') {
      slug.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;
      if (distance < CONFIG.enemyChaseRange && distance > 1) {
        const speed = slug.onLava ? SPEED.lava : SPEED.land;
        slug.strafeTimer -= dt;
        if (slug.strafeTimer <= 0) {
          slug.strafeDir *= -1;
          slug.strafeTimer = randomBetween(1, 2.2);
        }

        let heading;
        if (distance > SPIT.range - 40) heading = toPlayer;                     // close in
        else if (distance < SPIT.minRange) heading = toPlayer + Math.PI;        // back off
        else heading = toPlayer + slug.strafeDir * Math.PI / 2;                 // circle

        slug.walkTimer += dt * (slug.onLava ? 8 : 5);
        moveSlug(slug, heading, speed, dt);
      }

      if (distance < SPIT.range && slug.spitCooldown === 0) {
        slug.state = 'charge';
        slug.stateTimer = SPIT.windupTime;
      }

      if (distance < 26 && slug.contactCooldown === 0 && player.enemyDamageCooldown === 0) {
        slug.contactCooldown = 1.1;
        if (!hurtPlayer(player, SLUG_CONFIG.damage, 'Burned by a magma slug!', onDeath)) return false;
      }
    } else if (slug.state === 'charge') {
      slug.stateTimer -= dt;
      slug.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;
      if (slug.stateTimer <= 0) {
        fireGlobs(slug, player, toPlayer);
        slug.state = 'recover';
        slug.stateTimer = SPIT.recoverTime;
      }
    } else if (slug.state === 'recover') {
      slug.stateTimer -= dt;
      if (slug.stateTimer <= 0) {
        slug.state = 'roam';
        slug.spitCooldown = randomBetween(SPIT.minCooldown, SPIT.maxCooldown);
      }
    }
  }
  return true;
}

function drawPuddle(ctx, puddle, player, time) {
  const x = puddle.x - player.cameraX;
  const y = puddle.y - player.cameraY;
  const fade = Math.min(1, puddle.timer / 1);
  const r = puddle.radius * (1 + Math.sin(time / 120 + puddle.x) * 0.05);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.78);
  ctx.globalAlpha = fade;
  const gradient = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
  gradient.addColorStop(0, '#fde047');
  gradient.addColorStop(0.45, '#f97316');
  gradient.addColorStop(1, 'rgba(127, 29, 29, 0.6)');
  ctx.fillStyle = gradient;
  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // Bubbles
  ctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
  for (let i = 0; i < 3; i++) {
    const phase = (time / 500 + i * 0.37 + puddle.x * 0.01) % 1;
    ctx.globalAlpha = fade * (1 - phase);
    ctx.beginPath();
    ctx.arc(Math.cos(i * 2.4) * r * 0.5, Math.sin(i * 2.4) * r * 0.4, 1.5 + phase * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawGlob(ctx, glob, player, time) {
  const p = 1 - glob.timer / glob.duration;
  const tx = glob.targetX - player.cameraX;
  const ty = glob.targetY - player.cameraY;
  const sx = glob.startX - player.cameraX;
  const sy = glob.startY - player.cameraY;

  // Landing telegraph
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(1, 0.78);
  ctx.fillStyle = `rgba(249, 115, 22, ${0.08 + p * 0.25})`;
  ctx.strokeStyle = `rgba(253, 186, 116, ${0.35 + p * 0.5})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.lineDashOffset = -time / 40;
  ctx.beginPath();
  ctx.arc(0, 0, SPIT.impactRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = `rgba(253, 224, 71, ${0.2 + p * 0.4})`;
  ctx.beginPath();
  ctx.arc(0, 0, SPIT.impactRadius * p, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Glob itself, arcing through the air
  const gx = sx + (tx - sx) * p;
  const gy = sy + (ty - sy) * p;
  const height = Math.sin(p * Math.PI) * ARC_HEIGHT;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(gx, gy + 4, 6, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowColor = '#f97316';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(gx, gy - height, 6.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(gx - 1, gy - height - 1, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSlug(ctx, slug, player, canvas, time) {
  const x = slug.x - player.cameraX;
  const y = slug.y - player.cameraY;
  if (x < -70 || y < -70 || x > canvas.width + 70 || y > canvas.height + 70) return;

  const charging = slug.state === 'charge';
  const chargeP = charging ? 1 - slug.stateTimer / SPIT.windupTime : 0;
  const flash = slug.hitFlash > 0;
  const swell = 1 + chargeP * 0.25 + Math.sin(time / 200 + slug.walkTimer) * 0.04;
  const crust = flash ? '#fed7aa' : '#7c2d12';
  const crustDark = flash ? '#fdba74' : '#431407';
  const glow = charging ? '#fde047' : '#fb923c';

  ctx.save();
  ctx.translate(x, y);

  if (slug.onLava) {
    ctx.fillStyle = 'rgba(249, 115, 22, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 9, 24 + Math.sin(time / 170) * 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 9, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Glowing slime trail on land
    ctx.fillStyle = 'rgba(249, 115, 22, 0.25)';
    ctx.beginPath();
    ctx.ellipse(-slug.facing * 16, 9, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.scale(slug.facing, 1);
  ctx.translate(0, -2);
  ctx.scale(swell, swell);
  ctx.lineCap = 'round';

  // Body segments, rear to head, rippling as it crawls
  const ripple = Math.sin(slug.walkTimer) * 1.5;
  ctx.fillStyle = crustDark;
  ctx.beginPath();
  ctx.ellipse(-15, 5 + ripple * 0.5, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = crust;
  ctx.beginPath();
  ctx.ellipse(-5, 3 - ripple * 0.5, 12, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, 1 + ripple * 0.4, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Glowing cracks
  ctx.strokeStyle = glow;
  ctx.shadowColor = glow;
  ctx.shadowBlur = charging ? 14 : 7;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-12, -3);
  ctx.lineTo(-7, 2);
  ctx.lineTo(-9, 7);
  ctx.moveTo(-2, -4);
  ctx.lineTo(2, 1);
  ctx.lineTo(0, 6);
  ctx.moveTo(6, -5);
  ctx.lineTo(9, -1);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Eye stalks
  ctx.strokeStyle = crust;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10, -5);
  ctx.lineTo(12, -13);
  ctx.moveTo(5, -6);
  ctx.lineTo(5, -14);
  ctx.stroke();
  ctx.fillStyle = '#fef9c3';
  ctx.beginPath();
  ctx.arc(12, -14, 2.4, 0, Math.PI * 2);
  ctx.arc(5, -15, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = charging ? '#dc2626' : '#111827';
  ctx.beginPath();
  ctx.arc(12.8, -14, 1.1, 0, Math.PI * 2);
  ctx.arc(5.8, -15, 1.1, 0, Math.PI * 2);
  ctx.fill();

  // Mouth: opens and glows white-hot while charging a spit
  const mouth = 1.5 + chargeP * 4.5;
  ctx.fillStyle = charging ? '#fef08a' : '#1c0a05';
  ctx.shadowColor = '#fde047';
  ctx.shadowBlur = charging ? 16 : 0;
  ctx.beginPath();
  ctx.ellipse(16, 2, 2.5 + chargeP * 2, mouth, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // Steam while charging
  if (charging) {
    ctx.fillStyle = `rgba(254, 215, 170, ${0.5 - chargeP * 0.25})`;
    for (let i = 0; i < 3; i++) {
      const phase = (time / 300 + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(-4 + i * 6, -10 - phase * 16, 2 + phase * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  if (slug.hp < slug.maxHp) {
    ctx.fillStyle = '#431407';
    ctx.fillRect(x - 14, y - 32, 28, 3);
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(x - 14, y - 32, 28 * slug.hp / slug.maxHp, 3);
  }
}

export function drawMagmaSlugs(ctx, player, canvas, time) {
  for (const puddle of puddles) drawPuddle(ctx, puddle, player, time);
  for (const slug of slugs.values()) {
    if (slug.alive) drawSlug(ctx, slug, player, canvas, time);
  }
  for (const glob of globs) drawGlob(ctx, glob, player, time);
}
