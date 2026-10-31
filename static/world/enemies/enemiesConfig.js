export function damageAfterArmor(player, damage) {
  return Math.max(1, damage - (player.armorReduction || 0));
}

export function isSlingshotHit(player, targetX, targetY, isChasing, chaseRange) {
  if (!player.slingshotShotActive || player.attackHitEnemies.has('slingshot-shot')) return false;
  if (!isChasing) return false;
  const dx = targetX - player.x;
  const dy = targetY - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 22 || distance > player.slingshotShotRange || distance >= chaseRange) return false;
  const angle = Math.atan2(dy, dx);
  const difference = Math.atan2(Math.sin(angle - player.slingshotShotAngle), Math.cos(angle - player.slingshotShotAngle));
  if (Math.abs(difference) > 0.055) return false;
  player.slingshotShotActive = false;
  player.attackHitEnemies.add('slingshot-shot');
  return true;
}

export const ENEMIES_CONFIG = {
  computerBug: {
    health: 2,
    damage: 1,
    spawnRate: {
      initialDelay: 1,
      minInterval: 2,
      maxInterval: 3,
      maxAlive: 10
    },
    movementSpeed: 60
  },
  octopus: {
    health: 3,
    damage: 2,
    tentacleHealth: 2,
    spawnRate: {
      initialDelay: 2.4,
      minInterval: 3,
      maxInterval: 5.6,
      maxAlive: 3
    },
    movementSpeed: 66
  },
  crab: {
    health: 4,
    damage: 2,
    spawnRate: {
      initialDelay: 2.8,
      minInterval: 3,
      maxInterval: 5,
      maxAlive: 4
    },
    movementSpeed: {
      land: 58,
      water: 84,
      lunge: 240,
      turnRate: 2.4
    }
  },
  computerVirus: {
    health: 10,
    damage: 4,
    spawnRate: {
      initialDelay: 1,
      minInterval: 2,
      maxInterval: 3,
      maxAlive: 4
    },
    movementSpeed: 130,
    teleport: {
      triggerRange: 220,
      minCooldown: 2,
      maxCooldown: 3.5,
      vanishTime: 0.4,
      appearTime: 0.3,
      landingDistance: 75
    }
  },
  skeleton: {
    health: 25,
    damage: 12,
    spawnRate: {
      initialDelay: 3,
      minInterval: 4,
      maxInterval: 6.5,
      maxAlive: 3
    },
    movementSpeed: 140,
    attack: {
      triggerRange: 120,
      range: 58,
      arc: 0.9,
      windupTime: 0.55,
      comboWindupTime: 0.28,
      swingTime: 0.16,
      recoverTime: 0.7,
      swings: 2,
      lungeSpeed: 560,
      knockback: 30
    }
  },
  magmaSlug: {
    health: 15,
    damage: 8,
    spawnRate: {
      initialDelay: 3,
      minInterval: 4,
      maxInterval: 6,
      maxAlive: 3
    },
    movementSpeed: {
      lava: 95,
      land: 48
    },
    spit: {
      range: 300,
      minRange: 110,
      windupTime: 0.7,
      recoverTime: 0.6,
      minCooldown: 2.2,
      maxCooldown: 3.4,
      globs: 3,
      spreadDistance: 80,
      flightTime: 0.75,
      globStagger: 0.14,
      impactRadius: 30,
      puddleRadius: 32,
      puddleDuration: 4,
      puddleDamage: 5
    }
  },
  malwareWorm: {
    health: 12,
    damage: 6,
    spawnRate: {
      initialDelay: 1,
      minInterval: 3,
      maxInterval: 5,
      maxAlive: 3
    },
    movementSpeed: 100,
    cycles: [5, 3, 2],
    split: {
      generations: 2,
      children: 2,
      healthScale: 0.6,
      damageScale: 0.75,
      speedScale: 1.4,
      sizeScale: 0.72,
      spreadDistance: 28,
      kickSpeed: 220
    }
  },
  overgrowthBoss: {
    name: 'Mossback Beetle',
    title: 'Guardian of the Overgrowth',
    health: 50,
    movementSpeed: 120,
    turnRate: 2.1,
    shellMultiplier: 1,
    stunMultiplier: 2,
    contactDamage: 1,
    deathTime: 2.6,
    reward: 50,
    attackDelay: { min: 1.3, max: 2.3 },
    enrage: {
      threshold: 0.5,
      speedScale: 1.35,
      cooldownScale: 0.7
    },
    charge: {
      windup: 0.95,
      lockTime: 0.3,
      duration: 0.7,
      speed: 560,
      damage: 2,
      recover: 1.4,
      laneWidth: 50,
      wallStunBonus: 0.8
    },
    spit: {
      windup: 0.7,
      recover: 0.7,
      shots: 3,
      shotsPhaseTwo: 5,
      spread: 0.36,
      speed: 270,
      damage: 2,
      radius: 10,
      life: 2.4
    },
    leap: {
      windup: 1,
      airTime: .9,
      radius: 115,
      damage: 2,
      recover: 1.1,
      ringShots: 8
    }
  },
  abyssBoss: {
    name: 'Abyssal Lurker',
    title: 'Sovereign of the Sunken Abyss',
    health: 100,
    movementSpeed: 105,
    turnRate: 1.9,
    bodyMultiplier: 1,
    lureMultiplier: 3,
    stunMultiplier: 2,
    contactDamage: 4,
    deathTime: 2.6,
    reward: 75,
    attackDelay: { min: 1.3, max: 2.3 },
    enrage: {
      threshold: 0.5,
      speedScale: 1.3,
      cooldownScale: 0.7
    },
    bubbles: {
      windup: 0.8,
      recover: 0.7,
      count: 5,
      countPhaseTwo: 8,
      spread: 1.1,
      speed: 340,
      friction: 1.2,
      minLife: 1.4,
      maxLife: 2.2,
      radius: 14,
      popRadius: 54,
      damage: 4
    },
    pull: {
      windup: 0.9,
      duration: 2.2,
      speed: 150,
      range: 320,
      chompRadius: 80,
      chompDamage: 5,
      stunAfter: 1.3,
      interruptStun: 1.4
    },
    dive: {
      sinkTime: 0.6,
      trackTime: 1.5,
      warnTime: 0.85,
      trackSpeed: 280,
      radius: 105,
      damage: 5,
      stun: 1.8,
      knockback: 90,
      satellites: 4,
      satelliteRadius: 62,
      satelliteDistance: 150,
      satelliteDelay: 0.45,
      satelliteStagger: 0.2,
      satelliteDamage: 2
    }
  },
};
