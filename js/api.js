// js/api.js — frontend API client

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : window.location.origin;

const SESSION_KEY = 'reloop_session';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch (error) {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  updateUserBadge(session.user);
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getAuthToken() {
  return getSession()?.token || null;
}

async function apiRequest(path, options = {}) {
  const headers = { ...(options.headers || {}), 'ngrok-skip-browser-warning': '1' };
  const token = getAuthToken();

  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body && !(options.body instanceof FormData)
      ? JSON.stringify(options.body)
      : options.body
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') {
      clearSession();
      document.getElementById('app').style.display = 'none';
      document.getElementById('auth-screen').style.display = 'flex';
      showAuthMessage('登入狀態已過期，請重新登入。');
    }
    throw new Error(data.error || data.message || 'API request failed.');
  }
  return data;
}

function updateUserBadge(user) {
  if (!user) return;
  const nameEl = document.querySelector('.user-name');
  const avatarEl = document.querySelector('.avatar');
  if (nameEl) nameEl.textContent = user.name;
  if (avatarEl) {
    avatarEl.textContent = user.name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}

function showAuthMessage(message, type = 'error') {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = message;
  el.className = `auth-message ${type}`;
}
