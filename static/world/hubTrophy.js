import { CONFIG } from '../config.js';

const TROPHY_LOCATION = { x: 128, y: -144 };
const ABYSS_TROPHY_LOCATION = { x: 192, y: -144 };

let trophyUnlocked = false;
let abyssTrophyUnlocked = false;

window.addEventListener('simulation-restarted', () => {
  trophyUnlocked = false;
  abyssTrophyUnlocked = false;
});

window.addEventListener('overgrowth-boss-defeated', () => {
  trophyUnlocked = true;
});

window.addEventListener('abyss-boss-defeated', () => {
  abyssTrophyUnlocked = true;
});

export function drawHubTrophy(ctx, player) {
  if (trophyUnlocked) drawTrophy(ctx, player, TROPHY_LOCATION, '#22c55e', '#4ade80', '#86efac', '#16a34a');
  if (abyssTrophyUnlocked) drawTrophy(ctx, player, ABYSS_TROPHY_LOCATION, '#0284c7', '#38bdf8', '#bae6fd', '#0369a1');
}

function drawTrophy(ctx, player, location, cupColor, handleColor, highlightColor, stemColor) {
  const x = location.x - player.cameraX;
  const y = location.y - player.cameraY;
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
  ctx.strokeStyle = handleColor;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-size * 0.4, -size * 0.28, size * 0.25, -Math.PI / 2, Math.PI / 2);
  ctx.arc(size * 0.4, -size * 0.28, size * 0.25, Math.PI / 2, -Math.PI / 2);
  ctx.stroke();

  ctx.fillStyle = cupColor;
  ctx.beginPath();
  ctx.moveTo(-size * 0.52, -size * 0.55);
  ctx.lineTo(size * 0.52, -size * 0.55);
  ctx.lineTo(size * 0.38, -size * 0.12);
  ctx.quadraticCurveTo(0, size * 0.22, -size * 0.38, -size * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = highlightColor;
  ctx.beginPath();
  ctx.ellipse(-size * 0.13, -size * 0.4, size * 0.12, size * 0.08, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = stemColor;
  ctx.fillRect(-size * 0.1, size * 0.05, size * 0.2, size * 0.18);
  ctx.fillRect(-size * 0.3, size * 0.19, size * 0.6, size * 0.09);

  ctx.restore();
}
