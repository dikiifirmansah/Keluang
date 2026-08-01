// ======================================================
// MODULE: Budget
// STATUS: Aktif
// ======================================================

// ======================================================
// STATE
// ======================================================
let budgetMonth = '';
let budgetFormCategory = null;
let budgetDetailCategory = null;

// ======================================================
// INIT
// ======================================================
function initBudget() {
  const now = new Date();
  budgetMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  renderBudgetPage();
}

// ======================================================
// HELPERS
// ======================================================
function budgetMonthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  const bulan = ['Januari','Februari','Maret','April','Mei','Juni',
                 'Juli','Agustus','September','Oktober','November','Desember'];
  return `${bulan[m - 1]} ${y}`;
}

function budgetPrevMonth() {
  const [y, m] = budgetMonth.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  budgetMonth = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  renderBudgetPage();
}

function budgetNextMonth() {
  const [y, m] = budgetMonth.split('-').map(Number);
  const d = new Date(y, m, 1);
  budgetMonth = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  renderBudgetPage();
}

function getSpentByCategory(month) {
  const result = {};
  loadTransactions().forEach(t => {
    if (t.type !== 'keluar') return;
    if (!t.date || !t.date.startsWith(month)) return;
    result[t.category] = (result[t.category] || 0) + t.amount;
  });
  return result;
}

function getTxByCategory(month, category) {
  return loadTransactions().filter(t =>
    t.type === 'keluar' &&
    t.category === category &&
    t.date && t.date.startsWith(month)
  ).sort((a, b) => b.date.localeCompare(a.date));
}

// FIX POIN 4: getBudgetsForMonth selalu baca fresh dari storage,
// TIDAK andalkan state global. Repeat hanya aktif kalau ada data
// eksplisit bulan sebelumnya yang tersimpan user sendiri.
function getBudgetsForMonth(month) {
  const allBudgets = loadBudgets(); // selalu fresh
  const explicit = allBudgets.filter(b => b.month === month);

  const [y, m] = month.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevMonth = `${prevDate.getFullYear()}-${(prevDate.getMonth() + 1).toString().padStart(2, '0')}`;
  const repeating = allBudgets.filter(b => b.month === prevMonth && b.repeat === true);

  repeating.forEach(rb => {
    if (!explicit.find(e => e.category === rb.category)) {
      explicit.push({ ...rb, id: null, month });
    }
  });
  return explicit;
}

function bdgStatusInfo(spent, limit) {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const over = spent > limit;
  const warn = !over && pct >= 80;
  return {
    pct,
    over,
    warn,
    statusClass: over ? 'bdg-status-over' : warn ? 'bdg-status-warn' : 'bdg-status-ok',
    statusText: over ? 'Over budget' : warn ? 'Hampir habis' : 'Aman',
    barClass: over ? 'over' : warn ? 'warn' : 'ok',
  };
}

// ======================================================
// RENDER HALAMAN BUDGET
// ======================================================
function renderBudgetPage() {
  const isTrulyEmpty = loadBudgets().length === 0;
  document.getElementById('budgetNavRow').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('budgetTopbarSearchBtn').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('budgetAddBtn').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('budgetInfoNote').style.display = isTrulyEmpty ? 'none' : 'flex';

  if (isTrulyEmpty) {
    document.getElementById('budgetSearchRow').style.display = 'none';
    document.getElementById('budgetHero').innerHTML = '';
    document.getElementById('budgetList').innerHTML = `
      <div class="bdg-empty" style="margin-top:24px;">
        <i class="fi fi-ss-calculator-money"></i>
        <div class="bdg-empty-title">Belum Ada Budget</div>
        <div class="bdg-empty-sub">Rencanakan pengeluaranmu dengan mengatur batas belanja per kategori setiap bulan.</div>
        <button class="dd-empty-cta" style="margin-top:16px;" onclick="openBudgetForm(null)">
          <i class="bi bi-plus-lg"></i> Buat Budget
        </button>
      </div>`;
    return;
  }

  const spent = getSpentByCategory(budgetMonth);
  const activeBudgets = getBudgetsForMonth(budgetMonth);

  let totalLimit = 0, totalSpent = 0;
  activeBudgets.forEach(b => {
    totalLimit += b.limit;
    totalSpent += (spent[b.category] || 0);
  });
  const totalSisa = totalLimit - totalSpent;
  const globalPct = totalLimit > 0 ? Math.min((totalSpent / totalLimit) * 100, 100) : 0;
  const globalOver = totalSpent > totalLimit;

  document.getElementById('budgetMonthLabel').textContent = budgetMonthLabel(budgetMonth);

  // Hero global — hanya tampil kalau ada budget
  const heroEl = document.getElementById('budgetHero');
  heroEl.innerHTML = totalLimit === 0 ? '' : `
    <div class="bdg-hero">
      <div class="bdg-hero-row">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">Total Budget</div>
          <div class="bdg-hero-val">${formatRupiah(totalLimit)}</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Terpakai</div>
          <div class="bdg-hero-val danger">${formatRupiah(totalSpent)}</div>
        </div>
      </div>
      <div class="bdg-global-track">
        <div class="bdg-global-fill ${globalOver ? 'over' : globalPct >= 80 ? 'warn' : 'ok'}"
             style="width:${globalPct}%;"></div>
      </div>
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct ${globalOver ? 'danger' : globalPct >= 80 ? 'warn' : 'ok-text'}">
          ${globalPct.toFixed(1)}% terpakai
        </div>
        <div class="bdg-hero-sisa ${globalOver ? 'danger' : 'ok-text'}">
          ${globalOver
            ? 'Over ' + formatRupiahShort(totalSpent - totalLimit)
            : 'Sisa ' + formatRupiahShort(totalSisa)}
        </div>
      </div>
    </div>`;

  // List
  const listEl = document.getElementById('budgetList');
  if (activeBudgets.length === 0) {
    listEl.innerHTML = `
      <div class="bdg-empty">
        <i class="fi fi-ss-calculator-money"></i>
        <div class="bdg-empty-title">Belum Ada Budget</div>
        <div class="bdg-empty-sub">Tap "Buat Budget" di bawah untuk mulai merencanakan pengeluaranmu</div>
      </div>`;
    return;
  }

  activeBudgets.sort((a, b) => {
    const pA = (spent[a.category] || 0) / a.limit;
    const pB = (spent[b.category] || 0) / b.limit;
    return pB - pA;
  });

  // Filter search inline
  const q = (document.getElementById('budgetSearchInput') && document.getElementById('budgetSearchInput').value || '').toLowerCase().trim();
  const filtered = q ? activeBudgets.filter(b => b.category.toLowerCase().includes(q)) : activeBudgets;

  if (filtered.length === 0 && q) {
    listEl.innerHTML = `<div class="bdg-empty" style="padding:24px 0;"><i class="bi bi-search"></i><div class="bdg-empty-title">Tidak ditemukan</div></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(b => {
    const s = spent[b.category] || 0;
    const { pct, statusClass, statusText, barClass } = bdgStatusInfo(s, b.limit);
    const icon = (categoryIcons && categoryIcons[b.category]) || 'bi-circle';
    const color = (categoryColors && categoryColors[b.category]) || 'var(--ink-300)';

    return `
      <div class="bdg-item" onclick="openBudgetDetail('${b.category}')">
        <div class="bdg-item-top">
          <div class="bdg-item-icon" style="background:${color}20;">
            <i class="bi ${icon}" style="color:${color};"></i>
          </div>
          <div class="bdg-item-info">
            <div class="bdg-item-name">${b.category}</div>
            <div class="bdg-item-amounts">
              <span class="bdg-spent">${formatRupiah(s)}</span>
              <span class="bdg-limit"> / ${formatRupiah(b.limit)}</span>
            </div>
          </div>
          <div class="bdg-item-right">
            <span class="bdg-status ${statusClass}">${statusText}</span>
            <div class="bdg-pct-text">${pct.toFixed(0)}%</div>
          </div>
        </div>
        <div class="bdg-bar-track">
          <div class="bdg-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%;"></div>
        </div>
      </div>`;
  }).join('');
}

// ======================================================
// DETAIL PAGE (page baru, konsisten dengan fitur lain)
// ======================================================
function openBudgetDetail(category) {
  budgetDetailCategory = category;
  // Aktivasi page-budget-detail via goTo agar konsisten
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-budget-detail').classList.add('active');
  renderBudgetDetailPage();
}

function renderBudgetDetailPage() {
  if (!budgetDetailCategory) return;
  const category = budgetDetailCategory;

  const spent = getSpentByCategory(budgetMonth);
  const activeBudgets = getBudgetsForMonth(budgetMonth);
  const b = activeBudgets.find(x => x.category === category);
  if (!b) return;

  const s = spent[category] || 0;
  const sisa = b.limit - s;
  const { pct, over, statusClass, statusText, barClass } = bdgStatusInfo(s, b.limit);
  const icon = (categoryIcons && categoryIcons[category]) || 'bi-circle';
  const color = (categoryColors && categoryColors[category]) || 'var(--ink-300)';

  document.getElementById('budgetDetailTitle').textContent = category;

  const txList = getTxByCategory(budgetMonth, category);
  const uniqueDays = new Set(txList.map(t => t.date.slice(0,10))).size;
  const avgPerDay = uniqueDays > 0 ? Math.round(s / uniqueDays) : 0;

  function fmtTxDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const grouped = {};
  txList.forEach(t => {
    const key = t.date.slice(0,10);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  });

  const txHTML = Object.keys(grouped).sort((a,b) => b.localeCompare(a)).map(dateKey => {
    const items = grouped[dateKey];
    return `
      <div class="bdg-tx-date">${fmtTxDate(dateKey)}</div>
      ${items.map(t => `
        <div class="bdg-tx-item">
          <div class="bdg-tx-note">${escapeHtml(t.note || t.category)}</div>
          <div class="bdg-tx-amt">−${formatRupiah(t.amount)}</div>
        </div>`).join('')}`;
  }).join('');

  document.getElementById('budgetDetailContent').innerHTML = `
    <!-- Hero -->
    <div class="bdg-detail-hero" style="border-color:${color}40;">
      <div class="bdg-detail-icon-row">
        <div class="bdg-detail-icon" style="background:${color}20;">
          <i class="bi ${icon}" style="color:${color}; font-size:22px;"></i>
        </div>
        <div class="bdg-detail-month-label">${budgetMonthLabel(budgetMonth)}</div>
      </div>
      <div class="bdg-detail-nums">
        <div class="bdg-detail-num-item">
          <div class="bdg-detail-num danger">${formatRupiah(s)}</div>
          <div class="bdg-detail-num-lbl">Terpakai</div>
        </div>
        <div class="bdg-detail-num-item center">
          <div class="bdg-detail-num">${formatRupiah(b.limit)}</div>
          <div class="bdg-detail-num-lbl">Limit</div>
        </div>
        <div class="bdg-detail-num-item right">
          <div class="bdg-detail-num ${over ? 'danger' : 'ok-text'}">
            ${over ? '−'+formatRupiah(Math.abs(sisa)) : formatRupiah(sisa)}
          </div>
          <div class="bdg-detail-num-lbl">${over ? 'Over' : 'Sisa'}</div>
        </div>
      </div>
      <div class="bdg-bar-track" style="height:8px; margin-bottom:8px;">
        <div class="bdg-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%;"></div>
      </div>
      <div class="bdg-detail-meta">
        <span class="bdg-status ${statusClass}">${statusText}</span>
        <span class="bdg-detail-pct">${pct.toFixed(1)}% terpakai</span>
      </div>
    </div>

    <!-- Strip info -->
    <div class="bdg-detail-strip">
      <div class="bdg-detail-strip-item">
        <i class="bi bi-receipt"></i>
        <span>${txList.length} transaksi</span>
      </div>
      <div class="bdg-detail-strip-sep"></div>
      <div class="bdg-detail-strip-item">
        <i class="bi bi-calendar3"></i>
        <span>Rata-rata ${formatRupiahShort(avgPerDay)}/hari</span>
      </div>
    </div>

    <!-- Transaksi -->
    <div class="bdg-detail-tx-head">Riwayat Transaksi</div>
    ${txList.length === 0
      ? `<div class="bdg-detail-tx-empty"><i class="bi bi-inbox"></i><span>Belum ada transaksi bulan ini</span></div>`
      : txHTML}
  `;
}

function openBudgetFormFromDetail() {
  openBudgetForm(budgetDetailCategory);
}

// ======================================================
// FORM BUDGET
// ======================================================
function openBudgetForm(category) {
  budgetFormCategory = category || null;
  const activeBudgets = getBudgetsForMonth(budgetMonth);
  const existing = category ? activeBudgets.find(b => b.category === category) : null;

  if (existing) {
    budgetFormCategory = existing.category;
    document.getElementById('budgetLimitInput').value = existing.limit.toLocaleString('id-ID');
    document.getElementById('budgetRepeatToggle').checked = existing.repeat !== false;
    document.getElementById('budgetDeleteBtn').style.display = 'flex';
    document.getElementById('budgetSheetTitle').textContent = 'Edit Budget';
    // Update category card
    _updateBudgetCatCard(existing.category);
  } else {
    budgetFormCategory = null;
    document.getElementById('budgetLimitInput').value = '';
    document.getElementById('budgetRepeatToggle').checked = true;
    document.getElementById('budgetDeleteBtn').style.display = 'none';
    document.getElementById('budgetSheetTitle').textContent = 'Buat Budget';
    _updateBudgetCatCard(null);
  }

  document.getElementById('budgetErrMsg').style.display = 'none';
  openSheet('budgetSheetOverlay');
}

function _updateBudgetCatCard(cat) {
  const card = document.getElementById('budgetCatCard');
  const iconWrap = document.getElementById('budgetCatIconWrap');
  const label = document.getElementById('budgetCatLabel');
  if (cat) {
    const icon = (categoryIcons && categoryIcons[cat]) || 'bi-circle';
    const color = (categoryColors && categoryColors[cat]) || 'var(--ink-300)';
    iconWrap.innerHTML = `<i class="bi ${icon}" style="color:${color};"></i>`;
    label.textContent = cat;
    card.classList.remove('placeholder');
  } else {
    iconWrap.innerHTML = '<i class="bi bi-grid"></i>';
    label.textContent = 'Pilih kategori';
    card.classList.add('placeholder');
  }
}

function openBudgetCatPicker() {
  const activeBudgets = getBudgetsForMonth(budgetMonth);
  const usedCats = activeBudgets.map(b => b.category).filter(c => c !== budgetFormCategory);
  const keluarCats = (categories && categories.keluar) || [];
  const available = keluarCats.filter(c => !usedCats.includes(c));

  const listEl = document.getElementById('budgetCategoryList');
  listEl.innerHTML = available.map(c => {
    const icon = (categoryIcons && categoryIcons[c]) || 'bi-circle';
    const color = (categoryColors && categoryColors[c]) || 'var(--primary)';
    const sel = c === budgetFormCategory;
    return `
      <div class="picker-item ${sel ? 'selected' : ''}" onclick="selectBudgetCategory('${c}')">
        <div class="picker-item-icon" style="background:${color}20;">
          <i class="bi ${icon}" style="color:${color};"></i>
        </div>
        <div class="picker-item-name">${c}</div>
        <i class="bi bi-check2 picker-item-check"></i>
      </div>`;
  }).join('');

  openSheet('budgetCatPickerOverlay');
}

// ======================================================
// MONTH PICKER
// ======================================================
let budgetPickerYear = new Date().getFullYear();

function openBudgetMonthPicker() {
  const [y] = budgetMonth.split('-').map(Number);
  budgetPickerYear = y;
  renderBudgetMonthGrid();
  openSheet('budgetMonthPickerOverlay');
}

function budgetPickerPrevYear() {
  budgetPickerYear--;
  document.getElementById('budgetPickerYear').textContent = budgetPickerYear;
  renderBudgetMonthGrid();
}

function budgetPickerNextYear() {
  budgetPickerYear++;
  document.getElementById('budgetPickerYear').textContent = budgetPickerYear;
  renderBudgetMonthGrid();
}

function renderBudgetMonthGrid() {
  document.getElementById('budgetPickerYear').textContent = budgetPickerYear;
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const [curY, curM] = budgetMonth.split('-').map(Number);
  document.getElementById('budgetMonthGrid').innerHTML = bulan.map((b, i) => {
    const m = i + 1;
    const active = budgetPickerYear === curY && m === curM;
    return `<div class="bdg-month-chip ${active ? 'active' : ''}" onclick="selectBudgetMonth(${budgetPickerYear},${m})">${b}</div>`;
  }).join('');
}

function selectBudgetMonth(y, m) {
  budgetMonth = `${y}-${m.toString().padStart(2,'0')}`;
  closeSheet('budgetMonthPickerOverlay');
  renderBudgetPage();
}

// ======================================================
// SEARCH — inline, filter langsung di halaman
// ======================================================
let budgetSearchActive = false;

function toggleBudgetSearch() {
  budgetSearchActive = !budgetSearchActive;
  const row = document.getElementById('budgetSearchRow');
  const input = document.getElementById('budgetSearchInput');
  row.style.display = budgetSearchActive ? 'block' : 'none';
  if (budgetSearchActive) {
    input.value = '';
    renderBudgetPage();
    setTimeout(() => input.focus(), 100);
  } else {
    input.value = '';
    renderBudgetPage();
  }
}

function selectBudgetCategory(cat) {
  budgetFormCategory = cat;
  _updateBudgetCatCard(cat);
  closeSheet('budgetCatPickerOverlay');
}

function saveBudgetForm() {
  const limitRaw = document.getElementById('budgetLimitInput').value.replace(/\D/g, '');
  const limit = parseInt(limitRaw, 10);
  const repeat = document.getElementById('budgetRepeatToggle').checked;
  const errEl = document.getElementById('budgetErrMsg');

  if (!budgetFormCategory) {
    errEl.textContent = 'Pilih kategori terlebih dahulu.';
    errEl.style.display = 'block';
    return;
  }
  if (!limit || limit <= 0) {
    errEl.textContent = 'Masukkan nominal budget yang valid.';
    errEl.style.display = 'block';
    return;
  }

  const allBudgets = loadBudgets();
  const filtered = allBudgets.filter(b => !(b.month === budgetMonth && b.category === budgetFormCategory));
  filtered.push({ id: 'bdg' + uniqueTick(), category: budgetFormCategory, limit, month: budgetMonth, repeat });
  saveBudgets(filtered);

  closeSheet('budgetSheetOverlay');
  renderBudgetPage();
  showToast('Budget disimpan');
}

function deleteBudgetForm() {
  const allBudgets = loadBudgets();
  saveBudgets(allBudgets.filter(b => !(b.month === budgetMonth && b.category === budgetFormCategory)));
  closeSheet('budgetSheetOverlay');
  // Kembali ke halaman budget jika sedang di detail
  goTo('budget');
  showToast('Budget dihapus');
}

function formatBudgetInput(el) {
  const raw = el.value.replace(/\D/g, '');
  el.value = raw ? parseInt(raw, 10).toLocaleString('id-ID') : '';
}
