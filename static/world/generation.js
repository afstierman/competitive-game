import { CONFIG } from '../config.js';

export const collectedCrystals = new Set();

export function getBiomeAtDistance(dist) {
  return CONFIG.biomes.find(b => dist < b.maxDistance) || CONFIG.biomes[CONFIG.biomes.length - 1];
}

function pseudoRandom(x, y) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export function isBlackHoleTile(tx, ty) {
  const worldX = tx * CONFIG.tileSize;
  const worldY = ty * CONFIG.tileSize;
  const distFromCenter = Math.hypot(worldX, worldY);
  const biome = getBiomeAtDistance(distFromCenter);
  if (biome.name !== 'Void Nebula') return false;

  const distToInner = distFromCenter - 3200;
  const distToOuter = 5000 - distFromCenter;
  return pseudoRandom(tx, ty) > 0.994 && distToInner > 250 && distToOuter > 250;
}

export function getLiquidPoolData(worldX, worldY, biomeName) {
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

  if (isBlackHoleTile(tx, ty)) {
    return { type: 'void_pit', radius: 48 };
  }

  if (val > 1 - CONFIG.world.rockDensity) {
    const isLarge = val > (1 - CONFIG.world.rockDensity * 0.4);
    return {
      type: isLarge ? 'rock_large' : 'rock_small',
      radius: isLarge ? 14 : 9,
      biome
    };
  }

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
