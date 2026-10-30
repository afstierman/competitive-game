import { CONFIG } from '../../config.js';
import { checkCollision } from '../world.js';
import { getBiomeAtDistance, getTileEnvironment } from '../generation.js';
import { isInsideShopSector } from '../shop.js';
import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const BUG_CONFIG = ENEMIES_CONFIG.computerBug;

const CELL_SIZE = 260;
const FIRST_SECTION_RADIUS = CONFIG.biomes[0].maxDistance;
const enemiesByCell = new Map();
let spawnTimer = BUG_CONFIG.spawnRate.initialDelay;

function randomForCell(x, y, salt = 0) {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
}

function getOrCreateEnemy(cellX, cellY) {
  const key = `${cellX},${cellY}`;
  if (enemiesByCell.has(key)) return enemiesByCell.get(key);
  if (randomForCell(cellX, cellY) < 0.68) {
    enemiesByCell.set(key, null);
    return null;
  }

  const x = (cellX + 0.2 + randomForCell(cellX, cellY, 1) * 0.6) * CELL_SIZE;
  const y = (cellY + 0.2 + randomForCell(cellX, cellY, 2) * 0.6) * CELL_SIZE;
  const distance = Math.hypot(x, y);
  const tileX = Math.floor(x / CONFIG.tileSize);
  const tileY = Math.floor(y / CONFIG.tileSize);
  const environment = getTileEnvironment(tileX, tileY);
  const inHub = Math.abs(tileX) < CONFIG.world.hubSafeZoneTiles && Math.abs(tileY) < CONFIG.world.hubSafeZoneTiles;

  if (distance > FIRST_SECTION_RADIUS - 40 || getBiomeAtDistance(distance).name !== CONFIG.biomes[0].name || inHub || isInsideShopSector(x, y) || environment?.type.startsWith('rock')) {
    enemiesByCell.set(key, null);
    return null;
  }

  const enemy = {
    id: key,
    x,
    y,
    hp: BUG_CONFIG.health,
    maxHp: BUG_CONFIG.health,
    speed: BUG_CONFIG.movementSpeed,
    attackCooldown: 0,
    attackAnimationTimer: 0,
    attackAngle: 0,
    walkTimer: randomForCell(cellX, cellY, 3) * Math.PI * 2,
    alive: true
  };
  enemiesByCell.set(key, enemy);
  return enemy;
}

function applySlash(player, swingAngle) {
  if (swingAngle === null) return;
  for (const enemy of enemiesByCell.values()) {
    if (!enemy?.alive || player.attackHitEnemies.has(enemy.id)) continue;
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distance = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(angle - swingAngle), Math.cos(angle - swingAngle));
    if (distance <= 78 && distance >= 18 && Math.abs(difference) < 0.34) {
      enemy.hp -= player.swordDamage;
      player.attackHitEnemies.add(enemy.id);
      if (enemy.hp <= 0) {
        enemy.alive = false;
        player.cycles++;
      }
    }
  }
}

export function resetComputerBugs() {
  enemiesByCell.clear();
  spawnTimer = BUG_CONFIG.spawnRate.initialDelay;
}

export function damageComputerBugs(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateComputerBugs(player, dt, onDeath) {
  const playerDistance = Math.hypot(player.x, player.y);
  if (playerDistance < FIRST_SECTION_RADIUS) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const enemy of enemiesByCell.values()) {
        if (enemy?.alive) livingCount++;
      }

      if (livingCount < BUG_CONFIG.spawnRate.maxAlive) {
        const cellX = Math.floor(player.x / CELL_SIZE);
        const cellY = Math.floor(player.y / CELL_SIZE);
        for (let attempt = 0; attempt < 12; attempt++) {
          const spawnCellX = cellX + Math.floor(Math.random() * 9) - 4;
          const spawnCellY = cellY + Math.floor(Math.random() * 9) - 4;
          const key = `${spawnCellX},${spawnCellY}`;
          if (enemiesByCell.has(key)) continue;
          if (getOrCreateEnemy(spawnCellX, spawnCellY)) break;
        }
      }
      spawnTimer = BUG_CONFIG.spawnRate.minInterval
        + Math.random() * (BUG_CONFIG.spawnRate.maxInterval - BUG_CONFIG.spawnRate.minInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, BUG_CONFIG.spawnRate.initialDelay);
  }

  for (const enemy of enemiesByCell.values()) {
    if (!enemy?.alive) continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - dt);
    enemy.attackAnimationTimer = Math.max(0, enemy.attackAnimationTimer - dt);

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 280 && distance > 1) {
      enemy.walkTimer += dt * 8;
      const step = enemy.speed * dt;
      const nextX = enemy.x + dx / distance * step;
      const nextY = enemy.y + dy / distance * step;
      if (!checkCollision(nextX, enemy.y, 9)) enemy.x = nextX;
      if (!checkCollision(enemy.x, nextY, 9)) enemy.y = nextY;
    }

    if (distance < 27 && enemy.attackCooldown === 0 && player.enemyDamageCooldown === 0) {
      player.hp -= damageAfterArmor(player, BUG_CONFIG.damage);
      player.enemyDamageCooldown = 0.9;
      enemy.attackCooldown = 1.1;
      enemy.attackAnimationTimer = 0.24;
      enemy.attackAngle = Math.atan2(dy, dx);
      if (player.hp <= 0 && typeof onDeath === 'function') {
        onDeath('Overrun by a computer bug!');
        return false;
      }
    }
  }
  return true;
}

export function drawComputerBugs(ctx, player, canvas, time) {
  for (const enemy of enemiesByCell.values()) {
    if (!enemy?.alive) continue;
    const attackProgress = enemy.attackAnimationTimer > 0
      ? 1 - enemy.attackAnimationTimer / 0.24
      : 0;
    const lunge = enemy.attackAnimationTimer > 0 ? Math.sin(attackProgress * Math.PI) * 8 : 0;
    const x = enemy.x + Math.cos(enemy.attackAngle) * lunge - player.cameraX;
    const y = enemy.y + Math.sin(enemy.attackAngle) * lunge - player.cameraY + Math.sin(time / 180 + enemy.walkTimer) * 2;
    if (x < -40 || y < -40 || x > canvas.width + 40 || y > canvas.height + 40) continue;

    if (enemy.attackAnimationTimer > 0) {
      ctx.save();
      ctx.translate(enemy.x - player.cameraX, enemy.y - player.cameraY);
      ctx.rotate(enemy.attackAngle);
      ctx.strokeStyle = `rgba(250, 204, 21, ${1 - attackProgress * 0.55})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = '#facc15';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(10, -3);
      ctx.lineTo(24, 0);
      ctx.lineTo(10, 3);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 10, 14, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 2;
    for (let leg = 0; leg < 3; leg++) {
      const offsetY = -3 + leg * 5;
      const twitch = Math.sin(enemy.walkTimer + leg) * 2;
      ctx.beginPath();
      ctx.moveTo(-7, offsetY);
      ctx.lineTo(-13, offsetY - 3 + twitch);
      ctx.lineTo(-16, offsetY + 1 + twitch);
      ctx.moveTo(7, offsetY);
      ctx.lineTo(13, offsetY - 3 - twitch);
      ctx.lineTo(16, offsetY + 1 - twitch);
      ctx.stroke();
    }

    ctx.fillStyle = enemy.attackAnimationTimer > 0 ? '#a3e635' : '#15803d';
    ctx.beginPath();
    ctx.ellipse(0, 1, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = enemy.attackAnimationTimer > 0 ? '#ecfccb' : '#4ade80';
    ctx.beginPath();
    ctx.ellipse(1, -3, 9, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#14532d';
    ctx.fillRect(-5, 0, 3, 2);
    ctx.fillRect(2, -1, 4, 2);
    ctx.fillRect(-1, 3, 2, 3);

    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-5, -8);
    ctx.quadraticCurveTo(-11, -17, -8, -19);
    ctx.moveTo(5, -8);
    ctx.quadraticCurveTo(11, -17, 8, -19);
    ctx.stroke();
    ctx.fillStyle = '#bbf7d0';
    ctx.beginPath();
    ctx.arc(-8, -19, 2, 0, Math.PI * 2);
    ctx.arc(8, -19, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#052e16';
    ctx.fillRect(-5, -5, 3, 4);
    ctx.fillRect(3, -5, 3, 4);
    ctx.fillStyle = '#dcfce7';
    ctx.fillRect(-4, -5, 1, 2);
    ctx.fillRect(4, -5, 1, 2);

    if (enemy.hp < enemy.maxHp) {
      ctx.fillStyle = '#052e16';
      ctx.fillRect(-12, -26, 24, 3);
      ctx.fillStyle = '#4ade80';
      ctx.fillRect(-12, -26, 24 * enemy.hp / enemy.maxHp, 3);
    }
    ctx.restore();
  }
}
