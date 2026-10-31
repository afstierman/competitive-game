import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';
import { damageCrabs, resetCrabs, updateCrabs, drawCrabs } from './enemies/crab.js';
import { damageComputerViruses, resetComputerViruses, updateComputerViruses, drawComputerViruses } from './enemies/computerVirus.js';
import { damageMalwareWorms, resetMalwareWorms, updateMalwareWorms, drawMalwareWorms } from './enemies/malwareWorm.js';
import { damageSkeletons, resetSkeletons, updateSkeletons, drawSkeletons } from './enemies/skeleton.js';
import { damageMagmaSlugs, resetMagmaSlugs, updateMagmaSlugs, drawMagmaSlugs } from './enemies/magmaSlug.js';
import { damageOvergrowthBossEgg, drawOvergrowthBossEgg, resetOvergrowthBossEgg, updateOvergrowthBossEgg } from './enemies/overgrowthBossEgg.js';
import { damageAbyssBossEgg, drawAbyssBossEgg, resetAbyssBossEgg, updateAbyssBossEgg } from './enemies/abyssBossEgg.js';
import { damageOvergrowthBoss, drawOvergrowthBoss, isOvergrowthBossActive, resetOvergrowthBoss, startOvergrowthBoss, updateOvergrowthBoss } from './enemies/overgrowthBoss.js';
import { damageAbyssBoss, drawAbyssBoss, isAbyssBossActive, resetAbyssBoss, startAbyssBoss, updateAbyssBoss } from './enemies/abyssBoss.js';

function getSwingAngle(player) {
  const progress = 1 - player.slashTimer / 150;
  const easedProgress = 1 - (1 - progress) * (1 - progress);
  return player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2);
}

// Call this from whatever triggers the Sunken Abyss boss
export function summonAbyssBoss(x, y, player, canvas) {
  if (isOvergrowthBossActive() || isAbyssBossActive()) return;
  startAbyssBoss(x, y, player, canvas);
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
  resetOvergrowthBoss();
  resetAbyssBoss();
}

// During a boss fight only that boss runs, but the player's attacks still have to reach it
function runBossFight(player, dt, canvas, onDeath, damageBoss, updateBoss) {
  if (player.isAttacking && player.slashTimer > 0) {
    damageBoss(player, getSwingAngle(player));
  }
  if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
    damageBoss(player, null);
  }
  updateBoss(player, dt, canvas, onDeath);
}

export function updateEnemies(player, dt, time, canvas, onDeath, onBossSummon) {
  player.enemyDamageCooldown = Math.max(0, (player.enemyDamageCooldown || 0) - dt);
  const summonBoss = onBossSummon || ((x, y, targetPlayer) => startOvergrowthBoss(x, y, targetPlayer, canvas));

  // Keep regular mobs paused during a boss encounter, while still allowing
  // the player's attacks to land on the boss.
  if (isOvergrowthBossActive()) {
    runBossFight(player, dt, canvas, onDeath, damageOvergrowthBoss, updateOvergrowthBoss);
    return true;
  }
  if (isAbyssBossActive()) {
    runBossFight(player, dt, canvas, onDeath, damageAbyssBoss, updateAbyssBoss);
    return true;
  }

  updateOvergrowthBossEgg(player);
  updateAbyssBossEgg(player);
  const summonAbyssBoss = (x, y, targetPlayer) => startAbyssBoss(x, y, targetPlayer, canvas);

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
    damageAbyssBossEgg(player, swingAngle, summonAbyssBoss);
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
    damageAbyssBossEgg(player, null, summonAbyssBoss);
  }

  // Check again after damage so the fifth crab or octopus kill spawns the egg immediately.
  updateAbyssBossEgg(player);

  // The egg may summon the boss during this update; pause regular mobs immediately.
  if (isOvergrowthBossActive() || isAbyssBossActive()) return true;

  if (!updateComputerBugs(player, dt, onDeath)) return;
  if (!updateOctopuses(player, dt, canvas, onDeath)) return;
  if (!updateCrabs(player, dt, onDeath)) return;
  if (!updateComputerViruses(player, dt, onDeath)) return;
  if (!updateMalwareWorms(player, dt, onDeath)) return;
  if (!updateSkeletons(player, dt, canvas, onDeath)) return;
  updateMagmaSlugs(player, dt, onDeath);
}

export function drawEnemies(ctx, player, canvas, time) {
  if (isOvergrowthBossActive()) {
    drawOvergrowthBoss(ctx, player, canvas, time);
    return;
  }
  if (isAbyssBossActive()) {
    drawAbyssBoss(ctx, player, canvas, time);
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
}
