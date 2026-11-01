import { createPlayer, startPlayerAttack, releasePlayerAttack, updatePlayer, drawPlayer } from './player.js';
import { CONFIG } from './config.js';
import { drawWorld, getBiomeAtPosition } from './world/world.js';
import { isNearShop } from './world/shop.js';
import { drawEnemies, resetEnemies, updateEnemies } from './world/enemies.js';
import { getComputerBugKills } from './world/enemies/computerBug.js';
import { getCrabKills } from './world/enemies/crab.js';
import { getOctopusKills } from './world/enemies/octopus.js';
import { getComputerVirusKills } from './world/enemies/computerVirus.js';
import { getMalwareWormKills } from './world/enemies/malwareWorm.js';
import { getSkeletonKills } from './world/enemies/skeleton.js';
import { getMagmaSlugKills } from './world/enemies/magmaSlug.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('screen');
  const ctx = canvas.getContext('2d');
  const overlay = document.getElementById('start-screen');
  const launchBtn = document.getElementById('launch-btn');
  const posEl = document.getElementById('ui-pos');
  const hpEl = document.getElementById('ui-hp');
  const weaponEl = document.getElementById('ui-weapon');
  const shopPanel = document.getElementById('shop-panel');
  const shopCyclesEl = document.getElementById('shop-cycles');
  const shopStatusEl = document.getElementById('shop-status');
  const healButton = document.getElementById('buy-heal');
  const healthButton = document.getElementById('buy-health');
  const swordButton = document.getElementById('buy-sword');
  const slingshotButton = document.getElementById('buy-slingshot');
  const armorButton = document.getElementById('buy-armor');
  const almanacPanel = document.getElementById('almanac-panel');
  const bugKillProgressEl = document.getElementById('almanac-bug-kills');
  const crabKillProgressEl = document.getElementById('almanac-crab-kills');
  const octopusKillProgressEl = document.getElementById('almanac-octopus-kills');
  const virusKillProgressEl = document.getElementById('almanac-virus-kills');
  const wormKillProgressEl = document.getElementById('almanac-worm-kills');
  const skeletonKillProgressEl = document.getElementById('almanac-skeleton-kills');
  const slugKillProgressEl = document.getElementById('almanac-slug-kills');
  const almanacToggle = document.getElementById('almanac-toggle');
  const helpPanel = document.getElementById('help-panel');
  const helpToggle = document.getElementById('help-toggle');
  const testerToggle = document.getElementById('tester-toggle');
  const testerStatus = document.getElementById('tester-status');

  let cyclesEl = document.getElementById('ui-cycles');
  let biomeEl = document.getElementById('ui-biome');

  const statsContainer = document.querySelector('.stats');
  if (statsContainer) {
    if (!cyclesEl) {
      const span = document.createElement('span');
      span.innerHTML = 'CYCLES: <strong id="ui-cycles">0</strong>';
      statsContainer.appendChild(span);
      cyclesEl = document.getElementById('ui-cycles');
    }
    if (!biomeEl) {
      const span = document.createElement('span');
      span.innerHTML = '<strong id="ui-biome">Mossy Overgrowth</strong>';
      statsContainer.insertBefore(span, statsContainer.firstChild);
      biomeEl = document.getElementById('ui-biome');
    }
  }
  if (biomeEl) biomeEl.textContent = '';

  let isRunning = false;
  let player = createPlayer();
  let shopOpen = false;
  let almanacOpen = false;
  let helpOpen = false;
  let testerMode = false;
  const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
  const keys = {};

  let currentBiomeName = '';
  let bannerText = '';
  let bannerTimer = 0;

  function canAfford(cost) {
    return testerMode || player.cycles >= cost;
  }

  function spendCycles(cost) {
    if (!testerMode) player.cycles -= cost;
  }

  function refreshShop() {
    const healthUpgradeCost = 10 * (2 ** Math.max(0, player.maxHp - CONFIG.maxHp));
    shopCyclesEl.textContent = testerMode ? '∞' : player.cycles;
    healButton.textContent = 'Heal 1 heart · 10 cycles';
    healthButton.textContent = `+1 max health · ${healthUpgradeCost} cycles`;
    healButton.disabled = !canAfford(10) || player.hp >= player.maxHp;
    healthButton.disabled = !canAfford(healthUpgradeCost) || player.maxHp >= 10;
    const nextSword = CONFIG.swords[player.swordTier + 1];
    if (nextSword) {
      swordButton.textContent = `${nextSword.name} · ${nextSword.damage} damage · ${nextSword.price} cycles`;
      swordButton.style.setProperty('--weapon-color', nextSword.color);
      swordButton.disabled = !canAfford(nextSword.price);
    } else {
      const currentSword = CONFIG.swords[player.swordTier];
      swordButton.textContent = `Max sword · ${currentSword.name} · ${currentSword.damage} damage`;
      swordButton.style.setProperty('--weapon-color', currentSword.color);
      swordButton.disabled = true;
    }
    const nextArmor = CONFIG.armors[player.armorTier];
    if (nextArmor) {
      armorButton.textContent = `${nextArmor.name} · blocks ${nextArmor.blockedDamage} damage · ${nextArmor.price} cycles`;
      armorButton.style.setProperty('--armor-color', nextArmor.color);
      armorButton.style.color = nextArmor.color;
      armorButton.disabled = !canAfford(nextArmor.price);
    } else {
      const currentArmor = CONFIG.armors[player.armorTier - 1];
      armorButton.textContent = `Max armor · ${currentArmor.name} · blocks ${currentArmor.blockedDamage} damage`;
      armorButton.style.setProperty('--armor-color', currentArmor.color);
      armorButton.style.color = currentArmor.color;
      armorButton.disabled = true;
    }
    const nextSlingshot = CONFIG.slingshots[player.slingshotTier + 1];
    if (nextSlingshot) {
      slingshotButton.textContent = `${nextSlingshot.name} · ${nextSlingshot.damage} damage · ${nextSlingshot.price} cycles`;
      slingshotButton.style.setProperty('--weapon-color', nextSlingshot.color);
      slingshotButton.disabled = !canAfford(nextSlingshot.price);
    } else {
      const currentSlingshot = CONFIG.slingshots[player.slingshotTier];
      slingshotButton.textContent = `Max slingshot · ${currentSlingshot.name} · ${currentSlingshot.damage} damage`;
      slingshotButton.style.setProperty('--weapon-color', currentSlingshot.color);
      slingshotButton.disabled = true;
    }
  }

  swordButton.addEventListener('click', () => {
    const nextSword = CONFIG.swords[player.swordTier + 1];
    if (!nextSword || !canAfford(nextSword.price)) return;
    spendCycles(nextSword.price);
    player.swordTier++;
    player.swordDamage = nextSword.damage;
    player.swordColor = nextSword.color;
    shopStatusEl.textContent = `${nextSword.name} equipped!`;
    refreshShop();
  });

  slingshotButton.addEventListener('click', () => {
    const nextSlingshot = CONFIG.slingshots[player.slingshotTier + 1];
    if (!nextSlingshot || !canAfford(nextSlingshot.price)) return;
    spendCycles(nextSlingshot.price);
    player.slingshotTier++;
    player.slingshotDamage = nextSlingshot.damage;
    player.slingshotColor = nextSlingshot.color;
    shopStatusEl.textContent = `${nextSlingshot.name} unlocked! Press Q to equip it.`;
    refreshShop();
  });

  armorButton.addEventListener('click', () => {
    const nextArmor = CONFIG.armors[player.armorTier];
    if (!nextArmor || !canAfford(nextArmor.price)) return;
    spendCycles(nextArmor.price);
    player.armorTier++;
    player.armorReduction = nextArmor.blockedDamage;
    player.armorColor = nextArmor.color;
    shopStatusEl.textContent = `${nextArmor.name} equipped!`;
    refreshShop();
  });

  function setShopOpen(open) {
    shopOpen = open;
    shopPanel.classList.toggle('hidden', !open);
    if (open) {
      shopStatusEl.textContent = 'Welcome, explorer!';
      refreshShop();
    }
  }

  function setAlmanacOpen(open) {
    almanacOpen = open;
    almanacPanel.classList.toggle('hidden', !open);
    almanacToggle.setAttribute('aria-expanded', String(open));
  }

  function setHelpOpen(open) {
    helpOpen = open;
    helpPanel.classList.toggle('hidden', !open);
    helpToggle.setAttribute('aria-expanded', String(open));
  }

  function toggleWeapon() {
    if (!isRunning || player.slingshotTier < 0 || shopOpen || almanacOpen || helpOpen) return false;
    player.activeWeapon = player.activeWeapon === 'sword' ? 'slingshot' : 'sword';
    return true;
  }

  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'e' && !keys.e && isRunning && !almanacOpen && !helpOpen && isNearShop(player.x, player.y)) {
      setShopOpen(!shopOpen);
      e.preventDefault();
    } else if (key === 'escape' && shopOpen) {
      setShopOpen(false);
    } else if (key === 'escape' && almanacOpen) {
      setAlmanacOpen(false);
    } else if (key === 'escape' && helpOpen) {
      setHelpOpen(false);
    } else if (key === 'q' && !keys.q && isRunning && player.slingshotTier >= 0 && !shopOpen && !almanacOpen && !helpOpen) {
      toggleWeapon();
    }
    keys[key] = true;
  });
  window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
  canvas.addEventListener('wheel', e => {
    if (e.deltaY !== 0 && toggleWeapon()) e.preventDefault();
  }, { passive: false });

  document.getElementById('shop-close').addEventListener('click', () => setShopOpen(false));
  almanacToggle.addEventListener('click', () => {
    if (almanacOpen) {
      setAlmanacOpen(false);
    } else {
      setShopOpen(false);
      setHelpOpen(false);
      setAlmanacOpen(true);
    }
  });
  document.getElementById('almanac-close').addEventListener('click', () => setAlmanacOpen(false));
  helpToggle.addEventListener('click', () => {
    if (helpOpen) {
      setHelpOpen(false);
    } else {
      setShopOpen(false);
      setAlmanacOpen(false);
      setHelpOpen(true);
    }
  });
  document.getElementById('help-close').addEventListener('click', () => setHelpOpen(false));
  testerToggle.addEventListener('click', () => {
    testerMode = !testerMode;
    testerToggle.setAttribute('aria-pressed', String(testerMode));
    testerToggle.textContent = testerMode ? 'Disable tester mode' : 'Enable tester mode';
    testerStatus.textContent = testerMode
      ? 'Tester mode is on. Shop purchases are free.'
      : 'Tester mode is off.';
    if (shopOpen) refreshShop();
  });
  healButton.addEventListener('click', () => {
    if (!canAfford(10) || player.hp >= player.maxHp) return;
    spendCycles(10);
    player.hp++;
    shopStatusEl.textContent = 'One heart restored. Take care!';
    refreshShop();
  });
  healthButton.addEventListener('click', () => {
    const healthUpgradeCost = 10 * (2 ** Math.max(0, player.maxHp - CONFIG.maxHp));
    if (!canAfford(healthUpgradeCost) || player.maxHp >= 10) return;
    spendCycles(healthUpgradeCost);
    player.maxHp++;
    player.hp++;
    shopStatusEl.textContent = 'A little sturdier! Max health increased.';
    refreshShop();
  });

  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0 || !isRunning || shopOpen || almanacOpen || helpOpen) return;
    startPlayerAttack(player);
  });
  window.addEventListener('mouseup', e => {
    if (e.button === 0) releasePlayerAttack(player);
  });

  function triggerGameOver(reason) {
    isRunning = false;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <h2 style="color:#f87171;">SYSTEM TERMINATED</h2>
      <p>${reason}<br>Extracted Cycles: <b>${player.cycles}</b></p>
      <button id="launch-btn">RESTART SIMULATION</button>
    `;
    document.getElementById('launch-btn').addEventListener('click', startNewRun);
  }

  function startNewRun() {
    player = createPlayer();
    resetEnemies();
    window.dispatchEvent(new Event('simulation-restarted'));
    setShopOpen(false);
    setAlmanacOpen(false);
    setHelpOpen(false);
    overlay.classList.add('hidden');
    isRunning = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  launchBtn.addEventListener('click', startNewRun);

  let lastTime = 0;

  function renderBiomeBanner(dt) {
    if (bannerTimer <= 0) return;
    bannerTimer -= dt;

    ctx.save();
    ctx.fillStyle = 'rgba(3, 7, 18, 0.72)';
    ctx.fillRect(0, 16, canvas.width, 60);

    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 16, canvas.width, 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`ENTERING SECTOR: ${bannerText.toUpperCase()}`, canvas.width / 2, 52);
    ctx.restore();
  }

  function loop(timestamp) {
    if (!isRunning) return;

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;

    if (!shopOpen && !almanacOpen && !helpOpen) {
      updatePlayer(player, keys, dt, canvas, timestamp, triggerGameOver, mouse);
      updateEnemies(player, dt, timestamp, canvas, triggerGameOver);
    }
    if (!isRunning) return;

    const activeBiome = getBiomeAtPosition(player.x, player.y);

    if (activeBiome.name !== currentBiomeName) {
      currentBiomeName = activeBiome.name;
      bannerText = currentBiomeName;
      bannerTimer = currentBiomeName ? 3.0 : 0;
      if (biomeEl) {
        biomeEl.textContent = currentBiomeName;
        if (currentBiomeName) biomeEl.style.color = activeBiome.crystal.color;
      }
    }

    posEl.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;
    hpEl.textContent = `${'♥'.repeat(player.hp)}${'♡'.repeat(player.maxHp - player.hp)}`;
    if (cyclesEl) cyclesEl.textContent = testerMode ? '∞' : player.cycles;
    if (weaponEl) weaponEl.textContent = player.activeWeapon === 'sword'
      ? CONFIG.swords[player.swordTier].name
      : CONFIG.slingshots[player.slingshotTier].name;
    if (bugKillProgressEl) {
      const kills = getComputerBugKills();
      bugKillProgressEl.textContent = kills >= 5 ? `${kills} defeated · egg ready` : `${kills} / 5 defeated · egg progress`;
    }
    if (crabKillProgressEl) {
      const kills = getCrabKills();
      crabKillProgressEl.textContent = `${kills} / 5 defeated${kills >= 5 ? ' · threshold met' : ''}`;
    }
    if (octopusKillProgressEl) {
      const kills = getOctopusKills();
      octopusKillProgressEl.textContent = `${kills} / 5 defeated${kills >= 5 ? ' · threshold met' : ''}`;
    }
    if (virusKillProgressEl) {
      const kills = getComputerVirusKills();
      virusKillProgressEl.textContent = `${kills} / 5 defeated${kills >= 5 ? ' · threshold met' : ''}`;
    }
    if (wormKillProgressEl) {
      const kills = getMalwareWormKills();
      wormKillProgressEl.textContent = `${kills} / 5 worm families defeated${kills >= 5 ? ' · threshold met' : ''}`;
    }
    if (skeletonKillProgressEl) {
      const kills = getSkeletonKills();
      skeletonKillProgressEl.textContent = `${kills} / 5 defeated${kills >= 5 ? ' · threshold met' : ''}`;
    }
    if (slugKillProgressEl) {
      const kills = getMagmaSlugKills();
      slugKillProgressEl.textContent = `${kills} / 5 defeated${kills >= 5 ? ' · infernal egg ready' : ''}`;
    }
    drawWorld(ctx, canvas, player, timestamp);
    drawEnemies(ctx, player, canvas, timestamp);
    drawPlayer(ctx, player, mouse, canvas);
    if (isNearShop(player.x, player.y) && !shopOpen) {
      ctx.fillStyle = 'rgba(3, 7, 18, 0.85)';
      ctx.fillRect(canvas.width / 2 - 98, canvas.height / 2 + 42, 196, 28);
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Press E to browse the shop', canvas.width / 2, canvas.height / 2 + 61);
    }
    renderBiomeBanner(dt);

    requestAnimationFrame(loop);
  }

  drawWorld(ctx, canvas, player, performance.now());
  drawEnemies(ctx, player, canvas, performance.now());
  drawPlayer(ctx, player, mouse, canvas);
});
