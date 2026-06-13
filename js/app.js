// js/app.js — 核心路由、設定面板、主題切換

const PAGE_LABELS = {
  dashboard: 'Overview',
  scan:      'AI Vision',
  stats:     'Analytics',
  rewards:   'Rewards',
  game:      'Eco-Tree Game',
};

let currentPage = 'dashboard';

function switchPage(pageId) {
  currentPage = pageId;
  document.getElementById('topbar-label').textContent = PAGE_LABELS[pageId] || pageId;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  const content = document.getElementById('content');
  content.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'page-anim';

  switch (pageId) {
    case 'dashboard': renderDashboard(wrapper); break;
    case 'scan':      renderScan(wrapper);      break;
    case 'stats':     renderStats(wrapper);     break;
    case 'rewards':   renderRewards(wrapper);   break;
    case 'game':      renderGamePage(wrapper);  break;
  }

  content.appendChild(wrapper);
}

function toggleSettings(forceClose) {
  const drawer = document.getElementById('settings-drawer');
  const overlay = document.getElementById('settings-overlay');
  const isOpen = drawer.classList.contains('open');
  if (forceClose || isOpen) {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
  } else {
    drawer.classList.add('open');
    overlay.classList.add('open');
  }
}

function setTheme(mode) {
  document.body.classList.toggle('dark', mode === 'dark');
  document.getElementById('btn-light').classList.toggle('active', mode === 'light');
  document.getElementById('btn-dark').classList.toggle('active', mode === 'dark');
}
