import { CONFIG } from '../../config.js';
import { findOpenPosition } from '../world.js';
import { getSkeletonKills } from './skeleton.js';
import { getMagmaSlugKills } from './magmaSlug.js';

const REQUIRED_KILLS = 5;
const EGG_HEALTH = 8;
const INNER_RADIUS = CONFIG.biomes[2].maxDistance;
let egg = null;
let hasSpawnedEgg = false;
let nextId = 1;

export function resetInfernalBossEgg() {
  egg = null;
  hasSpawnedEgg = false;
  nextId = 1;
}

export function damageInfernalBossEgg(player, swingAngle, onSummonBoss) {
  if (!egg || egg.hp <= 0 || player.attackHitEnemies.has(egg.id)) return;
  const dx = egg.x - player.x;
  const dy = egg.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 18 || distance > 78) return;

  if (player.activeWeapon === 'slingshot') {
    if (!player.slingshotShotActive || distance > player.slingshotShotRange) return;
    const angle = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(angle - player.slingshotShotAngle), Math.cos(angle - player.slingshotShotAngle));
    if (Math.abs(difference) > 0.055) return;
    player.slingshotShotActive = false;
    egg.hp -= player.slingshotDamage;
  } else {
    if (swingAngle === null) return;
    const angle = Math.atan2(dy, dx);
    const difference = Math.atan2(Math.sin(angle - swingAngle), Math.cos(angle - swingAngle));
    if (Math.abs(difference) > 0.34) return;
    egg.hp -= player.swordDamage;
  }

  player.attackHitEnemies.add(egg.id);
  if (egg.hp <= 0) {
    const defeatedEgg = egg;
    egg = null;
    player.cycles += 10;
    if (typeof onSummonBoss === 'function') onSummonBoss(defeatedEgg.x, defeatedEgg.y, player);
    else window.dispatchEvent(new CustomEvent('infernal-boss-summoned', { detail: { x: defeatedEgg.x, y: defeatedEgg.y } }));
  }
}

export function updateInfernalBossEgg(player) {
  if (egg || hasSpawnedEgg || Math.hypot(player.x, player.y) <= INNER_RADIUS
    || getSkeletonKills() < REQUIRED_KILLS || getMagmaSlugKills() < REQUIRED_KILLS) return;

  const angle = Math.random() * Math.PI * 2;
  const spawn = findOpenPosition(player.x + Math.cos(angle) * 100, player.y + Math.sin(angle) * 100, CONFIG.playerRadius);
  egg = {
    id: `infernal-boss-egg-${nextId++}`,
    x: spawn.x,
    y: spawn.y,
    hp: EGG_HEALTH,
    maxHp: EGG_HEALTH
  };
  hasSpawnedEgg = true;
}

export function drawInfernalBossEgg(ctx, player, time) {
  if (!egg) return;
  const x = egg.x - player.cameraX;
  const y = egg.y - player.cameraY;
  const bob = Math.sin(time / 210) * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .45)';
  ctx.beginPath(); ctx.ellipse(x, y + 20, 25, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 18;
  ctx.fillStyle = '#7f1d1d';
  ctx.beginPath(); ctx.ellipse(x, y + bob, 21, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath(); ctx.ellipse(x, y + bob, 15, 21, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.ellipse(x - 4, y - 5 + bob, 5, 9, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff7ed';
  ctx.fillRect(x + 3, y - 5 + bob, 4, 7);
  if (egg.hp < egg.maxHp) {
    ctx.fillStyle = '#1f2937'; ctx.fillRect(x - 20, y - 35, 40, 4);
    ctx.fillStyle = '#fb923c'; ctx.fillRect(x - 20, y - 35, 40 * egg.hp / egg.maxHp, 4);
  }
  ctx.restore();
}
