'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  all: [],
  toastTimer: null,
};

function apiFetch(path, options = {}) {
  if (window.JT?.apiFetch) return window.JT.apiFetch(path, options);

  return fetch(`${window.JT?.API_BASE || '/api'}${path}`, options).then(async (response) => {
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

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('ru-RU').format(Math.round(number));
}

function labelType(type) {
  return type === 'vacancy' ? 'вакансия' : type === 'freelance' ? 'фриланс' : '—';
}

function paymentHint(type) {
  return type === 'vacancy' ? '₸ / мес' : '₸ за задачу';
}

function toast(text) {
  const toastNode = $('#toast');
  const label = $('#toast-text');
  if (label) label.textContent = text;
  if (!toastNode) return;
  toastNode.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastNode.classList.add('hidden'), 1800);
}

function normalizeJobs(rawJobs) {
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];

  return jobs.map((job) => {
    const paymentRaw = String(job?.salary ?? '').trim();
    const payment = paymentRaw ? Number(paymentRaw) : Number.NaN;

    return {
      city: job?.city || '',
      createdAt: job?.createdAt || '',
      description: job?.description || '',
      id: job?.id || '',
      jobType: job?.jobType || '',
      payment: Number.isFinite(payment) ? payment : null,
      title: job?.title || '',
    };
  });
}

function matches(job, query) {
  if (!query) return true;
  const haystack = [job.title, job.description, job.city].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function openJob(job) {
  try {
    localStorage.setItem('jt_room_active', JSON.stringify(job));
  } catch {
    // ignore storage errors
  }
  window.location.href = `room-detail.html?id=${encodeURIComponent(job.id)}`;
}

function apply() {
  const query = ($('#q')?.value || '').trim();
  const type = $('#type')?.value || 'all';
  const sort = $('#sort')?.value || 'new';

  let list = state.all.slice();
  if (type !== 'all') list = list.filter((job) => job.jobType === type);
  if (query) list = list.filter((job) => matches(job, query));

  list.sort((left, right) => {
    const leftTime = Date.parse(left.createdAt || 0) || 0;
    const rightTime = Date.parse(right.createdAt || 0) || 0;

    if (sort === 'new') return rightTime - leftTime;
    if (sort === 'old') return leftTime - rightTime;
    if (sort === 'pay_desc') return (right.payment || 0) - (left.payment || 0);
    if (sort === 'az') return String(left.title || '').localeCompare(String(right.title || ''), 'ru');
    return 0;
  });

  render(list);
}

function render(list) {
  const grid = $('#jobs');
  const empty = $('#empty');
  const pill = $('#count-pill');
  if (!grid) return;

  if (pill) pill.textContent = String(list.length);
  if (empty) empty.classList.toggle('hidden', list.length !== 0);

  grid.replaceChildren();

  for (const job of list) {
    const meta = [labelType(job.jobType), job.city || 'город не указан', job.createdAt ? new Date(job.createdAt).toLocaleString('ru-RU') : '']
      .filter(Boolean)
      .join(' • ');

    const card = document.createElement('article');
    card.className = 'job';
    card.dataset.id = job.id;
    card.innerHTML = `
      <div class="job__top">
        <div>
          <div class="job__type"><span class="job__typeDot"></span>${esc(labelType(job.jobType))}</div>
          <div class="job__meta">${esc(meta)}</div>
        </div>
        <div class="job__money" aria-label="Оплата">
          <div class="job__moneyValue">${formatMoney(job.payment)} ₸</div>
          <div class="job__moneyHint">${esc(paymentHint(job.jobType))}</div>
        </div>
      </div>

      <h3 class="job__title">${esc(job.title || 'Без названия')}</h3>
      <p class="job__desc">${esc(job.description || '')}</p>

      <div class="job__bottom">
        <div class="job__actions">
          <button class="btn btn--outline btn--sm" type="button" data-open="true">Открыть</button>
          <button class="btn btn--outline btn--sm" type="button" data-delete="true">Удалить</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest('[data-open="true"]')) {
        openJob(job);
        return;
      }
      if (target.closest('[data-delete="true"]')) {
        removeJob(job.id);
      }
    });

    grid.appendChild(card);
  }
}

async function loadProfile() {
  const cached = window.JT?.loadProfileSnapshot?.() || null;
  if (cached?.role && cached.role !== 'employer') {
    toast('Эта страница доступна работодателям.');
    setTimeout(() => {
      window.location.href = 'worker-rooms.html';
    }, 900);
    return false;
  }

  const { ok, status, data } = await apiFetch('/profile', { method: 'GET' });
  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
      window.location.href = 'index.html';
      return false;
    }
    toast(apiMessage(data, 'Не удалось загрузить профиль.'));
    return false;
  }

  window.JT?.saveProfileSnapshot?.(data);
  if (data?.role && data.role !== 'employer') {
    toast('Эта страница доступна работодателям.');
    setTimeout(() => {
      window.location.href = 'worker-rooms.html';
    }, 900);
    return false;
  }

  return true;
}

async function loadJobs() {
  if (!(window.JT?.requireAuth?.('index.html') ?? true)) return;
  if (!(await loadProfile())) return;

  const { ok, data } = await apiFetch('/jobs/my', { method: 'GET' });
  if (!ok) {
    toast(apiMessage(data, 'Не удалось загрузить ваши задания.'));
    return;
  }

  state.all = normalizeJobs(data?.jobs);
  apply();
}

async function removeJob(id) {
  const { ok, status, data } = await apiFetch(`/jobs/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });

  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
      window.location.href = 'index.html';
      return;
    }
    toast(apiMessage(data, 'Не удалось удалить задание.'));
    return;
  }

  state.all = state.all.filter((job) => job.id !== id);
  apply();
  toast('Удалено');
}

async function clearAll() {
  if (state.all.length === 0) {
    toast('Архив уже пуст');
    return;
  }

  const items = [...state.all];
  for (const job of items) {
    const { ok } = await apiFetch(`/jobs/${encodeURIComponent(job.id)}`, { method: 'DELETE' });
    if (!ok) {
      toast('Не удалось удалить все задания.');
      await loadJobs();
      return;
    }
  }

  state.all = [];
  apply();
  toast('Архив очищен');
}

function wire() {
  loadJobs();

  $('#q')?.addEventListener('input', apply);
  $('#type')?.addEventListener('change', apply);
  $('#sort')?.addEventListener('change', apply);
  $('#btn-clear')?.addEventListener('click', clearAll);

  $('#btn-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.location.href = 'create-job.html';
  });
}

document.addEventListener('DOMContentLoaded', wire);
