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
    health: 6,
    damage: 3,
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
  }
};
