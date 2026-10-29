import { CONFIG } from './config.js';

// Track collected crystal coordinates to prevent respawning: "tx,ty"
export const collectedCrystals = new Set();

export function getTileEnvironment(tx, ty) {
  // 1. Keep Central Hub clear around origin (0,0)
  if (Math.abs(tx) < CONFIG.world.hubSafeZoneTiles && Math.abs(ty) < CONFIG.world.hubSafeZoneTiles) {
    return null;
  }
  
  // Deterministic pseudo-random noise generator
  const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
  const val = n - Math.floor(n);

  // 2. Obstacle Rocks
  if (val > 1 - CONFIG.world.rockDensity) {
    const isLarge = val > (1 - CONFIG.world.rockDensity * 0.4);
    return { 
      type: isLarge ? 'rock_large' : 'rock_small', 
      radius: isLarge ? 14 : 9 
    };
  }
  
  // 3. Rare Crystals (Requires much more exploration)
  if (val < CONFIG.world.crystalDensity) {
    const worldX = tx * CONFIG.tileSize;
    const worldY = ty * CONFIG.tileSize;
    const distFromCenter = Math.hypot(worldX, worldY);
    
    // Select crystal tier based on distance thresholds in CONFIG
    const tier = CONFIG.crystals.tiers.find(t => distFromCenter < t.maxDistance) 
              || CONFIG.crystals.tiers[CONFIG.crystals.tiers.length - 1];

    return { 
      type: 'crystal', 
      radius: 7, 
      value: tier.value, 
      color: tier.color, 
      tx, 
      ty 
    };
  }
  
  return null;
}

function drawRealisticRock(ctx, cx, cy, radius) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.4, radius * 0.9, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.8, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.6, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.3, cy - radius * 0.8);
  ctx.lineTo(cx + radius * 0.9, cy - radius * 0.2);
  ctx.lineTo(cx + radius * 0.7, cy + radius * 0.7);
  ctx.lineTo(cx - radius * 0.4, cy + radius * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.8, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.6, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.3, cy - radius * 0.8);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx - radius * 0.3, cy - radius * 0.4, radius * 0.3, radius * 0.2);
  ctx.restore();
}

function drawCrystal(ctx, cx, cy, radius, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx + radius * 0.6, cy - radius * 0.3);
  ctx.lineTo(cx + radius * 0.4, cy + radius);
  ctx.lineTo(cx - radius * 0.4, cy + radius);
  ctx.lineTo(cx - radius * 0.6, cy - radius * 0.3);
  ctx.closePath();
  ctx.fill();

  // Inner sparkle highlight
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.2, cy - radius * 0.2);
  ctx.lineTo(cx, cy + radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawWorld(ctx, canvas, player) {
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startX = Math.floor(player.cameraX / CONFIG.tileSize) - 1;
  const endX = startX + Math.ceil(canvas.width / CONFIG.tileSize) + 2;
  const startY = Math.floor(player.cameraY / CONFIG.tileSize) - 1;
  const endY = startY + Math.ceil(canvas.height / CONFIG.tileSize) + 2;

  for (let tx = startX; tx < endX; tx++) {
    for (let ty = startY; ty < endY; ty++) {
      const sx = Math.floor(tx * CONFIG.tileSize - player.cameraX);
      const sy = Math.floor(ty * CONFIG.tileSize - player.cameraY);

      ctx.fillStyle = (Math.abs(tx + ty) % 2 === 0) ? '#0d131a' : '#090e13';
      ctx.fillRect(sx, sy, CONFIG.tileSize, CONFIG.tileSize);

      const env = getTileEnvironment(tx, ty);
      if (env) {
        const cx = sx + CONFIG.tileSize / 2;
        const cy = sy + CONFIG.tileSize / 2;
        
        if (env.type.startsWith('rock')) {
          drawRealisticRock(ctx, cx, cy, env.radius);
        } else if (env.type === 'crystal') {
          if (!collectedCrystals.has(`${tx},${ty}`)) {
            drawCrystal(ctx, cx, cy, env.radius, env.color);
          }
        }
      }
    }
  }
}

export function checkCollision(x, y, radius) {
  const tileX = Math.floor(x / CONFIG.tileSize);
  const tileY = Math.floor(y / CONFIG.tileSize);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const env = getTileEnvironment(tx, ty);

      if (env && env.type.startsWith('rock')) {
        const rockWorldX = tx * CONFIG.tileSize + CONFIG.tileSize / 2;
        const rockWorldY = ty * CONFIG.tileSize + CONFIG.tileSize / 2;
        const dist = Math.hypot(x - rockWorldX, y - rockWorldY);

        if (dist < radius + env.radius) return true;
      }
    }
  }
  return false;
}

export function checkCrystalCollection(playerX, playerY) {
  const tileX = Math.floor(playerX / CONFIG.tileSize);
  const tileY = Math.floor(playerY / CONFIG.tileSize);

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const key = `${tx},${ty}`;

      if (!collectedCrystals.has(key)) {
        const env = getTileEnvironment(tx, ty);
        if (env && env.type === 'crystal') {
          const crystalWorldX = tx * CONFIG.tileSize + CONFIG.tileSize / 2;
          const crystalWorldY = ty * CONFIG.tileSize + CONFIG.tileSize / 2;
          const dist = Math.hypot(playerX - crystalWorldX, playerY - crystalWorldY);

          if (dist < CONFIG.playerRadius + env.radius + 6) {
            collectedCrystals.add(key);
            return env.value;
          }
        }
      }
    }
  }
  return 0;
}