import { CONFIG } from '../../config.js';
import { checkCollision, getObstacleAvoidanceAngle } from '../world.js';
import { getTileEnvironment } from '../generation.js';
import { ENEMIES_CONFIG, damageAfterArmor, despawnDistantEnemies, isSlingshotHit } from './enemiesConfig.js';

const OCTOPUS_CONFIG = ENEMIES_CONFIG.octopus;
const BLUE_SECTION_INNER_RADIUS = CONFIG.biomes[0].maxDistance;
const BLUE_SECTION_OUTER_RADIUS = CONFIG.biomes[1].maxDistance;
const PULL_DURATION = 1.8;
const octopusesByTile = new Map();
let spawnTimer = OCTOPUS_CONFIG.spawnRate.initialDelay;
let totalKills = 0;

export function getOctopusKills() { return totalKills; }

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

function isDeepWaterTile(tileX, tileY) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (getTileEnvironment(tileX + dx, tileY + dy)?.type !== 'water_puddle') return false;
    }
  }
  return true;
}

function trySpawnNearPlayer(playerX, playerY) {
  const searchRadius = 650;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = playerX + (Math.random() * 2 - 1) * searchRadius;
    const y = playerY + (Math.random() * 2 - 1) * searchRadius;
    const distance = Math.hypot(x, y);
    if (distance <= BLUE_SECTION_INNER_RADIUS || distance >= BLUE_SECTION_OUTER_RADIUS) continue;

    const tileX = Math.floor(x / CONFIG.tileSize);
    const tileY = Math.floor(y / CONFIG.tileSize);
    const key = `${tileX},${tileY}`;
    if (octopusesByTile.has(key)) continue;
    if (getTileEnvironment(tileX, tileY)?.type !== 'water_puddle' || !isDeepWaterTile(tileX, tileY)) continue;

    octopusesByTile.set(key, {
      id: `octopus-${key}`,
      kind: 'octopus',
      x: tileX * CONFIG.tileSize + CONFIG.tileSize / 2,
      y: tileY * CONFIG.tileSize + CONFIG.tileSize / 2,
      hp: OCTOPUS_CONFIG.health,
      maxHp: OCTOPUS_CONFIG.health,
      speed: OCTOPUS_CONFIG.movementSpeed,
      attackCooldown: 0.8,
      contactCooldown: 0,
      contactAnimationTimer: 0,
      attackAnimationTimer: 0,
      attackAngle: 0,
      attackTentacleIndex: -1,
      isGrabbing: false,
      pullTimer: 0,
      pullTargetX: 0,
      pullTargetY: 0,
      tentacles: Array.from({ length: 8 }, (_, index) => ({
        angle: index * Math.PI / 4,
        hp: OCTOPUS_CONFIG.tentacleHealth,
        cut: false
      })),
      walkTimer: Math.random() * Math.PI * 2,
      alive: true
    });
    return true;
  }
  return false;
}

function applySlash(player, swingAngle) {
  if (player.activeWeapon === 'slingshot') {
    if (!player.slingshotShotActive) return;
    for (const octopus of octopusesByTile.values()) {
      if (!octopus.alive || player.attackHitEnemies.has(octopus.id) || !isSlingshotHit(player, octopus.x, octopus.y, octopus.isChasing, CONFIG.enemyChaseRange)) continue;
      octopus.hp -= player.slingshotDamage;
      player.attackHitEnemies.add(octopus.id);
      if (octopus.hp <= 0) {
        octopus.alive = false;
        if (player.isGrabbedBy === octopus.id) player.isGrabbedBy = null;
        player.cycles += 5;
        totalKills++;
      }
      return;
    }
    return;
  }
  if (swingAngle === null) return;
  for (const octopus of octopusesByTile.values()) {
    if (!octopus.alive || player.attackHitEnemies.has(octopus.id)) continue;

    if (!octopus.isGrabbing) {
      let slicedTentacle = false;
      for (let index = 0; index < octopus.tentacles.length; index++) {
        const tentacle = octopus.tentacles[index];
        const tentacleKey = `${octopus.id}:tentacle:${index}`;
        if (tentacle.cut || player.attackHitEnemies.has(tentacleKey)) continue;
        const tentacleX = octopus.x + Math.cos(tentacle.angle) * 25;
        const tentacleY = octopus.y + Math.sin(tentacle.angle) * 25;
        const dx = tentacleX - player.x;
        const dy = tentacleY - player.y;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx);
        if (distance <= 88 && distance >= 18 && Math.abs(angleDifference(angle, swingAngle)) < 0.34) {
          tentacle.hp--;
          player.attackHitEnemies.add(tentacleKey);
          slicedTentacle = true;
          if (tentacle.hp <= 0) {
            tentacle.cut = true;
            if (octopus.attackTentacleIndex === index && octopus.attackAnimationTimer > 0) {
              octopus.attackAnimationTimer = 0;
              octopus.attackCooldown = 0.65;
            }
            if (octopus.attackTentacleIndex === index && octopus.pullTimer > 0) {
              octopus.pullTimer = 0;
              octopus.attackCooldown = 0.65;
            }
          }
          break;
        }
      }
      if (slicedTentacle) continue;
    }

    const dx = octopus.x - player.x;
    const dy = octopus.y - player.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    if (distance <= 88 && distance >= 18 && Math.abs(angleDifference(angle, swingAngle)) < 0.34) {
      octopus.hp -= player.swordDamage;
      player.attackHitEnemies.add(octopus.id);
      if (octopus.hp <= 0) {
        octopus.alive = false;
        if (player.isGrabbedBy === octopus.id) player.isGrabbedBy = null;
        player.cycles += 5;
        totalKills++;
      }
    }
  }
}

export function resetOctopuses(preserveProgress = false) {
  octopusesByTile.clear();
  spawnTimer = OCTOPUS_CONFIG.spawnRate.initialDelay;
  if (!preserveProgress) totalKills = 0;
}

export function damageOctopuses(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateOctopuses(player, dt, canvas, onDeath) {
  despawnDistantEnemies(octopusesByTile, player);
  const playerDistance = Math.hypot(player.x, player.y);
  const inBlueSection = playerDistance > BLUE_SECTION_INNER_RADIUS && playerDistance < BLUE_SECTION_OUTER_RADIUS;
  if (inBlueSection) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const octopus of octopusesByTile.values()) {
        if (octopus.alive) livingCount++;
      }
      if (livingCount < OCTOPUS_CONFIG.spawnRate.maxAlive) trySpawnNearPlayer(player.x, player.y);
      spawnTimer = OCTOPUS_CONFIG.spawnRate.minInterval
        + Math.random() * (OCTOPUS_CONFIG.spawnRate.maxInterval - OCTOPUS_CONFIG.spawnRate.minInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, OCTOPUS_CONFIG.spawnRate.initialDelay);
  }

  for (const octopus of octopusesByTile.values()) {
    if (!octopus.alive) continue;
    octopus.attackCooldown = Math.max(0, octopus.attackCooldown - dt);
    octopus.contactCooldown = Math.max(0, octopus.contactCooldown - dt);
    octopus.contactAnimationTimer = Math.max(0, octopus.contactAnimationTimer - dt);

    const dx = player.x - octopus.x;
    const dy = player.y - octopus.y;
    const distance = Math.hypot(dx, dy);
    octopus.isChasing = distance < CONFIG.enemyChaseRange || octopus.attackAnimationTimer > 0 || octopus.pullTimer > 0 || octopus.isGrabbing;
    if (distance < CONFIG.enemyChaseRange && distance > 1 && octopus.attackAnimationTimer === 0 && octopus.pullTimer === 0 && !octopus.isGrabbing) {
      octopus.walkTimer += dt * 8;
      const step = octopus.speed * dt;
      const heading = getObstacleAvoidanceAngle(octopus.x, octopus.y, Math.atan2(dy, dx), step, 9,
        (x, y) => isDeepWaterTile(Math.floor(x / CONFIG.tileSize), Math.floor(y / CONFIG.tileSize)), octopus);
      const nextX = octopus.x + Math.cos(heading) * step;
      const nextY = octopus.y + Math.sin(heading) * step;
      if (isDeepWaterTile(Math.floor(nextX / CONFIG.tileSize), Math.floor(octopus.y / CONFIG.tileSize)) && !checkCollision(nextX, octopus.y, 9)) octopus.x = nextX;
      if (isDeepWaterTile(Math.floor(octopus.x / CONFIG.tileSize), Math.floor(nextY / CONFIG.tileSize)) && !checkCollision(octopus.x, nextY, 9)) octopus.y = nextY;
    }

    if (octopus.attackAnimationTimer > 0) {
      octopus.attackAnimationTimer = Math.max(0, octopus.attackAnimationTimer - dt);
      const reachProgress = 1 - octopus.attackAnimationTimer / 1.05;
      const reach = 42 + Math.sin(reachProgress * Math.PI / 2) * 125;
      const tipX = octopus.x + Math.cos(octopus.attackAngle) * reach;
      const tipY = octopus.y + Math.sin(octopus.attackAngle) * reach;
      if (!player.isGrabbedBy && Math.hypot(player.x - tipX, player.y - tipY) <= CONFIG.playerRadius + 9) {
        octopus.attackAnimationTimer = 0;
        octopus.isGrabbing = true;
        player.isGrabbedBy = octopus.id;
        octopus.pullTargetX = octopus.x + Math.cos(octopus.attackAngle) * 26;
        octopus.pullTargetY = octopus.y + Math.sin(octopus.attackAngle) * 26;
        octopus.pullTimer = PULL_DURATION;
      }
    } else if (!player.isGrabbedBy && !octopus.isGrabbing && octopus.pullTimer === 0 && distance < 180 && octopus.attackCooldown === 0 && player.enemyDamageCooldown === 0) {
      const availableTentacles = octopus.tentacles
        .map((tentacle, index) => ({ tentacle, index }))
        .filter(({ tentacle }) => !tentacle.cut);
      if (availableTentacles.length === 0) continue;

      octopus.attackAngle = Math.atan2(dy, dx);
      octopus.attackTentacleIndex = availableTentacles.reduce((best, entry) => {
        return Math.abs(angleDifference(entry.tentacle.angle, octopus.attackAngle)) < Math.abs(angleDifference(best.tentacle.angle, octopus.attackAngle))
          ? entry
          : best;
      }).index;
      octopus.attackAnimationTimer = 1.05;
      octopus.attackCooldown = 2.1;
    }

    if (octopus.pullTimer > 0) {
      const pullDx = octopus.pullTargetX - player.x;
      const pullDy = octopus.pullTargetY - player.y;
      const pullDistance = Math.hypot(pullDx, pullDy);
      const step = Math.min(pullDistance, 90 * dt);
      const pulledX = pullDistance > 0 ? player.x + pullDx / pullDistance * step : player.x;
      const pulledY = pullDistance > 0 ? player.y + pullDy / pullDistance * step : player.y;
      if (step > 0 && !checkCollision(pulledX, pulledY + 17, CONFIG.playerRadius)) {
        player.x = pulledX;
        player.y = pulledY;
        player.cameraX = player.x - canvas.width / 2;
        player.cameraY = player.y - canvas.height / 2;
      } else if (step > 0) {
        // A blocked pull can leave the grab flag set forever, disabling movement.
        octopus.pullTimer = 0;
        octopus.isGrabbing = false;
        if (player.isGrabbedBy === octopus.id) player.isGrabbedBy = null;
      }
      octopus.pullTimer = Math.max(0, octopus.pullTimer - dt);
    }

    const contactDistance = Math.hypot(player.x - octopus.x, player.y - octopus.y);
    if (contactDistance < 28 && octopus.contactCooldown === 0 && player.enemyDamageCooldown === 0) {
      player.hp -= damageAfterArmor(player, OCTOPUS_CONFIG.damage);
      player.enemyDamageCooldown = 0.9;
      octopus.contactCooldown = 1.1;
      octopus.contactAnimationTimer = 0.2;
      octopus.attackAngle = Math.atan2(player.y - octopus.y, player.x - octopus.x);
      if (player.hp <= 0 && typeof onDeath === 'function') {
        onDeath('Attacked by an octopus!');
        return false;
      }
    }
  }
  return true;
}

export function drawOctopuses(ctx, player, canvas, time) {
  for (const octopus of octopusesByTile.values()) {
    if (!octopus.alive) continue;
    const attackProgress = octopus.attackAnimationTimer > 0
      ? 1 - octopus.attackAnimationTimer / 1.05
      : 0;
    const tentacleIsActive = octopus.attackAnimationTimer > 0 || octopus.pullTimer > 0 || octopus.isGrabbing;
    const bob = Math.sin(time / 220 + octopus.walkTimer) * 2;
    const x = octopus.x - player.cameraX;
    const y = octopus.y - player.cameraY + bob;
    if (x < -70 || y < -70 || x > canvas.width + 70 || y > canvas.height + 70) continue;

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(125, 211, 252, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 11, 24 + Math.sin(time / 190) * 2, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#6d28d9';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < octopus.tentacles.length; arm++) {
      const tentacle = octopus.tentacles[arm];
      if (tentacle.cut || (tentacleIsActive && arm === octopus.attackTentacleIndex)) continue;
      ctx.strokeStyle = tentacle.hp < OCTOPUS_CONFIG.tentacleHealth ? '#c4b5fd' : '#6d28d9';
      const angle = tentacle.angle + Math.sin(time / 300 + arm) * 0.12;
      const length = 20 + Math.sin(time / 170 + arm * 1.8) * 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 6 + 5);
      ctx.quadraticCurveTo(Math.cos(angle) * (length * 0.65), Math.sin(angle) * (length * 0.6) + 10, Math.cos(angle) * length, Math.sin(angle) * length + 10);
      ctx.stroke();
    }

    if (tentacleIsActive) {
      const reach = octopus.attackAnimationTimer > 0
        ? 42 + Math.sin(attackProgress * Math.PI / 2) * 125
        : Math.min(175, Math.hypot(player.x - octopus.x, player.y - octopus.y));
      ctx.save();
      ctx.rotate(octopus.attackAngle);
      ctx.strokeStyle = `rgba(139, 92, 246, ${1 - attackProgress * 0.2})`;
      ctx.lineWidth = 8;
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(8, 1);
      ctx.quadraticCurveTo(reach * 0.45, -22, reach, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ccfbf1';
      for (let cup = 1; cup <= 4; cup++) {
        const cupX = reach * cup / 5;
        const cupY = -Math.sin(Math.PI * cup / 5) * 18;
        ctx.beginPath();
        ctx.arc(cupX, cupY, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (octopus.isGrabbing) {
        const playerDx = player.x - octopus.x;
        const playerDy = player.y - octopus.y;
        const localPlayerX = playerDx * Math.cos(octopus.attackAngle) + playerDy * Math.sin(octopus.attackAngle);
        const localPlayerY = -playerDx * Math.sin(octopus.attackAngle) + playerDy * Math.cos(octopus.attackAngle);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 7;
        ctx.shadowColor = '#a78bfa';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(8, 1);
        ctx.quadraticCurveTo(localPlayerX * 0.45, -20, localPlayerX, localPlayerY);
        ctx.ellipse(localPlayerX, localPlayerY, 28, 38, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.fillStyle = octopus.contactAnimationTimer > 0 ? '#f0abfc' : '#a78bfa';
    ctx.beginPath();
    ctx.ellipse(0, -2, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.ellipse(0, 5, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#2e1065';
    ctx.beginPath();
    ctx.arc(-6, -3, 3.2, 0, Math.PI * 2);
    ctx.arc(6, -3, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f5f3ff';
    ctx.beginPath();
    ctx.arc(-6, -4, 1.3, 0, Math.PI * 2);
    ctx.arc(6, -4, 1.3, 0, Math.PI * 2);
    ctx.fill();

    if (octopus.hp < octopus.maxHp) {
      ctx.fillStyle = '#2e1065';
      ctx.fillRect(-13, -25, 26, 3);
      ctx.fillStyle = '#c4b5fd';
      ctx.fillRect(-13, -25, 26 * octopus.hp / octopus.maxHp, 3);
    }
    ctx.restore();
  }
}
