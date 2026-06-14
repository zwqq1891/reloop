// js/pages/game.js — Eco-Tree Game

const TREE_STAGES = [
  { level: 1, name: '種子',  visual: '🌱', desc: '剛萌芽的小種子，充滿無限潛能。' },
  { level: 2, name: '幼苗',  visual: '🪴', desc: '嫩綠的幼苗，正努力向陽生長。' },
  { level: 3, name: '小樹',  visual: '🌳', desc: '茁壯的小樹，枝葉日漸茂盛。' },
  { level: 4, name: '成樹',  visual: '🌲', desc: '繁茂的大樹，已可移栽入碳匯森林！' },
];

const REGIONS = {
  north:   { name: '北部', color: '#22c55e', cx: 78,  cy: 68  },
  central: { name: '中部', color: '#3b82f6', cx: 74,  cy: 132 },
  south:   { name: '南部', color: '#f59e0b', cx: 72,  cy: 225 },
  east:    { name: '東部', color: '#8b5cf6', cx: 133, cy: 152 },
};

// Simplified Taiwan silhouette divided into 4 regions (viewBox 0 0 200 340)
const TAIWAN_PATHS = {
  north:   'M58,48 L100,32 L132,48 L118,54 L118,95 L82,100 L52,96 L32,95 Z',
  central: 'M32,95 L52,96 L82,100 L118,95 L118,165 L88,172 L50,168 L28,155 Z',
  south:   'M28,155 L50,168 L88,172 L118,165 L118,232 L138,238 L112,294 L88,310 L62,296 L36,258 L22,205 Z',
  east:    'M132,48 L148,95 L152,165 L138,238 L118,232 L118,165 L118,95 L118,54 Z',
};

function buildTaiwanSVG(regionCounts, { interactive = false, width = 150 } = {}) {
  const maxCount = Math.max(1, ...Object.values(regionCounts));

  const parts = Object.entries(TAIWAN_PATHS).map(([key, d]) => {
    const info  = REGIONS[key];
    const count = regionCounts[key] || 0;
    const opacity = interactive ? 0.82 : (0.35 + 0.65 * (count / maxCount));
    const onclickAttr = interactive
      ? `onclick="selectHarvestRegion('${key}')" style="cursor:pointer"`
      : '';
    const cls = `taiwan-region${interactive ? ' interactive' : ''}`;

    const isEast = key === 'east';
    const bR = isEast ? 14 : 19;
    const fsMain = isEast ? 11 : 13;
    const fsSub  = isEast ? 8  : 9;
    const dyMain = isEast ? -4 : -4;
    const dySub  = isEast ? 8  : 10;

    const badge = `
      <circle cx="${info.cx}" cy="${info.cy}" r="${bR}"
              fill="rgba(0,0,0,0.22)" style="pointer-events:none"/>
      <text x="${info.cx}" y="${info.cy + dyMain}"
            text-anchor="middle" font-size="${fsMain}" font-weight="800"
            fill="white" style="pointer-events:none">${count.toLocaleString()}</text>
      <text x="${info.cx}" y="${info.cy + dySub}"
            text-anchor="middle" font-size="${fsSub}"
            fill="rgba(255,255,255,.85)" style="pointer-events:none">棵</text>`;

    return `
      <path d="${d}" fill="${info.color}" fill-opacity="${opacity.toFixed(2)}"
            class="${cls}" ${onclickAttr}/>
      ${badge}`;
  }).join('');

  return `<svg viewBox="0 0 200 340" xmlns="http://www.w3.org/2000/svg"
          class="taiwan-svg" style="width:${width}px">
    ${parts}
  </svg>`;
}

// ── Map data cache ──────────────────────────────────────────
let _mapData = { north: 0, central: 0, south: 0, east: 0 };

async function loadMapData() {
  try {
    const data = await apiRequest('/api/game/map');
    _mapData = data.regions;
    updateMapUI(_mapData);
  } catch (_) {
    // map is non-critical; keep cached zeros
  }
}

function updateMapUI(regions) {
  const mapEl = document.getElementById('g-taiwan-map');
  if (!mapEl) return;

  mapEl.innerHTML = buildTaiwanSVG(regions, { width: 140 });

  const total = Math.max(1, Object.values(regions).reduce((s, c) => s + c, 0));
  const hasAny = Object.values(regions).some(c => c > 0);

  // Region cards
  Object.entries(REGIONS).forEach(([key, info]) => {
    const count   = regions[key] || 0;
    const card    = document.getElementById(`rc-${key}`);
    if (!card) return;
    const planted = count > 0;
    card.className = `map-rc${planted ? ' planted' : ''}`;
    card.innerHTML = `
      <div class="map-rc-icon">${planted ? '🌳' : '🌱'}</div>
      <div class="map-rc-name">${info.name}地區</div>
      <div class="map-rc-num">${count.toLocaleString()}</div>
      <div class="map-rc-status${planted ? ' done' : ''}">${planted ? '已完成種樹' : '尚未種植'}</div>`;
  });

  // Legend with percentage bars
  const legendEl = document.getElementById('g-map-legend');
  if (!legendEl) return;
  legendEl.innerHTML = Object.entries(REGIONS).map(([key, info]) => {
    const count = regions[key] || 0;
    const pct   = hasAny ? Math.round(count / total * 100) : 0;
    return `
      <div class="map-legend-item2">
        <div class="map-legend-row2">
          <span class="map-legend-dot2" style="background:${info.color}"></span>
          <span class="map-legend-nm2">${info.name}地區</span>
          <span class="map-legend-pct2">${pct}%</span>
          <span class="map-legend-cnt2">${count} 棵</span>
        </div>
        <div class="map-legend-bar-bg2">
          <div class="map-legend-bar2" style="width:${pct}%;background:${info.color}"></div>
        </div>
      </div>`;
  }).join('');
}

async function togglePlantLog() {
  const logEl = document.getElementById('g-plant-log');
  const btn   = document.querySelector('.map-log-btn');
  if (!logEl) return;

  if (logEl.style.display !== 'none') {
    logEl.style.display = 'none';
    btn.textContent = '查看種植活動日誌';
    return;
  }

  btn.textContent = '收起日誌';
  logEl.style.display = 'block';
  logEl.innerHTML = '<div class="plant-log-empty">載入中...</div>';

  try {
    const data = await apiRequest('/api/game/plant-log');
    if (!data.logs.length) {
      logEl.innerHTML = '<div class="plant-log-empty">目前尚無種植紀錄</div>';
      return;
    }
    logEl.innerHTML = data.logs.map(log => {
      const info = REGIONS[log.region];
      const date = new Date(log.created_at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
      return `<div class="plant-log-item">
        <span class="plant-log-dot" style="background:${info?.color || '#aaa'}"></span>
        <span class="plant-log-name">${log.name}</span>
        <span class="plant-log-region">${info?.name || log.region}</span>
        <span class="plant-log-date">${date}</span>
      </div>`;
    }).join('');
  } catch (_) {
    logEl.innerHTML = '<div class="plant-log-empty">無法載入紀錄</div>';
  }
}

// ── Harvest region modal ────────────────────────────────────
function openHarvestModal() {
  const btn = document.getElementById('btn-harvest');
  if (btn && btn.disabled) return;

  const regionBtns = Object.entries(REGIONS).map(([key, info]) => `
    <button class="region-pick-btn" onclick="selectHarvestRegion('${key}')">
      <span class="region-pick-dot" style="background:${info.color}"></span>
      <span class="region-pick-label">${info.name}</span>
      <span class="region-pick-count">${(_mapData[key] || 0).toLocaleString()} 棵已種</span>
    </button>`).join('');

  const modal = document.createElement('div');
  modal.id        = 'harvest-modal';
  modal.className = 'harvest-modal-bg';
  modal.addEventListener('click', e => { if (e.target === modal) closeHarvestModal(); });

  modal.innerHTML = `
    <div class="harvest-modal">
      <div class="harvest-modal-title">🌲 選擇種植區域</div>
      <div class="harvest-modal-sub">點擊地圖區域或右側按鈕，將成樹種入台灣</div>
      <div class="harvest-modal-inner">
        <div>${buildTaiwanSVG(_mapData, { interactive: true, width: 120 })}</div>
        <div class="harvest-modal-regions">${regionBtns}</div>
      </div>
      <button class="harvest-modal-cancel-btn" onclick="closeHarvestModal()">取消</button>
    </div>`;

  document.body.appendChild(modal);
}

function closeHarvestModal() {
  document.getElementById('harvest-modal')?.remove();
}

function selectHarvestRegion(region) {
  closeHarvestModal();
  performGameAction('harvest', region);
}

// ── Page render ─────────────────────────────────────────────
function renderGamePage(container) {
  container.innerHTML = `
    <div class="game-layout">

      <!-- 碳匯儀表板 -->
      <div class="game-dashboard">
        <div class="card card-dark game-dashboard-card">
          <div class="game-dashboard-title">全球碳匯儀表板</div>
          <div class="game-dashboard-stats">
            <div class="game-dash-stat">
              <div class="game-dash-num" id="g-total-trees">--</div>
              <div class="game-dash-label">累積成樹總數</div>
            </div>
            <div class="game-dash-stat">
              <div class="game-dash-num" id="g-co2">--</div>
              <div class="game-dash-label">估算減碳 (kg CO₂)</div>
            </div>
            <div class="game-dash-stat">
              <div class="game-dash-num" id="g-players">--</div>
              <div class="game-dash-label">參與玩家數</div>
            </div>
          </div>
        </div>
        <div class="card game-mini-card">
          <div class="game-mini-icon">💰</div>
          <div>
            <div class="game-mini-label">我的碳幣餘額</div>
            <div class="game-mini-value" id="g-coins">-- <span class="stat-unit">CCN</span></div>
          </div>
        </div>
        <div class="card game-mini-card">
          <div class="game-mini-icon">🏆</div>
          <div>
            <div class="game-mini-label">我已移栽成樹</div>
            <div class="game-mini-value" id="g-harvested">-- <span class="stat-unit">棵</span></div>
          </div>
        </div>
      </div>

      <!-- 樹木成長視覺區 -->
      <div class="card game-tree-card">
        <div class="game-stage-track">
          ${TREE_STAGES.map(s => `
            <div class="game-stage-step" data-level="${s.level}">
              <div class="game-stage-dot"></div>
              <div class="game-stage-step-label">${s.name}</div>
            </div>
          `).join('<div class="game-stage-line"></div>')}
        </div>

        <div class="game-tree-visual" id="g-tree-visual">
          <div class="game-tree-emoji game-tree-stage-1" id="g-tree-emoji">🌱</div>
          <div class="game-tree-ripple" id="g-tree-ripple"></div>
        </div>

        <div class="game-tree-info">
          <div class="game-tree-name" id="g-tree-name">我的小樹</div>
          <div class="game-tree-stage-badge" id="g-tree-stage">Lv.1・種子</div>
          <div class="game-tree-desc" id="g-tree-desc">正在讀取樹木狀態...</div>
        </div>

        <div class="game-exp-wrap">
          <div class="game-exp-label">
            <span>成長進度</span>
            <span id="g-exp-text">0 / 100 EXP</span>
          </div>
          <div class="game-exp-bar-bg">
            <div class="game-exp-bar" id="g-exp-bar" style="width:0%"></div>
          </div>
        </div>
      </div>

      <!-- 養成互動區 -->
      <div class="card game-action-card">
        <div class="card-title">養成動作</div>
        <div class="game-action-grid">

          <div class="game-action-item">
            <div class="game-action-icon">💧</div>
            <div class="game-action-name">澆水</div>
            <div class="game-action-meta">消耗 <strong>10 CCN</strong></div>
            <div class="game-action-exp">+ 15 EXP</div>
            <button class="btn-primary game-action-btn" id="btn-water"
                    onclick="performGameAction('water')">澆水</button>
          </div>

          <div class="game-action-item">
            <div class="game-action-icon">🌿</div>
            <div class="game-action-name">施肥</div>
            <div class="game-action-meta">消耗 <strong>30 CCN</strong></div>
            <div class="game-action-exp">+ 50 EXP</div>
            <button class="btn-primary game-action-btn" id="btn-fertilize"
                    onclick="performGameAction('fertilize')">施肥</button>
          </div>

          <div class="game-action-item game-harvest-item" id="harvest-item">
            <div class="game-action-icon">🌲</div>
            <div class="game-action-name">移栽成樹</div>
            <div class="game-action-meta">達到 <strong>Lv.4</strong> 解鎖</div>
            <div class="game-action-exp">選擇區域・計入碳匯</div>
            <button class="btn-primary game-action-btn game-harvest-btn" id="btn-harvest"
                    onclick="openHarvestModal()" disabled>移栽</button>
          </div>

        </div>
        <div class="game-feedback" id="g-feedback"></div>
      </div>

      <!-- 台灣碳匯種植地圖 -->
      <div class="card game-map-card">
        <div class="map-card-hd">
          <div class="card-title">🗺️ 台灣碳匯種植地圖</div>
          <div class="map-card-sub">全台用戶累積種植成果・每棵成樹估算吸收 21.7 kg CO₂／年</div>
        </div>
        <div class="map-card-body">

          <div id="g-taiwan-map" class="g-taiwan-map-wrap">
            <div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">地圖載入中...</div>
          </div>

          <div class="map-region-cards">
            <div class="map-rc" id="rc-north"><div class="map-rc-icon">🌱</div><div class="map-rc-name">北部地區</div><div class="map-rc-num">--</div><div class="map-rc-status">載入中</div></div>
            <div class="map-rc" id="rc-central"><div class="map-rc-icon">🌱</div><div class="map-rc-name">中部地區</div><div class="map-rc-num">--</div><div class="map-rc-status">載入中</div></div>
            <div class="map-rc" id="rc-south"><div class="map-rc-icon">🌱</div><div class="map-rc-name">南部地區</div><div class="map-rc-num">--</div><div class="map-rc-status">載入中</div></div>
            <div class="map-rc" id="rc-east"><div class="map-rc-icon">🌱</div><div class="map-rc-name">東部地區</div><div class="map-rc-num">--</div><div class="map-rc-status">載入中</div></div>
          </div>

          <div class="map-side-panel">
            <div class="map-legend-list" id="g-map-legend"></div>
            <button class="map-log-btn" onclick="togglePlantLog()">查看種植活動日誌</button>
            <div class="map-plant-log" id="g-plant-log" style="display:none"></div>
          </div>

        </div>
      </div>

    </div>
  `;

  loadGameStatus();
  loadMapData();
}

async function loadGameStatus() {
  try {
    const data = await apiRequest('/api/game/status');
    updateGameUI(data);
  } catch (error) {
    const el = document.getElementById('g-feedback');
    if (el) el.innerHTML = `<div class="inline-error">讀取遊戲狀態失敗：${error.message}</div>`;
  }
}

function updateGameUI({ tree, wallet, globalStats }) {
  if (!document.getElementById('g-total-trees')) return;

  // 儀表板數字
  document.getElementById('g-total-trees').textContent = globalStats.totalMatureTrees.toLocaleString();
  document.getElementById('g-co2').textContent         = globalStats.co2AbsorbedKg.toLocaleString();
  document.getElementById('g-players').textContent     = globalStats.totalPlayers.toLocaleString();
  document.getElementById('g-coins').innerHTML =
    `${Number(wallet.carbonCoins).toLocaleString()} <span class="stat-unit">CCN</span>`;
  document.getElementById('g-harvested').innerHTML =
    `${tree.harvestedCount} <span class="stat-unit">棵</span>`;

  // 樹木視覺
  const stage   = TREE_STAGES[tree.level - 1];
  const emojiEl = document.getElementById('g-tree-emoji');
  emojiEl.textContent = stage.visual;
  emojiEl.className   = `game-tree-emoji game-tree-stage-${tree.level}`;

  document.getElementById('g-tree-name').textContent        = tree.name;
  document.getElementById('g-tree-stage').textContent       = `Lv.${tree.level}・${stage.name}`;
  document.getElementById('g-tree-desc').textContent        = stage.desc;

  // 成長階段軌跡
  document.querySelectorAll('.game-stage-step').forEach(step => {
    const lv = Number(step.dataset.level);
    step.classList.toggle('passed',  lv < tree.level);
    step.classList.toggle('current', lv === tree.level);
  });

  // 進度條
  const expMin = tree.expForCurrentLevel;
  const expMax = tree.expForNextLevel ?? tree.currentExp;
  const pct    = expMax > expMin
    ? Math.min(100, ((tree.currentExp - expMin) / (expMax - expMin)) * 100)
    : 100;
  document.getElementById('g-exp-bar').style.width   = `${pct}%`;
  document.getElementById('g-exp-text').textContent  = tree.expForNextLevel
    ? `${tree.currentExp} / ${tree.expForNextLevel} EXP`
    : `${tree.currentExp} EXP・可移栽！`;

  // 移栽按鈕
  const harvestBtn  = document.getElementById('btn-harvest');
  const harvestItem = document.getElementById('harvest-item');
  harvestBtn.disabled = !tree.canHarvest;
  harvestItem.classList.toggle('game-harvest-ready', tree.canHarvest);
}

async function performGameAction(action, region = null) {
  const btnId    = action === 'harvest' ? 'btn-harvest' : `btn-${action}`;
  const btn      = document.getElementById(btnId);
  const feedback = document.getElementById('g-feedback');
  const visual   = document.getElementById('g-tree-visual');

  if (!btn || btn.disabled) return;

  btn.disabled    = true;
  btn.textContent = '處理中...';
  feedback.innerHTML = '';

  try {
    const body = { action };
    if (action === 'harvest' && region) body.region = region;

    const data = await apiRequest('/api/game/action', {
      method: 'POST',
      body,
    });

    // 成功脈衝動畫
    visual.classList.add('game-tree-pulse');
    setTimeout(() => visual.classList.remove('game-tree-pulse'), 600);

    // 漣漪特效
    if (action !== 'harvest') {
      const ripple = document.getElementById('g-tree-ripple');
      const cls    = action === 'water' ? 'ripple-water' : 'ripple-fertilize';
      ripple.classList.add(cls);
      setTimeout(() => ripple.classList.remove(cls), 900);
    }

    if (data.leveledUp) {
      showGameFeedback(`🎉 升級！樹木成長到 Lv.${data.tree.level}（${TREE_STAGES[data.tree.level - 1].name}）！`, 'success');
    } else if (data.harvested) {
      showGameFeedback(`🌲 成功移栽至${data.regionName}！這棵樹已加入台灣${data.regionName}的碳匯森林，新的種子正在萌芽...`, 'success');
      await loadMapData();
    } else {
      const label = action === 'water' ? '澆水' : '施肥';
      showGameFeedback(`✓ ${label}成功 · +${data.expGained} EXP · 消耗 ${data.coinSpent} CCN`, 'ok');
    }

    await loadGameStatus();

  } catch (error) {
    visual.classList.add('game-tree-shake');
    setTimeout(() => visual.classList.remove('game-tree-shake'), 500);
    showGameFeedback(error.message, 'error');
  } finally {
    const labels = { water: '澆水', fertilize: '施肥', harvest: '移栽' };
    if (btn) {
      btn.textContent = labels[action];
      btn.disabled    = false;
    }
  }
}

function showGameFeedback(msg, type) {
  const el = document.getElementById('g-feedback');
  if (!el) return;
  const cls = { success: 'game-feedback-success', ok: 'game-feedback-ok', error: 'inline-error' };
  el.innerHTML = `<div class="${cls[type] || 'game-feedback-ok'}">${msg}</div>`;
}
