// js/pages/scan.js — AI 掃描辨識頁（清單模式）

let scanning = false;
let autoScanEnabled = false;
let countdownInterval = null;
let countdownSec = 3;
let scannedItems = [];

const WASTE_CATALOG = [
  { id: 'pet-bottle',    name: 'PET 寶特瓶',   material: '塑膠類',    size: '中型', cleanliness: '乾淨',   bin: '塑膠回收桶', basePoints: 40, sizeMultiplier: 1,   cleanlinessMultiplier: 1 },
  { id: 'aluminum-can',  name: '鋁罐',          material: '金屬類',    size: '小型', cleanliness: '乾淨',   bin: '金屬回收桶', basePoints: 60, sizeMultiplier: 0.8, cleanlinessMultiplier: 1 },
  { id: 'cardboard',     name: '紙板',          material: '紙類',      size: '大型', cleanliness: '乾淨',   bin: '紙類回收桶', basePoints: 25, sizeMultiplier: 1.3, cleanlinessMultiplier: 1 },
  { id: 'glass-bottle',  name: '玻璃瓶',        material: '玻璃類',    size: '中型', cleanliness: '乾淨',   bin: '玻璃回收桶', basePoints: 45, sizeMultiplier: 1,   cleanlinessMultiplier: 1 },
  { id: 'oily-lunchbox', name: '有油污餐盒',    material: '污染回收物', size: '中型', cleanliness: '嚴重油污', bin: '一般垃圾桶', basePoints: 25, sizeMultiplier: 1,   cleanlinessMultiplier: 0 },
  { id: 'general-waste', name: '一般垃圾',      material: '不可回收物', size: '中型', cleanliness: '不適用', bin: '一般垃圾桶', basePoints: 0,  sizeMultiplier: 1,   cleanlinessMultiplier: 0 }
];

const SIZE_MULTIPLIERS      = { '小型': 0.8, '中型': 1, '大型': 1.3 };
const CLEANLINESS_MULTIPLIERS = { '乾淨': 1, '輕微殘留': 0.7, '嚴重油污': 0, '不適用': 0 };

function calculatePoints(item) {
  const sm = SIZE_MULTIPLIERS[item.size] ?? 1;
  const cm = CLEANLINESS_MULTIPLIERS[item.cleanliness] ?? 0;
  return Math.round(item.basePoints * sm * cm);
}

function renderScan(container) {
  scanning = false;
  autoScanEnabled = false;
  scannedItems = [];
  clearCountdown();

  container.innerHTML = `
    <div class="scan-layout">

      <div class="cam-frame" id="cam-frame">
        <div class="scan-line"></div>

        <div id="auto-countdown" style="
          display:none; position:absolute; top:18px; left:50%;
          transform:translateX(-50%); z-index:20; text-align:center;">
          <div style="background:rgba(0,0,0,.55);backdrop-filter:blur(6px);
            border-radius:999px;padding:6px 20px;display:flex;align-items:center;gap:8px;">
            <span style="color:#4ade80;font-size:11px;font-weight:700;letter-spacing:1px">AUTO</span>
            <span id="countdown-num" style="font-family:'Syne',sans-serif;font-size:22px;
              font-weight:800;color:#fff;min-width:24px;text-align:center;line-height:1;">3</span>
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

        <div class="scan-controls">
          <button class="scan-btn" id="scan-btn" onclick="startScan()">啟動辨識</button>
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
        </div>

        <div class="scan-list">
          <div class="scan-list-header">
            掃描清單
            <span class="scan-list-count" id="scan-count">0 件</span>
          </div>
          <div class="scan-list-items" id="scan-list-items">
            <div class="scan-list-empty">尚未掃描任何物品<br><span style="font-size:11px">拍照後自動加入清單</span></div>
          </div>
          <div class="scan-list-footer">
            <div class="scan-total-row">
              <span>預計點數</span>
              <span class="scan-total-points" id="scan-total-points">0 CCN</span>
            </div>
            <button class="btn-confirm-all" id="confirm-all-btn" onclick="confirmAllScans()" disabled>
              確認全部投入 ✓
            </button>
          </div>
        </div>

      </div>
    </div>

    <div class="item-stats-card">
      <div class="item-stats-header">
        <span class="item-stats-title">累積回收紀錄</span>
        <span class="item-stats-sub" id="item-stats-sub"></span>
      </div>
      <div id="item-stats-body"><div class="scan-list-empty" style="padding:16px 0">讀取中...</div></div>
    </div>
  `;

  startCamera();
  loadItemStats();
}

async function loadItemStats() {
  const body  = document.getElementById('item-stats-body');
  const sub   = document.getElementById('item-stats-sub');
  if (!body) return;
  try {
    const { items } = await apiRequest('/api/stats/items');
    const total = items.reduce((s, i) => s + i.count, 0);
    const max   = Math.max(...items.map(i => i.count), 1);
    if (sub) sub.textContent = `共 ${total} 筆`;
    body.innerHTML = items.map(item => {
      const pct = Math.round((item.count / max) * 100);
      return `
        <div class="stat-bar-row">
          <div class="stat-bar-label">${item.name}</div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="stat-bar-count">${item.count}</div>
        </div>`;
    }).join('');
  } catch {
    if (body) body.innerHTML = '<div class="scan-list-empty" style="padding:16px 0">無法載入統計</div>';
  }
}

function renderScanList() {
  const countEl    = document.getElementById('scan-count');
  const listEl     = document.getElementById('scan-list-items');
  const totalEl    = document.getElementById('scan-total-points');
  const confirmBtn = document.getElementById('confirm-all-btn');
  if (!listEl) return;

  const total = scannedItems.reduce((sum, item) => sum + calculatePoints(item), 0);
  if (countEl)    countEl.textContent = `${scannedItems.length} 件`;
  if (totalEl)    totalEl.textContent = `${total} CCN`;
  if (confirmBtn) confirmBtn.disabled = scannedItems.length === 0;

  if (scannedItems.length === 0) {
    listEl.innerHTML = `
      <div class="scan-list-empty">
        尚未掃描任何物品<br>
        <span style="font-size:11px">拍照後自動加入清單</span>
      </div>`;
    return;
  }

  listEl.innerHTML = scannedItems.map((item, i) => {
    const pts = calculatePoints(item);
    return `
      <div class="scan-list-item">
        <div class="scan-item-info">
          <div class="scan-item-name">${item.name}</div>
          <div class="scan-item-meta">${item.material} · ${item.size} · ${item.cleanliness}</div>
        </div>
        <div class="scan-item-points">${pts > 0 ? `+${pts}` : '0'} CCN</div>
        <button class="btn-remove-item" onclick="removeScannedItem(${i})" title="移除">×</button>
      </div>`;
  }).join('');
}

function removeScannedItem(index) {
  scannedItems.splice(index, 1);
  renderScanList();
}

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
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
  const row = document.getElementById('auto-scan-row');
  const sub = document.getElementById('auto-scan-sub');
  if (row) row.classList.toggle('auto-active', enabled);
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
  const numEl       = document.getElementById('countdown-num');
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
      if (autoScanEnabled && !scanning) startScan(true);
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

async function startScan(fromAuto) {
  if (scanning) return;
  scanning = true;
  clearCountdown();

  const btn     = document.getElementById('scan-btn');
  const overlay = document.getElementById('scanning-overlay');
  if (btn)     btn.disabled = true;
  if (overlay) overlay.classList.add('active');

  try {
    const imageBlob = captureFrame();
    if (!imageBlob) {
      alert('請先允許相機存取權限。');
      return;
    }

    const formData = new FormData();
    formData.append('image', imageBlob, 'capture.jpg');
    const result = await apiRequest('/api/classify', { method: 'POST', body: formData });

    const match = WASTE_CATALOG.find(w => w.id === result.itemId) || WASTE_CATALOG[WASTE_CATALOG.length - 1];
    scannedItems.push({
      ...match,
      size:        result.size        || match.size,
      cleanliness: result.cleanliness || match.cleanliness,
      confidence:  Math.round((result.confidence ?? 0) * 100)
    });
    renderScanList();

  } catch (error) {
    alert(`AI 辨識失敗：${error.message}`);
  } finally {
    if (overlay) overlay.classList.remove('active');
    scanning = false;
    if (btn)  btn.disabled = false;
    if (autoScanEnabled) setTimeout(() => runAutoCountdown(), 500);
  }
}

function captureFrame() {
  const video = document.getElementById('cam-video');
  if (!video || video.style.display === 'none' || video.readyState < 2) return null;
  const canvas = document.createElement('canvas');
  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return dataURLtoBlob(canvas.toDataURL('image/jpeg', 0.85));
}

function dataURLtoBlob(dataURL) {
  const [header, data] = dataURL.split(',');
  const mime  = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function confirmAllScans() {
  if (scannedItems.length === 0) return;

  autoScanEnabled = false;
  const toggle = document.getElementById('auto-scan-toggle');
  if (toggle) toggle.checked = false;
  clearCountdown();

  const confirmBtn = document.getElementById('confirm-all-btn');
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = '儲存中...';
  }

  let successCount = 0;
  let totalPoints  = 0;
  const errors     = [];

  for (const item of scannedItems) {
    try {
      const record = await apiRequest('/api/records', {
        method: 'POST',
        body: {
          itemId:      item.id,
          size:        item.size,
          cleanliness: item.cleanliness,
          confidence:  item.confidence
        }
      });
      successCount++;
      totalPoints += record.points;
    } catch (err) {
      errors.push(`${item.name}：${err.message}`);
    }
  }

  if (successCount > 0) {
    alert(`成功記錄 ${successCount} 件回收物\n獲得點數：+${totalPoints} CCN`);
    scannedItems = [];
    renderScanList();
    switchPage('dashboard');
  } else {
    alert(`儲存失敗：\n${errors.join('\n')}`);
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.textContent = '確認全部投入 ✓';
    }
  }
}
