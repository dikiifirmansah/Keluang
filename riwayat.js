// ======================================================
// MODULE: Riwayat
// STATUS: Aktif (redesain filter chip multi-select)
// ======================================================

// ======================================================
// STATE
// ======================================================
let rwSearchVal = '';

// Periode — unit + offset + custom
let rwPeriodUnit = 'all';        // '1d'|'1w'|'1m'|'3m'|'6m'|'1y'|'all'|'custom'
let rwPeriodOffset = 0;          // dipakai unit 1d/1w/1m/3m/6m/1y
let rwCustomMode = 'tanggal';    // 'tanggal' | 'rentang'
let rwCustomDate = null;         // ISO string, untuk mode tanggal
let rwCustomRange = null;        // { from, to }, untuk mode rentang

// Filter multi-select (array kosong = semua)
let rwTypeFilter = [];      // 'keluar'|'masuk'|'transfer'
let rwCatFilter = [];       // nama kategori

// Draft untuk sheet
let rwDraft = null;
let rwCatExpanded = false;
const RW_CAT_VISIBLE = 6;

const RW_ALL_CATS = [
  'Makan & Minum','Transport','Belanja','Tagihan','Hiburan',
  'Kesehatan','Pendidikan','Cicilan/Utang','Biaya Admin/Fee','Lainnya',
  'Gaji','Bonus/THR','Hasil Usaha/Freelance','Hasil Investasi','Saldo Awal'
];

const RW_PERIOD_OPTS = [
  { key: '1d',  label: '1 Hari' },
  { key: '1w',  label: '1 Minggu' },
  { key: '1m',  label: '1 Bulan' },
  { key: '3m',  label: '3 Bulan' },
  { key: '6m',  label: '6 Bulan' },
  { key: '1y',  label: '1 Tahun' },
  { key: 'all', label: 'Semua' },
  { key: 'custom', label: 'Custom' },
];

const RW_TYPE_OPTS = [
  { key: 'masuk',    label: 'Pemasukan',   icon: 'bi-arrow-down-circle' },
  { key: 'keluar',   label: 'Pengeluaran', icon: 'bi-arrow-up-circle' },
  { key: 'transfer', label: 'Transfer',    icon: 'bi-arrow-left-right' },
];

// ======================================================
// RANGE PERIODE (sama logikanya dengan Statistik)
// ======================================================
function rwAddDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

function getRwRange() {
  const now = new Date();
  const today = isoOf(now);

  if (rwPeriodUnit === 'all') return { from: '0000-01-01', to: '9999-12-31' };

  if (rwPeriodUnit === 'custom') {
    if (rwCustomMode === 'tanggal') {
      const d = rwCustomDate || today;
      return { from: d, to: d };
    }
    return rwCustomRange || { from: today, to: today };
  }

  if (rwPeriodUnit === '1d') {
    const ref = rwAddDays(now, rwPeriodOffset);
    const iso = isoOf(ref);
    return { from: iso, to: iso };
  }
  if (rwPeriodUnit === '1w') {
    const ref = new Date(now); ref.setDate(now.getDate() + rwPeriodOffset * 7);
    const dayNum = (ref.getDay() + 6) % 7;
    const monday = new Date(ref); monday.setDate(ref.getDate() - dayNum); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    return { from: isoOf(monday), to: isoOf(sunday) };
  }
  if (rwPeriodUnit === '1m') {
    const ref = new Date(now.getFullYear(), now.getMonth() + rwPeriodOffset, 1);
    const y = ref.getFullYear(), m = ref.getMonth();
    const last = new Date(y, m+1, 0).getDate();
    const mm = (m+1).toString().padStart(2,'0');
    return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${last.toString().padStart(2,'0')}` };
  }
  if (rwPeriodUnit === '3m' || rwPeriodUnit === '6m') {
    const span = rwPeriodUnit === '3m' ? 3 : 6;
    const totalIdx = now.getFullYear() * 12 + now.getMonth() + rwPeriodOffset * span;
    const startIdx = totalIdx - (span - 1);
    const sy = Math.floor(startIdx/12), sm = ((startIdx%12)+12)%12;
    const ey = Math.floor(totalIdx/12), em = ((totalIdx%12)+12)%12;
    const lastDay = new Date(ey, em+1, 0).getDate();
    return {
      from: `${sy}-${(sm+1).toString().padStart(2,'0')}-01`,
      to:   `${ey}-${(em+1).toString().padStart(2,'0')}-${lastDay.toString().padStart(2,'0')}`
    };
  }
  if (rwPeriodUnit === '1y') {
    const y = now.getFullYear() + rwPeriodOffset;
    return { from: `${y}-01-01`, to: `${y}-12-31` };
  }
  return { from: today, to: today };
}

function getRwPeriodLabel() {
  const now = new Date();
  if (rwPeriodUnit === 'all') return 'Semua Waktu';
  if (rwPeriodUnit === 'custom') {
    if (rwCustomMode === 'tanggal') return rwCustomDate ? formatTanggalLabel(rwCustomDate) : 'Tanggal tertentu';
    if (rwCustomRange) return `${formatTanggalLabel(rwCustomRange.from)} – ${formatTanggalLabel(rwCustomRange.to)}`;
    return 'Rentang tanggal';
  }
  if (rwPeriodUnit === '1d') {
    if (rwPeriodOffset === 0) return 'Hari ini';
    if (rwPeriodOffset === -1) return 'Kemarin';
    return `${Math.abs(rwPeriodOffset)} hari lalu`;
  }
  if (rwPeriodUnit === '1w') {
    if (rwPeriodOffset === 0) return 'Minggu ini';
    if (rwPeriodOffset === -1) return 'Minggu lalu';
    return `${Math.abs(rwPeriodOffset)} minggu lalu`;
  }
  if (rwPeriodUnit === '1m') {
    if (rwPeriodOffset === 0) return 'Bulan ini';
    if (rwPeriodOffset === -1) return 'Bulan lalu';
    const ref = new Date(now.getFullYear(), now.getMonth() + rwPeriodOffset, 1);
    return `${bulanPanjang[ref.getMonth()]} ${ref.getFullYear()}`;
  }
  if (rwPeriodUnit === '3m') return rwPeriodOffset === 0 ? '3 Bulan Terakhir' : `3 Bulan (${Math.abs(rwPeriodOffset)*3}bl lalu)`;
  if (rwPeriodUnit === '6m') return rwPeriodOffset === 0 ? '6 Bulan Terakhir' : `6 Bulan (${Math.abs(rwPeriodOffset)*6}bl lalu)`;
  if (rwPeriodUnit === '1y') {
    const y = now.getFullYear() + rwPeriodOffset;
    return rwPeriodOffset === 0 ? 'Tahun ini' : String(y);
  }
  return '—';
}

// ======================================================
// FILTER + RENDER LIST
// ======================================================
function getFilteredRiwayat() {
  const range = getRwRange();
  let list = transactions.filter(t => inRange(t.date, range.from, range.to));
  if (rwTypeFilter.length) list = list.filter(t => rwTypeFilter.includes(t.type));
  if (rwCatFilter.length) list = list.filter(t => t.category && rwCatFilter.includes(t.category));
  if (rwSearchVal) {
    list = list.filter(t =>
      (t.note || '').toLowerCase().includes(rwSearchVal) ||
      (t.category || '').toLowerCase().includes(rwSearchVal)
    );
  }
  list = [...list].sort((a, b) => {
    const ka = a.date + (a.time || '00:00'), kb = b.date + (b.time || '00:00');
    if (ka !== kb) return kb.localeCompare(ka);
    return b.id.localeCompare(a.id);
  });
  return list;
}

function renderRiwayat() {
  renderRwSummary();
  renderRwActiveChips();
  updateRwFilterBadge();

  const list = getFilteredRiwayat();
  const groupsEl = document.getElementById('riwayatGroups');
  const emptyEl = document.getElementById('riwayatEmptyState');

  if (!list.length) {
    groupsEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  const groups = [];
  let curKey = null, curGroup = null;
  list.forEach(t => {
    if (t.date !== curKey) {
      curKey = t.date;
      curGroup = { date: t.date, items: [] };
      groups.push(curGroup);
    }
    curGroup.items.push(t);
  });

  groupsEl.innerHTML = groups.map(g => `
    <div>
      <div class="rw-group-label">${groupDateLabel(g.date)}</div>
      <div class="rw-group-list">${g.items.map(t => txRowHTML(t)).join('')}</div>
    </div>
  `).join('');
}

function groupDateLabel(dateISO) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return dateISO;
  const rel = relativeDayLabel(dateISO);
  const [y, m, d] = dateISO.split('-').map(Number);
  return `${rel}, ${d} ${bulanPanjang[m-1]} ${y}`;
}

// ======================================================
// RINGKASAN 3 KARTU
// ======================================================
function renderRwSummary() {
  const el = document.getElementById('rwSummaryRow');
  const list = getFilteredRiwayat();
  const total = list.length;
  const flowList = list.filter(t => !t.isFee && !t.isAdjustment && !t.isSaldoAwal);
  const masuk = flowList.filter(t => t.type === 'masuk').reduce((a,t)=>a+t.amount,0);
  const keluar = flowList.filter(t => t.type === 'keluar').reduce((a,t)=>a+t.amount,0);
  el.innerHTML = `
    <div class="rw-summary-card">
      <div class="rsc-label"><i class="bi bi-list-ul"></i> Total Transaksi</div>
      <div class="rsc-val">${total} transaksi</div>
    </div>
    <div class="rw-summary-card">
      <div class="rsc-label"><i class="bi bi-arrow-down-circle" style="color:#06A876"></i> Pemasukan</div>
      <div class="rsc-val" style="color:#06A876">${formatRupiahShort(masuk)}</div>
    </div>
    <div class="rw-summary-card">
      <div class="rsc-label"><i class="bi bi-arrow-up-circle" style="color:var(--danger)"></i> Pengeluaran</div>
      <div class="rsc-val" style="color:var(--danger)">${formatRupiahShort(keluar)}</div>
    </div>`;
}

// ======================================================
// CHIP FILTER AKTIF (di bawah search bar)
// ======================================================
function renderRwActiveChips() {
  const wrap = document.getElementById('rwActiveChips');
  const chips = [];

  // Periode aktif kalau bukan default (Semua)
  const isDefaultPeriod = rwPeriodUnit === 'all';
  if (!isDefaultPeriod) {
    chips.push({ label: getRwPeriodLabel(), onclick: `removeRwPeriodFilter()` });
  }

  rwTypeFilter.forEach(t => {
    const opt = RW_TYPE_OPTS.find(o => o.key === t);
    if (opt) chips.push({ label: opt.label, onclick: `removeRwTypeFilter('${t}')` });
  });
  rwCatFilter.forEach(c => {
    chips.push({ label: c, onclick: `removeRwCatFilter('${c}')` });
  });

  if (!chips.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = `
    <button class="rw-chip-clear-all" onclick="resetRwFilter()"><i class="bi bi-x"></i> Hapus</button>
    ${chips.map(c => `<div class="rw-active-chip">${c.label}<i class="bi bi-x" onclick="${c.onclick}"></i></div>`).join('')}`;
}

function updateRwFilterBadge() {
  const isDefaultPeriod = rwPeriodUnit === 'all';
  const count = (!isDefaultPeriod ? 1 : 0) + rwTypeFilter.length + rwCatFilter.length;
  const badge = document.getElementById('rwFilterBadge');
  const btn = document.getElementById('riwayatFilterBtn');
  if (count > 0) {
    badge.textContent = count; badge.style.display = 'flex'; btn.classList.add('has-filter');
  } else {
    badge.style.display = 'none'; btn.classList.remove('has-filter');
  }
}

function removeRwPeriodFilter() { rwPeriodUnit = 'all'; rwPeriodOffset = 0; rwCustomDate = null; rwCustomRange = null; renderRiwayat(); }
function removeRwTypeFilter(t) { rwTypeFilter = rwTypeFilter.filter(x => x !== t); renderRiwayat(); }
function removeRwCatFilter(c) { rwCatFilter = rwCatFilter.filter(x => x !== c); renderRiwayat(); }

// ======================================================
// SEARCH
// ======================================================
function filterRiwayat() {
  rwSearchVal = document.getElementById('riwayatSearch').value.toLowerCase();
  renderRiwayat();
}

// ======================================================
// FILTER SHEET — BUKA / TUTUP
// ======================================================
function openRwFilterSheet() {
  rwDraft = {
    periodUnit:   rwPeriodUnit,
    periodOffset: rwPeriodOffset,
    customMode:   rwCustomMode,
    customDate:   rwCustomDate,
    customRange:  rwCustomRange ? { ...rwCustomRange } : null,
    typeFilter:   [...rwTypeFilter],
    catFilter:    [...rwCatFilter],
  };
  rwCatExpanded = false;
  renderRwFilterSheet();
  document.getElementById('rwFilterOverlay').classList.add('open');
}

function closeRwFilterSheet() { document.getElementById('rwFilterOverlay').classList.remove('open'); }
function rwFilterOutsideClick(e) { if (e.target.id === 'rwFilterOverlay') closeRwFilterSheet(); }

function renderRwFilterSheet() {
  // --- Periode chips (1D/1W/1M/3M/6M/1Y/All/Custom) ---
  const periodWrap = document.getElementById('rwfPeriodChips');
  periodWrap.innerHTML = RW_PERIOD_OPTS.map(o => `
    <div class="rw-fchip ${rwDraft.periodUnit === o.key ? 'active' : ''}" onclick="rwDraftPeriod('${o.key}')">
      ${o.label}
    </div>`).join('');

  // Custom step: muncul di bawah chips kalau pilih Custom
  const pickBtn = document.getElementById('rwfPickDateBtn');
  const pickLabel = document.getElementById('rwfPickDateLabel');
  if (rwDraft.periodUnit === 'custom') {
    // Tampilkan mode chip Tanggal Tertentu / Rentang Tanggal
    let customStepEl = document.getElementById('rwfCustomStep');
    if (!customStepEl) {
      customStepEl = document.createElement('div');
      customStepEl.id = 'rwfCustomStep';
      customStepEl.className = 'rw-fs-custom-step';
      pickBtn.parentElement.insertBefore(customStepEl, pickBtn);
    }
    customStepEl.innerHTML = `
      <div class="rw-chip-wrap" style="margin-bottom:8px;">
        <div class="rw-fchip ${rwDraft.customMode === 'tanggal' ? 'active' : ''}" onclick="rwDraftCustomMode('tanggal')">Tanggal Tertentu</div>
        <div class="rw-fchip ${rwDraft.customMode === 'rentang' ? 'active' : ''}" onclick="rwDraftCustomMode('rentang')">Rentang Tanggal</div>
      </div>`;
    customStepEl.style.display = 'block';

    if (rwDraft.customMode === 'tanggal') {
      pickLabel.textContent = rwDraft.customDate ? formatTanggalLabel(rwDraft.customDate) : 'Pilih tanggal';
    } else {
      pickLabel.textContent = rwDraft.customRange
        ? `${formatTanggalLabel(rwDraft.customRange.from)} – ${formatTanggalLabel(rwDraft.customRange.to)}`
        : 'Pilih rentang tanggal';
    }
    pickBtn.style.display = 'flex';
  } else {
    const customStepEl = document.getElementById('rwfCustomStep');
    if (customStepEl) customStepEl.style.display = 'none';
    pickBtn.style.display = 'none';
  }

  // --- Jenis chips ---
  const typeWrap = document.getElementById('rwfTypeChips');
  typeWrap.innerHTML = RW_TYPE_OPTS.map(o => `
    <div class="rw-fchip ${rwDraft.typeFilter.includes(o.key) ? 'active' : ''}" onclick="rwDraftToggleType('${o.key}')">
      <i class="bi ${o.icon}"></i>${o.label}
    </div>`).join('');

  // --- Kategori chips ---
  renderRwCatChips();
}

function renderRwCatChips() {
  const wrap = document.getElementById('rwfCatChips');
  const seeAll = document.getElementById('rwfCatSeeAll');
  const cats = rwCatExpanded ? RW_ALL_CATS : RW_ALL_CATS.slice(0, RW_CAT_VISIBLE);

  wrap.innerHTML = cats.map(c => `
    <div class="rw-fchip ${rwDraft.catFilter.includes(c) ? 'active' : ''}" onclick="rwDraftToggleCat('${c}')">
      <i class="bi ${categoryIcons[c] || 'bi-circle'}"></i>${c}
    </div>`).join('');

  if (RW_ALL_CATS.length > RW_CAT_VISIBLE) {
    seeAll.style.display = 'flex';
    seeAll.innerHTML = rwCatExpanded
      ? `Sembunyikan <i class="bi bi-chevron-up"></i>`
      : `Lihat semua <i class="bi bi-chevron-down"></i>`;
    seeAll.classList.toggle('expanded', rwCatExpanded);
  } else {
    seeAll.style.display = 'none';
  }
}

// ======================================================
// DRAFT ACTIONS
// ======================================================
function rwDraftPeriod(key) {
  rwDraft.periodUnit = key;
  rwDraft.periodOffset = 0;
  if (key !== 'custom') { rwDraft.customDate = null; rwDraft.customRange = null; }
  renderRwFilterSheet();
}

function rwDraftCustomMode(mode) {
  rwDraft.customMode = mode;
  renderRwFilterSheet();
}

function rwDraftToggleType(key) {
  const idx = rwDraft.typeFilter.indexOf(key);
  if (idx >= 0) rwDraft.typeFilter.splice(idx, 1);
  else rwDraft.typeFilter.push(key);
  renderRwFilterSheet();
}

function rwDraftToggleCat(cat) {
  const idx = rwDraft.catFilter.indexOf(cat);
  if (idx >= 0) rwDraft.catFilter.splice(idx, 1);
  else rwDraft.catFilter.push(cat);
  renderRwCatChips();
}

function toggleRwCatAll() {
  rwCatExpanded = !rwCatExpanded;
  renderRwCatChips();
}

function openRwPeriodPicker() {
  if (rwDraft.customMode === 'tanggal') {
    openDatePicker('tanggal', { date: rwDraft.customDate || isoOf(new Date()) }, (res) => {
      rwDraft.customMode = 'tanggal';
      rwDraft.customDate = res.date;
      rwDraft.customRange = null;
      renderRwFilterSheet();
    });
  } else {
    openDatePicker('rentang', rwDraft.customRange || {}, (res) => {
      if (res.from > res.to) { showToast('Tanggal awal harus sebelum tanggal akhir'); return; }
      rwDraft.customMode = 'rentang';
      rwDraft.customRange = { from: res.from, to: res.to };
      rwDraft.customDate = null;
      renderRwFilterSheet();
    });
  }
}

function applyRwFilter() {
  rwPeriodUnit   = rwDraft.periodUnit;
  rwPeriodOffset = rwDraft.periodOffset;
  rwCustomMode   = rwDraft.customMode;
  rwCustomDate   = rwDraft.customDate;
  rwCustomRange  = rwDraft.customRange ? { ...rwDraft.customRange } : null;
  rwTypeFilter   = [...rwDraft.typeFilter];
  rwCatFilter    = [...rwDraft.catFilter];
  closeRwFilterSheet();
  renderRiwayat();
}

function resetRwFilter() {
  rwPeriodUnit = 'all'; rwPeriodOffset = 0;
  rwCustomMode = 'tanggal'; rwCustomDate = null; rwCustomRange = null;
  rwTypeFilter = []; rwCatFilter = [];
  if (rwDraft) {
    rwDraft.periodUnit = 'all'; rwDraft.periodOffset = 0;
    rwDraft.customMode = 'tanggal'; rwDraft.customDate = null; rwDraft.customRange = null;
    rwDraft.typeFilter = []; rwDraft.catFilter = [];
    renderRwFilterSheet();
  }
  renderRiwayat();
}

