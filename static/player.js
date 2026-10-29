import { CONFIG } from './config.js';
import { checkCollision, checkCrystalCollection } from './world.js';

export function createPlayer() {
  return {
    x: 0,
    y: 0,
    speed: CONFIG.playerSpeed,
    hp: CONFIG.maxHp,
    cycles: 0, // Track currency/cycles from crystals
    facingRight: true,
    cameraX: 0,
    cameraY: 0,
    walkTimer: 0,
    isMoving: false
  };
}

export function updatePlayer(player, keys, dt, canvas) {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy -= 1;
  if (keys['s'] || keys['arrowdown']) dy += 1;
  if (keys['a'] || keys['arrowleft']) dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  player.isMoving = (dx !== 0 || dy !== 0);

  if (player.isMoving) {
    player.walkTimer += dt * 10;
    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }
  } else {
    player.walkTimer += dt * 3;
  }

  const moveDist = player.speed * dt;

  if (dx !== 0) {
    const nextX = player.x + dx * moveDist;
    if (!checkCollision(nextX, player.y, CONFIG.playerRadius)) {
      player.x = nextX;
    }
  }

  if (dy !== 0) {
    const nextY = player.y + dy * moveDist;
    if (!checkCollision(player.x, nextY, CONFIG.playerRadius)) {
      player.y = nextY;
    }
  }

  // Check if player walks over any crystals to collect them
  const earnedCycles = checkCrystalCollection(player.x, player.y);
  if (earnedCycles > 0) {
    player.cycles += earnedCycles;
  }

  player.cameraX = player.x - canvas.width / 2;
  player.cameraY = player.y - canvas.height / 2;
}

export function drawPlayer(ctx, player, mouse, canvas) {
  // (Player drawing code remains identical to previous version)
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const aimAngle = Math.atan2(mouse.y - centerY, mouse.x - centerX);

  player.facingRight = mouse.x >= centerX;

  const bounceY = player.isMoving ? Math.sin(player.walkTimer) * 2 : Math.sin(player.walkTimer) * 1;
  const legOffset = player.isMoving ? Math.sin(player.walkTimer) * 3 : 0;

  ctx.save();
  ctx.translate(centerX, centerY + bounceY);

  // Shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 12, 5, 0, 0, Math.PI * 2);
  ctx.fill();

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
  ctx.rotate(aimAngle);

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
}