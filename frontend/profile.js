'use strict';

const API_BASE = 'http://localhost:8080/api';
const DEFAULT_AVATAR =
  "data:image/svg+xml,%3Csvg viewBox='0 0 80 80' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='80' height='80' fill='%23dbeafe'/%3E%3Ccircle cx='40' cy='32' r='14' fill='%2393c5fd'/%3E%3Cellipse cx='40' cy='72' rx='22' ry='16' fill='%2393c5fd'/%3E%3C/svg%3E";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const SKILL_PRESETS = [
  'Figma',
  'Adobe Photoshop',
  'Illustrator',
  'SMM',
  'Copywriting',
  'Customer Support',
  'Sales',
  'Excel',
  'PowerPoint',
  'Google Sheets',
  'Data entry',
  'Go',
  'JavaScript',
  'TypeScript',
  'HTML',
  'CSS',
  'React',
  'Node.js',
  'PostgreSQL',
  'UI/UX',
  'QA',
  'Project Management',
  'Recruiting',
  'Branding',
];

const state = {
  profile: null,
  avatarDataUrl: '',
  availability: new Set(),
  dirty: false,
  jobType: '',
  lastFocus: null,
  role: '',
  roleLocked: false,
  roleModalPending: null,
  skills: [],
  suggestionVisible: false,
  telegramConnected: false,
  tgPollTimer: null,
  toastTimer: null,
};

function apiToken() {
  return window.JT?.getToken?.() || localStorage.getItem('jt_token') || '';
}

async function apiFetch(path, options = {}) {
  if (window.JT?.apiFetch) return window.JT.apiFetch(path, options);

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = apiToken();
  if (token) headers.Authorization = `Bearer ${token}`;

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

function apiMessage(data, fallback) {
  if (window.JT?.message) return window.JT.message(data, fallback);
  return data?.message || data?.error || fallback;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toast(kind, text) {
  clearTimeout(state.toastTimer);
  const node = kind === 'error' ? $('#toast-error') : $('#toast-success');
  const other = kind === 'error' ? $('#toast-success') : $('#toast-error');
  if (other) other.classList.add('hidden');
  if (!node) return;

  const label = kind === 'error' ? $('#toast-error-text') : $('#toast-success-text');
  if (label && text) label.textContent = text;

  node.classList.remove('hidden');
  state.toastTimer = setTimeout(() => node.classList.add('hidden'), 2600);
}

function setDirty(dirty) {
  state.dirty = dirty;
  const label = $('#save-status');
  if (!label) return;
  label.classList.toggle('is-dirty', dirty);
  label.classList.toggle('is-saved', !dirty);
  label.textContent = dirty ? 'Не сохранено' : 'Сохранено';
}

function clearErrors() {
  const nameErr = $('#err-display-name');
  const roleErr = $('#err-role');
  if (nameErr) nameErr.textContent = '';
  if (roleErr) roleErr.textContent = '';
}

function scrollToSection(id) {
  const node = document.getElementById(id);
  if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function normalizeSkill(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^#+/g, '')
    .slice(0, 32);
}

function renderSkills() {
  const box = $('#skills-box');
  const input = $('#skill-input');
  if (!box || !input) return;

  $$('.tag', box).forEach((tag) => tag.remove());

  const fragment = document.createDocumentFragment();
  for (const skill of state.skills) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.value = skill;
    tag.textContent = skill;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tag__x';
    removeButton.setAttribute('aria-label', `Удалить навык ${skill}`);
    removeButton.innerHTML =
      "<svg viewBox='0 0 14 14' fill='none' aria-hidden='true'><path d='M4 4l6 6M10 4L4 10' stroke='currentColor' stroke-width='2' stroke-linecap='round'/></svg>";
    removeButton.addEventListener('click', () => removeSkill(skill));

    tag.appendChild(removeButton);
    fragment.appendChild(tag);
  }

  box.insertBefore(fragment, input);
}

function addSkill(raw) {
  const skill = normalizeSkill(raw);
  if (!skill) return;

  const exists = state.skills.some((item) => item.toLowerCase() === skill.toLowerCase());
  if (exists) return;

  if (state.skills.length >= 20) {
    toast('error', 'Можно добавить максимум 20 навыков.');
    return;
  }

  state.skills.push(skill);
  renderSkills();
  setDirty(true);
}

function removeSkill(skill) {
  state.skills = state.skills.filter((item) => item !== skill);
  renderSkills();
  setDirty(true);
}

function hideSuggestions() {
  const wrap = $('#skill-suggestions');
  if (!wrap) return;
  wrap.classList.add('hidden');
  wrap.replaceChildren();
  state.suggestionVisible = false;
}

function showSuggestions(query) {
  const wrap = $('#skill-suggestions');
  if (!wrap) return;

  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    hideSuggestions();
    return;
  }

  const existing = new Set(state.skills.map((skill) => skill.toLowerCase()));
  const list = SKILL_PRESETS.filter((skill) => skill.toLowerCase().includes(q) && !existing.has(skill.toLowerCase())).slice(0, 7);
  if (list.length === 0) {
    hideSuggestions();
    return;
  }

  wrap.replaceChildren();
  for (const item of list) {
    const row = document.createElement('div');
    row.className = 'sugg-item';
    row.setAttribute('role', 'option');
    row.innerHTML = `<span>${escapeHtml(item)}</span><small>добавить</small>`;
    row.addEventListener('mousedown', (event) => {
      event.preventDefault();
      addSkill(item);
      const input = $('#skill-input');
      if (input) {
        input.value = '';
        input.focus();
      }
      hideSuggestions();
    });
    wrap.appendChild(row);
  }

  wrap.classList.remove('hidden');
  state.suggestionVisible = true;
}

function updateBioCount() {
  const bio = $('#bio');
  const output = $('#bio-count');
  if (!bio || !output) return;
  output.textContent = `${bio.value.length} / 500`;
}

function updateRoleVisibility(role) {
  const hideWorkerOnly = role === 'employer';
  for (const id of ['sec-about', 'sec-skills', 'sec-avail', 'sec-prefs', 'experience-wrap']) {
    const node = document.getElementById(id);
    if (node) node.classList.toggle('hidden', hideWorkerOnly);
  }

  if (hideWorkerOnly) {
    hideSuggestions();
    state.jobType = '';
    $$('.chip[data-group="jobtype"]').forEach((chip) => chip.classList.remove('is-active'));
    const salary = $('#salary');
    if (salary) salary.value = '';
  }
}

function lockRoleUI(locked) {
  const grid = $('#role-grid');
  if (grid) grid.classList.toggle('is-locked', locked);
  $$('input[name="role"]').forEach((input) => {
    input.disabled = locked;
  });
}

function pickRole(value) {
  state.role = value || '';
  $$('.role-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.value === state.role);
  });
  $$('input[name="role"]').forEach((input) => {
    input.checked = input.value === state.role;
  });
  updateRoleVisibility(state.role);
  setDirty(true);
}

function openRoleModal(nextRole) {
  const modal = $('#role-modal');
  const confirm = $('#role-modal-confirm');
  const cancel = $('#role-modal-cancel');
  if (!modal || !confirm || !cancel) return;

  state.roleModalPending = nextRole;
  state.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const title = $('#role-modal-title');
  const desc = $('#role-modal-desc');
  const roleLabel = nextRole === 'employer' ? 'работодатель' : 'соискатель';
  if (title) title.textContent = 'Подтвердить роль?';
  if (desc) desc.textContent = `Вы действительно хотите выбрать роль "${roleLabel}"? После сохранения профиля изменить её уже не получится.`;

  confirm.textContent = 'Да, выбрать';
  modal.classList.remove('hidden');
  document.documentElement.style.overflow = 'hidden';
  confirm.focus();
}

function closeRoleModal() {
  const modal = $('#role-modal');
  if (!modal) return;

  modal.classList.add('hidden');
  document.documentElement.style.overflow = '';
  state.roleModalPending = null;

  if (state.lastFocus) state.lastFocus.focus();
  state.lastFocus = null;
}

function confirmRolePick() {
  const next = state.roleModalPending;
  closeRoleModal();
  if (!next) return;
  pickRole(next);
  toast('success', 'Роль выбрана. Сохраните профиль, чтобы закрепить её.');
}

function setTelegramConnected(connected) {
  state.telegramConnected = connected;
  const status = $('#tg-status');
  const text = $('#tg-status-text');
  const button = $('#btn-tg');
  if (!status || !text || !button) return;

  status.classList.toggle('tg-status--on', connected);
  status.classList.toggle('tg-status--off', !connected);
  text.textContent = connected ? 'подключён' : 'не подключён';
  button.textContent = connected ? 'Telegram подключён' : 'Проверить Telegram';
  button.disabled = connected;
}

function telegramIdentity() {
  return state.profile?.name || loadSavedProfileSnapshot()?.name || '';
}

function stopTelegramPolling() {
  if (!state.tgPollTimer) return;
  clearInterval(state.tgPollTimer);
  state.tgPollTimer = null;
}

function markTelegramConnected() {
  setTelegramConnected(true);
  stopTelegramPolling();

  const updated = {
    ...(state.profile || loadSavedProfileSnapshot() || {}),
    tgVerified: true,
  };
  state.profile = updated;
  saveProfileSnapshot(updated);
}

async function syncTelegramStatus(silent = false) {
  const name = telegramIdentity();
  if (!name) return false;

  const { ok, data } = await apiFetch(`/auth/status?name=${encodeURIComponent(name)}`, {
    method: 'GET',
  });

  if (!ok) {
    if (!silent) toast('error', apiMessage(data, 'Не удалось проверить Telegram.'));
    return false;
  }

  if (data.activated) {
    markTelegramConnected();
    if (!silent) toast('success', 'Telegram подключён.');
    return true;
  }

  if (!silent) toast('error', 'Telegram ещё не подключён.');
  return false;
}

function startTelegramPolling() {
  stopTelegramPolling();
  if (state.telegramConnected || !telegramIdentity()) return;

  state.tgPollTimer = setInterval(() => {
    if (document.hidden || state.telegramConnected) return;
    syncTelegramStatus(true);
  }, 3500);
}

function previewAvatar(file) {
  const img = $('#avatar-preview');
  const clearButton = $('#avatar-clear');
  if (!img || !file) return;

  if (!file.type.startsWith('image/')) {
    toast('error', 'Выберите изображение.');
    return;
  }
  if (file.size > 3.5 * 1024 * 1024) {
    toast('error', 'Файл слишком большой. Максимум 3.5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    state.avatarDataUrl = String(reader.result || '');
    img.src = state.avatarDataUrl || DEFAULT_AVATAR;
    clearButton?.classList.remove('hidden');
    setDirty(true);
  };
  reader.readAsDataURL(file);
}

function clearAvatar() {
  const img = $('#avatar-preview');
  const input = $('#avatar-input');
  const clearButton = $('#avatar-clear');
  if (input) input.value = '';
  if (img) img.src = DEFAULT_AVATAR;
  state.avatarDataUrl = '';
  clearButton?.classList.add('hidden');
  setDirty(true);
}

function loadSavedProfileSnapshot() {
  if (window.JT?.loadProfileSnapshot) return window.JT.loadProfileSnapshot();

  try {
    const raw = localStorage.getItem('jt_profile');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveProfileSnapshot(profile) {
  if (window.JT?.saveProfileSnapshot) {
    window.JT.saveProfileSnapshot(profile);
    return;
  }

  try {
    localStorage.setItem('jt_profile', JSON.stringify(profile));
  } catch {
    // ignore storage errors
  }
}

function applyProfileToForm(profile) {
  state.profile = profile || null;

  const displayNameField = $('#display-name');
  const cityField = $('#city');
  const bioField = $('#bio');
  const experienceField = $('#experience');
  const salaryField = $('#salary');
  const avatar = $('#avatar-preview');
  const clearButton = $('#avatar-clear');

  if (displayNameField) displayNameField.value = profile?.displayName || profile?.name || '';
  if (cityField) cityField.value = profile?.city || '';
  if (bioField) bioField.value = profile?.bio || '';
  if (experienceField) experienceField.value = profile?.experience || '';
  if (salaryField) salaryField.value = profile?.expectedSalary != null ? String(profile.expectedSalary) : '';

  state.skills = Array.isArray(profile?.skills) ? [...profile.skills] : [];
  state.availability = new Set(Array.isArray(profile?.availability) ? profile.availability : []);
  state.jobType = profile?.jobType || '';
  state.role = profile?.role || '';
  state.roleLocked = Boolean(profile?.role);
  state.avatarDataUrl = profile?.avatar || '';

  if (avatar) avatar.src = state.avatarDataUrl || DEFAULT_AVATAR;
  clearButton?.classList.toggle('hidden', !state.avatarDataUrl);

  renderSkills();

  $$('.chip[data-group="avail"]').forEach((chip) => {
    const value = chip.dataset.value || '';
    chip.classList.toggle('is-active', state.availability.has(value));
  });

  $$('.chip[data-group="jobtype"]').forEach((chip) => {
    const value = chip.dataset.value || '';
    chip.classList.toggle('is-active', value === state.jobType);
  });

  $$('.role-card').forEach((card) => {
    card.classList.toggle('is-active', card.dataset.value === state.role);
  });
  $$('input[name="role"]').forEach((input) => {
    input.checked = input.value === state.role;
  });

  setTelegramConnected(Boolean(profile?.tgVerified));
  lockRoleUI(state.roleLocked);
  updateRoleVisibility(state.role);
  updateBioCount();
  setDirty(false);

  if (state.telegramConnected) stopTelegramPolling();
  else startTelegramPolling();
}

async function loadProfile() {
  const saved = loadSavedProfileSnapshot();
  if (saved) applyProfileToForm(saved);

  if (!apiToken()) {
    window.location.href = 'index.html';
    return;
  }

  const { ok, status, data } = await apiFetch('/profile', { method: 'GET' });
  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
      window.location.href = 'index.html';
      return;
    }
    toast('error', apiMessage(data, 'Не удалось загрузить профиль.'));
    return;
  }

  applyProfileToForm(data);
  saveProfileSnapshot(data);
}

function collectProfilePayload() {
  const role = document.querySelector('input[name="role"]:checked')?.value || '';
  const isEmployer = role === 'employer';
  const salaryRaw = ($('#salary')?.value || '').trim();
  const expectedSalary = !isEmployer && salaryRaw ? Number(salaryRaw) : null;

  return {
    avatar: state.avatarDataUrl || '',
    availability: isEmployer ? [] : [...state.availability],
    bio: isEmployer ? '' : ($('#bio')?.value || '').trim(),
    city: ($('#city')?.value || '').trim(),
    displayName: ($('#display-name')?.value || '').trim(),
    experience: isEmployer ? '' : ($('#experience')?.value || '').trim(),
    expectedSalary: Number.isFinite(expectedSalary) ? expectedSalary : null,
    jobType: isEmployer ? '' : state.jobType || '',
    phone: state.profile?.phone || loadSavedProfileSnapshot()?.phone || '',
    role,
    skills: isEmployer ? [] : [...state.skills],
  };
}

function validateProfile() {
  clearErrors();
  let valid = true;

  const displayName = ($('#display-name')?.value || '').trim();
  const role = document.querySelector('input[name="role"]:checked')?.value || '';

  if (!displayName) {
    const field = $('#err-display-name');
    if (field) field.textContent = 'Введите отображаемое имя.';
    valid = false;
  }

  if (!role) {
    const field = $('#err-role');
    if (field) field.textContent = 'Выберите роль.';
    valid = false;
  }

  return valid;
}

async function refreshTelegramStatus() {
  if (!telegramIdentity()) {
    toast('error', 'Сначала сохраните профиль.');
    return;
  }

  const activated = await syncTelegramStatus(false);
  if (!activated) startTelegramPolling();
}

async function saveProfile() {
  if (!apiToken()) {
    toast('error', 'Сначала войдите в аккаунт.');
    return;
  }

  if (!validateProfile()) {
    toast('error', 'Заполните обязательные поля.');
    if ($('#err-display-name')?.textContent) scrollToSection('sec-profile');
    else scrollToSection('sec-role');
    return;
  }

  const { ok, status, data } = await apiFetch('/profile', {
    method: 'PUT',
    body: JSON.stringify(collectProfilePayload()),
  });

  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
      window.location.href = 'index.html';
      return;
    }
    toast('error', apiMessage(data, 'Не удалось сохранить профиль.'));
    return;
  }

  applyProfileToForm(data);
  saveProfileSnapshot(data);
  toast('success', 'Профиль успешно сохранён.');

  if (!data.tgVerified) startTelegramPolling();

  const redirect = data.role === 'employer' ? 'create-job.html' : 'worker-rooms.html';
  setTimeout(() => {
    window.location.href = redirect;
  }, 850);
}

function wire() {
  const form = $('#profile-form');
  const saveTop = $('#btn-save-top');
  const avatarInput = $('#avatar-input');
  const avatarClear = $('#avatar-clear');
  const skillsBox = $('#skills-box');
  const skillInput = $('#skill-input');
  const tgButton = $('#btn-tg');
  const roleModal = $('#role-modal');
  const roleModalConfirm = $('#role-modal-confirm');

  saveTop?.addEventListener('click', () => form?.requestSubmit());
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    saveProfile();
  });

  avatarInput?.addEventListener('change', () => previewAvatar(avatarInput.files?.[0]));
  avatarClear?.addEventListener('click', clearAvatar);

  if (skillsBox && skillInput) {
    skillsBox.addEventListener('click', () => skillInput.focus());

    skillInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        addSkill(skillInput.value);
        skillInput.value = '';
        hideSuggestions();
        return;
      }
      if (event.key === 'Backspace' && !skillInput.value) {
        const last = state.skills[state.skills.length - 1];
        if (last) removeSkill(last);
      }
      if (event.key === 'Escape') hideSuggestions();
    });

    skillInput.addEventListener('input', () => {
      setDirty(true);
      showSuggestions(skillInput.value);
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const roleCard = target.closest('.role-card');
    if (roleCard) {
      const nextRole = roleCard.dataset.value || '';
      if (!nextRole) return;
      if (state.roleLocked) {
        toast('error', 'Роль уже сохранена. Изменить её нельзя.');
        return;
      }
      openRoleModal(nextRole);
      return;
    }

    const chip = target.closest('.chip');
    if (chip && chip instanceof HTMLButtonElement) {
      const group = chip.dataset.group || '';
      const value = chip.dataset.value || '';

      if (group === 'jobtype') {
        state.jobType = value;
        $$('.chip[data-group="jobtype"]').forEach((item) => {
          item.classList.toggle('is-active', item.dataset.value === value);
        });
        setDirty(true);
        return;
      }

      if (group === 'avail') {
        const active = chip.classList.toggle('is-active');
        if (active) state.availability.add(value);
        else state.availability.delete(value);
        setDirty(true);
        return;
      }
    }

    if (!target.closest('#sec-skills')) hideSuggestions();
  });

  if (roleModal && roleModalConfirm) {
    roleModalConfirm.addEventListener('click', confirmRolePick);
    roleModal.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-modal-close="true"]')) {
        closeRoleModal();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.roleModalPending) closeRoleModal();
    });
  }

  tgButton?.addEventListener('click', refreshTelegramStatus);

  const bio = $('#bio');
  bio?.addEventListener('input', () => {
    setDirty(true);
    updateBioCount();
  });

  for (const selector of ['#display-name', '#city', '#salary', '#experience']) {
    $(selector)?.addEventListener('input', () => setDirty(true));
    $(selector)?.addEventListener('change', () => setDirty(true));
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !state.telegramConnected) syncTelegramStatus(true);
  });
  window.addEventListener('beforeunload', stopTelegramPolling);

  $('#btn-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.location.href = 'index.html';
  });

  loadProfile().then(() => {
    setDirty(false);
    updateBioCount();
  });
}

document.addEventListener('DOMContentLoaded', wire);
