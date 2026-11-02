export function drawBossEggIndicator(ctx, player, egg) {
  if (!egg) return;
  const canvas = ctx.canvas;
  const x = egg.x - player.cameraX;
  const y = egg.y - player.cameraY;
  const inset = 34;
  if (x >= inset && x <= canvas.width - inset && y >= inset && y <= canvas.height - inset) return;

  const dx = x - canvas.width / 2;
  const dy = y - canvas.height / 2;
  const scale = Math.min(
    (canvas.width / 2 - inset) / Math.max(1, Math.abs(dx)),
    (canvas.height / 2 - inset) / Math.max(1, Math.abs(dy))
  );
  const angle = Math.atan2(dy, dx);
  const px = canvas.width / 2 + dx * scale;
  const py = canvas.height / 2 + dy * scale;

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle);
  ctx.fillStyle = '#fbbf24';
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -7);
  ctx.lineTo(-5, 0);
  ctx.lineTo(-8, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
