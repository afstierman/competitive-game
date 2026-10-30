import { CONFIG } from '../config.js';

const STORAGE_KEY = 'overgrowthBossDefeated';
const TROPHY_LOCATION = { x: 128, y: -144 };

let trophyUnlocked = localStorage.getItem(STORAGE_KEY) === 'true';

window.addEventListener('overgrowth-boss-defeated', () => {
  trophyUnlocked = true;
  localStorage.setItem(STORAGE_KEY, 'true');
});

export function drawHubTrophy(ctx, player) {
  if (!trophyUnlocked) return;

  const x = TROPHY_LOCATION.x - player.cameraX;
  const y = TROPHY_LOCATION.y - player.cameraY;
  const size = CONFIG.tileSize;

  ctx.save();
  ctx.translate(x, y);

  // Small stone plinth beside the hub shop.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, size * 0.58, size * 0.9, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#475569';
  ctx.fillRect(-size * 0.65, size * 0.18, size * 1.3, size * 0.38);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(-size * 0.75, size * 0.12, size * 1.5, size * 0.12);

  // Moss green cup, handles, and stem.
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-size * 0.4, -size * 0.28, size * 0.25, -Math.PI / 2, Math.PI / 2);
  ctx.arc(size * 0.4, -size * 0.28, size * 0.25, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();

  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.moveTo(-size * 0.52, -size * 0.55);
  ctx.lineTo(size * 0.52, -size * 0.55);
  ctx.lineTo(size * 0.38, -size * 0.12);
  ctx.quadraticCurveTo(0, size * 0.22, -size * 0.38, -size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#86efac';
  ctx.beginPath();
  ctx.ellipse(-size * 0.13, -size * 0.4, size * 0.12, size * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16a34a';
  ctx.fillRect(-size * 0.1, size * 0.05, size * 0.2, size * 0.18);
  ctx.fillRect(-size * 0.3, size * 0.19, size * 0.6, size * 0.09);

  ctx.restore();
}
