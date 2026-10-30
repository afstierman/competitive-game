import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';
import { damageCrabs, resetCrabs, updateCrabs, drawCrabs } from './enemies/crab.js';

export function resetEnemies() {
  resetComputerBugs();
  resetOctopuses();
  resetCrabs();
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
  }

  if (!updateComputerBugs(player, dt, onDeath)) return;
  if (!updateOctopuses(player, dt, canvas, onDeath)) return;
  updateCrabs(player, dt, onDeath);
}

export function drawEnemies(ctx, player, canvas, time) {
  drawComputerBugs(ctx, player, canvas, time);
  drawOctopuses(ctx, player, canvas, time);
  drawCrabs(ctx, player, canvas, time);
}