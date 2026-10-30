import { CONFIG } from '../config.js';
import { getTileEnvironment, isBlackHoleTile } from './generation.js';

export function drawOrganicLiquid(ctx, sx, sy, env, time, worldX, worldY) {
  ctx.save();
  const sz = CONFIG.tileSize;

  if (env.type === 'water_puddle') {
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(sx, sy, sz, sz);

    ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
    ctx.lineWidth = 2;
    
    const waveOffset = Math.sin(time / 300 + worldX * 0.05 + worldY * 0.05) * 6;
    ctx.beginPath();
    ctx.moveTo(sx + 4, sy + sz * 0.5 + waveOffset);
    ctx.quadraticCurveTo(sx + sz * 0.5, sy + sz * 0.3 + waveOffset, sx + sz - 4, sy + sz * 0.5 + waveOffset);
    ctx.stroke();

    if (env.edgeDistance < 22) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fillRect(sx, sy, sz, sz);
    }
  } else if (env.type === 'lava_pool') {
    const pulse = Math.sin(time / 250 + worldX * 0.1) * 0.15 + 0.85;

    ctx.fillStyle = '#ea580c';
    ctx.fillRect(sx, sy, sz, sz);

    ctx.fillStyle = `rgba(249, 115, 22, ${0.75 * pulse})`;
    ctx.fillRect(sx + 4, sy + 4, sz - 8, sz - 8);

    if (env.edgeDistance < 25) {
      ctx.strokeStyle = '#7c2d12';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx, sy, sz, sz);
    }
  }

  ctx.restore();
}

export function drawUnclippedBlackHoles(ctx, canvas, player, time) {
  const startX = Math.floor(player.cameraX / CONFIG.tileSize) - 3;
  const endX = startX + Math.ceil(canvas.width / CONFIG.tileSize) + 6;
  const startY = Math.floor(player.cameraY / CONFIG.tileSize) - 3;
  const endY = startY + Math.ceil(canvas.height / CONFIG.tileSize) + 6;

  for (let tx = startX; tx < endX; tx++) {
    for (let ty = startY; ty < endY; ty++) {
      const worldX = tx * CONFIG.tileSize;
      const worldY = ty * CONFIG.tileSize;
      if (isBlackHoleTile(tx, ty)) {
        const baseCx = worldX + CONFIG.tileSize / 2;
        const baseCy = worldY + CONFIG.tileSize / 2;

        const driftX = Math.sin(time / 2500 + tx) * 15;
        const driftY = Math.cos(time / 2500 + ty) * 15;
        const cx = baseCx + driftX - player.cameraX;
        const cy = baseCy + driftY - player.cameraY;

        const scaleFactor = 0.5 + 0.5 * Math.sin(time / 1500 + tx);
        const currentRadius = 48 * scaleFactor;

        ctx.save();
        ctx.fillStyle = `rgba(192, 132, 252, ${0.12 + 0.18 * scaleFactor})`;
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius + 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#581c87';
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(cx, cy, currentRadius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

export function checkHazards(playerX, playerY, time) {
  const tileX = Math.floor(playerX / CONFIG.tileSize);
  const tileY = Math.floor(playerY / CONFIG.tileSize);

  let speedMultiplier = 1.0;
  let takeDamage = false;
  let pullVelocity = { x: 0, y: 0 };

  const currentTileEnv = getTileEnvironment(tileX, tileY);
  if (currentTileEnv) {
    if (currentTileEnv.type === 'water_puddle') {
      speedMultiplier = 0.6;
    } else if (currentTileEnv.type === 'lava_pool') {
      speedMultiplier = 0.4;
      takeDamage = true;
    }
  }

  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      if (isBlackHoleTile(tx, ty)) {
        const worldX = tx * CONFIG.tileSize;
        const worldY = ty * CONFIG.tileSize;
        const hazardX = worldX + CONFIG.tileSize / 2 + Math.sin(time / 2500 + tx) * 15;
        const hazardY = worldY + CONFIG.tileSize / 2 + Math.cos(time / 2500 + ty) * 15;

        const dist = Math.hypot(hazardX - playerX, hazardY - playerY);
        const scaleFactor = 0.5 + 0.5 * Math.sin(time / 1500 + tx);
        const pullRadius = 180 * scaleFactor;

        if (dist < pullRadius && dist > 10) {
          const force = (1 - dist / pullRadius) * 220 * scaleFactor;
          const angle = Math.atan2(hazardY - playerY, hazardX - playerX);
          pullVelocity.x += Math.cos(angle) * force;
          pullVelocity.y += Math.sin(angle) * force;
        }
      }
    }
  }

  return { speedMultiplier, takeDamage, pullVelocity };
}
