import { CONFIG } from './config.js';

export const collectedCrystals = new Set();

export function getBiomeAtDistance(dist) {
  return CONFIG.biomes.find(b => dist < b.maxDistance) || CONFIG.biomes[CONFIG.biomes.length - 1];
}

function pseudoRandom(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function getLiquidPoolData(worldX, worldY, biomeName) {
  const spacing = biomeName === 'Sunken Abyss' ? 500 : 600; 
  const baseRadius = biomeName === 'Sunken Abyss' ? 200 : 240;

  const cellX = Math.floor(worldX / spacing);
  const cellY = Math.floor(worldY / spacing);

  let closestDist = Infinity;
  let poolSeed = 0;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cx = cellX + dx;
      const cy = cellY + dy;
      
      const randX = (pseudoRandom(cx, cy) - 0.5) * (spacing * 0.6);
      const randY = (pseudoRandom(cy, cx) - 0.5) * (spacing * 0.6);
      
      const centerX = (cx + 0.5) * spacing + randX;
      const centerY = (cy + 0.5) * spacing + randY;

      const dist = Math.hypot(worldX - centerX, worldY - centerY);
      if (dist < closestDist) {
        closestDist = dist;
        poolSeed = pseudoRandom(cx, cy);
      }
    }
  }

  const angle = Math.atan2(worldY, worldX);
  const wobble = Math.sin(angle * 3 + poolSeed * 15) * 35 
               + Math.cos(angle * 7 - poolSeed * 8) * 18;
               
  const effectiveRadius = baseRadius + wobble;
  const currentDistFromCenter = Math.hypot(worldX, worldY);
  let boundaryBuffer = 1.0;
  
  if (biomeName === 'Sunken Abyss') {
    const distToInner = currentDistFromCenter - 1500;
    const distToOuter = 3200 - currentDistFromCenter;
    if (distToInner < 120) boundaryBuffer = Math.max(0.2, distToInner / 120);
    if (distToOuter < 120) boundaryBuffer = Math.max(0.2, distToOuter / 120);
  } else if (biomeName === 'Infernal Kernel') {
    const distToInner = currentDistFromCenter - 5000;
    if (distToInner < 150) boundaryBuffer = Math.max(0.2, distToInner / 150);
  }

  const finalRadius = effectiveRadius * boundaryBuffer;

  if (closestDist < finalRadius) {
    return { inside: true, distToEdge: finalRadius - closestDist };
  }
  return { inside: false, distToEdge: 0 };
}

export function getTileEnvironment(tx, ty) {
  if (Math.abs(tx) < CONFIG.world.hubSafeZoneTiles && Math.abs(ty) < CONFIG.world.hubSafeZoneTiles) {
    return null;
  }

  const worldX = tx * CONFIG.tileSize;
  const worldY = ty * CONFIG.tileSize;
  const distFromCenter = Math.hypot(worldX, worldY);
  const biome = getBiomeAtDistance(distFromCenter);

  const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
  const val = n - Math.floor(n);

  // 1. Liquid Pool Exclusion Zone
  let inLiquidPool = false;
  let poolEdgeDist = 0;
  if (biome.name === 'Sunken Abyss') {
    const pool = getLiquidPoolData(worldX, worldY, 'Sunken Abyss');
    if (pool.inside) {
      inLiquidPool = true;
      poolEdgeDist = pool.distToEdge;
    }
  } else if (biome.name === 'Infernal Kernel') {
    const pool = getLiquidPoolData(worldX, worldY, 'Infernal Kernel');
    if (pool.inside) {
      inLiquidPool = true;
      poolEdgeDist = pool.distToEdge;
    }
  }

  if (inLiquidPool) {
    return { 
      type: biome.name === 'Sunken Abyss' ? 'water_puddle' : 'lava_pool', 
      edgeDistance: poolEdgeDist 
    };
  }

  // 2. Void Nebula Black Holes (Less frequent: val > 0.994)
  if (biome.name === 'Void Nebula' && val > 0.994) {
    const distToInner = distFromCenter - 3200;
    const distToOuter = 5000 - distFromCenter;
    if (distToInner > 250 && distToOuter > 250) {
      return { type: 'void_pit', radius: 48 }; // Doubled base radius (approx 2x diameter)
    }
  }

  // 3. Obstacle Rocks
  if (val > 1 - CONFIG.world.rockDensity) {
    const isLarge = val > (1 - CONFIG.world.rockDensity * 0.4);
    return {
      type: isLarge ? 'rock_large' : 'rock_small',
      radius: isLarge ? 14 : 9,
      biome
    };
  }

  // 4. Rare Crystals
  if (val < CONFIG.world.crystalDensity) {
    return {
      type: 'crystal',
      radius: 7,
      value: biome.crystal.value,
      color: biome.crystal.color,
      tx,
      ty
    };
  }

  return null;
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

function drawOrganicLiquid(ctx, sx, sy, env, time, worldX, worldY) {
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

// Render un-clipped massive black holes in world space
function drawUnclippedBlackHoles(ctx, canvas, player, time) {
  const startX = Math.floor(player.cameraX / CONFIG.tileSize) - 3;
  const endX = startX + Math.ceil(canvas.width / CONFIG.tileSize) + 6;
  const startY = Math.floor(player.cameraY / CONFIG.tileSize) - 3;
  const endY = startY + Math.ceil(canvas.height / CONFIG.tileSize) + 6;

  for (let tx = startX; tx < endX; tx++) {
    for (let ty = startY; ty < endY; ty++) {
      const worldX = tx * CONFIG.tileSize;
      const worldY = ty * CONFIG.tileSize;
      const distFromCenter = Math.hypot(worldX, worldY);
      const biome = getBiomeAtDistance(distFromCenter);

      if (biome.name === 'Void Nebula') {
        const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
        const val = n - Math.floor(n);
        if (val > 0.994) {
          const distToInner = distFromCenter - 3200;
          const distToOuter = 5000 - distFromCenter;
          if (distToInner > 250 && distToOuter > 250) {
            const baseCx = worldX + CONFIG.tileSize / 2;
            const baseCy = worldY + CONFIG.tileSize / 2;
            
            const driftX = Math.sin(time / 2500 + tx) * 15;
            const driftY = Math.cos(time / 2500 + ty) * 15;
            const cx = baseCx + driftX - player.cameraX;
            const cy = baseCy + driftY - player.cameraY;

            // Slow pulse scaling from small to big to small (base radius 48)
            const scaleFactor = 0.5 + 0.5 * Math.sin(time / 1500 + tx);
            const currentRadius = 48 * scaleFactor;

            ctx.save();
            // Expanded accretion glow
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
  }
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
      const distFromCenter = Math.hypot(worldX, worldY);
      const biome = getBiomeAtDistance(distFromCenter);

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

  drawUnclippedBlackHoles(ctx, canvas, player, time);
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

  // Check nearby black hole pull scaled to larger diameter
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const tx = tileX + dx;
      const ty = tileY + dy;
      const worldX = tx * CONFIG.tileSize;
      const worldY = ty * CONFIG.tileSize;
      const distFromCenter = Math.hypot(worldX, worldY);
      const biome = getBiomeAtDistance(distFromCenter);

      if (biome.name === 'Void Nebula') {
        const n = Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453;
        const val = n - Math.floor(n);
        if (val > 0.994) {
          const hazardX = worldX + CONFIG.tileSize / 2 + Math.sin(time / 2500 + tx) * 15;
          const hazardY = worldY + CONFIG.tileSize / 2 + Math.cos(time / 2500 + ty) * 15;
          
          const dist = Math.hypot(hazardX - playerX, hazardY - playerY);
          const scaleFactor = 0.5 + 0.5 * Math.sin(time / 1500 + tx);
          const pullRadius = 180 * scaleFactor; // Larger pull radius matching doubled size

          if (dist < pullRadius && dist > 10) {
            const force = (1 - dist / pullRadius) * 220 * scaleFactor;
            const angle = Math.atan2(hazardY - playerY, hazardX - playerX);
            pullVelocity.x += Math.cos(angle) * force;
            pullVelocity.y += Math.sin(angle) * force;
          }
        }
      }
    }
  }

  return { speedMultiplier, takeDamage, pullVelocity };
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