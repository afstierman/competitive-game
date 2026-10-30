export const ENEMIES_CONFIG = {
  computerBug: {
    health: 2,
    damage: 1,
    spawnRate: {
      initialDelay: 1.1,
      minInterval: 2.5,
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
  }
};
