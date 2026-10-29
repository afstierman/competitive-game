export const CONFIG = {
  tileSize: 32,
  playerSpeed: 210,
  playerRadius: 12,
  maxHp: 3,

  // World Generation Tuning
  world: {
    hubSafeZoneTiles: 8, // Clear radius around (0,0) origin
    rockDensity: 0.08,   // Density of obstacle rocks
    crystalDensity: 0.015 // Significantly reduced for higher exploration demand (1.5% chance)
  },

  // Crystal Tiers, Color Palette, and Distance Thresholds (in World Pixels)
  crystals: {
    tiers: [
      { maxDistance: 1000,  color: '#4ade80', value: 1,  name: 'Common Green' },
      { maxDistance: 2000, color: '#facc15', value: 5,  name: 'Uncommon Yellow' },
      { maxDistance: 3000, color: '#f87171', value: 15, name: 'Rare Red' },
      { maxDistance: Infinity, color: '#c084fc', value: 50, name: 'Exotic Purple' }
    ]
  }
};