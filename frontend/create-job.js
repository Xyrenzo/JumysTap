'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  availability: new Set(),
  imageDataUrl: '',
  jobType: '',
  profile: null,
  redirecting: false,
  requiredSkills: [],
  toastTimer: null,
  workFormat: 'onsite',
};

const SKILL_PRESETS = [
  'Figma',
  'Photoshop',
  'Illustrator',
  'Excel',
  'Google Sheets',
  'JavaScript',
  'TypeScript',
  'React',
  'Node.js',
  'HTML',
  'CSS',
  'Go',
  'Sales',
  'Customer Support',
  'Copywriting',
  'SMM',
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

function toast(kind, text) {
  clearTimeout(state.toastTimer);

  const node = kind === 'error' ? $('#toast-error') : $('#toast-success');
  const other = kind === 'error' ? $('#toast-success') : $('#toast-error');
  if (other) other.classList.add('hidden');
  if (!node) return;

  const label = kind === 'error' ? $('#toast-error-text') : $('#toast-success span');
  if (label && text) label.textContent = text;

  node.classList.remove('hidden');
  state.toastTimer = setTimeout(() => node.classList.add('hidden'), 2800);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeSkill(raw) {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^#+/g, '')
    .slice(0, 32);
}

function setJobType(value) {
  state.jobType = value || '';
  $$('.chip[data-group="jobType"]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.value === state.jobType);
  });

  const pill = $('#jobtype-pill');
  if (pill) {
    const label = state.jobType === 'vacancy' ? 'вакансия' : state.jobType === 'freelance' ? 'фриланс' : '—';
    pill.textContent = `Тип: ${label}`;
  }

  const paymentLabel = $('#payment-label');
  if (paymentLabel) paymentLabel.textContent = state.jobType === 'freelance' ? 'Оплата' : 'Зарплата';

  const safepay = $('#safepay');
  if (safepay) safepay.classList.toggle('hidden', state.jobType !== 'freelance');

  applyJobTypeLayout();
}

function applyJobTypeLayout() {
  const isVacancy = state.jobType === 'vacancy';

  const titleLabel = $('#title-label');
  const titleInput = $('#title');
  if (titleLabel) titleLabel.textContent = isVacancy ? 'Профессия / должность' : 'Название задания';
  if (titleInput) {
    titleInput.placeholder = isVacancy
      ? 'Например: Бариста, SMM-специалист, Frontend-разработчик'
      : 'Например: Сделать лендинг для Instagram';
  }

  const peopleWrap = $('#peopleNeeded-wrap');
  if (peopleWrap) peopleWrap.classList.toggle('hidden', isVacancy);
  if (isVacancy) {
    const people = $('#peopleNeeded');
    if (people) people.value = '1';
  }

  const dateWrap = $('#date-wrap');
  if (dateWrap) dateWrap.classList.toggle('hidden', isVacancy);
  if (isVacancy) {
    const date = $('#date');
    if (date) date.value = '';
  }

  const desc = $('#description');
  if (desc && state.jobType === 'freelance') {
    desc.placeholder = 'Опишите задачу: требования, сроки, условия, что важно...';
  }
  if (desc && isVacancy) {
    desc.placeholder = 'Опишите вакансию: обязанности, требования, график, условия...';
  }
}

function setWorkFormat(value) {
  state.workFormat = value || '';
  $$('.chip[data-group="workFormat"]').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.value === state.workFormat);
  });
}

function toggleAvailability(btn) {
  const value = btn.dataset.value || '';
  if (!value) return;

  const active = btn.classList.toggle('is-active');
  if (active) state.availability.add(value);
  else state.availability.delete(value);
}

function renderSkills() {
  const box = $('#skills-box');
  const input = $('#skill-input');
  if (!box || !input) return;

  $$('.tag', box).forEach((tag) => tag.remove());

  const fragment = document.createDocumentFragment();
  for (const skill of state.requiredSkills) {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.dataset.value = skill;
    tag.textContent = skill;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'tag__x';
    removeButton.setAttribute('aria-label', `Remove skill ${skill}`);
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

  const exists = state.requiredSkills.some((item) => item.toLowerCase() === skill.toLowerCase());
  if (exists) return;

  if (state.requiredSkills.length >= 20) {
    toast('error', 'Можно добавить максимум 20 навыков.');
    return;
  }

  state.requiredSkills.push(skill);
  renderSkills();
}

function removeSkill(skill) {
  state.requiredSkills = state.requiredSkills.filter((item) => item !== skill);
  renderSkills();
}

function hideSuggestions() {
  const wrap = $('#skill-suggestions');
  if (!wrap) return;
  wrap.classList.add('hidden');
  wrap.replaceChildren();
}

function showSuggestions(query) {
  const wrap = $('#skill-suggestions');
  if (!wrap) return;

  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    hideSuggestions();
    return;
  }

  const existing = new Set(state.requiredSkills.map((skill) => skill.toLowerCase()));
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
}

function updateDescCount() {
  const desc = $('#description');
  const output = $('#desc-count');
  if (!desc || !output) return;
  output.textContent = `${desc.value.length} / 1200`;
}

function setImagePreview(dataUrl) {
  const preview = $('#image-preview');
  if (!preview) return;

  state.imageDataUrl = dataUrl || '';
  preview.classList.toggle('has-image', Boolean(dataUrl));
  preview.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : '';

  const placeholder = $('.upload__placeholder', preview);
  if (placeholder) placeholder.style.display = dataUrl ? 'none' : 'grid';
}

function previewImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    toast('error', 'Выберите изображение.');
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    toast('error', 'Файл слишком большой. Максимум 4MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => setImagePreview(String(reader.result || ''));
  reader.readAsDataURL(file);
}

function clearErrors() {
  for (const id of ['err-jobtype', 'err-title', 'err-description', 'err-city', 'err-phone']) {
    const field = document.getElementById(id);
    if (field) field.textContent = '';
  }
}

function validate() {
  clearErrors();
  let valid = true;

  const title = ($('#title')?.value || '').trim();
  const description = ($('#description')?.value || '').trim();
  const city = ($('#city')?.value || '').trim();
  const contactPhone = ($('#contactPhone')?.value || '').trim();

  if (!state.jobType) {
    const field = $('#err-jobtype');
    if (field) field.textContent = 'Выберите тип задания.';
    valid = false;
  }
  if (!title) {
    const field = $('#err-title');
    if (field) field.textContent = 'Введите название.';
    valid = false;
  }
  if (!description) {
    const field = $('#err-description');
    if (field) field.textContent = 'Введите описание.';
    valid = false;
  }
  if (!city) {
    const field = $('#err-city');
    if (field) field.textContent = 'Введите город.';
    valid = false;
  }
  if (!contactPhone) {
    const field = $('#err-phone');
    if (field) field.textContent = 'Введите телефон.';
    valid = false;
  }

  return valid;
}

function collectPayload() {
  const isVacancy = state.jobType === 'vacancy';
  const peopleNeededRaw = isVacancy ? '' : ($('#peopleNeeded')?.value || '').trim();
  const peopleNeededNumber = peopleNeededRaw ? Number(peopleNeededRaw) : null;

  return {
    title: ($('#title')?.value || '').trim(),
    description: ($('#description')?.value || '').trim(),
    jobType: state.jobType,
    workFormat: state.workFormat || '',
    city: ($('#city')?.value || '').trim(),
    address: ($('#address')?.value || '').trim(),
    salary: ($('#payment')?.value || '').trim(),
    contactPhone: ($('#contactPhone')?.value || '').trim(),
    urgent: Boolean($('#urgent')?.checked),
    skills: [...state.requiredSkills],
    availability: [...state.availability],
    experienceRequired: ($('#experienceRequired')?.value || '').trim(),
    date: isVacancy ? '' : ($('#date')?.value || '').trim(),
    peopleNeeded: Number.isFinite(peopleNeededNumber) ? peopleNeededNumber : null,
    imageUrl: state.imageDataUrl || '',
  };
}

function redirectForRole(role) {
  if (state.redirecting) return;
  state.redirecting = true;
  const target = role === 'worker' ? 'worker-rooms.html' : 'profile.html';
  setTimeout(() => {
    window.location.href = target;
  }, 900);
}

function applyProfileDefaults(profile) {
  state.profile = profile || null;

  const city = $('#city');
  const phone = $('#contactPhone');
  if (city && !city.value) city.value = profile?.city || '';
  if (phone && !phone.value) phone.value = profile?.phone || '';

  if (profile?.role && profile.role !== 'employer') {
    toast('error', 'Создавать задания может только работодатель.');
    redirectForRole(profile.role);
  }
}

async function loadProfileDefaults() {
  if (!(window.JT?.requireAuth?.('index.html') ?? true)) return;

  const cached = window.JT?.loadProfileSnapshot?.() || null;
  if (cached) applyProfileDefaults(cached);

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

  window.JT?.saveProfileSnapshot?.(data);
  applyProfileDefaults(data);
}

async function onSubmit() {
  if (!(window.JT?.requireAuth?.('index.html') ?? true)) return;

  if (!validate()) {
    toast('error', 'Проверьте обязательные поля.');
    return;
  }

  const { ok, status, data } = await apiFetch('/jobs', {
    method: 'POST',
    body: JSON.stringify(collectPayload()),
  });

  if (!ok) {
    if (status === 401) {
      window.JT?.clearAuth?.();
      window.location.href = 'index.html';
      return;
    }
    toast('error', apiMessage(data, 'Не удалось создать задание.'));
    return;
  }

  toast('success', 'Задание опубликовано.');
  setTimeout(() => {
    window.location.href = 'my-jobs.html';
  }, 650);
}

function wire() {
  const form = $('#job-form');
  const buttonTop = $('#btn-submit-top');
  const skillInput = $('#skill-input');
  const skillsBox = $('#skills-box');
  const desc = $('#description');
  const imageInput = $('#image-input');
  const imagePreview = $('#image-preview');
  const imageClear = $('#btn-image-clear');

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
  });

  buttonTop?.addEventListener('click', () => form?.requestSubmit());

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const chip = target.closest('.chip');
    if (chip && chip instanceof HTMLButtonElement) {
      const group = chip.dataset.group || '';
      const value = chip.dataset.value || '';

      if (group === 'jobType') {
        setJobType(value);
        return;
      }
      if (group === 'workFormat') {
        setWorkFormat(value);
        return;
      }
      if (group === 'availability') {
        toggleAvailability(chip);
        return;
      }
    }

    if (!target.closest('#sec-skills')) hideSuggestions();
  });

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
        const last = state.requiredSkills[state.requiredSkills.length - 1];
        if (last) removeSkill(last);
      }
      if (event.key === 'Escape') hideSuggestions();
    });

    skillInput.addEventListener('input', () => showSuggestions(skillInput.value));
  }

  if (desc) {
    desc.addEventListener('input', updateDescCount);
    updateDescCount();
  }

  imageInput?.addEventListener('change', () => previewImage(imageInput.files?.[0]));
  imageClear?.addEventListener('click', () => {
    if (imageInput) imageInput.value = '';
    setImagePreview('');
  });

  if (imagePreview && imageInput) {
    imagePreview.addEventListener('click', () => imageInput.click());
    imagePreview.addEventListener('dragover', (event) => event.preventDefault());
    imagePreview.addEventListener('drop', (event) => {
      event.preventDefault();
      const file = event.dataTransfer?.files?.[0];
      if (file) previewImage(file);
    });
  }

  setJobType('');
  setWorkFormat('onsite');
  applyJobTypeLayout();

  $('#btn-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.location.href = 'index.html';
  });

  loadProfileDefaults();
}

document.addEventListener('DOMContentLoaded', wire);
