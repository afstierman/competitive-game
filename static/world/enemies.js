import { damageComputerBugs, resetComputerBugs, updateComputerBugs, drawComputerBugs } from './enemies/computerBug.js';
import { damageOctopuses, resetOctopuses, updateOctopuses, drawOctopuses } from './enemies/octopus.js';

export function resetEnemies() {
  resetComputerBugs();
  resetOctopuses();
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
  }

  if (!updateComputerBugs(player, dt, onDeath)) return;
  updateOctopuses(player, dt, canvas, onDeath);
}

export function drawEnemies(ctx, player, canvas, time) {
  drawComputerBugs(ctx, player, canvas, time);
  drawOctopuses(ctx, player, canvas, time);
}
