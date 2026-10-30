import { CONFIG } from '../config.js';
import { getBiomeAtDistance, getTileEnvironment, collectedCrystals } from './generation.js';
import { drawOrganicLiquid, drawUnclippedBlackHoles } from './hazards.js';
import { collidesWithShop, drawShop, isInsideShopSector } from './shop.js';
import { drawHubTrophy } from './hubTrophy.js';

export { checkHazards } from './hazards.js';
export { collectedCrystals };
export { getBiomeAtDistance } from './generation.js';

export function getBiomeAtPosition(worldX, worldY) {
  if (isInsideShopSector(worldX, worldY)) {
    return {
      name: '',
      tiles: { primary: '#394047', alt: '#30373e' },
      crystal: { color: '#cbd5e1', value: 0 }
    };
  }
  return getBiomeAtDistance(Math.hypot(worldX, worldY));
}

function drawBiomeRock(ctx, cx, cy, radius, biome) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + radius * 0.4, radius * 0.9, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = biome.rock.base;
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.8, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.6, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.3, cy - radius * 0.8);
  ctx.lineTo(cx + radius * 0.9, cy - radius * 0.2);
  ctx.lineTo(cx + radius * 0.7, cy + radius * 0.7);
  ctx.lineTo(cx - radius * 0.4, cy + radius * 0.8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = biome.rock.highlight;
  ctx.beginPath();
  ctx.moveTo(cx - radius * 0.8, cy + radius * 0.2);
  ctx.lineTo(cx - radius * 0.6, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.3, cy - radius * 0.8);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = biome.rock.detail;
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

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius * 0.7);
  ctx.lineTo(cx + radius * 0.2, cy - radius * 0.2);
  ctx.lineTo(cx, cy + radius * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function drawWorld(ctx, canvas, player, time) {
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

      const worldX = tx * CONFIG.tileSize;
      const worldY = ty * CONFIG.tileSize;
      const biome = getBiomeAtPosition(worldX, worldY);

      const isAlt = Math.abs(tx + ty) % 2 === 0;
      ctx.fillStyle = isAlt ? biome.tiles.primary : biome.tiles.alt;
      ctx.fillRect(sx, sy, CONFIG.tileSize, CONFIG.tileSize);

      const env = getTileEnvironment(tx, ty);
      if (env) {
        const cx = sx + CONFIG.tileSize / 2;
        const cy = sy + CONFIG.tileSize / 2;

        if (env.type === 'water_puddle' || env.type === 'lava_pool') {
          drawOrganicLiquid(ctx, sx, sy, env, time, worldX, worldY);
        } else if (env.type === 'rock_large' || env.type === 'rock_small') {
          drawBiomeRock(ctx, cx, cy, env.radius, env.biome);
        } else if (env.type === 'crystal') {
          if (!collectedCrystals.has(`${tx},${ty}`)) {
            drawCrystal(ctx, cx, cy, env.radius, env.color);
          }
        }
      }
    }
  }

  drawShop(ctx, player);
  drawHubTrophy(ctx, player);
  drawUnclippedBlackHoles(ctx, canvas, player, time);
}

export function checkCollision(x, y, radius) {
  if (collidesWithShop(x, y, radius)) return true;

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
