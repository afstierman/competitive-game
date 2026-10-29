window.addEventListener('error', (e) => {
  const banner = document.getElementById('error-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.textContent = `JS Error: ${e.message} at line ${e.lineno}`;
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('start-screen');
  const launchBtn = document.getElementById('launch-btn');
  const posEl = document.getElementById('ui-pos');
  const hpEl = document.getElementById('ui-hp');

  let isRunning = false;
  const player = { 
    x: 0, 
    y: 0, 
    speed: 210, 
    hp: 3,
    facingRight: true
  };
  
  const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  const keys = {};

  // Input listeners
  window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

  // Track mouse relative to canvas
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  launchBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    isRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  });

  let lastTime = 0;

  function drawComputerScientist(centerX, centerY, aimAngle) {
    ctx.save();
    ctx.translate(centerX, centerY);

    // Determine facing direction based on mouse position relative to player center
    player.facingRight = mouse.x >= centerX;

    // --- BODY DRAWING ---
    // Lab coat / Torso
    ctx.fillStyle = '#f8fafc'; // White lab coat
    ctx.fillRect(-10, -12, 20, 24);

    // Inner Shirt (Dark shirt with terminal cyan accent)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-4, -12, 8, 16);
    ctx.fillStyle = '#38bdf8'; // Glowing terminal shirt icon/detail
    ctx.fillRect(-2, -8, 4, 6);

    // Pants / Legs
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-8, 12, 6, 12); // Left leg
    ctx.fillRect(2, 12, 6, 12);  // Right leg

    // Head / Skin
    ctx.fillStyle = '#fbe4d8'; // Skin tone
    ctx.fillRect(-8, -26, 16, 14);

    // Hair
    ctx.fillStyle = '#475569'; // Messy programmer hair
    ctx.fillRect(-9, -29, 18, 6);

    // Glasses
    ctx.fillStyle = '#0f172a'; // Glasses frame
    if (player.facingRight) {
      ctx.fillRect(0, -22, 7, 5);
      ctx.fillStyle = '#38bdf8'; // Lens glint
      ctx.fillRect(2, -20, 4, 3);
    } else {
      ctx.fillRect(-7, -22, 7, 5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-6, -20, 4, 3);
    }

    ctx.restore();

    // --- ARM & CYBER-SWORD DRAWING ---
    ctx.save();
    // Anchor arm to shoulder joint
    const shoulderX = player.facingRight ? centerX + 4 : centerX - 4;
    const shoulderY = centerY - 2;
    ctx.translate(shoulderX, shoulderY);
    ctx.rotate(aimAngle);

    // Arm (Sleeve)
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, -3, 12, 6);

    // Hand
    ctx.fillStyle = '#fbe4d8';
    ctx.fillRect(12, -2, 4, 4);

    // Cyber Sword Hilt
    ctx.fillStyle = '#334155';
    ctx.fillRect(16, -4, 4, 8); // Crossguard
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(12, -2, 5, 4); // Handle

    // Cyber Sword Blade (Glowing Energy Blade)
    ctx.fillStyle = '#38bdf8'; // Outer glow
    ctx.fillRect(20, -3, 28, 6);
    ctx.fillStyle = '#f0fdf4'; // Bright core
    ctx.fillRect(22, -1, 24, 2);

    ctx.restore();
  }

  function loop(timestamp) {
    if (!isRunning) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    // 1. UPDATE
    let dx = 0, dy = 0;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;

    if (dx !== 0 && dy !== 0) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    player.x += dx * player.speed * dt;
    player.y += dy * player.speed * dt;

    // Calculate aim angle toward mouse cursor
    const playerCenterX = canvas.width / 2;
    const playerCenterY = canvas.height / 2;
    const aimAngle = Math.atan2(mouse.y - playerCenterY, mouse.x - playerCenterX);

    // Update UI text
    posEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    hpEl.textContent = '♥'.repeat(player.hp);

    // 2. DRAW
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid lines
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    const tileSize = 64;
    const offsetX = Math.floor(-player.x % tileSize);
    const offsetY = Math.floor(-player.y % tileSize);

    for (let x = offsetX; x < canvas.width; x += tileSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = offsetY; y < canvas.height; y += tileSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw Computer Scientist Player & Aiming Cyber Sword
    drawComputerScientist(playerCenterX, playerCenterY, aimAngle);

    requestAnimationFrame(loop);
  }

  // Initial draw pass
  ctx.fillStyle = '#030712';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});