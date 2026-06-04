// js/pages/scan.js — AI 掃描辨識頁

let scanning = false;
let autoScanEnabled = false;
let countdownInterval = null;
let countdownSec = 3;
let selectedWasteId = 'pet-bottle';
let latestScanResult = null;

const WASTE_CATALOG = [
  {
    id: 'pet-bottle',
    name: 'PET 寶特瓶',
    material: '塑膠類',
    size: '中型',
    cleanliness: '乾淨',
    bin: '塑膠回收桶',
    basePoints: 40,
    sizeMultiplier: 1,
    cleanlinessMultiplier: 1,
    confidence: 94,
    note: '請先倒空內容物，瓶身壓扁後再投入塑膠回收桶。'
  },
  {
    id: 'aluminum-can',
    name: '鋁罐',
    material: '金屬類',
    size: '小型',
    cleanliness: '乾淨',
    bin: '金屬回收桶',
    basePoints: 60,
    sizeMultiplier: 0.8,
    cleanlinessMultiplier: 1,
    confidence: 96,
    note: '請確認罐內已排空，壓扁後可提升桶內收納效率。'
  },
  {
    id: 'cardboard',
    name: '紙板',
    material: '紙類',
    size: '大型',
    cleanliness: '乾淨',
    bin: '紙類回收桶',
    basePoints: 25,
    sizeMultiplier: 1.3,
    cleanlinessMultiplier: 1,
    confidence: 91,
    note: '請攤平或摺疊紙板，避免混入膠帶、食物殘渣與油污。'
  },
  {
    id: 'glass-bottle',
    name: '玻璃瓶',
    material: '玻璃類',
    size: '中型',
    cleanliness: '乾淨',
    bin: '玻璃回收桶',
    basePoints: 45,
    sizeMultiplier: 1,
    cleanlinessMultiplier: 1,
    confidence: 93,
    note: '請清空瓶內液體，保持瓶身完整，避免破裂造成清運風險。'
  },
  {
    id: 'oily-lunchbox',
    name: '有油污餐盒',
    material: '污染回收物',
    size: '中型',
    cleanliness: '嚴重油污',
    bin: '一般垃圾桶',
    basePoints: 25,
    sizeMultiplier: 1,
    cleanlinessMultiplier: 0,
    confidence: 88,
    note: '油污會降低回收純淨度，未清洗前不發放回收點數。'
  },
  {
    id: 'general-waste',
    name: '一般垃圾',
    material: '不可回收物',
    size: '中型',
    cleanliness: '不適用',
    bin: '一般垃圾桶',
    basePoints: 0,
    sizeMultiplier: 1,
    cleanlinessMultiplier: 0,
    confidence: 90,
    note: '此品項不屬於資源回收範圍，請投入一般垃圾桶。'
  }
];

function renderScan(container) {
  scanning = false;
  autoScanEnabled = false;
  clearCountdown();

  container.innerHTML = `
    <div class="scan-layout">
      <div class="cam-frame" id="cam-frame">
        <div class="scan-line"></div>

        <!-- 倒計時顯示：正上方中間 -->
        <div id="auto-countdown" style="
          display:none;
          position:absolute;
          top:18px;
          left:50%;
          transform:translateX(-50%);
          z-index:20;
          text-align:center;
        ">
          <div style="
            background:rgba(0,0,0,.55);
            backdrop-filter:blur(6px);
            border-radius:999px;
            padding:6px 20px;
            display:flex;
            align-items:center;
            gap:8px;
          ">
            <span style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:1px">AUTO</span>
            <span id="countdown-num" style="
              font-family:'Syne',sans-serif;
              font-size:22px;
              font-weight:800;
              color:#fff;
              min-width:24px;
              text-align:center;
              line-height:1;
            ">3</span>
            <span style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:1px">s</span>
          </div>
        </div>

        <div class="cam-ph">
          <div class="cam-ph-icon">📷</div>
          <div class="cam-ph-text">CAMERA FEED</div>
        </div>
        <video id="cam-video" autoplay playsinline muted
          style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"></video>
        <div class="scanning-overlay" id="scanning-overlay">
          <div class="scan-ring"></div>
        </div>
      </div>

      <div class="scan-panel">
        <div class="scan-idle" id="scan-idle">
          <div class="scan-idle-icon">📷</div>
          <div class="scan-idle-title">reloop Vision AI</div>
          <div class="scan-idle-sub">選擇展示品項後開始辨識，<br/>系統會依材質、大小與清潔度計算點數</div>
          <div class="waste-selector">
            ${WASTE_CATALOG.map(item => `
              <button class="waste-option ${item.id === selectedWasteId ? 'active' : ''}" onclick="selectWasteDemo('${item.id}')">
                <span>${item.name}</span>
                <small>${item.material}</small>
              </button>
            `).join('')}
          </div>
          <button class="scan-btn" id="scan-btn" onclick="startScan()">啟動辨識</button>
        </div>

        <!-- 自動辨識開關 -->
        <div class="auto-scan-row" id="auto-scan-row">
          <div class="auto-scan-info">
            <div class="auto-scan-title">🤖 自動辨識模式</div>
            <div class="auto-scan-sub" id="auto-scan-sub">開啟後每 3 秒自動掃描一次</div>
          </div>
          <label class="toggle-wrap" style="margin:0">
            <input type="checkbox" id="auto-scan-toggle" onchange="toggleAutoScan(this.checked)"/>
            <span class="toggle"></span>
          </label>
        </div>

        <div class="scan-result" id="scan-result"></div>
      </div>
    </div>
  `;

  startCamera();
}

function calculatePoints(item) {
  return Math.round(item.basePoints * item.sizeMultiplier * item.cleanlinessMultiplier);
}

function selectWasteDemo(itemId) {
  selectedWasteId = itemId;
  document.querySelectorAll('.waste-option').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(itemId));
  });
}

function getSelectedWaste() {
  return WASTE_CATALOG.find(item => item.id === selectedWasteId) || WASTE_CATALOG[0];
}

function renderScanResult(item) {
  const points = calculatePoints(item);
  const result = document.getElementById('scan-result');
  if (!result) return;

  latestScanResult = { ...item, points };
  result.innerHTML = `
    <div class="result-kicker">辨識結果</div>
    <div class="result-type">${item.name}</div>
    <div class="result-grid result-grid-4">
      <div class="result-stat">
        <div class="result-stat-label">材質</div>
        <div class="result-stat-val">${item.material}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">大小</div>
        <div class="result-stat-val">${item.size}</div>
      </div>
      <div class="result-stat">
        <div class="result-stat-label">清潔度</div>
        <div class="result-stat-val">${item.cleanliness}</div>
      </div>
      <div class="result-stat green">
        <div class="result-stat-label">Reward</div>
        <div class="result-stat-val">+${points} CCN</div>
      </div>
    </div>
    <div class="result-rule">
      <div>
        <strong>點數公式</strong>
        <span>${item.basePoints} 基礎分 × ${item.sizeMultiplier} 大小倍率 × ${item.cleanlinessMultiplier} 清潔度倍率 = ${points} CCN</span>
      </div>
      <div>
        <strong>建議投放</strong>
        <span>${item.bin}</span>
      </div>
      <div>
        <strong>信心分數</strong>
        <span>${item.confidence}%</span>
      </div>
    </div>
    <div class="${points > 0 ? 'result-tip' : 'result-tip warning'}">
      ${item.note}
    </div>
    <div class="result-actions">
      <button class="btn-retry" onclick="resetScan()">重試</button>
      <button class="btn-confirm" id="confirm-scan-btn" onclick="confirmScan()">確認投入系統 ✓</button>
    </div>
  `;
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const video = document.getElementById('cam-video');
    if (!video) return;
    video.srcObject = stream;
    video.style.display = 'block';
    const ph = document.querySelector('.cam-ph');
    if (ph) ph.style.display = 'none';
  } catch (e) {
    console.log('Camera unavailable:', e.message);
  }
}

function toggleAutoScan(enabled) {
  autoScanEnabled = enabled;
  clearCountdown();
  const sub = document.getElementById('auto-scan-sub');
  if (enabled) {
    if (sub) sub.textContent = '自動掃描進行中...';
    runAutoCountdown();
  } else {
    if (sub) sub.textContent = '開啟後每 3 秒自動掃描一次';
  }
}

function runAutoCountdown() {
  if (!autoScanEnabled || scanning) return;

  countdownSec = 3;
  const countdownEl = document.getElementById('auto-countdown');
  const numEl = document.getElementById('countdown-num');
  if (!countdownEl || !numEl) return;

  numEl.textContent = countdownSec;
  countdownEl.style.display = 'block';

  countdownInterval = setInterval(() => {
    countdownSec--;
    const n = document.getElementById('countdown-num');
    if (n) n.textContent = countdownSec;

    if (countdownSec <= 0) {
      clearInterval(countdownInterval);
      countdownInterval = null;
      const el = document.getElementById('auto-countdown');
      if (el) el.style.display = 'none';
      // 實際觸發掃描
      if (autoScanEnabled && !scanning) {
        startScan(true);
      }
    }
  }, 1000);
}

function clearCountdown() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  const el = document.getElementById('auto-countdown');
  if (el) el.style.display = 'none';
}

function startScan(fromAuto) {
  if (scanning) return;
  scanning = true;
  clearCountdown();

  const btn = document.getElementById('scan-btn');
  if (btn) btn.disabled = true;
  const overlay = document.getElementById('scanning-overlay');
  if (overlay) overlay.classList.add('active');

  setTimeout(() => {
    if (overlay) overlay.classList.remove('active');
    renderScanResult(getSelectedWaste());
    const idle = document.getElementById('scan-idle');
    const autoRow = document.getElementById('auto-scan-row');
    const result = document.getElementById('scan-result');
    if (idle) idle.style.display = 'none';
    if (autoRow) autoRow.style.display = 'none';
    if (result) result.classList.add('show');
    scanning = false;
  }, 2200);
}

function resetScan() {
  scanning = false;
  const idle = document.getElementById('scan-idle');
  const autoRow = document.getElementById('auto-scan-row');
  const result = document.getElementById('scan-result');
  const btn = document.getElementById('scan-btn');
  if (idle) idle.style.display = '';
  if (autoRow) autoRow.style.display = '';
  if (result) result.classList.remove('show');
  if (btn) btn.disabled = false;
  latestScanResult = null;

  // 若自動模式仍開著，重新倒計時
  if (autoScanEnabled) {
    setTimeout(() => runAutoCountdown(), 300);
  }
}

async function confirmScan() {
  autoScanEnabled = false;
  clearCountdown();
  scanning = false;
  const confirmBtn = document.getElementById('confirm-scan-btn');
  if (confirmBtn) confirmBtn.disabled = true;

  try {
    if (latestScanResult) {
      const record = await apiRequest('/api/records', {
        method: 'POST',
        body: {
          itemId: latestScanResult.id,
          size: latestScanResult.size,
          cleanliness: latestScanResult.cleanliness,
          confidence: latestScanResult.confidence
        }
      });
      alert(`已記錄：${record.name}\n投放桶：${record.bin}\n獲得點數：${record.points} CCN`);
    }
    const toggle = document.getElementById('auto-scan-toggle');
    if (toggle) toggle.checked = false;
    resetScan();
    switchPage('dashboard');
  } catch (error) {
    alert(`寫入回收紀錄失敗：${error.message}`);
    if (confirmBtn) confirmBtn.disabled = false;
  }
}
