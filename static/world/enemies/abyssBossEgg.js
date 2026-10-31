import { getCrabKills } from './crab.js';
import { getOctopusKills } from './octopus.js';

const REQUIRED_KILLS = 5;
const EGG_HEALTH = 5;
let egg = null;
let hasSpawnedEgg = false;
let nextId = 1;

export function resetAbyssBossEgg() {
  egg = null;
  hasSpawnedEgg = false;
  nextId = 1;
}

export function damageAbyssBossEgg(player, swingAngle, onSummonBoss) {
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
    else window.dispatchEvent(new CustomEvent('abyss-boss-summoned', { detail: { x: defeatedEgg.x, y: defeatedEgg.y } }));
  }
}

export function updateAbyssBossEgg(player) {
  if (egg || hasSpawnedEgg || getCrabKills() < REQUIRED_KILLS || getOctopusKills() < REQUIRED_KILLS) return;
  const angle = Math.random() * Math.PI * 2;
  egg = {
    id: `abyss-boss-egg-${nextId++}`,
    x: player.x + Math.cos(angle) * 100,
    y: player.y + Math.sin(angle) * 100,
    hp: EGG_HEALTH,
    maxHp: EGG_HEALTH
  };
  hasSpawnedEgg = true;
}

export function drawAbyssBossEgg(ctx, player, time) {
  if (!egg) return;
  const x = egg.x - player.cameraX;
  const y = egg.y - player.cameraY;
  const bob = Math.sin(time / 240) * 1.5;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, .35)';
  ctx.beginPath(); ctx.ellipse(x, y + 15, 22, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0c4a6e'; ctx.fillRect(x - 20, y + 7 + bob, 40, 5);
  ctx.fillStyle = '#0369a1'; ctx.fillRect(x - 25, y + 2 + bob, 9, 5); ctx.fillRect(x + 16, y + 2 + bob, 9, 5);
  ctx.fillStyle = '#164e63'; ctx.fillRect(x - 19, y + 11 + bob, 15, 3); ctx.fillRect(x + 5, y + 11 + bob, 17, 3);
  ctx.fillStyle = '#38bdf8'; ctx.fillRect(x - 12, y - 13 + bob, 24, 4); ctx.fillRect(x - 17, y - 9 + bob, 34, 15); ctx.fillRect(x - 12, y + 6 + bob, 24, 4);
  ctx.fillStyle = '#bae6fd'; ctx.fillRect(x - 10, y - 11 + bob, 15, 4); ctx.fillRect(x - 14, y - 7 + bob, 6, 7);
  ctx.fillStyle = '#0284c7'; ctx.fillRect(x + 9, y - 5 + bob, 7, 9); ctx.fillRect(x + 4, y + 4 + bob, 8, 3);
  ctx.fillStyle = '#e0f2fe'; ctx.fillRect(x - 3, y - 5 + bob, 6, 8); ctx.fillRect(x - 1, y - 8 + bob, 2, 3);
  if (egg.hp < egg.maxHp) {
    ctx.fillStyle = '#1f2937'; ctx.fillRect(x - 18, y - 23, 36, 4);
    ctx.fillStyle = '#38bdf8'; ctx.fillRect(x - 18, y - 23, 36 * egg.hp / egg.maxHp, 4);
  }
  ctx.restore();
}
