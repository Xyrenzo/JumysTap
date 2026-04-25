'use strict';

const API = window.JT?.API_BASE || '/api';

const $ = (id) => document.getElementById(id);

let loginName = '';
let registerName = '';
let activationTimer = null;

function setMsg(id, text, type = 'error') {
  const node = $(id);
  if (!node) return;
  node.textContent = text;
  node.className = `msg ${type}`;
}

function clearMsg(id) {
  const node = $(id);
  if (!node) return;
  node.textContent = '';
  node.className = 'msg';
}

function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle('loading', loading);
  button.disabled = loading;
}

async function apiFetch(path, options = {}) {
  if (window.JT?.apiFetch) return window.JT.apiFetch(path, options);

  const response = await fetch(API + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

function apiMessage(data, fallback) {
  if (window.JT?.message) return window.JT.message(data, fallback);
  return data?.message || data?.error || fallback;
}

function switchTab(tab) {
  const switcher = document.querySelector('.tab-switcher');
  if (switcher) switcher.dataset.active = tab;

  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.classList.remove('active');
  });
  document.querySelectorAll('.form-panel').forEach((panel) => {
    panel.classList.add('hidden');
  });

  $('tab-' + tab)?.classList.add('active');
  $('panel-' + tab)?.classList.remove('hidden');
}

async function requestCode() {
  const name = ($('login-name')?.value || '').trim();
  clearMsg('login-step1-msg');

  if (!name) {
    setMsg('login-step1-msg', 'Введите имя');
    return;
  }

  const button = $('btn-request-code');
  setLoading(button, true);

  try {
    const { ok, data } = await apiFetch('/auth/login/request', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    if (!ok) {
      setMsg('login-step1-msg', apiMessage(data, 'Ошибка отправки кода'));
      return;
    }

    loginName = name;
    $('login-code-hint').textContent = 'Код отправлен в Telegram';
    showStep('login', 1, 2);
  } catch {
    setMsg('login-step1-msg', 'Нет соединения с сервером');
  } finally {
    setLoading(button, false);
  }
}

async function loginWithCode() {
  const code = ($('login-code')?.value || '').trim();
  clearMsg('login-step2-msg');

  if (!code) {
    setMsg('login-step2-msg', 'Введите код');
    return;
  }

  const button = document.querySelector('#login-step-2 .btn--primary');
  setLoading(button, true);

  try {
    const { ok, data } = await apiFetch('/auth/login/verify', {
      method: 'POST',
      body: JSON.stringify({
        name: loginName,
        code,
      }),
    });

    if (!ok) {
      setMsg('login-step2-msg', apiMessage(data, 'Неверный код'));
      return;
    }

    const token = data?.token || '';
    window.JT?.setToken?.(token);

    if (data?.user) window.JT?.saveProfileSnapshot?.(data.user);
    await loadProfile();
    showStep('login', 2, 3);
  } catch {
    setMsg('login-step2-msg', 'Нет соединения с сервером');
  } finally {
    setLoading(button, false);
  }
}

async function loadProfile() {
  try {
    const { ok, data } = await apiFetch('/profile', { method: 'GET' });
    const node = $('profile-data');
    if (!node) return;

    if (!ok) {
      node.innerHTML = '<div>Профиль недоступен</div>';
      return;
    }

    window.JT?.saveProfileSnapshot?.(data);

    node.innerHTML = `
      <div><strong>Имя:</strong> ${esc(data.displayName || data.name || '—')}</div>
      <div><strong>Телефон:</strong> ${esc(data.phone || '—')}</div>
      <div><strong>Город:</strong> ${esc(data.city || '—')}</div>
      <div><strong>Роль:</strong> ${esc(data.role || 'не выбрана')}</div>
    `;
  } catch {
    if ($('profile-data')) $('profile-data').innerHTML = '<div>Ошибка загрузки профиля</div>';
  }
}

function logout() {
  window.JT?.clearAuth?.();
  loginName = '';

  if ($('login-name')) $('login-name').value = '';
  if ($('login-code')) $('login-code').value = '';
  if ($('profile-data')) $('profile-data').innerHTML = '';

  showStep('login', 3, 1);
}

function goBack(panel) {
  if (panel === 'login') showStep('login', 2, 1);
}

async function register() {
  const name = ($('reg-name')?.value || '').trim();
  const phone = ($('reg-phone')?.value || '').trim();
  const city = ($('reg-city')?.value || '').trim();

  clearMsg('reg-step1-msg');

  if (!name) {
    setMsg('reg-step1-msg', 'Введите имя');
    return;
  }
  if (!phone) {
    setMsg('reg-step1-msg', 'Введите номер');
    return;
  }
  if (!city) {
    setMsg('reg-step1-msg', 'Введите город');
    return;
  }

  const button = document.querySelector('#reg-step-1 .btn--primary');
  setLoading(button, true);

  try {
    const { ok, data } = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, phone, city }),
    });

    if (!ok) {
      setMsg('reg-step1-msg', apiMessage(data, 'Ошибка регистрации'));
      return;
    }

    registerName = name;
    if ($('reg-tg-link')) $('reg-tg-link').href = data.verificationLink || '#';
    if ($('reg-tg-info')) {
      $('reg-tg-info').innerHTML = '<div>Откройте Telegram и активируйте аккаунт через бота.</div>';
    }

    showStep('register', 1, 2);
    startActivationPolling();
  } catch {
    setMsg('reg-step1-msg', 'Нет соединения с сервером');
  } finally {
    setLoading(button, false);
  }
}

function startActivationPolling() {
  if (activationTimer) clearInterval(activationTimer);

  activationTimer = setInterval(async () => {
    try {
      const { ok, data } = await apiFetch(`/auth/status?name=${encodeURIComponent(registerName)}`, {
        method: 'GET',
      });

      if (!ok || !data?.activated) return;

      clearInterval(activationTimer);
      activationTimer = null;

      if ($('reg-tg-info')) {
        $('reg-tg-info').innerHTML = '<div>Telegram успешно активирован. Теперь можно войти.</div>';
      }
      if ($('login-name')) $('login-name').value = registerName;
    } catch {
      // ignore polling errors
    }
  }, 3000);
}

function showStep(panel, from, to) {
  const prefix = panel === 'login' ? 'login-step-' : 'reg-step-';
  $(prefix + from)?.classList.add('hidden');
  $(prefix + to)?.classList.remove('hidden');
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[char]);
}

(async function init() {
  const token = window.JT?.getToken?.() || '';
  if (!token) return;

  await loadProfile();
  showStep('login', 1, 3);
})();
