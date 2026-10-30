export const CONFIG = {
  tileSize: 32,
  playerSpeed: 210,
  playerRadius: 12,
  maxHp: 3,

  world: {
    hubSafeZoneTiles: 8,
    rockDensity: 0.08,
    crystalDensity: 0.012 // Extra rare for massive exploration
  },

  // Expanded Biome Distances
  biomes: [
    {
      name: 'Mossy Overgrowth',
      maxDistance: 1500,
      tiles: { primary: '#0c1e15', alt: '#081610' },
      rock: { base: '#2d3a2f', highlight: '#405243', detail: '#4ade80' },
      crystal: { color: '#4ade80', value: 1 }
    },
    {
      name: 'Sunken Abyss',
      maxDistance: 3200,
      tiles: { primary: '#0a1829', alt: '#06101d' },
      rock: { base: '#1e293b', highlight: '#334155', detail: '#38bdf8' },
      crystal: { color: '#38bdf8', value: 5 }
    },
    {
      name: 'Void Nebula',
      maxDistance: 5000,
      tiles: { primary: '#180e29', alt: '#10081d' },
      rock: { base: '#2e1065', highlight: '#4c1d95', detail: '#c084fc' },
      crystal: { color: '#c084fc', value: 15 }
    },
    {
      name: 'Infernal Kernel',
      maxDistance: Infinity,
      tiles: { primary: '#240a0a', alt: '#170505' },
      rock: { base: '#3f0f0f', highlight: '#7f1d1d', detail: '#ef4444' },
      crystal: { color: '#ef4444', value: 50 }
    }
  ]
};