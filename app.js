// ===== STATE =====
let CONFIG = null;
let SHA = null;
let DATA = { sessions: [], referenceOptions: ['Namaste Psychology', 'MindWorks', 'Armeet'] };
let saveQueue = Promise.resolve();
let editingId = null;
let sortKey = 'date';
let sortDir = 'asc';
let pendingDelete = null;
let noticeTimer = null;

const $ = (id) => document.getElementById(id);

const EDIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
const DUP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';

// ===== INIT =====
window.addEventListener('DOMContentLoaded', () => {
  $('fDate').value = todayISO();
  bindEvents();
  loadConfigFromStorage();
  renderReferenceOptions();
  updateSortSelectUI();
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function bindEvents() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings modal
  $('settingsBtn').addEventListener('click', openSettings);
  $('cfgCancel').addEventListener('click', closeSettings);
  $('cfgSave').addEventListener('click', onSaveConfig);
  $('settingsBackdrop').addEventListener('click', (e) => { if (e.target.id === 'settingsBackdrop') closeSettings(); });

  // Filter sheet
  $('filterBtn').addEventListener('click', openFilterSheet);
  $('closeFilterSheetBtn').addEventListener('click', closeFilterSheet);
  $('filterSheetBackdrop').addEventListener('click', (e) => { if (e.target.id === 'filterSheetBackdrop') closeFilterSheet(); });
  $('clearFiltersBtn').addEventListener('click', () => {
    $('orgFilter').value = '';
    $('locationFilterSel').value = '';
    $('modeFilterSel').value = '';
    renderHistoryList();
    updateFilterCount();
  });

  // Form
  $('sessionForm').addEventListener('submit', onAddSession);
  $('fReference').addEventListener('change', onReferenceChange);
  $('fReference').addEventListener('change', suggestCommission);
  $('fFee').addEventListener('input', updateCalcPreview);
  $('fCommission').addEventListener('input', updateCalcPreview);
  $('cancelEditBtn').addEventListener('click', exitEditMode);

  // Insights
  $('monthFilter').addEventListener('change', () => { renderInsights(); renderBreakdown(); renderHistoryList(); });
  $('fyFilter').addEventListener('change', renderFYStats);

  // History toolbar
  $('clientSearch').addEventListener('input', renderHistoryList);
  $('orgFilter').addEventListener('change', () => { renderHistoryList(); updateFilterCount(); });
  $('locationFilterSel').addEventListener('change', () => { renderHistoryList(); updateFilterCount(); });
  $('modeFilterSel').addEventListener('change', () => { renderHistoryList(); updateFilterCount(); });
  $('sortSelect').addEventListener('change', () => setSortFromSelect($('sortSelect').value));
  $('sortDirBtn').addEventListener('click', toggleSortDir);
  $('exportBtn').addEventListener('click', onExport);
  $('backupBtn').addEventListener('click', onBackupJSON);
  document.querySelectorAll('#sessionsTable thead th.sortable').forEach(th => {
    th.addEventListener('click', () => setSortFromHeader(th.dataset.sort));
  });

  // Undo toast + notice
  $('toastUndo').addEventListener('click', undoDelete);
  $('noticeClose').addEventListener('click', hideNotice);

  // Calendar picker
  $('fDate').addEventListener('click', openCalendar);
  $('calPrevBtn').addEventListener('click', () => navCalendar(-1));
  $('calNextBtn').addEventListener('click', () => navCalendar(1));
  $('calTodayBtn').addEventListener('click', () => selectCalendarDay(todayISO()));
  $('calendarBackdrop').addEventListener('click', (e) => { if (e.target.id === 'calendarBackdrop') closeCalendar(); });
}

// ===== TABS =====
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => {
    const match = p.dataset.tabPanel === tab;
    p.hidden = !match;
    if (match) {
      p.classList.remove('active');
      void p.offsetWidth; // restart the fade-in animation
      p.classList.add('active');
    }
  });
}

// ===== NOTICE BANNER (replaces alert()) =====
function showNotice(message) {
  $('noticeMsg').textContent = message;
  $('notice').classList.remove('hidden');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(hideNotice, 5500);
}
function hideNotice() {
  $('notice').classList.add('hidden');
}

// ===== MODALS =====
function openSettings() { $('settingsBackdrop').classList.remove('hidden'); }
function closeSettings() { $('settingsBackdrop').classList.add('hidden'); }
function openFilterSheet() { $('filterSheetBackdrop').classList.remove('hidden'); }
function closeFilterSheet() { $('filterSheetBackdrop').classList.add('hidden'); }

// ===== CALENDAR PICKER =====
let calendarViewYear, calendarViewMonth;

function openCalendar() {
  const iso = $('fDate').value || todayISO();
  const d = new Date(iso + 'T00:00:00');
  calendarViewYear = d.getFullYear();
  calendarViewMonth = d.getMonth();
  renderCalendar();
  $('calendarBackdrop').classList.remove('hidden');
}
function closeCalendar() { $('calendarBackdrop').classList.add('hidden'); }

function navCalendar(delta) {
  calendarViewMonth += delta;
  if (calendarViewMonth < 0) { calendarViewMonth = 11; calendarViewYear--; }
  if (calendarViewMonth > 11) { calendarViewMonth = 0; calendarViewYear++; }
  renderCalendar();
}

function renderCalendar() {
  const selectedISO = $('fDate').value;
  const todayIso = todayISO();
  const first = new Date(calendarViewYear, calendarViewMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calendarViewYear, calendarViewMonth + 1, 0).getDate();

  $('calTitle').textContent = first.toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  let cells = '';
  for (let i = 0; i < startDow; i++) cells += '<span class="cal-day cal-day-empty"></span>';
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${calendarViewYear}-${String(calendarViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const classes = ['cal-day'];
    if (iso === selectedISO) classes.push('selected');
    if (iso === todayIso) classes.push('today');
    cells += `<button type="button" class="${classes.join(' ')}" onclick="selectCalendarDay('${iso}')">${day}</button>`;
  }
  $('calGrid').innerHTML = cells;
}

function selectCalendarDay(iso) {
  $('fDate').value = iso;
  closeCalendar();
}

// ===== CONFIG =====
function loadConfigFromStorage() {
  const raw = localStorage.getItem('ledger_config');
  if (!raw) { setSyncStatus('not connected', false); openSettings(); return; }
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
    showNotice('Owner, repo, and token are required.');
    return;
  }
  localStorage.setItem('ledger_config', JSON.stringify(CONFIG));
  closeSettings();
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
    fullRerender();
  } catch (e) {
    console.error(e);
    setSyncStatus('connection failed', false);
    showNotice('Could not connect: ' + e.message);
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
    showNotice('Save failed: ' + (err.message || res.status));
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

// The stored value stays "Armeet" (so existing data keeps working) —
// this only controls what gets shown to a reader.
function displayRef(reference) {
  return refClass(reference) === 'armeet' ? 'Direct / Self-referred' : reference;
}

function renderReferenceOptions() {
  const sel = $('fReference');
  sel.innerHTML = '';
  DATA.referenceOptions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r; opt.textContent = displayRef(r);
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

// ===== ADD / EDIT SESSION =====
async function onAddSession(e) {
  e.preventDefault();
  if (!CONFIG) { showNotice('Connect a repo first (Settings, top right).'); openSettings(); return; }

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
  const fields = {
    session: $('fSession').value.trim(),
    date: $('fDate').value,
    reference,
    modeSession: $('fModeSession').value,
    location: $('fLocation').value.trim(),
    fee, commissionRate: rate, toOrg, toArmeet,
  };

  // Non-blocking duplicate-entry guard: same session name + date already logged.
  if (!editingId) {
    const dupe = DATA.sessions.find(s =>
      s.session.trim().toLowerCase() === fields.session.toLowerCase() && s.date === fields.date);
    if (dupe) {
      showNotice(`Heads up: "${fields.session}" already has a session logged on ${formatDate(fields.date)}. Saved anyway — check History if that wasn't intended.`);
    }
  }

  const submitBtn = $('formSubmitBtn');
  submitBtn.disabled = true;

  if (editingId) {
    const idx = DATA.sessions.findIndex(s => s.id === editingId);
    if (idx === -1) {
      showNotice('This session no longer exists — it may have been deleted elsewhere.');
      exitEditMode();
      submitBtn.disabled = false;
      return;
    }
    const original = { ...DATA.sessions[idx] };
    DATA.sessions[idx] = { ...original, ...fields, updatedAt: new Date().toISOString() };
    try {
      await saveData(`Edit session: ${fields.session}`);
      exitEditMode();
      fullRerender();
    } catch (err) {
      DATA.sessions[idx] = original;
    } finally {
      submitBtn.disabled = false;
    }
  } else {
    const session = { id: crypto.randomUUID(), ...fields, createdAt: new Date().toISOString() };
    DATA.sessions.push(session);
    try {
      await saveData(`Add session: ${session.session}`);
      resetForm();
      fullRerender();
    } catch (err) {
      DATA.sessions.pop();
    } finally {
      submitBtn.disabled = false;
    }
  }
}

function fullRerender() {
  renderReferenceOptions();
  renderMonthOptions();
  renderFYOptions();
  renderOrgFilter();
  renderLocationFilter();
  updateLocationOptions();
  renderInsights();
  renderFYStats();
  renderHistoryList();
  renderTrendChart();
  renderBreakdown();
  updateFilterCount();
  updateSortHeaderUI();
  updateSortSelectUI();
}

function resetForm() {
  $('sessionForm').reset();
  $('fDate').value = todayISO();
  onReferenceChange();
  updateCalcPreview();
}

function editSession(id) {
  const session = DATA.sessions.find(s => s.id === id);
  if (!session) return;
  editingId = id;
  switchTab('log');

  $('fSession').value = session.session;
  $('fDate').value = session.date;
  $('fReference').value = session.reference;
  onReferenceChange();
  $('fModeSession').value = session.modeSession;
  $('fLocation').value = session.location;
  $('fFee').value = session.fee;
  $('fCommission').value = session.commissionRate;
  updateCalcPreview();

  $('formTitle').textContent = 'Edit session';
  $('editSrNo').textContent = computeSrNoMap().get(id);
  $('editBadge').classList.remove('hidden');
  $('formSubmitBtn').textContent = 'Save changes';
  $('cancelEditBtn').classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Pre-fills the form with an existing session's details as a fresh (non-edit)
// entry — same client, referrer, mode, location, fee and commission, but
// today's date — so a repeat visit is one tap plus a submit.
function duplicateSession(id) {
  const session = DATA.sessions.find(s => s.id === id);
  if (!session) return;
  exitEditMode();
  switchTab('log');

  $('fSession').value = session.session;
  $('fDate').value = todayISO();
  $('fReference').value = session.reference;
  onReferenceChange();
  $('fModeSession').value = session.modeSession;
  $('fLocation').value = session.location;
  $('fFee').value = session.fee;
  $('fCommission').value = session.commissionRate;
  updateCalcPreview();

  showNotice(`Prefilled a new session for "${session.session}" — check the date and details, then submit.`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function exitEditMode() {
  editingId = null;
  $('formTitle').textContent = 'New session';
  $('editBadge').classList.add('hidden');
  $('formSubmitBtn').textContent = 'Add session';
  $('cancelEditBtn').classList.add('hidden');
  resetForm();
}

// ===== DELETE (with undo) =====
function deleteSession(id) {
  const idx = DATA.sessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  if (editingId === id) exitEditMode();
  finalizePendingDelete();
  const session = DATA.sessions[idx];
  DATA.sessions.splice(idx, 1);
  fullRerender();
  showUndoToast(`Deleted "${session.session}"`);
  pendingDelete = { session, index: idx, timerId: setTimeout(finalizePendingDelete, 5000) };
}

function undoDelete() {
  if (!pendingDelete) return;
  clearTimeout(pendingDelete.timerId);
  DATA.sessions.splice(pendingDelete.index, 0, pendingDelete.session);
  pendingDelete = null;
  hideToast();
  fullRerender();
}

function finalizePendingDelete() {
  if (!pendingDelete) return;
  const removed = pendingDelete.session;
  pendingDelete = null;
  hideToast();
  saveData(`Delete session: ${removed.session}`).catch(() => {
    DATA.sessions.push(removed);
    fullRerender();
    showNotice(`Could not save the deletion of "${removed.session}" — it has been restored.`);
  });
}

function showUndoToast(message) {
  $('toastMsg').textContent = message;
  $('toast').classList.remove('hidden');
}
function hideToast() {
  $('toast').classList.add('hidden');
}

// ===== SORTING =====
function setSortFromHeader(key) {
  if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortKey = key; sortDir = 'asc'; }
  afterSortChange();
}
function setSortFromSelect(key) {
  sortKey = key;
  afterSortChange();
}
function toggleSortDir() {
  sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  afterSortChange();
}
function afterSortChange() {
  renderHistoryList();
  updateSortHeaderUI();
  updateSortSelectUI();
}
function updateSortHeaderUI() {
  document.querySelectorAll('#sessionsTable thead th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortKey) th.classList.add(sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}
function updateSortSelectUI() {
  $('sortSelect').value = sortKey;
  $('sortDirIcon').style.transform = sortDir === 'desc' ? 'rotate(180deg)' : 'rotate(0deg)';
}

function compareByKey(a, b, key) {
  switch (key) {
    case 'reference': return a.reference.localeCompare(b.reference);
    case 'modeSession': return a.modeSession.localeCompare(b.modeSession);
    case 'location': return a.location.localeCompare(b.location);
    case 'date':
    default: return a.date.localeCompare(b.date);
  }
}

// ===== FILTERS =====
function monthKey(dateStr) { return dateStr ? dateStr.slice(0, 7) : ''; }

// Serial numbers restart at 1 for every calendar month (grouped by the
// session's own date, not when it was entered), assigned in date/createdAt
// order within that month — so "Sr. No. 1" always means the first logged
// session of that particular month, matching the old spreadsheet format.
function computeSrNoMap() {
  const byMonth = new Map();
  DATA.sessions.forEach(s => {
    const mk = monthKey(s.date);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(s);
  });

  const map = new Map();
  byMonth.forEach(monthSessions => {
    monthSessions
      .sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''))
      .forEach((s, i) => map.set(s.id, i + 1));
  });
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

// ===== FINANCIAL YEAR (April – March) =====
// FY key format: "2025-26" meaning 1 Apr 2025 – 31 Mar 2026
function fyKeyForDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const y = d.getFullYear();
  const startYear = d.getMonth() >= 3 ? y : y - 1; // month is 0-indexed, 3 = April
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

function currentFYKey() {
  return fyKeyForDate(todayISO());
}

function renderFYOptions() {
  const sel = $('fyFilter');
  const current = sel.value;
  const fys = [...new Set(DATA.sessions.map(s => fyKeyForDate(s.date)))];
  const thisFY = currentFYKey();
  if (!fys.includes(thisFY)) fys.push(thisFY);
  fys.sort().reverse();
  sel.innerHTML = fys.map(f => `<option value="${f}">FY ${f}</option>`).join('');
  sel.value = fys.includes(current) ? current : thisFY;
}

function renderFYStats() {
  const fy = $('fyFilter').value || currentFYKey();
  const rows = DATA.sessions.filter(s => fyKeyForDate(s.date) === fy);
  const totalFee = rows.reduce((sum, s) => sum + s.fee, 0);
  const totalToArmeet = rows.reduce((sum, s) => sum + s.toArmeet, 0);
  const totalToOrg = rows.reduce((sum, s) => sum + s.toOrg, 0);
  $('fyStats').innerHTML = `
    <span class="fy-stat"><b>${rows.length}</b> session${rows.length === 1 ? '' : 's'}</span>
    <span class="fy-stat">₹${totalFee.toLocaleString('en-IN')} collected</span>
    <span class="fy-stat">₹${totalToOrg.toLocaleString('en-IN')} to organisations</span>
    <span class="fy-stat fy-stat-highlight">₹${totalToArmeet.toLocaleString('en-IN')} yours</span>
  `;
}

function renderOrgFilter() {
  const sel = $('orgFilter');
  const current = sel.value;
  sel.innerHTML = `<option value="">All referrers</option>` + DATA.referenceOptions.map(r =>
    `<option value="${escapeHtml(r)}">${escapeHtml(displayRef(r))}</option>`).join('');
  sel.value = current;
}

function renderLocationFilter() {
  const sel = $('locationFilterSel');
  const current = sel.value;
  const locs = [...new Set(DATA.sessions.map(s => s.location).filter(Boolean))].sort();
  sel.innerHTML = `<option value="">All locations</option>` + locs.map(l =>
    `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
  sel.value = locs.includes(current) ? current : '';
}

function updateFilterCount() {
  const count = [$('orgFilter').value, $('locationFilterSel').value, $('modeFilterSel').value].filter(Boolean).length;
  const el = $('filterCount');
  if (count > 0) { el.textContent = count; el.classList.remove('hidden'); }
  else el.classList.add('hidden');
}

function filteredSessions() {
  const month = $('monthFilter').value;
  const org = $('orgFilter').value;
  const location = $('locationFilterSel').value;
  const mode = $('modeFilterSel').value;
  const q = $('clientSearch').value.trim().toLowerCase();
  const monthActive = !q && month; // a name search intentionally spans all time

  return DATA.sessions
    .filter(s => !monthActive || monthKey(s.date) === month)
    .filter(s => !org || s.reference === org)
    .filter(s => !location || s.location === location)
    .filter(s => !mode || s.modeSession === mode)
    .filter(s => !q || s.session.toLowerCase().includes(q))
    .sort((a, b) => {
      const primary = compareByKey(a, b, sortKey) * (sortDir === 'asc' ? 1 : -1);
      if (primary !== 0) return primary;
      return a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

// ===== INSIGHTS (hero + trend + breakdown) =====
function renderInsights() {
  const month = $('monthFilter').value;
  const rows = DATA.sessions.filter(s => !month || monthKey(s.date) === month);
  const totalFee = rows.reduce((sum, s) => sum + s.fee, 0);
  const totalToArmeet = rows.reduce((sum, s) => sum + s.toArmeet, 0);

  $('heroMonthLabel').textContent = month ? formatMonth(month) : 'all time';
  const hv = $('heroValue');
  hv.style.opacity = '0';
  hv.textContent = `₹${totalToArmeet.toLocaleString('en-IN')}`;
  requestAnimationFrame(() => { hv.style.opacity = '1'; });
  $('heroSub').textContent = `${rows.length} session${rows.length === 1 ? '' : 's'} · ₹${totalFee.toLocaleString('en-IN')} collected`;
}

// Formats a rupee amount into a short label using the Indian numbering
// system (thousand → k, lakh → L) so large totals stay readable on the
// chart's y-axis, bar labels, and average line without wrapping.
function formatShort(v) {
  v = Math.round(v);
  if (v >= 100000) {
    const lakhs = v / 100000;
    return (Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)) + 'L';
  }
  if (v >= 1000) {
    const th = v / 1000;
    return (Number.isInteger(th) ? th : th.toFixed(1)) + 'k';
  }
  return String(v);
}

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
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const avgPct = Math.min((avg / max) * 100, 100);
  const thisMonthKey = now.toISOString().slice(0, 7);

  // Gridlines from 0% to 100% of the tallest month, each labelled with the
  // rupee value it represents, so the chart reads like a real axis instead
  // of a row of unlabelled bars.
  const gridlinesHtml = [0, 25, 50, 75, 100].map(pct => `
    <div class="trend-gridline" style="bottom:${pct}%">
      <span class="trend-gridline-label">₹${formatShort(max * pct / 100)}</span>
    </div>`).join('');

  const valueRow = values.map(v =>
    `<div class="trend-col-cell">${v ? '₹' + formatShort(v) : ''}</div>`
  ).join('');

  const barsRow = months.map((m, i) => {
    const v = values[i];
    const pct = max ? (v / max) * 100 : 0;
    const isCurrent = m === thisMonthKey;
    return `<div class="trend-col-cell trend-bar-cell">
      <div class="trend-bar-tooltip">₹${v.toLocaleString('en-IN')}<span>${formatMonth(m)}</span></div>
      <div class="trend-bar${isCurrent ? ' is-current' : ''}" data-h="${pct}" style="height:0%"></div>
    </div>`;
  }).join('');

  const labelRow = months.map(m => {
    const [y, mo] = m.split('-');
    const label = new Date(y, mo - 1, 1).toLocaleString('en-IN', { month: 'short' });
    const isCurrent = m === thisMonthKey;
    return `<div class="trend-col-cell trend-label-cell${isCurrent ? ' is-current' : ''}">${label}</div>`;
  }).join('');

  container.innerHTML = `
    <div class="trend-plot">
      <div class="trend-scroll">
        <div class="trend-value-row">${valueRow}</div>
        <div class="trend-bars-area">
          <div class="trend-gridlines">${gridlinesHtml}</div>
          <div class="trend-avg-line" style="bottom:${avgPct}%"><span>avg ₹${formatShort(avg)}</span></div>
          <div class="trend-bars-row">${barsRow}</div>
        </div>
        <div class="trend-label-row">${labelRow}</div>
      </div>
    </div>
  `;

  // Grow bars in from zero, staggered left-to-right, instead of popping
  // straight to full height.
  requestAnimationFrame(() => {
    container.querySelectorAll('.trend-bar').forEach((el, i) => {
      setTimeout(() => { el.style.height = el.dataset.h + '%'; }, i * 30);
    });
  });
}

function groupBy(rows, keyFn) {
  const map = {};
  rows.forEach(s => {
    const k = keyFn(s) || '\u2014';
    map[k] = map[k] || { count: 0, toOrg: 0, toArmeet: 0 };
    map[k].count++;
    map[k].toOrg += s.toOrg;
    map[k].toArmeet += s.toArmeet;
  });
  return map;
}

function renderBreakdownRows(map, tagged) {
  const entries = Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  if (!entries.length) return '<tr><td class="mini-empty" colspan="4">No sessions this month</td></tr>';
  return entries.map(([name, v]) => `
    <tr>
      <td class="mini-name">${tagged ? `<span class="ref-tag ${refClass(name)}">${escapeHtml(displayRef(name))}</span>` : escapeHtml(name)}</td>
      <td>${v.count}</td>
      <td>\u20b9${v.toOrg.toLocaleString('en-IN')}</td>
      <td>\u20b9${v.toArmeet.toLocaleString('en-IN')}</td>
    </tr>
  `).join('');
}

function renderBreakdown() {
  const month = $('monthFilter').value;
  const rows = DATA.sessions.filter(s => !month || monthKey(s.date) === month);
  $('refBreakdownBody').innerHTML = renderBreakdownRows(groupBy(rows, s => s.reference), true);
  $('locationBreakdownBody').innerHTML = renderBreakdownRows(groupBy(rows, s => s.location), false);
  $('modeBreakdownBody').innerHTML = renderBreakdownRows(groupBy(rows, s => s.modeSession), false);
}

// ===== HISTORY LIST (table + cards, unified) =====
function renderHistoryList() {
  const rows = filteredSessions();
  const srNoMap = computeSrNoMap();
  $('emptyState').classList.toggle('hidden', rows.length > 0);

  $('tableBody').innerHTML = rows.map((s, i) => renderTableRow(s, srNoMap.get(s.id), i)).join('');
  $('sessionCards').innerHTML = rows.map((s, i) => renderCard(s, srNoMap.get(s.id), i)).join('');

  renderSearchSummary(rows);
}

function renderTableRow(s, srNo, i) {
  return `<tr style="animation-delay:${Math.min(i * 18, 300)}ms">
    <td>${srNo}</td>
    <td class="session-name">${escapeHtml(s.session)}</td>
    <td>${formatDate(s.date)}</td>
    <td><span class="ref-tag ${refClass(s.reference)}">${escapeHtml(displayRef(s.reference))}</span></td>
    <td>${s.modeSession}</td>
    <td>${escapeHtml(s.location)}</td>
    <td>₹${s.fee.toLocaleString('en-IN')}</td>
    <td>${s.commissionRate}%</td>
    <td>₹${s.toOrg.toLocaleString('en-IN')}</td>
    <td>₹${s.toArmeet.toLocaleString('en-IN')}</td>
    <td><div class="row-actions">
      <button class="icon-btn icon-btn-dup" onclick="duplicateSession('${s.id}')" title="Duplicate as new session">${DUP_ICON}</button>
      <button class="icon-btn icon-btn-edit" onclick="editSession('${s.id}')" title="Edit">${EDIT_ICON}</button>
      <button class="icon-btn" onclick="deleteSession('${s.id}')" title="Delete">${TRASH_ICON}</button>
    </div></td>
  </tr>`;
}

function renderCard(s, srNo, i) {
  return `<div class="session-card" style="animation-delay:${Math.min(i * 18, 300)}ms">
    <div class="sc-top">
      <span class="sc-name">${escapeHtml(s.session)}</span>
      <span class="sc-amount">₹${s.toArmeet.toLocaleString('en-IN')}</span>
    </div>
    <div class="sc-meta">
      <span class="ref-tag ${refClass(s.reference)}">${escapeHtml(displayRef(s.reference))}</span>
      <span class="sc-dot">·</span><span>${formatDate(s.date)}</span>
      <span class="sc-dot">·</span><span>${s.modeSession}</span>
      <span class="sc-dot">·</span><span>${escapeHtml(s.location)}</span>
    </div>
    <div class="sc-bottom">
      <span class="sc-fee">#${srNo} · Fee ₹${s.fee.toLocaleString('en-IN')} · ${s.commissionRate}%</span>
      <div class="sc-actions">
        <button class="icon-btn icon-btn-dup" onclick="duplicateSession('${s.id}')" title="Duplicate as new session">${DUP_ICON}</button>
        <button class="icon-btn icon-btn-edit" onclick="editSession('${s.id}')" title="Edit">${EDIT_ICON}</button>
        <button class="icon-btn" onclick="deleteSession('${s.id}')" title="Delete">${TRASH_ICON}</button>
      </div>
    </div>
  </div>`;
}

function renderSearchSummary(rows) {
  const q = $('clientSearch').value.trim();
  const el = $('searchSummary');
  if (!q) { el.classList.add('hidden'); return; }
  if (!rows.length) {
    el.textContent = `No sessions found matching "${q}".`;
    el.classList.remove('hidden');
    return;
  }
  const totalArmeet = rows.reduce((sum, s) => sum + s.toArmeet, 0);
  el.textContent = `${rows.length} session${rows.length === 1 ? '' : 's'} matching "${q}" · ₹${totalArmeet.toLocaleString('en-IN')} earned`;
  el.classList.remove('hidden');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== EXPORT =====
function onExport() {
  const rows = filteredSessions();
  if (!rows.length) { showNotice('Nothing to export for this filter.'); return; }
  const srNoMap = computeSrNoMap();

  const sheetRows = rows.map(s => ({
    'Sr. No': srNoMap.get(s.id),
    'Session': s.session,
    'Date': formatDate(s.date),
    'Mode of Reference': displayRef(s.reference),
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

// ===== RAW JSON BACKUP =====
// Independent safety net from the GitHub-backed store: dumps the whole
// DATA object (sessions + referenceOptions) exactly as stored, unfiltered.
function onBackupJSON() {
  if (!DATA.sessions.length) { showNotice('No data to back up yet.'); return; }
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = todayISO();
  a.href = url;
  a.download = `ledger_backup_${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showNotice('Backup downloaded — this is a full raw copy independent of your GitHub repo.');
}
