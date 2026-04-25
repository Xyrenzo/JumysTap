'use strict';

const $ = (sel, root = document) => root.querySelector(sel);

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

function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('ru-RU').format(Math.round(number));
}

function labelJobType(jobType) {
  return jobType === 'vacancy' ? 'вакансия' : jobType === 'freelance' ? 'фриланс' : '—';
}

function labelAvailability(list) {
  const labels = {
    day: 'день',
    evening: 'вечер',
    flexible: 'гибко',
    morning: 'утро',
    night: 'ночь',
    weekend: 'выходные',
  };

  const values = Array.isArray(list) ? list : [];
  const normalized = values.map((value) => labels[value] || value).filter(Boolean);
  return normalized.length ? normalized.join(', ') : 'не указано';
}

function labelExperience(value) {
  const labels = {
    no: 'без опыта',
    '0-1': 'до 1 года',
    '1-3': '1–3 года',
    '3-5': '3–5 лет',
    '5+': '5+ лет',
  };

  return value ? labels[value] || value : 'не важно';
}

function labelWorkFormat(value) {
  const labels = {
    hybrid: 'гибрид',
    onsite: 'офис',
    remote: 'удалённо',
  };

  return value ? labels[value] || value : 'не указано';
}

function makeFact(label, value) {
  return `<div class="fact"><div class="fact__label">${esc(label)}</div><div class="fact__value">${esc(value)}</div></div>`;
}

function toast(text) {
  const toastNode = $('#toast');
  const label = $('#toast-text');
  if (label) label.textContent = text;
  if (!toastNode) return;
  toastNode.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toastNode.classList.add('hidden'), 1600);
}

function normalizeRoom(raw) {
  if (!raw) return null;

  const paymentRaw = String(raw?.salary ?? '').trim();
  const payment = paymentRaw ? Number(paymentRaw) : Number.NaN;

  return {
    address: raw.address || '',
    availability: Array.isArray(raw.availability) ? raw.availability : [],
    city: raw.city || '',
    contactPhone: raw.contactPhone || '',
    createdAt: raw.createdAt || '',
    date: raw.date || '',
    description: raw.description || '',
    employerName: raw.authorName || raw.employerName || 'Работодатель',
    experienceRequired: raw.experienceRequired || '',
    id: raw.id || '',
    jobType: raw.jobType || '',
    payment: Number.isFinite(payment) ? payment : null,
    peopleNeeded: raw.peopleNeeded ?? null,
    requiredSkills: Array.isArray(raw.skills) ? raw.skills : Array.isArray(raw.requiredSkills) ? raw.requiredSkills : [],
    title: raw.title || '',
    urgent: Boolean(raw.urgent),
    workFormat: raw.workFormat || '',
  };
}

function setContactSection(phone) {
  const value = $('#tg-handle');
  const button = $('#btn-tg');
  const copyButton = $('#btn-copy');
  const label = document.querySelector('.contact__label');
  const card = button?.closest('.card');
  const sub = card?.querySelector('.card__sub');

  if (label) label.textContent = 'Контакт';
  if (sub) sub.textContent = 'Свяжитесь с работодателем по указанному контакту';

  const normalizedPhone = String(phone || '').trim();
  if (value) value.textContent = normalizedPhone || 'не указан';

  if (!button) return;

  if (normalizedPhone) {
    button.href = `tel:${normalizedPhone.replace(/[^\d+]/g, '')}`;
    button.removeAttribute('target');
    button.removeAttribute('rel');
    button.innerHTML = `
      <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M1 9l16-6-6 16-3-7-7-3z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
      Позвонить
    `;
    button.classList.remove('hidden');
    copyButton?.classList.remove('hidden');
  } else {
    button.classList.add('hidden');
    copyButton?.classList.add('hidden');
  }
}

function render(room) {
  const title = room.title || 'Комната';
  const subText = `${room.employerName} • ${labelJobType(room.jobType)} • ${room.city || 'город не указан'}`;

  if ($('#room-title')) $('#room-title').textContent = title;
  if ($('#room-title-mini')) $('#room-title-mini').textContent = title;
  if ($('#room-sub')) $('#room-sub').textContent = subText;
  if ($('#room-sub-mini')) $('#room-sub-mini').textContent = subText;
  if ($('#pill-type')) $('#pill-type').textContent = labelJobType(room.jobType);
  if ($('#money-value')) $('#money-value').textContent = `${formatMoney(room.payment)} ₸`;
  if ($('#money-hint')) $('#money-hint').textContent = room.jobType === 'vacancy' ? '₸ / мес' : '₸ за задачу';
  if ($('#desc')) $('#desc').textContent = room.description || '—';

  const facts = $('#facts');
  if (facts) {
    const rows = [
      makeFact('Работодатель', room.employerName),
      makeFact('Город', room.city || '—'),
      makeFact('Адрес / район', room.address || '—'),
      makeFact('Формат', labelWorkFormat(room.workFormat)),
      makeFact('Доступность', labelAvailability(room.availability)),
      makeFact('Опыт', labelExperience(room.experienceRequired)),
      makeFact('Срочность', room.urgent ? 'срочно' : 'обычно'),
    ];

    if (room.date) rows.push(makeFact('Дата', room.date));
    if (room.peopleNeeded != null) rows.push(makeFact('Людей нужно', String(room.peopleNeeded)));
    if (room.contactPhone) rows.push(makeFact('Телефон', room.contactPhone));

    facts.innerHTML = rows.join('');
  }

  const skills = $('#skills');
  if (skills) {
    skills.innerHTML = room.requiredSkills.length
      ? room.requiredSkills.map((skill) => `<span class="tag">${esc(skill)}</span>`).join('')
      : '—';
  }

  setContactSection(room.contactPhone);

  $('#btn-copy')?.addEventListener('click', async () => {
    if (!room.contactPhone) {
      toast('Контакт не указан');
      return;
    }

    try {
      await navigator.clipboard.writeText(room.contactPhone);
      toast('Контакт скопирован');
    } catch {
      toast('Не удалось скопировать');
    }
  });
}

function loadCachedRoom() {
  try {
    const raw = localStorage.getItem('jt_room_active');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function showEmpty() {
  $('#empty')?.classList.remove('hidden');
  $('.grid')?.classList.add('hidden');
}

async function loadRoom() {
  const params = new URLSearchParams(window.location.search);
  const requestedID = params.get('id') || '';
  const cached = loadCachedRoom();

  if (!requestedID && !cached?.id) {
    showEmpty();
    return;
  }

  const id = requestedID || cached.id;
  const { ok, data } = await apiFetch(`/jobs/${encodeURIComponent(id)}`, { method: 'GET' });
  if (!ok) {
    if (cached?.id === id) {
      render(normalizeRoom(cached));
      return;
    }
    toast(apiMessage(data, 'Не удалось загрузить комнату.'));
    showEmpty();
    return;
  }

  const room = normalizeRoom(data);
  try {
    localStorage.setItem('jt_room_active', JSON.stringify(room));
  } catch {
    // ignore storage errors
  }
  render(room);
}

function wire() {
  $('#btn-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.location.href = 'worker-rooms.html';
  });

  loadRoom();
}

document.addEventListener('DOMContentLoaded', wire);
