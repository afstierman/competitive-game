import { CONFIG } from '../../config.js';
import { checkCollision } from '../world.js';
import { getTileEnvironment } from '../generation.js';
import { isInsideShopSector } from '../shop.js';
import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const VIRUS_CONFIG = ENEMIES_CONFIG.computerVirus;
const SPAWN = VIRUS_CONFIG.spawnRate;
const TELEPORT = VIRUS_CONFIG.teleport;
const PURPLE_SECTION_INNER_RADIUS = CONFIG.biomes[1].maxDistance;
const PURPLE_SECTION_OUTER_RADIUS = CONFIG.biomes[2].maxDistance;
const HIT_RADIUS = 16;
const FX_TIME = 0.55;

const viruses = new Map();
let effects = [];
let nextId = 0;
let spawnTimer = SPAWN.initialDelay;

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function inPurpleSection(x, y) {
  const distance = Math.hypot(x, y);
  return distance > PURPLE_SECTION_INNER_RADIUS && distance < PURPLE_SECTION_OUTER_RADIUS;
}

function trySpawnNearPlayer(player) {
  const searchRadius = 650;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = player.x + (Math.random() * 2 - 1) * searchRadius;
    const y = player.y + (Math.random() * 2 - 1) * searchRadius;
    const distance = Math.hypot(x, y);
    if (distance <= PURPLE_SECTION_INNER_RADIUS + 20 || distance >= PURPLE_SECTION_OUTER_RADIUS - 20) continue;
    if (Math.hypot(x - player.x, y - player.y) < 260) continue;

    const tileX = Math.floor(x / CONFIG.tileSize);
    const tileY = Math.floor(y / CONFIG.tileSize);
    const inHub = Math.abs(tileX) < CONFIG.world.hubSafeZoneTiles && Math.abs(tileY) < CONFIG.world.hubSafeZoneTiles;
    const environment = getTileEnvironment(tileX, tileY);
    if (inHub || isInsideShopSector(x, y) || environment?.type.startsWith('rock')) continue;
    if (checkCollision(x, y, 9)) continue;

    const id = `computer-virus-${nextId++}`;
    viruses.set(id, {
      id,
      kind: 'computerVirus',
      x,
      y,
      hp: VIRUS_CONFIG.health,
      maxHp: VIRUS_CONFIG.health,
      state: 'chase',            // chase | vanish | appear
      stateTimer: 0,
      landing: null,
      teleportCooldown: randomBetween(0.8, 1.6),
      contactCooldown: 0,
      hitFlash: 0,
      walkTimer: Math.random() * Math.PI * 2,
      alive: true
    });
    return true;
  }
  return false;
}

// Finds a free spot on the opposite side of the player from the virus
function findLandingSpot(virus, player) {
  const awayAngle = Math.atan2(virus.y - player.y, virus.x - player.x) + Math.PI;
  const distances = [TELEPORT.landingDistance, TELEPORT.landingDistance * 1.35, TELEPORT.landingDistance * 0.75];
  const offsets = [0, 0.5, -0.5, 1, -1];
  for (const d of distances) {
    for (const offset of offsets) {
      const angle = awayAngle + offset;
      const x = player.x + Math.cos(angle) * d;
      const y = player.y + Math.sin(angle) * d;
      if (!inPurpleSection(x, y)) continue;
      if (isInsideShopSector(x, y)) continue;
      if (checkCollision(x, y, 9)) continue;
      return { x, y };
    }
  }
  return null;
}

function moveVirus(virus, angle, speed, dt) {
  const nextX = virus.x + Math.cos(angle) * speed * dt;
  const nextY = virus.y + Math.sin(angle) * speed * dt;
  if (!checkCollision(nextX, virus.y, 9)) virus.x = nextX;
  if (!checkCollision(virus.x, nextY, 9)) virus.y = nextY;
}

function applySlash(player, swingAngle) {
  if (swingAngle === null) return;
  for (const virus of viruses.values()) {
    // Can't be hit while dematerialized
    if (!virus.alive || virus.state !== 'chase' || player.attackHitEnemies.has(virus.id)) continue;
    const dx = virus.x - player.x;
    const dy = virus.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 80 + HIT_RADIUS) continue;

    if (distance > HIT_RADIUS) {
      const angle = Math.atan2(dy, dx);
      const slack = Math.asin(HIT_RADIUS / distance);
      if (Math.abs(angleDifference(angle, swingAngle)) >= 0.34 + slack) continue;
    }

    virus.hp -= player.swordDamage;
    virus.hitFlash = 0.12;
    player.attackHitEnemies.add(virus.id);
    if (virus.hp <= 0) {
      virus.alive = false;
      player.cycles += 4;
    }
  }
}

export function resetComputerViruses() {
  viruses.clear();
  effects = [];
  nextId = 0;
  spawnTimer = SPAWN.initialDelay;
}

export function damageComputerViruses(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateComputerViruses(player, dt, onDeath) {
  if (inPurpleSection(player.x, player.y)) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const virus of viruses.values()) {
        if (virus.alive) livingCount++;
      }
      if (livingCount < SPAWN.maxAlive) trySpawnNearPlayer(player);
      spawnTimer = randomBetween(SPAWN.minInterval, SPAWN.maxInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, SPAWN.initialDelay);
  }

  for (const effect of effects) effect.timer -= dt;
  effects = effects.filter(effect => effect.timer > 0);

  for (const [id, virus] of viruses) {
    if (!virus.alive) {
      viruses.delete(id);
      continue;
    }

    virus.teleportCooldown = Math.max(0, virus.teleportCooldown - dt);
    virus.contactCooldown = Math.max(0, virus.contactCooldown - dt);
    virus.hitFlash = Math.max(0, virus.hitFlash - dt);

    const dx = player.x - virus.x;
    const dy = player.y - virus.y;
    const distance = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);

    if (virus.state === 'chase') {
      if (distance < 360 && distance > 20) {
        virus.walkTimer += dt * 16;
        // Slight zigzag so the approach is harder to line up
        const heading = distance > 90
          ? toPlayer + Math.sin(virus.walkTimer * 0.35) * 0.35
          : toPlayer;
        moveVirus(virus, heading, VIRUS_CONFIG.movementSpeed, dt);
      }

      if (distance < TELEPORT.triggerRange && virus.teleportCooldown === 0) {
        const landing = findLandingSpot(virus, player);
        if (landing) {
          virus.state = 'vanish';
          virus.stateTimer = TELEPORT.vanishTime;
          virus.landing = landing;
        } else {
          virus.teleportCooldown = 0.8;
        }
      }
    } else if (virus.state === 'vanish') {
      virus.stateTimer -= dt;
      // Keep the landing spot locked to the player's current position
      const landing = findLandingSpot(virus, player);
      if (landing) virus.landing = landing;

      if (virus.stateTimer <= 0) {
        effects.push({ fromX: virus.x, fromY: virus.y, toX: virus.landing.x, toY: virus.landing.y, timer: FX_TIME });
        virus.x = virus.landing.x;
        virus.y = virus.landing.y;
        virus.landing = null;
        virus.state = 'appear';
        virus.stateTimer = TELEPORT.appearTime;
      }
    } else if (virus.state === 'appear') {
      virus.stateTimer -= dt;
      if (virus.stateTimer <= 0) {
        virus.state = 'chase';
        virus.teleportCooldown = randomBetween(TELEPORT.minCooldown, TELEPORT.maxCooldown);
      }
    }

    if (virus.state === 'chase' && distance < 26 && virus.contactCooldown === 0 && player.enemyDamageCooldown === 0) {
      player.hp -= damageAfterArmor(player, VIRUS_CONFIG.damage);
      player.enemyDamageCooldown = 0.9;
      virus.contactCooldown = 1.0;
      // Hit and run: teleport away shortly after biting
      virus.teleportCooldown = Math.min(virus.teleportCooldown, 0.5);
      if (player.hp <= 0 && typeof onDeath === 'function') {
        onDeath('Infected by a computer virus!');
        return false;
      }
    }
  }
  return true;
}

function flatPalette(color) {
  return { head: color, headDark: color, tail: color, tailLine: color, leg: color, core: color, outline: color };
}

const PALETTE = {
  head: '#22d3ee',
  headDark: '#0e7490',
  tail: '#a5f3fc',
  tailLine: '#0e7490',
  leg: '#0891b2',
  core: '#f0abfc',
  outline: '#164e63'
};
const FLASH_PALETTE = { ...PALETTE, head: '#ecfeff', tail: '#ffffff', leg: '#a5f3fc' };
const CYAN_GHOST = flatPalette('#22d3ee');
const MAGENTA_GHOST = flatPalette('#e879f9');

// Upright phage-shaped virus: icosahedral head, striped tail sheath, base plate, six legs
function drawBody(ctx, virus, palette, time) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.strokeStyle = palette.leg;
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? -1 : 1;
    const k = i % 3;
    const swing = Math.sin(virus.walkTimer + k * 2.1 + (side > 0 ? Math.PI : 0)) * 3;
    ctx.beginPath();
    ctx.moveTo(side * 3, 6);
    ctx.lineTo(side * (10 + k * 3), 5 + k * 2 - Math.abs(swing) * 0.5);
    ctx.lineTo(side * (14 + k * 3) + swing, 16);
    ctx.stroke();
  }

  ctx.fillStyle = palette.tail;
  ctx.fillRect(-3, -9, 6, 14);
  ctx.strokeStyle = palette.tailLine;
  ctx.lineWidth = 1;
  for (let s = 0; s < 4; s++) {
    ctx.beginPath();
    ctx.moveTo(-3, -7 + s * 3.5);
    ctx.lineTo(3, -7 + s * 3.5);
    ctx.stroke();
  }

  ctx.fillStyle = palette.leg;
  ctx.fillRect(-6, 4, 12, 3);
  ctx.fillRect(-5, -11, 10, 3);

  const cy = -23;
  const hex = [[0, -12], [10, -6], [10, 6], [0, 12], [-10, 6], [-10, -6]];
  ctx.fillStyle = palette.head;
  ctx.strokeStyle = palette.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  hex.forEach(([hx, hy], i) => (i === 0 ? ctx.moveTo(hx, cy + hy) : ctx.lineTo(hx, cy + hy)));
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = palette.headDark;
  ctx.lineWidth = 1;
  ctx.beginPath();
  hex.forEach(([hx, hy]) => {
    ctx.moveTo(0, cy);
    ctx.lineTo(hx, cy + hy);
  });
  ctx.stroke();

  ctx.fillStyle = palette.core;
  ctx.beginPath();
  ctx.arc(0, cy, 3 + Math.sin(time / 120) * 0.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawEffect(ctx, effect, player) {
  const t = 1 - effect.timer / FX_TIME;
  const fade = 1 - t;
  const fx = effect.fromX - player.cameraX;
  const fy = effect.fromY - player.cameraY;
  const tx = effect.toX - player.cameraX;
  const ty = effect.toY - player.cameraY;

  ctx.save();
  ctx.lineCap = 'round';

  // Energy beam between the two points
  const gradient = ctx.createLinearGradient(fx, fy, tx, ty);
  gradient.addColorStop(0, `rgba(34, 211, 238, ${fade * 0.8})`);
  gradient.addColorStop(1, `rgba(232, 121, 249, ${fade * 0.8})`);
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 3 * fade + 0.5;
  ctx.setLineDash([6, 8]);
  ctx.lineDashOffset = -t * 60;
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
  ctx.setLineDash([]);

  // Origin: collapsing ring and rising data bits
  ctx.strokeStyle = `rgba(34, 211, 238, ${fade})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(fx, fy, 8 + t * 26, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = `rgba(165, 243, 252, ${fade})`;
  for (let i = 0; i < 6; i++) {
    const bitX = fx + (i - 2.5) * 5;
    const bitY = fy - 6 - t * (30 + i * 6);
    ctx.fillRect(bitX, bitY, 2, 2);
  }

  // Destination: shockwave ring and radial sparks
  ctx.strokeStyle = `rgba(232, 121, 249, ${fade})`;
  ctx.beginPath();
  ctx.arc(tx, ty, 6 + t * 38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4 + 0.2;
    const inner = 10 + t * 20;
    const outer = inner + 8 * fade;
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(angle) * inner, ty + Math.sin(angle) * inner);
    ctx.lineTo(tx + Math.cos(angle) * outer, ty + Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawComputerViruses(ctx, player, canvas, time) {
  for (const effect of effects) drawEffect(ctx, effect, player);

  for (const virus of viruses.values()) {
    if (!virus.alive) continue;
    const bob = virus.state === 'chase' ? Math.sin(time / 90 + virus.walkTimer) * 1 : 0;
    const x = virus.x - player.cameraX;
    const y = virus.y - player.cameraY + bob;

    // Landing reticle (telegraphs where it will reappear)
    if (virus.state === 'vanish' && virus.landing) {
      const p = 1 - virus.stateTimer / TELEPORT.vanishTime;
      const lx = virus.landing.x - player.cameraX;
      const ly = virus.landing.y - player.cameraY;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(time / 150);
      ctx.strokeStyle = `rgba(232, 121, 249, ${0.25 + p * 0.6})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 22 - p * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(6, 0);
      ctx.moveTo(0, -6);
      ctx.lineTo(0, 6);
      ctx.stroke();
      ctx.restore();
    }

    if (x < -60 || y < -80 || x > canvas.width + 60 || y > canvas.height + 60) continue;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 17, 15, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const palette = virus.hitFlash > 0 ? FLASH_PALETTE : PALETTE;

    if (virus.state === 'vanish') {
      // Squeeze into a thin vertical beam with RGB-split glitching
      const p = 1 - virus.stateTimer / TELEPORT.vanishTime;
      const jitter = Math.sin(p * 50) * 5 * p;
      ctx.scale(1 - p * 0.85, 1 + p * 0.8);
      ctx.globalAlpha = (1 - p) * 0.6;
      ctx.save();
      ctx.translate(-jitter, 0);
      drawBody(ctx, virus, MAGENTA_GHOST, time);
      ctx.restore();
      ctx.save();
      ctx.translate(jitter, 0);
      drawBody(ctx, virus, CYAN_GHOST, time);
      ctx.restore();
      ctx.globalAlpha = 1 - p * 0.7;
      drawBody(ctx, virus, palette, time);
    } else if (virus.state === 'appear') {
      // Scan-line reveal from the top down with a small glitch offset
      const p = 1 - virus.stateTimer / TELEPORT.appearTime;
      const top = -38;
      const clipHeight = 58 * p;
      const jitter = Math.sin(p * 40) * 4 * (1 - p);
      ctx.save();
      ctx.beginPath();
      ctx.rect(-30, top, 60, clipHeight);
      ctx.clip();
      ctx.globalAlpha = 0.5;
      ctx.save();
      ctx.translate(jitter, 0);
      drawBody(ctx, virus, MAGENTA_GHOST, time);
      ctx.restore();
      ctx.globalAlpha = 1;
      drawBody(ctx, virus, palette, time);
      ctx.restore();

      ctx.fillStyle = '#a5f3fc';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 10;
      ctx.fillRect(-16, top + clipHeight - 1, 32, 2);
      ctx.shadowBlur = 0;
    } else {
      drawBody(ctx, virus, palette, time);
    }
    ctx.restore();

    if (virus.hp < virus.maxHp) {
      ctx.fillStyle = '#083344';
      ctx.fillRect(x - 13, y - 44, 26, 3);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(x - 13, y - 44, 26 * virus.hp / virus.maxHp, 3);
    }
  }
}
