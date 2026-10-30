import { CONFIG } from '../../config.js';
import { checkCollision } from '../world.js';
import { getTileEnvironment } from '../generation.js';
import { isInsideShopSector } from '../shop.js';
import { ENEMIES_CONFIG, damageAfterArmor } from './enemiesConfig.js';

const SKELETON_CONFIG = ENEMIES_CONFIG.skeleton;
const SPAWN = SKELETON_CONFIG.spawnRate;
const ATTACK = SKELETON_CONFIG.attack;
const FAR_SECTION_INNER_RADIUS = CONFIG.biomes[2].maxDistance;
const FAR_SECTION_OUTER_RADIUS = CONFIG.biomes[3]?.maxDistance ?? Infinity;
const HIT_RADIUS = 14;
const BODY_RADIUS = 9;
const RAISE_EXTRA = 0.5;     // how far past the swing start the sword is raised in windup
const LOCK_TIME = 0.15;      // aim locks this long before the swing

const skeletons = new Map();
let nextId = 0;
let spawnTimer = SPAWN.initialDelay;

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

// Skeletons stay on land: lava is off limits
function isLavaTile(tileX, tileY) {
  return getTileEnvironment(tileX, tileY)?.type?.includes('lava_pool') ?? false;
}

// Checks the center and the edges of the body so he never overlaps lava
function isLavaAt(x, y) {
  const points = [
    [x, y],
    [x - BODY_RADIUS, y],
    [x + BODY_RADIUS, y],
    [x, y - BODY_RADIUS],
    [x, y + BODY_RADIUS]
  ];
  return points.some(([px, py]) => isLavaTile(Math.floor(px / CONFIG.tileSize), Math.floor(py / CONFIG.tileSize)));
}

function trySpawnNearPlayer(player) {
  const searchRadius = 650;
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = player.x + (Math.random() * 2 - 1) * searchRadius;
    const y = player.y + (Math.random() * 2 - 1) * searchRadius;
    const distance = Math.hypot(x, y);
    if (distance <= FAR_SECTION_INNER_RADIUS + 20 || distance >= FAR_SECTION_OUTER_RADIUS - 20) continue;
    if (Math.hypot(x - player.x, y - player.y) < 260) continue;

    const tileX = Math.floor(x / CONFIG.tileSize);
    const tileY = Math.floor(y / CONFIG.tileSize);
    const inHub = Math.abs(tileX) < CONFIG.world.hubSafeZoneTiles && Math.abs(tileY) < CONFIG.world.hubSafeZoneTiles;
    const environment = getTileEnvironment(tileX, tileY);
    if (inHub || isInsideShopSector(x, y) || environment?.type.startsWith('rock')) continue;
    if (isLavaAt(x, y)) continue;
    if (checkCollision(x, y, 9)) continue;

    const id = `skeleton-${nextId++}`;
    skeletons.set(id, {
      id,
      kind: 'skeleton',
      x,
      y,
      hp: SKELETON_CONFIG.health,
      maxHp: SKELETON_CONFIG.health,
      state: 'chase',          // chase | windup | swing | recover
      stateTimer: 0,
      attackAngle: 0,
      sweepAngle: 0,
      swingDir: 1,
      comboIndex: 0,
      hasHit: false,
      attackCooldown: randomBetween(0.6, 1.2),
      facing: 1,
      hitFlash: 0,
      walkTimer: Math.random() * Math.PI * 2,
      alive: true
    });
    return true;
  }
  return false;
}

function moveSkeleton(skeleton, angle, speed, dt) {
  const nextX = skeleton.x + Math.cos(angle) * speed * dt;
  const nextY = skeleton.y + Math.sin(angle) * speed * dt;
  if (!checkCollision(nextX, skeleton.y, 9) && !isLavaAt(nextX, skeleton.y)) skeleton.x = nextX;
  if (!checkCollision(skeleton.x, nextY, 9) && !isLavaAt(skeleton.x, nextY)) skeleton.y = nextY;
}

function startWindup(skeleton, toPlayer, time) {
  skeleton.state = 'windup';
  skeleton.stateTimer = time;
  skeleton.attackAngle = toPlayer;
}

function applySlash(player, swingAngle) {
  if (swingAngle === null) return;
  for (const skeleton of skeletons.values()) {
    if (!skeleton.alive || player.attackHitEnemies.has(skeleton.id)) continue;
    const dx = skeleton.x - player.x;
    const dy = skeleton.y - player.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 80 + HIT_RADIUS) continue;

    if (distance > HIT_RADIUS) {
      const angle = Math.atan2(dy, dx);
      const slack = Math.asin(HIT_RADIUS / distance);
      if (Math.abs(angleDifference(angle, swingAngle)) >= 0.34 + slack) continue;
    }

    skeleton.hp -= player.swordDamage;
    skeleton.hitFlash = 0.12;
    player.attackHitEnemies.add(skeleton.id);
    if (skeleton.hp <= 0) {
      skeleton.alive = false;
      player.cycles += 8;
    }
  }
}

export function resetSkeletons() {
  skeletons.clear();
  nextId = 0;
  spawnTimer = SPAWN.initialDelay;
}

export function damageSkeletons(player, swingAngle) {
  applySlash(player, swingAngle);
}

export function updateSkeletons(player, dt, canvas, onDeath) {
  if (inFarSection(player.x, player.y)) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) {
      let livingCount = 0;
      for (const skeleton of skeletons.values()) {
        if (skeleton.alive) livingCount++;
      }
      if (livingCount < SPAWN.maxAlive) trySpawnNearPlayer(player);
      spawnTimer = randomBetween(SPAWN.minInterval, SPAWN.maxInterval);
    }
  } else {
    spawnTimer = Math.min(spawnTimer, SPAWN.initialDelay);
  }

  for (const [id, skeleton] of skeletons) {
    if (!skeleton.alive) {
      skeletons.delete(id);
      continue;
    }

    skeleton.attackCooldown = Math.max(0, skeleton.attackCooldown - dt);
    skeleton.hitFlash = Math.max(0, skeleton.hitFlash - dt);

    const dx = player.x - skeleton.x;
    const dy = player.y - skeleton.y;
    const distance = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);

    if (skeleton.state === 'chase') {
      skeleton.facing = Math.cos(toPlayer) >= 0 ? 1 : -1;
      skeleton.sweepAngle = skeleton.facing > 0 ? 1.2 : Math.PI - 1.2;
      if (distance < 380 && distance > 40) {
        skeleton.walkTimer += dt * 9;
        moveSkeleton(skeleton, toPlayer, SKELETON_CONFIG.movementSpeed, dt);
      }
      if (distance < ATTACK.triggerRange && skeleton.attackCooldown === 0) {
        skeleton.comboIndex = 0;
        skeleton.swingDir = Math.random() < 0.5 ? 1 : -1;
        startWindup(skeleton, toPlayer, ATTACK.windupTime);
      }
    } else if (skeleton.state === 'windup') {
      skeleton.stateTimer -= dt;
      skeleton.facing = Math.cos(skeleton.attackAngle) >= 0 ? 1 : -1;
      // Keeps tracking the player until just before the swing
      if (skeleton.stateTimer > LOCK_TIME) skeleton.attackAngle = toPlayer;
      skeleton.sweepAngle = skeleton.attackAngle - skeleton.swingDir * (ATTACK.arc + RAISE_EXTRA);
      if (skeleton.stateTimer <= 0) {
        skeleton.state = 'swing';
        skeleton.stateTimer = ATTACK.swingTime;
        skeleton.hasHit = false;
      }
    } else if (skeleton.state === 'swing') {
      skeleton.stateTimer -= dt;
      const progress = Math.min(1, 1 - skeleton.stateTimer / ATTACK.swingTime);
      skeleton.sweepAngle = skeleton.attackAngle + skeleton.swingDir * (-ATTACK.arc + progress * ATTACK.arc * 2);
      skeleton.walkTimer += dt * 14;
      // Lunges hard toward the locked angle, stopping just short of the player (and short of lava)
      if (distance > 24) moveSkeleton(skeleton, skeleton.attackAngle, ATTACK.lungeSpeed, dt);

      if (!skeleton.hasHit && distance <= ATTACK.range + CONFIG.playerRadius
        && Math.abs(angleDifference(toPlayer, skeleton.sweepAngle)) < 0.5
        && player.enemyDamageCooldown === 0) {
        skeleton.hasHit = true;
        player.hp -= damageAfterArmor(player, SKELETON_CONFIG.damage);
        player.enemyDamageCooldown = 0.6;
        const pushX = player.x + Math.cos(skeleton.attackAngle) * ATTACK.knockback;
        const pushY = player.y + Math.sin(skeleton.attackAngle) * ATTACK.knockback;
        if (!checkCollision(pushX, pushY + 17, CONFIG.playerRadius)) {
          player.x = pushX;
          player.y = pushY;
          player.cameraX = player.x - canvas.width / 2;
          player.cameraY = player.y - canvas.height / 2;
        }
        if (player.hp <= 0 && typeof onDeath === 'function') {
          onDeath('Cut down by a skeleton!');
          return false;
        }
      }

      if (skeleton.stateTimer <= 0) {
        if (skeleton.comboIndex < ATTACK.swings - 1) {
          // Follow-up swing in the opposite direction, faster windup
          skeleton.comboIndex++;
          skeleton.swingDir *= -1;
          startWindup(skeleton, toPlayer, ATTACK.comboWindupTime);
        } else {
          skeleton.state = 'recover';
          skeleton.stateTimer = ATTACK.recoverTime;
        }
      }
    } else if (skeleton.state === 'recover') {
      skeleton.stateTimer -= dt;
      if (skeleton.stateTimer <= 0) {
        skeleton.state = 'chase';
        skeleton.attackCooldown = randomBetween(0.6, 1.3);
      }
    }
  }
  return true;
}

const BONE = '#e5e7eb';
const BONE_DARK = '#9ca3af';
const BONE_FLASH = '#ffffff';

export function drawSkeletons(ctx, player, canvas, time) {
  for (const skeleton of skeletons.values()) {
    if (!skeleton.alive) continue;
    const x = skeleton.x - player.cameraX;
    const y = skeleton.y - player.cameraY;
    if (x < -90 || y < -90 || x > canvas.width + 90 || y > canvas.height + 90) continue;

    const windup = skeleton.state === 'windup';
    const swinging = skeleton.state === 'swing';
    const bone = skeleton.hitFlash > 0 ? BONE_FLASH : BONE;
    const face = skeleton.facing;

    ctx.save();
    ctx.translate(x, y);

    // Ground telegraph: sweep zone plus the lunge path
    if (windup) {
      const total = skeleton.comboIndex === 0 ? ATTACK.windupTime : ATTACK.comboWindupTime;
      const p = 1 - skeleton.stateTimer / total;
      const lungeLength = ATTACK.lungeSpeed * ATTACK.swingTime;
      const reach = ATTACK.range + CONFIG.playerRadius + lungeLength;
      ctx.fillStyle = `rgba(239, 68, 68, ${0.08 + p * 0.25})`;
      ctx.strokeStyle = `rgba(248, 113, 113, ${0.3 + p * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, reach, skeleton.attackAngle - ATTACK.arc * 0.55, skeleton.attackAngle + ATTACK.arc * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Swing trail
    if (swinging) {
      const progress = Math.min(1, 1 - skeleton.stateTimer / ATTACK.swingTime);
      const startAngle = skeleton.attackAngle - skeleton.swingDir * ATTACK.arc;
      ctx.save();
      ctx.strokeStyle = `rgba(226, 232, 240, ${0.9 - progress * 0.4})`;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#e2e8f0';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, -6, ATTACK.range - 6, startAngle, skeleton.sweepAngle, skeleton.swingDir < 0);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 17, 13, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const shake = windup ? Math.sin(time / 25) * 0.8 : 0;
    ctx.translate(shake, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Legs
    ctx.strokeStyle = bone;
    ctx.lineWidth = 2.5;
    for (let leg = -1; leg <= 1; leg += 2) {
      const swing = Math.sin(skeleton.walkTimer + (leg > 0 ? Math.PI : 0)) * 4;
      ctx.beginPath();
      ctx.moveTo(leg * 3, 6);
      ctx.lineTo(leg * 4 + swing * 0.5, 12);
      ctx.lineTo(leg * 4 + swing, 17);
      ctx.stroke();
    }

    // Pelvis, spine, ribs
    ctx.fillStyle = BONE_DARK;
    ctx.fillRect(-5, 4, 10, 3);
    ctx.strokeStyle = bone;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.lineTo(0, -14);
    ctx.stroke();
    ctx.lineWidth = 1.8;
    for (let rib = 0; rib < 3; rib++) {
      const half = 7 - rib * 1.5;
      const ry = -11 + rib * 4.5;
      ctx.beginPath();
      ctx.moveTo(-half, ry);
      ctx.quadraticCurveTo(0, ry + 2.5, half, ry);
      ctx.stroke();
    }

    // Off arm
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(-face * 8, -7);
    ctx.lineTo(-face * 9, 0);
    ctx.stroke();

    // Skull
    ctx.fillStyle = bone;
    ctx.strokeStyle = BONE_DARK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -22, 7, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-4, -17, 8, 4);
    ctx.fillStyle = windup ? '#ef4444' : '#111827';
    ctx.beginPath();
    ctx.ellipse(-3, -23, 2, 2.4, 0, 0, Math.PI * 2);
    ctx.ellipse(3, -23, 2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.fillRect(-0.5, -20, 1, 2);
    ctx.fillRect(-3, -15, 1, 2);
    ctx.fillRect(0, -15, 1, 2);
    ctx.fillRect(3, -15, 1, 2);

    // Sword arm and sword, drawn at the real world angle so it matches the hitbox
    ctx.save();
    ctx.translate(face * 2, -12);
    ctx.rotate(skeleton.sweepAngle);
    ctx.strokeStyle = bone;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(9, 0);
    ctx.stroke();
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(13, 0);
    ctx.stroke();
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(13, -4);
    ctx.lineTo(13, 4);
    ctx.stroke();
    if (windup) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 10;
    } else if (swinging) {
      ctx.shadowColor = '#e2e8f0';
      ctx.shadowBlur = 8;
    }
    ctx.strokeStyle = windup ? '#fca5a5' : '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(ATTACK.range - 8, 0);
    ctx.stroke();
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(15, -0.8);
    ctx.lineTo(ATTACK.range - 10, -0.8);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    if (skeleton.hp < skeleton.maxHp) {
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(x - 14, y - 38, 28, 3);
      ctx.fillStyle = '#e5e7eb';
      ctx.fillRect(x - 14, y - 38, 28 * skeleton.hp / skeleton.maxHp, 3);
    }
  }
}
