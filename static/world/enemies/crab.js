import { CONFIG } from '../../config.js';
import { checkCollision, getObstacleAvoidanceAngle } from '../world.js';
import { getTileEnvironment } from '../generation.js';
import { isInsideShopSector } from '../shop.js';
import { ENEMIES_CONFIG, damageAfterArmor, despawnDistantEnemies, isSlingshotHit } from './enemiesConfig.js';

const CRAB_CONFIG = ENEMIES_CONFIG.crab;
const BLUE_SECTION_INNER_RADIUS = CONFIG.biomes[0].maxDistance;
const BLUE_SECTION_OUTER_RADIUS = CONFIG.biomes[1].maxDistance;

const WATER_SPEED = CRAB_CONFIG.movementSpeed.water;
const LAND_SPEED = CRAB_CONFIG.movementSpeed.land;
const LUNGE_SPEED = CRAB_CONFIG.movementSpeed.lunge;
const TURN_RATE = CRAB_CONFIG.movementSpeed.turnRate; // radians per second, slow enough to flank
const ARMOR_ARC = 0.95;      // front arc (each side of facing) that blocks hits
const WINDUP_TIME = 0.45;
const LUNGE_TIME = 0.22;
const crabs = new Map();
let nextId = 0;
let spawnTimer = CRAB_CONFIG.spawnRate.initialDelay;
let totalKills = 0;

export function getCrabKills() { return totalKills; }

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function isWaterAt(x, y) {
  const type = getTileEnvironment(Math.floor(x / CONFIG.tileSize), Math.floor(y / CONFIG.tileSize))?.type;
  return type === 'water_puddle';
}

function trySpawnNearPlayer(player) {
  const searchRadius = 650;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = player.x + (Math.random() * 2 - 1) * searchRadius;
    const y = player.y + (Math.random() * 2 - 1) * searchRadius;
    const distance = Math.hypot(x, y);
    if (distance <= BLUE_SECTION_INNER_RADIUS + 20 || distance >= BLUE_SECTION_OUTER_RADIUS - 20) continue;
    if (Math.hypot(x - player.x, y - player.y) < 240) continue;

    const tileX = Math.floor(x / CONFIG.tileSize);
    const tileY = Math.floor(y / CONFIG.tileSize);
    const inHub = Math.abs(tileX) < CONFIG.world.hubSafeZoneTiles && Math.abs(tileY) < CONFIG.world.hubSafeZoneTiles;
    const environment = getTileEnvironment(tileX, tileY);
    if (inHub || isInsideShopSector(x, y) || environment?.type.startsWith('rock')) continue;
    if (checkCollision(x, y, 9)) continue;

    const id = `crab-${nextId++}`;
    crabs.set(id, {
      id,
      kind: 'crab',
      x,
      y,
      hp: CRAB_CONFIG.health,
      maxHp: CRAB_CONFIG.health,
      facing: Math.random() * Math.PI * 2,
      state: 'move',            // move | windup | lunge
      stateTimer: 0,
      lungeAngle: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeTimer: 1.2 + Math.random() * 1.5,
      attackCooldown: 1.2,
      contactCooldown: 0,
      pinchTimer: 0,
      blockFlash: 0,
      walkTimer: Math.random() * Math.PI * 2,
      inWater: false,
      alive: true
    });
    return true;
  }
  return false;
}

function moveCrab(crab, angle, speed, dt) {
  angle = getObstacleAvoidanceAngle(crab.x, crab.y, angle, speed * dt, 9, undefined, crab);
  const nextX = crab.x + Math.cos(angle) * speed * dt;
  const nextY = crab.y + Math.sin(angle) * speed * dt;
  if (!checkCollision(nextX, crab.y, 9)) crab.x = nextX;
  if (!checkCollision(crab.x, nextY, 9)) crab.y = nextY;
}

function applySlash(player, swingAngle) {
  if (player.activeWeapon === 'slingshot') {
    if (!player.slingshotShotActive) return;
    for (const crab of crabs.values()) {
      if (!crab.alive || player.attackHitEnemies.has(crab.id) || !isSlingshotHit(player, crab.x, crab.y, crab.isChasing, CONFIG.enemyChaseRange)) continue;
      player.attackHitEnemies.add(crab.id);
      const hitFromAngle = Math.atan2(player.y - crab.y, player.x - crab.x);
      if (Math.abs(angleDifference(hitFromAngle, crab.facing)) < ARMOR_ARC) { crab.blockFlash = 0.18; return; }
      crab.hp -= player.slingshotDamage;
      if (crab.hp <= 0) { crab.alive = false; player.cycles += 3; totalKills++; }
      return;
    }
    return;
  }
  if (swingAngle === null) return;
  for (const crab of crabs.values()) {
    if (!crab.alive || player.attackHitEnemies.has(crab.id)) continue;
    const dx = crab.x - player.x;
    const dy = crab.y - player.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (distance > 80 || distance < 18 || Math.abs(angleDifference(angle, swingAngle)) >= 0.34) continue;

    player.attackHitEnemies.add(crab.id);

    // Direction from the crab toward the player. If that is inside the front arc, the shell blocks it.
    const hitFromAngle = Math.atan2(-dy, -dx);
    if (Math.abs(angleDifference(hitFromAngle, crab.facing)) < ARMOR_ARC) {
      crab.blockFlash = 0.18;
      continue;
    }

    crab.hp -= player.swordDamage;
    if (crab.hp <= 0) {
      crab.alive = false;
      player.cycles += 3;
      totalKills++;
    }
  }
}

export function resetCrabs(preserveProgress = false) {
  crabs.clear();
  nextId = 0;
  spawnTimer = CRAB_CONFIG.spawnRate.initialDelay;
  if (!preserveProgress) totalKills = 0;
}

export function damageCrabs(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateCrabs(player, dt, onDeath) {
  despawnDistantEnemies(crabs, player);
  const playerDistance = Math.hypot(player.x, player.y);
  const inBlueSection = playerDistance > BLUE_SECTION_INNER_RADIUS && playerDistance < BLUE_SECTION_OUTER_RADIUS;
  if (inBlueSection) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const crab of crabs.values()) {
        if (crab.alive) livingCount++;
      }
      if (livingCount < CRAB_CONFIG.spawnRate.maxAlive) trySpawnNearPlayer(player);
      spawnTimer = CRAB_CONFIG.spawnRate.minInterval
        + Math.random() * (CRAB_CONFIG.spawnRate.maxInterval - CRAB_CONFIG.spawnRate.minInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, CRAB_CONFIG.spawnRate.initialDelay);
  }

  for (const [id, crab] of crabs) {
    if (!crab.alive) {
      crabs.delete(id);
      continue;
    }

    crab.attackCooldown = Math.max(0, crab.attackCooldown - dt);
    crab.contactCooldown = Math.max(0, crab.contactCooldown - dt);
    crab.pinchTimer = Math.max(0, crab.pinchTimer - dt);
    crab.blockFlash = Math.max(0, crab.blockFlash - dt);
    crab.inWater = isWaterAt(crab.x, crab.y);

    const dx = player.x - crab.x;
    const dy = player.y - crab.y;
    const distance = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    const baseSpeed = crab.inWater ? WATER_SPEED : LAND_SPEED;
    crab.isChasing = distance < CONFIG.enemyChaseRange || crab.state === 'windup' || crab.state === 'lunge';

    if (crab.state === 'move') {
      // Slow turning is what lets the player get around to the unarmored sides.
      const turn = angleDifference(toPlayer, crab.facing);
      const maxTurn = TURN_RATE * dt;
      crab.facing += Math.max(-maxTurn, Math.min(maxTurn, turn));

      if (distance < CONFIG.enemyChaseRange && distance > 1) {
        crab.strafeTimer -= dt;
        if (crab.strafeTimer <= 0) {
          crab.strafeDir *= -1;
          crab.strafeTimer = 1.2 + Math.random() * 1.8;
        }

        crab.walkTimer += dt * 10;
        // Far away: close in at an angle. Close: scuttle sideways around the player.
        const heading = distance > 120
          ? toPlayer + crab.strafeDir * 0.5
          : toPlayer + crab.strafeDir * 1.3;
        moveCrab(crab, heading, baseSpeed, dt);
      }

      if (distance < 130 && crab.attackCooldown === 0) {
        crab.state = 'windup';
        crab.stateTimer = WINDUP_TIME;
        crab.lungeAngle = toPlayer;
        crab.facing = toPlayer;
      }
    } else if (crab.state === 'windup') {
      crab.stateTimer -= dt;
      if (crab.stateTimer <= 0) {
        crab.state = 'lunge';
        crab.stateTimer = LUNGE_TIME;
      }
    } else if (crab.state === 'lunge') {
      crab.stateTimer -= dt;
      crab.walkTimer += dt * 18;
      moveCrab(crab, crab.lungeAngle, LUNGE_SPEED, dt);
      if (crab.stateTimer <= 0) {
        crab.state = 'move';
        crab.attackCooldown = 1.6 + Math.random() * 0.8;
      }
    }

    if (distance < 28 && crab.contactCooldown === 0 && player.enemyDamageCooldown === 0) {
      player.hp -= damageAfterArmor(player, CRAB_CONFIG.damage);
      player.enemyDamageCooldown = 0.9;
      crab.contactCooldown = 1.0;
      crab.pinchTimer = 0.25;
      if (player.hp <= 0 && typeof onDeath === 'function') {
        onDeath('Pinched by a crab!');
        return false;
      }
    }
  }
  return true;
}

export function drawCrabs(ctx, player, canvas, time) {
  for (const crab of crabs.values()) {
    if (!crab.alive) continue;
    const x = crab.x - player.cameraX;
    const y = crab.y - player.cameraY + Math.sin(time / 200 + crab.walkTimer) * 1.2;
    if (x < -50 || y < -50 || x > canvas.width + 50 || y > canvas.height + 50) continue;

    const winding = crab.state === 'windup';
    const lunging = crab.state === 'lunge';

    ctx.save();
    ctx.translate(x, y);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 16, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    if (crab.inWater) {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 10, 20 + Math.sin(time / 160) * 2, 7, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.save();
    ctx.rotate(crab.facing);

    // Legs: four per side, scuttling
    ctx.strokeStyle = '#9a3412';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    for (let side = -1; side <= 1; side += 2) {
      for (let leg = 0; leg < 4; leg++) {
        const baseX = -7 + leg * 4.5;
        const swing = Math.sin(crab.walkTimer + leg * 1.4 + (side > 0 ? Math.PI : 0)) * 2.5;
        ctx.beginPath();
        ctx.moveTo(baseX, side * 8);
        ctx.lineTo(baseX + swing, side * 15);
        ctx.lineTo(baseX + swing * 0.6 - 2, side * 19);
        ctx.stroke();
      }
    }

    // Claws
    const clawOpen = winding ? 0.9 : lunging ? 0.1 : 0.35 + (crab.pinchTimer > 0 ? -0.3 : 0);
    const reachOut = winding ? 4 : lunging ? 9 : 0;
    for (let side = -1; side <= 1; side += 2) {
      ctx.strokeStyle = winding ? '#ef4444' : '#c2410c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(8, side * 8);
      ctx.lineTo(15 + reachOut, side * 12);
      ctx.stroke();

      const cx = 17 + reachOut;
      const cy = side * 12;
      ctx.fillStyle = winding ? '#f87171' : '#ea580c';
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - side * 1);
      ctx.lineTo(cx + 9, cy - side * 1 - side * clawOpen * 6);
      ctx.lineTo(cx + 3, cy - side * 1);
      ctx.lineTo(cx + 9, cy - side * 1 + side * clawOpen * 6);
      ctx.closePath();
      ctx.fill();
    }

    // Shell
    ctx.fillStyle = crab.blockFlash > 0 ? '#fef3c7' : '#dc2626';
    ctx.beginPath();
    ctx.ellipse(0, 0, 11, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = crab.blockFlash > 0 ? '#ffffff' : '#ef4444';
    ctx.beginPath();
    ctx.ellipse(-1, 0, 8, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Armored front plate (shows where hits get blocked)
    ctx.strokeStyle = crab.blockFlash > 0 ? '#ffffff' : '#fbbf24';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 13, -ARMOR_ARC, ARMOR_ARC);
    ctx.stroke();

    // Eyes on stalks
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(8, -4);
    ctx.lineTo(13, -5);
    ctx.moveTo(8, 4);
    ctx.lineTo(13, 5);
    ctx.stroke();
    ctx.fillStyle = '#fef2f2';
    ctx.beginPath();
    ctx.arc(13, -5, 2.2, 0, Math.PI * 2);
    ctx.arc(13, 5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(14, -5, 1, 0, Math.PI * 2);
    ctx.arc(14, 5, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    if (crab.hp < crab.maxHp) {
      ctx.fillStyle = '#450a0a';
      ctx.fillRect(-13, -27, 26, 3);
      ctx.fillStyle = '#f87171';
      ctx.fillRect(-13, -27, 26 * crab.hp / crab.maxHp, 3);
    }
    ctx.restore();
  }
}
