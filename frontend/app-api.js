'use strict';

(() => {
  const API_BASE = 'http://localhost:8080/api';

  function getToken() {
    return localStorage.getItem('jt_token') || '';
  }

  function setToken(token) {
    if (token) localStorage.setItem('jt_token', token);
    else localStorage.removeItem('jt_token');
  }

  function loadJSON(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  }

  async function apiFetch(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === 'content-type');
    if (!hasContentType && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const token = getToken();
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    return { ok: response.ok, status: response.status, data };
  }

  function message(data, fallback) {
    return data?.message || data?.error || fallback;
  }

  function saveProfileSnapshot(profile) {
    if (!profile) return;

    saveJSON('jt_profile', profile);
    saveJSON('jt_current_user', {
      id: profile.id || '',
      name: profile.name || '',
      displayName: profile.displayName || profile.name || '',
      city: profile.city || '',
      role: profile.role || '',
      phone: profile.phone || '',
      tgVerified: Boolean(profile.tgVerified),
      avatar: profile.avatar || '',
    });
  }

  function clearAuth() {
    localStorage.removeItem('jt_token');
    localStorage.removeItem('jt_profile');
    localStorage.removeItem('jt_current_user');
  }

  function requireAuth(redirect = 'index.html') {
    if (getToken()) return true;
    if (typeof window !== 'undefined') window.location.href = redirect;
    return false;
  }

  window.JT = {
    API_BASE,
    apiFetch,
    clearAuth,
    getToken,
    loadCurrentUser: () => loadJSON('jt_current_user', null),
    loadJSON,
    loadProfileSnapshot: () => loadJSON('jt_profile', null),
    message,
    requireAuth,
    saveJSON,
    saveProfileSnapshot,
    setToken,
  };
})();
