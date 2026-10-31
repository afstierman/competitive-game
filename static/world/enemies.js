import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';
import { damageCrabs, resetCrabs, updateCrabs, drawCrabs } from './enemies/crab.js';
import { damageComputerViruses, resetComputerViruses, updateComputerViruses, drawComputerViruses } from './enemies/computerVirus.js';
import { damageMalwareWorms, resetMalwareWorms, updateMalwareWorms, drawMalwareWorms } from './enemies/malwareWorm.js';
import { damageSkeletons, resetSkeletons, updateSkeletons, drawSkeletons } from './enemies/skeleton.js';
import { damageMagmaSlugs, resetMagmaSlugs, updateMagmaSlugs, drawMagmaSlugs } from './enemies/magmaSlug.js';
import { damageOvergrowthBossEgg, drawOvergrowthBossEgg, resetOvergrowthBossEgg, updateOvergrowthBossEgg } from './enemies/overgrowthBossEgg.js';
import { damageAbyssBossEgg, drawAbyssBossEgg, resetAbyssBossEgg, updateAbyssBossEgg } from './enemies/abyssBossEgg.js';
import { damageVoidBossEgg, drawVoidBossEgg, resetVoidBossEgg, updateVoidBossEgg } from './enemies/voidBossEgg.js';
import { damageInfernalBossEgg, drawInfernalBossEgg, resetInfernalBossEgg, updateInfernalBossEgg } from './enemies/infernalBossEgg.js';
import { damageOvergrowthBoss, drawOvergrowthBoss, isOvergrowthBossActive, resetOvergrowthBoss, startOvergrowthBoss, updateOvergrowthBoss } from './enemies/overgrowthBoss.js';
import { damageAbyssBoss, drawAbyssBoss, isAbyssBossActive, resetAbyssBoss, startAbyssBoss, updateAbyssBoss } from './enemies/abyssBoss.js';
import { damageVoidBoss, drawVoidBoss, isVoidBossActive, resetVoidBoss, startVoidBoss, updateVoidBoss } from './enemies/voidBoss.js';
import { damageInfernalBoss, drawInfernalBoss, isInfernalBossActive, resetInfernalBoss, startInfernalBoss, updateInfernalBoss } from './enemies/infernalBoss.js';

// Every boss plugs in here. Only one can be active at a time.
const BOSSES = [
  { isActive: isOvergrowthBossActive, damage: damageOvergrowthBoss, update: updateOvergrowthBoss, draw: drawOvergrowthBoss },
  { isActive: isAbyssBossActive, damage: damageAbyssBoss, update: updateAbyssBoss, draw: drawAbyssBoss },
  { isActive: isVoidBossActive, damage: damageVoidBoss, update: updateVoidBoss, draw: drawVoidBoss },
  { isActive: isInfernalBossActive, damage: damageInfernalBoss, update: updateInfernalBoss, draw: drawInfernalBoss }
];

function getActiveBoss() {
  return BOSSES.find(entry => entry.isActive()) || null;
}

function getSwingAngle(player) {
  const progress = 1 - player.slashTimer / 150;
  const easedProgress = 1 - (1 - progress) * (1 - progress);
  return player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2);
}

// Call these from whatever triggers each boss. They refuse to start if a boss is already active.
export function summonAbyssBoss(x, y, player, canvas) {
  if (getActiveBoss()) return;
  startAbyssBoss(x, y, player, canvas);
}

export function summonVoidBoss(x, y, player, canvas) {
  if (getActiveBoss()) return;
  startVoidBoss(x, y, player, canvas);
}

export function summonInfernalBoss(x, y, player, canvas) {
  if (getActiveBoss()) return;
  startInfernalBoss(x, y, player, canvas);
}

export function resetEnemies() {
  resetComputerBugs();
  resetOctopuses();
  resetCrabs();
  resetComputerViruses();
  resetMalwareWorms();
  resetSkeletons();
  resetMagmaSlugs();
  resetOvergrowthBossEgg();
  resetAbyssBossEgg();
  resetVoidBossEgg();
  resetInfernalBossEgg();
  resetOvergrowthBoss();
  resetAbyssBoss();
  resetVoidBoss();
  resetInfernalBoss();
}

// During a boss fight only that boss runs, but the player's attacks still have to reach it
function runBossFight(entry, player, dt, canvas, onDeath) {
  if (player.isAttacking && player.slashTimer > 0) {
    entry.damage(player, getSwingAngle(player));
  }
  if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
    entry.damage(player, null);
  }
  entry.update(player, dt, canvas, onDeath);
}

export function updateEnemies(player, dt, time, canvas, onDeath, onBossSummon) {
  player.enemyDamageCooldown = Math.max(0, (player.enemyDamageCooldown || 0) - dt);
  const summonBoss = onBossSummon || ((x, y, targetPlayer) => startOvergrowthBoss(x, y, targetPlayer, canvas));

  // Keep regular mobs paused during a boss encounter
  const activeBoss = getActiveBoss();
  if (activeBoss) {
    runBossFight(activeBoss, player, dt, canvas, onDeath);
    return true;
  }

  updateOvergrowthBossEgg(player);
  updateAbyssBossEgg(player);
  updateVoidBossEgg(player);
  updateInfernalBossEgg(player);
  const summonAbyss = (x, y, targetPlayer) => startAbyssBoss(x, y, targetPlayer, canvas);
  const summonVoid = (x, y, targetPlayer) => startVoidBoss(x, y, targetPlayer, canvas);
  const summonInfernal = (x, y, targetPlayer) => startInfernalBoss(x, y, targetPlayer, canvas);

  let swingAngle = null;
  if (player.isAttacking && player.slashTimer > 0) {
    swingAngle = getSwingAngle(player);
    damageComputerBugs(player, swingAngle);
    damageOctopuses(player, swingAngle);
    damageCrabs(player, swingAngle);
    damageComputerViruses(player, swingAngle);
    damageMalwareWorms(player, swingAngle);
    damageSkeletons(player, swingAngle);
    damageMagmaSlugs(player, swingAngle);
    damageOvergrowthBossEgg(player, swingAngle, summonBoss);
    damageAbyssBossEgg(player, swingAngle, summonAbyss);
    damageVoidBossEgg(player, swingAngle, summonVoid);
    damageInfernalBossEgg(player, swingAngle, summonInfernal);
  }
  if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
    damageComputerBugs(player, null);
    damageOctopuses(player, null);
    damageCrabs(player, null);
    damageComputerViruses(player, null);
    damageMalwareWorms(player, null);
    damageSkeletons(player, null);
    damageMagmaSlugs(player, null);
    damageOvergrowthBossEgg(player, null, summonBoss);
    damageAbyssBossEgg(player, null, summonAbyss);
    damageVoidBossEgg(player, null, summonVoid);
    damageInfernalBossEgg(player, null, summonInfernal);
  }

  // Spawn each biome egg immediately when its kill requirements are met.
  updateAbyssBossEgg(player);
  updateVoidBossEgg(player);
  updateInfernalBossEgg(player);

  // The egg may summon a boss during this update; pause regular mobs immediately.
  if (getActiveBoss()) return true;

  if (!updateComputerBugs(player, dt, onDeath)) return;
  if (!updateOctopuses(player, dt, canvas, onDeath)) return;
  if (!updateCrabs(player, dt, onDeath)) return;
  if (!updateComputerViruses(player, dt, onDeath)) return;
  if (!updateMalwareWorms(player, dt, onDeath)) return;
  if (!updateSkeletons(player, dt, canvas, onDeath)) return;
  updateMagmaSlugs(player, dt, onDeath);
}

export function drawEnemies(ctx, player, canvas, time) {
  const activeBoss = getActiveBoss();
  if (activeBoss) {
    activeBoss.draw(ctx, player, canvas, time);
    return;
  }
  drawComputerBugs(ctx, player, canvas, time);
  drawOctopuses(ctx, player, canvas, time);
  drawCrabs(ctx, player, canvas, time);
  drawComputerViruses(ctx, player, canvas, time);
  drawMalwareWorms(ctx, player, canvas, time);
  drawSkeletons(ctx, player, canvas, time);
  drawMagmaSlugs(ctx, player, canvas, time);
  drawOvergrowthBossEgg(ctx, player, time);
  drawAbyssBossEgg(ctx, player, time);
  drawVoidBossEgg(ctx, player, time);
  drawInfernalBossEgg(ctx, player, time);
}
