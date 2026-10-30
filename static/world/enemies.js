import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';
import { damageCrabs, resetCrabs, updateCrabs, drawCrabs } from './enemies/crab.js';
import { damageComputerViruses, resetComputerViruses, updateComputerViruses, drawComputerViruses } from './enemies/computerVirus.js';
import { damageSkeletons, resetSkeletons, updateSkeletons, drawSkeletons } from './enemies/skeleton.js';
import { damageMagmaSlugs, resetMagmaSlugs, updateMagmaSlugs, drawMagmaSlugs } from './enemies/magmaSlug.js';

export function resetEnemies() {
  resetComputerBugs();
  resetOctopuses();
  resetCrabs();
  resetComputerViruses();
  resetSkeletons();
  resetMagmaSlugs();
}

export function updateEnemies(player, dt, time, canvas, onDeath) {
  player.enemyDamageCooldown = Math.max(0, (player.enemyDamageCooldown || 0) - dt);

  let swingAngle = null;
  if (player.isAttacking && player.slashTimer > 0) {
    const progress = 1 - player.slashTimer / 150;
    const easedProgress = 1 - (1 - progress) * (1 - progress);
    swingAngle = player.aimAngle - Math.PI / 4 + easedProgress * (Math.PI / 2);
    damageComputerBugs(player, swingAngle);
    damageOctopuses(player, swingAngle);
    damageCrabs(player, swingAngle);
    damageComputerViruses(player, swingAngle);
    damageSkeletons(player, swingAngle);
    damageMagmaSlugs(player, swingAngle);
  }

  if (!updateComputerBugs(player, dt, onDeath)) return;
  if (!updateOctopuses(player, dt, canvas, onDeath)) return;
  if (!updateCrabs(player, dt, onDeath)) return;
  if (!updateComputerViruses(player, dt, onDeath)) return;
  if (!updateSkeletons(player, dt, canvas, onDeath)) return;
  updateMagmaSlugs(player, dt, onDeath);
}

export function drawEnemies(ctx, player, canvas, time) {
  drawComputerBugs(ctx, player, canvas, time);
  drawOctopuses(ctx, player, canvas, time);
  drawCrabs(ctx, player, canvas, time);
  drawComputerViruses(ctx, player, canvas, time);
  drawSkeletons(ctx, player, canvas, time);
  drawMagmaSlugs(ctx, player, canvas, time);
}