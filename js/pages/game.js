// js/pages/game.js — Eco-Tree Game

const TREE_STAGES = [
  { level: 1, name: '種子',  visual: '🌱', desc: '剛萌芽的小種子，充滿無限潛能。' },
  { level: 2, name: '幼苗',  visual: '🪴', desc: '嫩綠的幼苗，正努力向陽生長。' },
  { level: 3, name: '小樹',  visual: '🌳', desc: '茁壯的小樹，枝葉日漸茂盛。' },
  { level: 4, name: '成樹',  visual: '🌲', desc: '繁茂的大樹，已可移栽入碳匯森林！' },
];

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
            <div class="game-action-exp">計入碳匯・重置新樹</div>
            <button class="btn-primary game-action-btn game-harvest-btn" id="btn-harvest"
                    onclick="performGameAction('harvest')" disabled>移栽</button>
          </div>

        </div>
        <div class="game-feedback" id="g-feedback"></div>
      </div>

    </div>
  `;

  loadGameStatus();
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
  const expMin  = tree.expForCurrentLevel;
  const expMax  = tree.expForNextLevel ?? tree.currentExp;
  const pct     = expMax > expMin
    ? Math.min(100, ((tree.currentExp - expMin) / (expMax - expMin)) * 100)
    : 100;
  document.getElementById('g-exp-bar').style.width = `${pct}%`;
  document.getElementById('g-exp-text').textContent = tree.expForNextLevel
    ? `${tree.currentExp} / ${tree.expForNextLevel} EXP`
    : `${tree.currentExp} EXP・可移栽！`;

  // 移栽按鈕
  const harvestBtn  = document.getElementById('btn-harvest');
  const harvestItem = document.getElementById('harvest-item');
  harvestBtn.disabled = !tree.canHarvest;
  harvestItem.classList.toggle('game-harvest-ready', tree.canHarvest);
}

async function performGameAction(action) {
  const btnId    = `btn-${action}`;
  const btn      = document.getElementById(btnId);
  const feedback = document.getElementById('g-feedback');
  const visual   = document.getElementById('g-tree-visual');

  if (!btn || btn.disabled) return;

  btn.disabled    = true;
  btn.textContent = '處理中...';
  feedback.innerHTML = '';

  try {
    const data = await apiRequest('/api/game/action', {
      method: 'POST',
      body: { action },
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
      showGameFeedback('🌲 成功移栽！這棵樹已加入碳匯森林，新的種子正在萌芽...', 'success');
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
