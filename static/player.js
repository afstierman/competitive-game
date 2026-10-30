import { CONFIG } from './config.js';
import { checkCollision, checkCrystalCollection, checkHazards } from './world/world.js';
import { getTileEnvironment } from './world/generation.js';

const PLAYER_FEET_OFFSET = 17;
const PLAYER_FEET_RADIUS = 5;

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    speed: CONFIG.playerSpeed,
    hp: CONFIG.maxHp,
    maxHp: CONFIG.maxHp,
    cycles: 0,
    facingRight: true,
    cameraX: 0,
    cameraY: 0,
    walkTimer: 0,
    isMoving: false,
    damageCooldown: 0,
    enemyDamageCooldown: 0,
    aimAngle: 0,
    isAttacking: false,
    slashTimer: 0,
    slashCooldown: 0,
    attackId: 0,
    attackHitEnemies: new Set(),
    isGrabbedBy: null
  };
}

export function updatePlayer(player, keys, dt, canvas, time, onDeath, mouse) {
  player.slashCooldown = Math.max(0, player.slashCooldown - dt * 1000);
  if (mouse) {
    const targetAngle = Math.atan2(mouse.y - canvas.height / 2, mouse.x - canvas.width / 2);
    const angleDelta = Math.atan2(Math.sin(targetAngle - player.aimAngle), Math.cos(targetAngle - player.aimAngle));
    player.aimAngle += angleDelta * (1 - Math.exp(-dt * 20));
  }
  if (player.isAttacking) {
    player.slashTimer = Math.max(0, player.slashTimer - dt * 1000);
    if (player.slashTimer === 0) player.isAttacking = false;
  }

  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  player.isMoving = (dx !== 0 || dy !== 0);
  if (player.isGrabbedBy) {
    dx = 0;
    dy = 0;
    player.isMoving = false;
  }

  const hazard = checkHazards(player.x, player.y, time);

  player.damageCooldown = Math.max(0, player.damageCooldown - dt);
  if (hazard.takeDamage && player.damageCooldown === 0) {
    player.hp--;
    player.damageCooldown = 1.0;
    if (player.hp <= 0 && typeof onDeath === 'function') {
      onDeath('Incinerated by infernal magma!');
      return;
    }
  }

  const effectiveSpeed = player.speed * hazard.speedMultiplier;

  if (player.isMoving) {
    player.walkTimer += dt * 10;
    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }
  } else {
    player.walkTimer += dt * 3;
  }

  // Calculate intended movement distance plus gravitational black hole pull force
  const moveDist = effectiveSpeed * dt;
  let targetX = player.x + dx * moveDist + (player.isGrabbedBy ? 0 : hazard.pullVelocity.x * dt);
  let targetY = player.y + dy * moveDist + (player.isGrabbedBy ? 0 : hazard.pullVelocity.y * dt);

  // Axis-separated collision checks
  if (!checkCollision(targetX, player.y + PLAYER_FEET_OFFSET, PLAYER_FEET_RADIUS)) {
    player.x = targetX;
  }
  if (!checkCollision(player.x, targetY + PLAYER_FEET_OFFSET, PLAYER_FEET_RADIUS)) {
    player.y = targetY;
  }

  const earnedCycles = checkCrystalCollection(player.x, player.y);
  if (earnedCycles > 0) {
    player.cycles += earnedCycles;
  }

  player.cameraX = player.x - canvas.width / 2;
  player.cameraY = player.y - canvas.height / 2;
}

export function startPlayerAttack(player) {
  if (player.slashCooldown > 0) return false;
  player.isAttacking = true;
  player.slashTimer = 150;
  player.slashCooldown = 450;
  player.attackId++;
  player.attackHitEnemies.clear();
  return true;
}

export function drawPlayer(ctx, player, mouse, canvas) {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const aimAngle = player.aimAngle;

  player.facingRight = Math.cos(aimAngle) >= 0;

  const bounceY = player.isMoving ? Math.sin(player.walkTimer) * 2 : Math.sin(player.walkTimer) * 1;
  const legOffset = player.isMoving ? Math.sin(player.walkTimer) * 3 : 0;
  const playerTileX = Math.floor(player.x / CONFIG.tileSize);
  const playerTileY = Math.floor(player.y / CONFIG.tileSize);
  const currentEnvironment = getTileEnvironment(playerTileX, playerTileY);
  const inWater = currentEnvironment?.type === 'water_puddle';
  const inLava = currentEnvironment?.type === 'lava_pool';
  const effectTime = performance.now();

  ctx.save();
  ctx.translate(centerX, centerY + bounceY);

  // Legs & Boots
  const leftLegX = -6;
  const rightLegX = 1;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(leftLegX, 10 + legOffset, 5, 10);
  ctx.fillRect(rightLegX, 10 - legOffset, 5, 10);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(leftLegX + 1, 10 + legOffset, 3, 7);
  ctx.fillRect(rightLegX + 1, 10 - legOffset, 3, 7);
  ctx.fillStyle = '#020617';
  ctx.fillRect(leftLegX - 1, 17 + legOffset, 6, 4);
  ctx.fillRect(rightLegX - 1, 17 - legOffset, 6, 4);

  // Torso / Lab coat
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-11, -13, 22, 25);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-10, -12, 20, 23);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(-10, -12, 3, 23);
  ctx.fillRect(7, -12, 3, 23);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-4, -12, 8, 15);

  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(player.facingRight ? 3 : -6, -8, 4, 5);
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(player.facingRight ? 4 : -5, -6, 2, 1);

  // Head & Hair
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-9, -27, 18, 15);
  ctx.fillStyle = '#fbe4d8';
  ctx.fillRect(-8, -26, 16, 13);
  ctx.fillStyle = '#334155';
  ctx.fillRect(-10, -30, 20, 7);
  ctx.fillStyle = '#475569';
  ctx.fillRect(-8, -29, 16, 4);

  // Glasses
  ctx.fillStyle = '#0f172a';
  if (player.facingRight) {
    ctx.fillRect(0, -22, 8, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(2, -20, 5, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(5, -20, 1, 1);
  } else {
    ctx.fillRect(-8, -22, 8, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-7, -20, 5, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -20, 1, 1);
  }

  ctx.restore();

  // Arm & Sword
  ctx.save();
  const shoulderX = player.facingRight ? centerX + 4 : centerX - 4;
  const shoulderY = centerY - 2 + bounceY;
  ctx.translate(shoulderX, shoulderY);
  let swordAngle = aimAngle;
  if (player.isAttacking) {
    const progress = 1 - player.slashTimer / 150;
    const easedProgress = 1 - (1 - progress) * (1 - progress);
    swordAngle += -Math.PI / 4 + easedProgress * (Math.PI / 2);
  }
  ctx.rotate(swordAngle);

  if (player.isAttacking) {
    const progress = 1 - player.slashTimer / 150;
    ctx.strokeStyle = `rgba(125, 249, 255, ${0.9 * (1 - progress * 0.45)})`;
    ctx.lineWidth = 5 - progress * 2;
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(0, 0, 57, -0.7, 0.7);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-1, -4, 14, 8);
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(0, -3, 12, 6);
  ctx.fillStyle = '#fbe4d8';
  ctx.fillRect(11, -2, 4, 4);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(15, -6, 5, 12);
  ctx.fillStyle = '#334155';
  ctx.fillRect(16, -5, 3, 10);

  const pulse = Math.sin(performance.now() / 150) * 0.3 + 0.7;
  ctx.fillStyle = `rgba(74, 222, 128, ${pulse})`;
  ctx.fillRect(17, -2, 2, 4);

  ctx.fillStyle = '#0284c7';
  ctx.fillRect(20, -4, 30, 8);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(21, -3, 28, 6);
  ctx.fillStyle = '#f0fdf4';
  ctx.fillRect(23, -1, 24, 2);

  ctx.restore();

  // Draw liquid effects last so they sit visibly in front of the player.
  if (inWater || inLava) {
    ctx.save();
    ctx.translate(centerX, centerY + bounceY);

    if (inWater) {
      for (let i = 0; i < 6; i++) {
        const phase = effectTime / 240 + i * (Math.PI * 2 / 6);
        const rise = (Math.sin(phase) + 1) / 2;
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * (7 + rise * 11) + Math.sin(phase * 1.7) * 2;
        const y = 19 - rise * 25;
        const radius = 1.5 + rise * 1.2;
        ctx.fillStyle = `rgba(125, 211, 252, ${0.45 + rise * 0.5})`;
        ctx.beginPath();
        ctx.ellipse(x, y, radius * 0.75, radius * 1.35, side * -0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (inLava) {
      for (let i = 0; i < 7; i++) {
        const phase = effectTime / 110 + i * 1.7;
        const x = Math.sin(phase) * 11 + ((i % 3) - 1) * 3;
        const height = 7 + (Math.sin(phase * 1.4) + 1) * 4;
        const y = 9 - (i % 3) * 9;
        ctx.fillStyle = i % 2 ? 'rgba(249, 115, 22, 0.85)' : 'rgba(253, 224, 71, 0.9)';
        ctx.beginPath();
        ctx.moveTo(x - 3, y + 5);
        ctx.quadraticCurveTo(x - 4, y - height * 0.4, x + Math.sin(phase) * 2, y - height);
        ctx.quadraticCurveTo(x + 4, y - height * 0.3, x + 3, y + 5);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();
  }
}
