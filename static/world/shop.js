import { CONFIG } from '../config.js';

export const SHOP_LOCATION = { x: 0, y: -144 };
export const SHOP_INTERACT_RADIUS = 110;
export const SHOP_SECTOR_RADIUS = 245;
const SHOP_COLLISION_BOUNDS = { left: -61, right: 61, top: -50, bottom: 54 };

export function isNearShop(x, y) {
  return Math.hypot(x - SHOP_LOCATION.x, y - SHOP_LOCATION.y) <= SHOP_INTERACT_RADIUS;
}

export function isInsideShopSector(x, y) {
  return Math.hypot(x - SHOP_LOCATION.x, y - SHOP_LOCATION.y) <= SHOP_SECTOR_RADIUS;
}

export function collidesWithShop(x, y, radius) {
  const localX = x - SHOP_LOCATION.x;
  const localY = y - SHOP_LOCATION.y;
  const closestX = Math.max(SHOP_COLLISION_BOUNDS.left, Math.min(localX, SHOP_COLLISION_BOUNDS.right));
  const closestY = Math.max(SHOP_COLLISION_BOUNDS.top, Math.min(localY, SHOP_COLLISION_BOUNDS.bottom));
  return Math.hypot(localX - closestX, localY - closestY) < radius;
}

export function drawShop(ctx, player) {
  const x = SHOP_LOCATION.x - player.cameraX;
  const y = SHOP_LOCATION.y - player.cameraY;
  const tileSize = CONFIG.tileSize;

  ctx.save();
  ctx.translate(x, y);

  // Warm lantern glow and a small wooden storefront.
  ctx.fillStyle = 'rgba(250, 204, 21, 0.12)';
  ctx.beginPath();
  ctx.ellipse(0, 14, 76, 48, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#78350f';
  ctx.fillRect(-tileSize * 1.5, -tileSize * 0.35, tileSize * 3, tileSize * 1.7);
  ctx.fillStyle = '#a16207';
  ctx.fillRect(-tileSize * 1.35, -tileSize * 0.2, tileSize * 2.7, tileSize * 0.18);

  ctx.fillStyle = '#365314';
  ctx.beginPath();
  ctx.moveTo(-tileSize * 1.9, -tileSize * 0.35);
  ctx.lineTo(0, -tileSize * 1.55);
  ctx.lineTo(tileSize * 1.9, -tileSize * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4d7c0f';
  ctx.beginPath();
  ctx.moveTo(-tileSize * 1.45, -tileSize * 0.42);
  ctx.lineTo(0, -tileSize * 1.35);
  ctx.lineTo(tileSize * 1.45, -tileSize * 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-tileSize * 1.12, -tileSize * 0.05, tileSize * 0.62, tileSize * 0.58);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(-tileSize * 1.02, tileSize * 0.02, tileSize * 0.42, tileSize * 0.44);
  ctx.fillStyle = '#451a03';
  ctx.fillRect(tileSize * 0.42, -tileSize * 0.08, tileSize * 0.72, tileSize * 1.43);
  ctx.fillStyle = '#facc15';
  ctx.beginPath();
  ctx.arc(tileSize * 0.98, tileSize * 0.67, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(-tileSize * 0.92, -tileSize * 1.14, tileSize * 1.84, tileSize * 0.38);
  ctx.fillStyle = '#365314';
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HUB SHOP', 0, -tileSize * 0.95);

  ctx.restore();
}
