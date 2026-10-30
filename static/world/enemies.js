import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';
import { damageCrabs, resetCrabs, updateCrabs, drawCrabs } from './enemies/crab.js';
import { damageComputerViruses, resetComputerViruses, updateComputerViruses, drawComputerViruses } from './enemies/computerVirus.js';
import { damageMalwareWorms, resetMalwareWorms, updateMalwareWorms, drawMalwareWorms } from './enemies/malwareWorm.js';
import { damageSkeletons, resetSkeletons, updateSkeletons, drawSkeletons } from './enemies/skeleton.js';
import { damageMagmaSlugs, resetMagmaSlugs, updateMagmaSlugs, drawMagmaSlugs } from './enemies/magmaSlug.js';
import { damageOvergrowthBossEgg, drawOvergrowthBossEgg, resetOvergrowthBossEgg, updateOvergrowthBossEgg } from './enemies/overgrowthBossEgg.js';
import { damageOvergrowthBoss, drawOvergrowthBoss, isOvergrowthBossActive, resetOvergrowthBoss, startOvergrowthBoss, updateOvergrowthBoss } from './enemies/overgrowthBoss.js';

function getSwingAngle(player) {
  const progress = 1 - player.slashTimer / 150;
  const easedProgress = 1 - (1 - progress) * (1 - progress);
  return player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2);
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
  resetOvergrowthBoss();
}

export function updateEnemies(player, dt, time, canvas, onDeath, onBossSummon) {
  player.enemyDamageCooldown = Math.max(0, (player.enemyDamageCooldown || 0) - dt);
  const summonBoss = onBossSummon || ((x, y, targetPlayer) => startOvergrowthBoss(x, y, targetPlayer, canvas));

  // Keep regular mobs paused during the boss encounter, while still allowing
  // the player's attacks to land on the boss.
  if (isOvergrowthBossActive()) {
    if (player.isAttacking && player.slashTimer > 0) {
      damageOvergrowthBoss(player, getSwingAngle(player));
    }
    if (player.activeWeapon === 'slingshot' && player.slingshotShotActive) {
      damageOvergrowthBoss(player, null);
    }
    updateOvergrowthBoss(player, dt, canvas, onDeath);
    return true;
  }

  updateOvergrowthBossEgg(player);

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
  }

  // The egg may summon the boss during this update; pause regular mobs immediately.
  if (isOvergrowthBossActive()) return true;

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
  drawComputerBugs(ctx, player, canvas, time);
  drawOctopuses(ctx, player, canvas, time);
  drawCrabs(ctx, player, canvas, time);
  drawComputerViruses(ctx, player, canvas, time);
  drawMalwareWorms(ctx, player, canvas, time);
  drawSkeletons(ctx, player, canvas, time);
  drawMagmaSlugs(ctx, player, canvas, time);
  drawOvergrowthBossEgg(ctx, player, time);
}
