// ===== STATE =====
let CONFIG = null;          // {owner, repo, branch, path, token}
let SHA = null;             // current file sha on GitHub (null = file doesn't exist yet)
let DATA = { sessions: [], referenceOptions: ['Namaste Psychology', 'MindWorks', 'Armeet'] };
let saveQueue = Promise.resolve();

const $ = (id) => document.getElementById(id);

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  $('fDate').value = todayISO();
  bindEvents();
  loadConfigFromStorage();
  renderReferenceOptions();
  renderClientResults();
});

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function bindEvents() {
  $('settingsBtn').addEventListener('click', () => $('settingsPanel').classList.toggle('hidden'));
  $('cfgCancel').addEventListener('click', () => $('settingsPanel').classList.add('hidden'));
  $('cfgSave').addEventListener('click', onSaveConfig);

  $('sessionForm').addEventListener('submit', onAddSession);
  $('fReference').addEventListener('change', onReferenceChange);
  $('fReference').addEventListener('change', suggestCommission);
  $('fFee').addEventListener('input', updateCalcPreview);
  $('fCommission').addEventListener('input', updateCalcPreview);

  $('monthFilter').addEventListener('change', () => { renderDashboard(); renderTable(); });
  $('orgFilter').addEventListener('change', renderTable);
  $('exportBtn').addEventListener('click', onExport);

  $('clientSearch').addEventListener('input', renderClientResults);
  $('toastUndo').addEventListener('click', undoDelete);
}

// ===== CONFIG =====
function loadConfigFromStorage() {
  const raw = localStorage.getItem('ledger_config');
  if (!raw) { setSyncStatus('not connected', false); return; }
  CONFIG = JSON.parse(raw);
  $('cfgOwner').value = CONFIG.owner || '';
  $('cfgRepo').value = CONFIG.repo || '';
  $('cfgBranch').value = CONFIG.branch || 'main';
  $('cfgPath').value = CONFIG.path || 'data/sessions.json';
  $('cfgToken').value = CONFIG.token || '';
  connectAndLoad();
}

function onSaveConfig() {
  CONFIG = {
    owner: $('cfgOwner').value.trim(),
    repo: $('cfgRepo').value.trim(),
    branch: $('cfgBranch').value.trim() || 'main',
    path: $('cfgPath').value.trim() || 'data/sessions.json',
    token: $('cfgToken').value.trim(),
  };
  if (!CONFIG.owner || !CONFIG.repo || !CONFIG.token) {
    alert('Owner, repo, and token are required.');
    return;
  }
  localStorage.setItem('ledger_config', JSON.stringify(CONFIG));
  $('settingsPanel').classList.add('hidden');
  connectAndLoad();
}

function setSyncStatus(label, connected, saving) {
  $('syncLabel').textContent = label;
  const dot = $('syncDot');
  dot.classList.toggle('connected', !!connected && !saving);
  dot.classList.toggle('saving', !!saving);
}

function apiHeaders() {
  return {
    'Authorization': `Bearer ${CONFIG.token}`,
    'Accept': 'application/vnd.github+json',
  };
}

function fileUrl() {
  return `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}?ref=${CONFIG.branch}`;
}

async function connectAndLoad() {
  setSyncStatus('connecting…', false, true);
  try {
    const res = await fetch(fileUrl(), { headers: apiHeaders() });
    if (res.status === 200) {
      const json = await res.json();
      SHA = json.sha;
      const content = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ''))));
      DATA = JSON.parse(content);
      if (!DATA.referenceOptions) DATA.referenceOptions = ['Namaste Psychology', 'MindWorks', 'Armeet'];
    } else if (res.status === 404) {
      SHA = null;
      DATA = { sessions: [], referenceOptions: ['Namaste Psychology', 'MindWorks', 'Armeet'] };
      await saveData('Initialise sessions ledger');
    } else {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `GitHub returned ${res.status}`);
    }
    setSyncStatus(`${CONFIG.owner}/${CONFIG.repo}`, true);
    renderReferenceOptions();
    renderMonthOptions();
    renderOrgFilter();
    renderDashboard();
    renderTable();
    renderTrendChart();
    renderClientResults();
    updateLocationOptions();
  } catch (e) {
    console.error(e);
    setSyncStatus('connection failed', false);
    alert('Could not connect: ' + e.message);
  }
}

function saveData(message) {
  saveQueue = saveQueue.then(() => doSave(message));
  return saveQueue;
}

async function doSave(message) {
  setSyncStatus('saving…', true, true);
  const body = {
    message: message || 'Update sessions ledger',
    content: btoa(unescape(encodeURIComponent(JSON.stringify(DATA, null, 2)))),
    branch: CONFIG.branch,
  };
  if (SHA) body.sha = SHA;
  const res = await fetch(fileUrl().split('?')[0], {
    method: 'PUT',
    headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    setSyncStatus('save failed', false);
    alert('Save failed: ' + (err.message || res.status));
    throw new Error(err.message);
  }
  const json = await res.json();
  SHA = json.content.sha;
  setSyncStatus(`${CONFIG.owner}/${CONFIG.repo}`, true);
  $('saveState').textContent = 'saved ' + new Date().toLocaleTimeString();
}

// ===== REFERENCE / TAGGING =====
function refClass(reference) {
  const r = reference.toLowerCase();
  if (r.includes('namaste')) return 'namaste';
  if (r.includes('mindworks')) return 'mindworks';
  if (r.includes('armeet')) return 'armeet';
  return 'other';
}

function renderReferenceOptions() {
  const sel = $('fReference');
  sel.innerHTML = '';
  DATA.referenceOptions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = r;
    sel.appendChild(opt);
  });
  const newOpt = document.createElement('option');
  newOpt.value = '__new__'; newOpt.textContent = '+ Add new source…';
  sel.appendChild(newOpt);
}

function onReferenceChange() {
  const isNew = $('fReference').value === '__new__';
  $('newRefRow').classList.toggle('hidden', !isNew);
  $('fNewReference').required = isNew;
}

function suggestCommission() {
  const ref = $('fReference').value;
  if (ref === '__new__') return;
  const matches = DATA.sessions
    .filter(s => s.reference === ref)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (matches.length) {
    $('fCommission').value = matches[0].commissionRate;
    updateCalcPreview();
  }
}

function updateLocationOptions() {
  const dl = $('locationOptions');
  const locs = [...new Set(DATA.sessions.map(s => s.location))].sort();
  dl.innerHTML = locs.map(l => `<option value="${escapeHtml(l)}">`).join('');
}

function updateCalcPreview() {
  const fee = parseFloat($('fFee').value) || 0;
  const rate = parseFloat($('fCommission').value) || 0;
  const toOrg = Math.round(fee * rate / 100);
  const toArmeet = fee - toOrg;
  $('calcPreview').textContent = `To organisation ₹${toOrg.toLocaleString('en-IN')} · To Armeet ₹${toArmeet.toLocaleString('en-IN')}`;
}

// ===== ADD SESSION =====
async function onAddSession(e) {
  e.preventDefault();
  if (!CONFIG) { alert('Connect a repo first (Settings, top right).'); return; }

  let reference = $('fReference').value;
  if (reference === '__new__') {
    reference = $('fNewReference').value.trim();
    if (!reference) return;
    if (!DATA.referenceOptions.includes(reference)) DATA.referenceOptions.push(reference);
  }

  const fee = parseFloat($('fFee').value) || 0;
  const rate = parseFloat($('fCommission').value) || 0;
  const toOrg = Math.round(fee * rate / 100);
  const toArmeet = fee - toOrg;

  const session = {
    id: crypto.randomUUID(),
    session: $('fSession').value.trim(),
    date: $('fDate').value,
    reference,
    modeSession: $('fModeSession').value,
    location: $('fLocation').value.trim(),
    fee, commissionRate: rate, toOrg, toArmeet,
    createdAt: new Date().toISOString(),
  };
  DATA.sessions.push(session);

  const submitBtn = e.target.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  try {
    await saveData(`Add session: ${session.session}`);
    $('sessionForm').reset();
    $('fDate').value = todayISO();
    onReferenceChange();
    updateCalcPreview();
    renderReferenceOptions();
    renderMonthOptions();
    renderOrgFilter();
    updateLocationOptions();
    renderDashboard();
    renderTable();
    renderTrendChart();
    renderClientResults();
  } catch (err) {
    DATA.sessions.pop(); // rollback on failure
  } finally {
    submitBtn.disabled = false;
  }
}

let pendingDelete = null; // {session, index, timerId}

function deleteSession(id) {
  const idx = DATA.sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  finalizePendingDelete(); // commit any earlier pending delete first
  const session = DATA.sessions[idx];
  DATA.sessions.splice(idx, 1);
  renderDashboard(); renderTable(); renderTrendChart(); renderClientResults();
  showUndoToast(`Deleted "${session.session}"`);
  pendingDelete = {
    session, index: idx,
    timerId: setTimeout(finalizePendingDelete, 5000),
  };
}

function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timerId);
  DATA.sessions.splice(pendingDelete.index, 0, pendingDelete.session);
  pendingDelete = null;
  hideToast();
  renderDashboard(); renderTable(); renderTrendChart(); renderClientResults();
}

function finalizePendingDelete() {
  if (!pendingDelete) return;
  const removed = pendingDelete.session;
  pendingDelete = null;
  hideToast();
  saveData(`Delete session: ${removed.session}`).catch(() => {
    // save failed — restore locally so the entry isn't silently lost
    DATA.sessions.push(removed);
    renderDashboard(); renderTable(); renderTrendChart(); renderClientResults();
    alert(`Could not save the deletion of "${removed.session}" — it has been restored.`);
  });
}

function showUndoToast(message) {
  $('toastMsg').textContent = message;
  $('toast').classList.remove('hidden');
}
function hideToast() {
  $('toast').classList.add('hidden');
}

// ===== FILTERS =====
function monthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : ''; }

// Sr. No is always derived from chronological order across ALL sessions —
// oldest date is #1 — regardless of the order entries were added in.
// Ties on the same date fall back to createdAt (add order) for stability.
function computeSrNoMap() {
  const sorted = [...DATA.sessions].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const map = new Map();
  sorted.forEach((s, i) => map.set(s.id, i + 1));
  return map;
}

function renderMonthOptions() {
  const sel = $('monthFilter');
  const current = sel.value;
  const months = [...new Set(DATA.sessions.map(s => monthKey(s.date)))].sort().reverse();
  const thisMonth = todayISO().slice(0, 7);
  if (!months.includes(thisMonth)) months.unshift(thisMonth);
  sel.innerHTML = `<option value="">All time</option>` + months.map(m =>
    `<option value="${m}">${formatMonth(m)}</option>`).join('');
  sel.value = months.includes(current) ? current : thisMonth;
}

function formatMonth(m) {
  if (!m) return '';
  const [y, mo] = m.split('-');
  return new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function renderOrgFilter() {
  const sel = $('orgFilter');
  const current = sel.value;
  sel.innerHTML = `<option value="">All referrers</option>` + DATA.referenceOptions.map(r =>
    `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  sel.value = current;
}

function filteredSessions() {
  const month = $('monthFilter').value;
  const org = $('orgFilter').value;
  return DATA.sessions
    .filter(s => !month || monthKey(s.date) === month)
    .filter(s => !org || s.reference === org)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
}

// ===== DASHBOARD =====
function renderDashboard() {
  const month = $('monthFilter').value;
  const rows = DATA.sessions.filter(s => !month || monthKey(s.date) === month);

  const totalFee = rows.reduce((sum, s) => sum + s.fee, 0);
  const totalToArmeet = rows.reduce((sum, s) => sum + s.toArmeet, 0);

  const byRef = {};
  rows.forEach(s => {
    byRef[s.reference] = byRef[s.reference] || { count: 0, toOrg: 0, fee: 0 };
    byRef[s.reference].count++;
    byRef[s.reference].toOrg += s.toOrg;
    byRef[s.reference].fee += s.fee;
  });

  let html = `
    <div class="card">
      <div class="card-label">Sessions</div>
      <div class="card-value">${rows.length}</div>
      <div class="card-sub">${formatMonth(month) || 'all time'}</div>
    </div>
    <div class="card">
      <div class="card-label">Total fee collected</div>
      <div class="card-value">₹${totalFee.toLocaleString('en-IN')}</div>
    </div>
    <div class="card armeet">
      <div class="card-label">Your earnings</div>
      <div class="card-value">₹${totalToArmeet.toLocaleString('en-IN')}</div>
    </div>`;

  Object.entries(byRef).forEach(([ref, v]) => {
    html += `
    <div class="card ${refClass(ref)}">
      <div class="card-label">${escapeHtml(ref)}</div>
      <div class="card-value">₹${v.toOrg.toLocaleString('en-IN')}</div>
      <div class="card-sub">${v.count} session${v.count === 1 ? '' : 's'} owed to them</div>
    </div>`;
  });

  $('summaryCards').innerHTML = html;
}

// ===== TABLE =====
function renderTable() {
  const rows = filteredSessions();
  const srNoMap = computeSrNoMap();
  $('emptyState').classList.toggle('hidden', rows.length > 0);
  $('tableBody').innerHTML = rows.map(s => `
    <tr>
      <td>${srNoMap.get(s.id)}</td>
      <td class="session-name">${escapeHtml(s.session)}</td>
      <td>${formatDate(s.date)}</td>
      <td><span class="ref-tag ${refClass(s.reference)}">${escapeHtml(s.reference)}</span></td>
      <td>${s.modeSession}</td>
      <td>${escapeHtml(s.location)}</td>
      <td>₹${s.fee.toLocaleString('en-IN')}</td>
      <td>${s.commissionRate}%</td>
      <td>₹${s.toOrg.toLocaleString('en-IN')}</td>
      <td>₹${s.toArmeet.toLocaleString('en-IN')}</td>
      <td><div class="row-actions"><button class="icon-btn" onclick="deleteSession('${s.id}')" title="Delete">✕</button></div></td>
    </tr>
  `).join('');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== TREND CHART =====
function renderTrendChart() {
  const container = $('trendChart');
  if (!DATA.sessions.length) {
    container.innerHTML = '<p class="trend-empty">No sessions logged yet — this fills in as you add entries.</p>';
    return;
  }
  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    months.push(new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7));
  }
  const totals = {};
  DATA.sessions.forEach(s => {
    const mk = monthKey(s.date);
    totals[mk] = (totals[mk] || 0) + s.toArmeet;
  });
  const values = months.map(m => totals[m] || 0);
  const max = Math.max(...values, 1);

  const bars = months.map((m, i) => {
    const v = values[i];
    const h = v ? Math.max(Math.round((v / max) * 130), 2) : 2;
    const [y, mo] = m.split('-');
    const label = new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'short' });
    return `<div class="trend-bar-col">
      <div class="trend-bar-value">${v ? '₹' + Math.round(v / 1000) + 'k' : ''}</div>
      <div class="trend-bar" style="height:${h}px" title="${formatMonth(m)}: ₹${v.toLocaleString('en-IN')}"></div>
      <div class="trend-bar-label">${label}</div>
    </div>`;
  }).join('');

  container.innerHTML = `<div class="trend-bars-row">${bars}</div>`;
}

// ===== CLIENT LOOKUP =====
function renderClientResults() {
  const q = $('clientSearch').value.trim().toLowerCase();
  const resultsEl = $('clientResults');

  if (!q) {
    resultsEl.innerHTML = '<p class="client-hint">Start typing to see a client\u2019s full session history.</p>';
    return;
  }

  const matches = DATA.sessions
    .filter(s => s.session.toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!matches.length) {
    resultsEl.innerHTML = `<p class="client-hint">No sessions found matching "${escapeHtml(q)}".</p>`;
    return;
  }

  const totalArmeet = matches.reduce((sum, s) => sum + s.toArmeet, 0);
  const firstDate = matches[matches.length - 1].date;
  const lastDate = matches[0].date;

  const summary = `<div class="client-results-summary">
    ${matches.length} session${matches.length === 1 ? '' : 's'} ·
    ₹${totalArmeet.toLocaleString('en-IN')} earned ·
    first seen ${formatDate(firstDate)} · most recent ${formatDate(lastDate)}
  </div>`;

  const list = matches.map(s => `
    <li>
      <div class="chd-left">
        <span>${escapeHtml(s.session)}</span>
        <span class="chd-date">${formatDate(s.date)} ·
          <span class="ref-tag ${refClass(s.reference)}">${escapeHtml(s.reference)}</span> ·
          ${s.modeSession} · ${escapeHtml(s.location)}
        </span>
      </div>
      <div class="chd-right">₹${s.fee.toLocaleString('en-IN')}<br>
        <span style="color:var(--ink-faint);font-size:11px;">to you ₹${s.toArmeet.toLocaleString('en-IN')}</span>
      </div>
    </li>
  `).join('');

  resultsEl.innerHTML = summary + `<ul class="client-history-list">${list}</ul>`;
}

// ===== EXPORT =====
function onExport() {
  const rows = filteredSessions();
  if (!rows.length) { alert('Nothing to export for this filter.'); return; }
  const srNoMap = computeSrNoMap();

  const sheetRows = rows.map(s => ({
    'Sr. No': srNoMap.get(s.id),
    'Session': s.session,
    'Date': formatDate(s.date),
    'Mode of Reference': s.reference,
    'Mode of Session': s.modeSession,
    'Location': s.location,
    'Fee': s.fee,
    'Commission Rate': s.commissionRate / 100,
    'To Organisation': s.toOrg,
    'To Armeet': s.toArmeet,
  }));

  const ws = XLSX.utils.json_to_sheet(sheetRows);
  ws['!cols'] = [{ wch: 6 }, { wch: 26 }, { wch: 22 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }];
  const commCol = 'H';
  for (let i = 2; i <= sheetRows.length + 1; i++) {
    const cell = ws[commCol + i];
    if (cell) cell.z = '0.00%';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sessions');

  const org = $('orgFilter').value || 'All';
  const month = $('monthFilter').value || 'AllTime';
  const filename = `${org.replace(/\s+/g, '_')}_${month}.xlsx`;
  XLSX.writeFile(wb, filename);
}
