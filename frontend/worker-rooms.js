'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  all: [],
  prefs: {
    anim: true,
    compact: false,
    defaultPaySort: false,
    defaultUrgent: false,
    openOnCard: false,
  },
  toastTimer: null,
};

const CARD_GRADIENTS = [
  'linear-gradient(135deg, rgba(59,130,246,.35), rgba(34,211,238,.28))',
  'linear-gradient(135deg, rgba(14,165,233,.32), rgba(59,130,246,.22))',
  'linear-gradient(135deg, rgba(34,211,238,.26), rgba(59,130,246,.26))',
  'linear-gradient(135deg, rgba(59,130,246,.24), rgba(34,211,238,.2))',
  'linear-gradient(135deg, rgba(14,165,233,.24), rgba(34,211,238,.18))',
];

function apiFetch(path, options = {}) {
  if (window.JT?.apiFetch) return window.JT.apiFetch(path, options);

  return fetch(`http://localhost:8080/api${path}`, options).then(async (response) => {
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    return { ok: response.ok, status: response.status, data };
  });
}

function apiMessage(data, fallback) {
  if (window.JT?.message) return window.JT.message(data, fallback);
  return data?.message || data?.error || fallback;
}

function esc(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part.slice(0, 1).toUpperCase()).join('') || 'JT';
}

function gradientFor(text) {
  const value = String(text || 'JT');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return CARD_GRADIENTS[hash % CARD_GRADIENTS.length];
}

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('ru-RU').format(Math.round(number));
}

function relativeTime(iso) {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';

  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;

  const days = Math.floor(hours / 24);
  return `${days} д назад`;
}

function toast(text) {
  clearTimeout(state.toastTimer);
  const toastNode = $('#toast');
  const label = $('#toast-text');
  if (label) label.textContent = text;
  if (toastNode) toastNode.classList.remove('hidden');
  state.toastTimer = setTimeout(() => toastNode?.classList.add('hidden'), 1800);
}

function normalizeJobs(rawJobs) {
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];

  return jobs.map((job) => {
    const paymentRaw = String(job?.salary ?? '').trim();
    const payment = paymentRaw ? Number(paymentRaw) : Number.NaN;

    return {
      address: job?.address || '',
      availability: Array.isArray(job?.availability) ? job.availability : [],
      avatarBg: gradientFor(job?.authorName || job?.title || ''),
      city: job?.city || '',
      contactPhone: job?.contactPhone || '',
      createdAt: job?.createdAt || '',
      date: job?.date || '',
      description: job?.description || '',
      employerName: job?.authorName || 'Работодатель',
      experienceRequired: job?.experienceRequired || '',
      id: job?.id || '',
      imageUrl: job?.imageUrl || '',
      jobType: job?.jobType || '',
      payment: Number.isFinite(payment) ? payment : null,
      peopleNeeded: job?.peopleNeeded ?? null,
      requiredSkills: Array.isArray(job?.skills) ? job.skills : [],
      salary: job?.salary || '',
      title: job?.title || '',
      urgent: Boolean(job?.urgent),
      workFormat: job?.workFormat || '',
    };
  });
}

function loadMeFromSnapshot(profile) {
  const avatarImg = $('#me-avatar');
  const fallback = $('#me-fallback');

  const displayName = profile?.displayName || profile?.name || 'Мой профиль';
  const avatar = profile?.avatar || '';

  if (fallback) fallback.textContent = initials(displayName);
  if (!avatarImg) return;

  if (avatar) {
    avatarImg.src = avatar;
    avatarImg.classList.remove('hidden');
    fallback?.classList.add('hidden');
  } else {
    avatarImg.classList.add('hidden');
    fallback?.classList.remove('hidden');
  }
}

async function loadMe() {
  const cached = window.JT?.loadProfileSnapshot?.() || null;
  loadMeFromSnapshot(cached);

  if (!window.JT?.getToken?.()) return;

  const { ok, status, data } = await apiFetch('/profile', { method: 'GET' });
  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
    }
    return;
  }

  window.JT?.saveProfileSnapshot?.(data);
  loadMeFromSnapshot(data);
}

function matchesSearch(room, query) {
  if (!query) return true;

  const haystack = [
    room.employerName,
    room.city,
    room.title,
    room.description,
    room.address,
    ...(room.requiredSkills || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function roomTypeLabel(jobType) {
  return jobType === 'vacancy' ? 'вакансия' : jobType === 'freelance' ? 'фриланс' : '—';
}

function paymentHint(jobType) {
  return jobType === 'vacancy' ? '₸ / мес' : '₸ за задачу';
}

function openRoom(room) {
  try {
    localStorage.setItem('jt_room_active', JSON.stringify(room));
  } catch {
    // ignore storage errors
  }

  toast('Открываем комнату...');
  setTimeout(() => {
    window.location.href = `room-detail.html?id=${encodeURIComponent(room.id)}`;
  }, 220);
}

function render(list) {
  const grid = $('#rooms');
  const empty = $('#empty');
  const pill = $('#count-pill');
  if (!grid) return;

  grid.replaceChildren();
  if (pill) pill.textContent = `${list.length} комнат`;
  if (empty) empty.classList.toggle('hidden', list.length !== 0);

  for (const room of list) {
    const card = document.createElement('article');
    card.className = 'room';
    card.tabIndex = 0;
    card.dataset.id = room.id;

    const sub = `${roomTypeLabel(room.jobType)} • ${esc(room.city || 'Город не указан')} • ${relativeTime(room.createdAt)}`;
    const skills = (room.requiredSkills || []).slice(0, 4);
    const more = (room.requiredSkills || []).length - skills.length;

    card.innerHTML = `
      <div class="room__top">
        <div class="avatar" style="background:${esc(room.avatarBg)}">
          <div class="avatar__initials">${esc(initials(room.employerName))}</div>
        </div>
        <div class="meta">
          <div class="meta__name">${esc(room.employerName)}</div>
          <div class="meta__sub">${sub}</div>
        </div>
        <div class="money" aria-label="Оплата">
          <div class="money__value">${formatMoney(room.payment)} ₸</div>
          <div class="money__hint">${paymentHint(room.jobType)}</div>
        </div>
      </div>

      <div class="badges">
        <span class="badge"><span class="badge__dot"></span> ${roomTypeLabel(room.jobType)}</span>
        ${room.urgent ? '<span class="badge badge--urgent"><span class="badge__dot"></span> срочно</span>' : ''}
      </div>

      <h3 class="room__title">${esc(room.title || 'Без названия')}</h3>
      <p class="room__desc">${esc(room.description || '')}</p>

      <div class="room__bottom">
        <div class="tags" aria-label="Навыки">
          ${skills.map((skill) => `<span class="tag">${esc(skill)}</span>`).join('')}
          ${more > 0 ? `<span class="tag">+${more}</span>` : ''}
        </div>
        <div class="enter">
          <button class="btn btn--outline" type="button" data-enter="true">Войти</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-enter="true"]')) {
        openRoom(room);
        return;
      }
      if (state.prefs.openOnCard) openRoom(room);
    });
    card.addEventListener('dblclick', () => openRoom(room));
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') openRoom(room);
    });

    grid.appendChild(card);
  }
}

function buildLocationOptions(rooms) {
  const select = $('#loc');
  if (!select) return;

  const current = select.value || 'all';
  const cities = Array.from(
    new Set(
      rooms
        .map((room) => String(room.city || '').trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'ru'));

  select.replaceChildren();

  const all = document.createElement('option');
  all.value = 'all';
  all.textContent = 'Все города';
  select.appendChild(all);

  for (const city of cities) {
    const option = document.createElement('option');
    option.value = city;
    option.textContent = city;
    select.appendChild(option);
  }

  select.value = cities.includes(current) ? current : 'all';
}

function applyFilters() {
  const query = ($('#q')?.value || '').trim();
  const sort = $('#sort')?.value || 'new';
  const type = $('#type')?.value || 'all';
  const location = $('#loc')?.value || 'all';
  const urgentOnly = Boolean($('#urgentOnly')?.checked);

  let list = state.all.slice();

  if (type !== 'all') list = list.filter((room) => room.jobType === type);
  if (location !== 'all') list = list.filter((room) => String(room.city || '').toLowerCase() === location.toLowerCase());
  if (urgentOnly) list = list.filter((room) => room.urgent);
  if (query) list = list.filter((room) => matchesSearch(room, query));

  list.sort((left, right) => {
    if (sort === 'new') return Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0);
    if (sort === 'pay_desc') return (right.payment || 0) - (left.payment || 0);
    if (sort === 'pay_asc') return (left.payment || 0) - (right.payment || 0);
    if (sort === 'az') return String(left.employerName || '').localeCompare(String(right.employerName || ''), 'ru');
    return 0;
  });

  render(list);
}

async function loadRooms(showRefreshToast = false) {
  const { ok, data } = await apiFetch('/jobs?limit=100&offset=0', { method: 'GET' });
  if (!ok) {
    toast(apiMessage(data, 'Не удалось загрузить задания.'));
    return;
  }

  state.all = normalizeJobs(data?.jobs);
  buildLocationOptions(state.all);
  applyFilters();

  if (showRefreshToast) toast('Список обновлён');
}

function applyPrefs() {
  const compact = Boolean($('#pref-compact')?.checked);
  const anim = Boolean($('#pref-anim')?.checked);
  const defaultUrgent = Boolean($('#pref-default-urgent')?.checked);
  const defaultPaySort = Boolean($('#pref-default-pay')?.checked);
  const openOnCard = Boolean($('#pref-open-card')?.checked);

  state.prefs = { compact, anim, defaultUrgent, defaultPaySort, openOnCard };
  document.body.classList.toggle('is-compact', compact);
  document.body.classList.toggle('no-anim', !anim);

  try {
    localStorage.setItem('jt_rooms_compact', compact ? '1' : '0');
    localStorage.setItem('jt_rooms_anim', anim ? '1' : '0');
    localStorage.setItem('jt_rooms_default_urgent', defaultUrgent ? '1' : '0');
    localStorage.setItem('jt_rooms_default_pay', defaultPaySort ? '1' : '0');
    localStorage.setItem('jt_rooms_open_card', openOnCard ? '1' : '0');
  } catch {
    // ignore storage errors
  }

  const urgentOnly = $('#urgentOnly');
  const sort = $('#sort');
  if (urgentOnly) urgentOnly.checked = defaultUrgent;
  if (sort) sort.value = defaultPaySort ? 'pay_desc' : 'new';
  applyFilters();
}

function loadPrefs() {
  try {
    const compact = localStorage.getItem('jt_rooms_compact') === '1';
    const anim = localStorage.getItem('jt_rooms_anim') !== '0';
    const defaultUrgent = localStorage.getItem('jt_rooms_default_urgent') === '1';
    const defaultPaySort = localStorage.getItem('jt_rooms_default_pay') === '1';
    const openOnCard = localStorage.getItem('jt_rooms_open_card') === '1';

    if ($('#pref-compact')) $('#pref-compact').checked = compact;
    if ($('#pref-anim')) $('#pref-anim').checked = anim;
    if ($('#pref-default-urgent')) $('#pref-default-urgent').checked = defaultUrgent;
    if ($('#pref-default-pay')) $('#pref-default-pay').checked = defaultPaySort;
    if ($('#pref-open-card')) $('#pref-open-card').checked = openOnCard;
  } catch {
    // ignore storage errors
  }
}

function wire() {
  const query = $('#q');
  const sort = $('#sort');
  const type = $('#type');
  const location = $('#loc');
  const urgentOnly = $('#urgentOnly');

  query?.addEventListener('input', applyFilters);
  sort?.addEventListener('change', applyFilters);
  type?.addEventListener('change', applyFilters);
  location?.addEventListener('change', applyFilters);
  urgentOnly?.addEventListener('change', applyFilters);

  $('#btn-reset')?.addEventListener('click', () => {
    if (query) query.value = '';
    if (sort) sort.value = 'new';
    if (type) type.value = 'all';
    if (location) location.value = 'all';
    if (urgentOnly) urgentOnly.checked = false;
    applyFilters();
  });

  $('#btn-refresh')?.addEventListener('click', () => {
    loadRooms(true);
  });

  const menu = $('#profile-menu');
  const buttonProfile = $('#btn-profile');
  const buttonSettings = $('#btn-settings');
  const settingsModal = $('#settings-modal');

  const openMenu = () => menu?.classList.toggle('hidden');
  const closeMenu = () => menu?.classList.add('hidden');
  const openSettings = () => {
    closeMenu();
    settingsModal?.classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
    $('#pref-compact')?.focus();
  };
  const closeSettings = () => {
    settingsModal?.classList.add('hidden');
    document.documentElement.style.overflow = '';
  };

  buttonProfile?.addEventListener('click', (event) => {
    event.stopPropagation();
    openMenu();
  });
  $('#menu-profile')?.addEventListener('click', () => {
    closeMenu();
    window.location.href = 'profile.html';
  });
  buttonSettings?.addEventListener('click', openSettings);

  settingsModal?.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-close="true"]')) closeSettings();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeSettings();
  });
  document.addEventListener('click', () => closeMenu());

  loadPrefs();
  $('#pref-compact')?.addEventListener('change', applyPrefs);
  $('#pref-anim')?.addEventListener('change', applyPrefs);
  $('#pref-default-urgent')?.addEventListener('change', applyPrefs);
  $('#pref-default-pay')?.addEventListener('change', applyPrefs);
  $('#pref-open-card')?.addEventListener('change', applyPrefs);

  loadMe();
  applyPrefs();
  loadRooms();

  $('#btn-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', wire);
