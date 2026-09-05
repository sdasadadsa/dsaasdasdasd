// ── Config
const DATA_VERSION   = '1';
const SITE_NAME      = 'Knifex';
const FN_VULNS_URL   = '/.netlify/functions/get-vulns';
const FN_FIXED_GET   = '/.netlify/functions/get-fixed';
const FN_FIXED_URL   = '/.netlify/functions/toggle-fixed';
const FN_ADD_URL     = '/.netlify/functions/add-vuln';

// ── State
let nick         = '';
let vulns        = [];
let fixedMap     = {};
let activeStatus = 'all';
let selectedSeverity = 'critical';
let toggling     = false;
let adding       = false;

window.addEventListener('DOMContentLoaded', async () => {
  localStorage.removeItem('kx_vulns');
  localStorage.setItem('kx_version', DATA_VERSION);
  nick = localStorage.getItem('kx_nick') || '';

  await Promise.all([loadVulns(), loadFixed()]);

  if (nick) showMain();

  bindEvents();
});

async function loadVulns() {
  try {
    const r = await fetch(`${FN_VULNS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch failed');
    vulns = await r.json();
    if (!Array.isArray(vulns)) vulns = [];
  } catch {
    vulns = [];
  }
}

async function loadFixed() {
  try {
    const r = await fetch(`${FN_FIXED_GET}?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      fixedMap = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    }
  } catch { fixedMap = {}; }
}

function showMain() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-screen').classList.remove('hidden');
  render();
}

function bindEvents() {
  document.getElementById('nick-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitNick();
  });
  document.getElementById('nick-btn').addEventListener('click', submitNick);

  document.querySelectorAll('.status-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      render();
    });
  });

  document.getElementById('add-btn').addEventListener('click', openAddModal);
  document.getElementById('modal-close').addEventListener('click', closeAddModal);
  document.getElementById('modal').addEventListener('click', e => {
    if (e.target === document.getElementById('modal')) closeAddModal();
  });

  document.querySelectorAll('.sev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedSeverity = btn.dataset.sev;
    });
  });

  document.getElementById('form-submit').addEventListener('click', submitVuln);
}

function submitNick() {
  const val = document.getElementById('nick-input').value.trim();
  if (!val) return;
  nick = val;
  localStorage.setItem('kx_nick', nick);
  showMain();
}

function openAddModal() {
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('form-title').focus();
}

function closeAddModal() {
  document.getElementById('modal').classList.add('hidden');
  document.getElementById('form-title').value = '';
  document.getElementById('form-desc').value  = '';
  document.querySelectorAll('.sev-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.sev-btn[data-sev="critical"]').classList.add('active');
  selectedSeverity = 'critical';
}

async function submitVuln() {
  if (adding) return;
  const site  = SITE_NAME;
  const title = document.getElementById('form-title').value.trim();
  const desc  = document.getElementById('form-desc').value.trim();
  if (!title) {
    const inp = document.getElementById('form-title');
    inp.focus();
    inp.style.borderColor = 'var(--red)';
    setTimeout(() => { inp.style.borderColor = ''; }, 1500);
    return;
  }

  adding = true;
  const btn = document.getElementById('form-submit');
  const prevText = btn.textContent;
  btn.textContent = 'Сохранение...';
  btn.disabled = true;

  try {
    const res = await fetch(FN_ADD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site,
        title,
        description: desc,
        severity: selectedSeverity,
        addedBy: nick
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'save failed');

    vulns = data.list || [data.vuln, ...vulns];
    closeAddModal();
    render();
  } catch (e) {
    alert('Не удалось сохранить для всех. Проверь GITHUB_TOKEN на Netlify.\n' + (e.message || ''));
  }

  btn.textContent = prevText;
  btn.disabled = false;
  adding = false;
}

async function toggleFixed(id) {
  if (toggling) return;
  toggling = true;

  const key     = String(id);
  const isFixed = !!fixedMap[key];
  const action  = isFixed ? 'unfix' : 'fix';

  const prev = Object.assign({}, fixedMap);
  if (action === 'fix') {
    fixedMap[key] = { nick, date: new Date().toISOString().split('T')[0] };
  } else {
    delete fixedMap[key];
  }
  render();

  try {
    const res = await fetch(FN_FIXED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, nick, action })
    });

    if (res.ok) {
      fixedMap = await res.json();
    } else {
      fixedMap = prev;
    }
  } catch {
    fixedMap = prev;
  }

  toggling = false;
  render();
}

function render() {
  const list = document.getElementById('vuln-list');

  let filtered = vulns.slice();
  if (activeStatus === 'open') filtered = filtered.filter(v => !fixedMap[String(v.id)]);
  if (activeStatus === 'fixed') filtered = filtered.filter(v => !!fixedMap[String(v.id)]);

  document.getElementById('count-all').textContent   = vulns.length;
  document.getElementById('count-open').textContent  = vulns.filter(v => !fixedMap[String(v.id)]).length;
  document.getElementById('count-fixed').textContent = vulns.filter(v => !!fixedMap[String(v.id)]).length;

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state"><p>Уязвимостей не найдено</p></div>`;
    return;
  }

  list.innerHTML = filtered.map(v => {
    const key     = String(v.id);
    const isFixed = !!fixedMap[key];
    const fixer   = fixedMap[key];
    return `
      <div class="vuln-card ${isFixed ? 'fixed' : ''}" data-id="${v.id}" onclick="toggleFixed(${v.id})">
        <div class="vuln-checkbox">${isFixed ? '&#10003;' : ''}</div>
        <div class="vuln-body">
          <div class="vuln-meta">
            <span class="site-badge site-Knifex">${escHtml(v.site || SITE_NAME)}</span>
            <span class="sev-badge sev-${v.severity}">${sevLabel(v.severity)}</span>
            <span class="vuln-date">${v.date}</span>
          </div>
          <div class="vuln-title">${escHtml(v.title)}</div>
          ${v.description ? `<div class="vuln-desc">${escHtml(v.description)}</div>` : ''}
          ${isFixed ? `<div class="fixer-info">Исправлено: ${escHtml(fixer.nick)}, ${fixer.date}</div>` : ''}
          ${v.addedBy ? `<div class="vuln-added">Добавил: ${escHtml(v.addedBy)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function sevLabel(sev) {
  return { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' }[sev] || sev;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
