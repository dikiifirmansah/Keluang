// ======================================================
// MODULE: Utang-Piutang
// STATUS: Aktif
// ======================================================
// Data model per item:
// {
//   id, kind: 'utang' | 'piutang',
//   name (nama pemberi pinjaman / nama peminjam),
//   category: 'kpr' | 'paylater' | 'lainnya' (dipakai untuk kind 'utang'),
//   totalAmount, remaining, installmentAmount (opsional), dueDate (ISO|null),
//   note (opsional), status: 'berjalan' | 'lunas', paidOffAt (ISO|null),
//   history: [ { id, type:'bayar'|'terima'|'pinjam', amount, note, date, txId } ],
//   createdAt, updatedAt
// }
//
// Utang/Piutang BUKAN kantong berisi uang beneran — ia cuma angka liabilitas/
// piutang. Uang cuma benar-benar berpindah di 2 momen: (1) opsional saat
// catatan baru dibuat, kalau memang pinjamannya baru cair/dikasih saat itu
// juga; (2) saat Bayar Cicilan / Terima Pembayaran. Efek ke Net Worth = nol,
// karena aset cash yang turun/naik dibalas liabilitas/piutang yang ikut
// turun/naik di sisi lain.

// ======================================================
// STATE
// ======================================================
let upKindTab = 'utang';        // 'utang' | 'piutang' — sekarang dikontrol swipe carousel hero
let upStatusTab = 'aktif';      // 'aktif' | 'lunas'
let upHeroScrollT = null;
let upDetailId = null;
let upFormEditId = null;
let upFormKind = 'utang';
let upFormCategory = 'kpr';
let upFormMoveMode = 'catat';   // 'catat' (sekadar dicatat) | 'pindah' (uang beneran berpindah)
let upFormAccountId = null;
let upTxAccountId = null;       // akun terpilih di sheet Bayar/Terima
let upAccountPickerCtx = 'tx';  // 'tx' | 'form' — sheet pilih akun dipakai di 2 tempat
let upHapusPending = null;

// Warna & ikon per kategori — ini yang bikin tiap jenis utang kebeda
// sekali lihat, bukan cuma "utang = merah semua".
const UP_CATEGORY_META = {
  kpr:      { label: 'KPR',      icon: 'bi-house-door',   color: 'var(--info)' },
  paylater: { label: 'Paylater', icon: 'bi-credit-card',  color: 'var(--warning)' },
  lainnya:  { label: 'Utang Lain', icon: 'bi-cash-coin',  color: 'var(--danger)' },
  piutang:  { label: 'Piutang',  icon: 'bi-people',       color: '#06A876' },
};

const UP_KIND_META = {
  utang:   { label: 'Utang',   color: 'var(--danger)', action: 'Bayar Cicilan',
             emptyIcon: 'bi-cash-coin', emptyTitle: 'Belum Ada Utang Tercatat',
             emptySub: 'Tap tombol + untuk mencatat pinjaman, KPR, atau paylater yang perlu dilunasi.' },
  piutang: { label: 'Piutang', color: '#06A876', action: 'Terima Pembayaran',
             emptyIcon: 'bi-people', emptyTitle: 'Belum Ada Piutang Tercatat',
             emptySub: 'Tap tombol + untuk mencatat uang yang dipinjam orang lain darimu.' },
};

function upItemMeta(u) {
  return u.kind === 'utang' ? (UP_CATEGORY_META[u.category] || UP_CATEGORY_META.lainnya) : UP_CATEGORY_META.piutang;
}

// ======================================================
// INIT
// ======================================================
function initUtangPiutang() {
  upKindTab = 'utang';
  upStatusTab = 'aktif';
  const carousel = document.getElementById('upHeroCarousel');
  if (carousel) carousel.scrollLeft = 0;
  renderUtangPiutangPage();
}

// Dipanggil dari onscroll carousel hero — geser hero = ganti konteks
// Utang/Piutang, jadi gak perlu tab terpisah lagi.
function upHeroCarouselScroll() {
  clearTimeout(upHeroScrollT);
  upHeroScrollT = setTimeout(() => {
    const el = document.getElementById('upHeroCarousel');
    if (!el || !el.clientWidth) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    const kind = idx === 0 ? 'utang' : 'piutang';
    if (kind !== upKindTab) {
      upKindTab = kind;
      updateUpHeroDots();
      renderUpListSection();
    }
  }, 90);
}

function updateUpHeroDots() {
  document.querySelectorAll('.up-hero-dot-ind').forEach((el, i) => {
    el.classList.toggle('active', (i === 0 ? 'utang' : 'piutang') === upKindTab);
  });
}

function setUpStatusTab(status) {
  upStatusTab = status;
  renderUpListSection();
}

// ======================================================
// HELPERS
// ======================================================
function getUP() { return loadUtangPiutang(); }
function getUpById(id) { return getUP().find(u => u.id === id); }

function upProgressPct(u) {
  if (!u.totalAmount) return 0;
  return Math.min(((u.totalAmount - u.remaining) / u.totalAmount) * 100, 100);
}

function upDueLabel(u) {
  if (!u.dueDate) return null;
  const d = new Date(u.dueDate + 'T00:00:00');
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.round((d - today) / 86400000);
  const dateLabel = `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}`;
  if (u.status === 'lunas') return { label: dateLabel, danger: false };
  if (diffDays < 0) return { label: `Lewat jatuh tempo · ${dateLabel}`, danger: true };
  if (diffDays === 0) return { label: `Jatuh tempo hari ini`, danger: true };
  if (diffDays <= 7) return { label: `${diffDays} hari lagi · ${dateLabel}`, danger: true };
  return { label: dateLabel, danger: false };
}

function getUtangPiutangTotals() {
  const all = getUP().filter(u => u.status !== 'lunas');
  const utangTotal = all.filter(u => u.kind === 'utang').reduce((a, u) => a + u.remaining, 0);
  const piutangTotal = all.filter(u => u.kind === 'piutang').reduce((a, u) => a + u.remaining, 0);
  return { utangTotal, piutangTotal };
}

function getUpNearestDue(kind) {
  const list = getUP().filter(u => u.kind === kind && u.status !== 'lunas' && u.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return list.length ? list[0] : null;
}

function formatUpDateShort(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}`;
}

// ======================================================
// RENDER: LIST PAGE
// ======================================================
function getFilteredUP() {
  return getUP().filter(u => u.kind === upKindTab && (upStatusTab === 'lunas' ? u.status === 'lunas' : u.status !== 'lunas')).sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '');
  });
}

function renderUtangPiutangPage() {
  const isTrulyEmpty = getUP().length === 0;
  document.getElementById('upHeroCarousel').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('upHeroDots').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('upListHead').style.display = isTrulyEmpty ? 'none' : 'block';
  document.getElementById('upFabAction').style.display = isTrulyEmpty ? 'none' : 'flex';

  if (isTrulyEmpty) {
    document.getElementById('upList').innerHTML = '';
    const emptyEl = document.getElementById('upEmptyState');
    emptyEl.style.display = 'flex';
    emptyEl.innerHTML = `
      <i class="bi bi-cash-coin"></i>
      <div class="bdg-empty-title">Belum Ada Utang-Piutang</div>
      <div class="bdg-empty-sub">Catat pinjaman, KPR, paylater, atau uang yang dipinjam orang lain darimu di sini.</div>
      <button class="dd-empty-cta" style="margin-top:16px;" onclick="openUpForm(null)">
        <i class="bi bi-plus-lg"></i> Catat Utang/Piutang
      </button>`;
    return;
  }

  renderUpHero();
  updateUpHeroDots();
  renderUpListSection();
}

function renderUpListSection() {
  const meta = UP_KIND_META[upKindTab];
  const allKind = getUP().filter(u => u.kind === upKindTab);
  const aktifCount = allKind.filter(u => u.status !== 'lunas').length;
  const lunasCount = allKind.filter(u => u.status === 'lunas').length;

  const upAddBtn = document.getElementById('upFabAction');
  upAddBtn.style.color = meta.color;
  upAddBtn.style.borderColor = meta.color;
  upAddBtn.innerHTML = `<i class="bi bi-plus-lg"></i> Catat ${meta.label}`;

  document.getElementById('upListHead').innerHTML = `
    <div class="up-list-head-label">${meta.label} Kamu</div>
    <div class="up-status-toggle">
      <span class="up-status-toggle-item ${upStatusTab === 'aktif' ? 'active' : ''}" onclick="setUpStatusTab('aktif')">Berjalan (${aktifCount})</span>
      <span class="up-status-toggle-item ${upStatusTab === 'lunas' ? 'active' : ''}" onclick="setUpStatusTab('lunas')">Lunas (${lunasCount})</span>
    </div>`;

  const list = getFilteredUP();
  const listEl = document.getElementById('upList');
  const emptyEl = document.getElementById('upEmptyState');

  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    const icon = upStatusTab === 'lunas' ? 'bi-check-circle' : meta.emptyIcon;
    const title = upStatusTab === 'lunas' ? `Belum Ada ${meta.label} yang Lunas` : meta.emptyTitle;
    const sub = upStatusTab === 'lunas' ? `${meta.label} yang sudah selesai akan muncul di sini.` : meta.emptySub;
    emptyEl.innerHTML = `
      <i class="bi ${icon}"></i>
      <div class="bdg-empty-title">${title}</div>
      <div class="bdg-empty-sub">${sub}</div>`;
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = list.map(u => upItemHTML(u)).join('');
}

function renderUpHero() {
  const utangSlide = buildUpHeroSlideHTML('utang');
  const piutangSlide = buildUpHeroSlideHTML('piutang');
  document.getElementById('upHeroSlideUtang').innerHTML = utangSlide;
  document.getElementById('upHeroSlidePiutang').innerHTML = piutangSlide;
}

function buildUpHeroSlideHTML(kind) {
  const meta = UP_KIND_META[kind];
  const items = getUP().filter(u => u.kind === kind && u.status !== 'lunas');
  const total = items.reduce((a, u) => a + u.remaining, 0);
  const count = items.length;
  const nearest = getUpNearestDue(kind);
  const dirIcon = kind === 'utang' ? 'bi-arrow-up-right' : 'bi-arrow-down-left';
  const dirText = kind === 'utang' ? 'Perlu dibayar' : 'Akan diterima';

  return `
    <div class="up-hero" style="border-color:color-mix(in srgb, ${meta.color} 30%, var(--border));">
      <div class="up-hero-top">
        <div>
          <div class="up-hero-net-label"><i class="bi ${dirIcon}" style="color:${meta.color};"></i> Total ${meta.label} Aktif</div>
          <div class="up-hero-net-val" style="color:${meta.color};">${formatRupiah(total)}</div>
          <div class="up-hero-net-sub">${dirText} · ${count} catatan berjalan</div>
        </div>
      </div>
      <div class="up-hero-extra-inner" style="border-top:1px solid var(--border); margin-top:14px; padding-top:14px;">
        <div class="up-hero-extra-stat">
          <div class="up-hero-extra-stat-val">${count}</div>
          <div class="up-hero-extra-stat-label">Berjalan</div>
        </div>
        <div class="up-hero-extra-stat">
          <div class="up-hero-extra-stat-val" style="font-size:11.5px;">${nearest ? formatUpDateShort(nearest.dueDate) : '-'}</div>
          <div class="up-hero-extra-stat-label">Jatuh Tempo Terdekat</div>
        </div>
      </div>
    </div>`;
}

function upItemHTML(u) {
  const pct = upProgressPct(u);
  const cat = upItemMeta(u);
  const due = upDueLabel(u);
  const isLunas = u.status === 'lunas';
  const dir = u.kind === 'utang' ? 'out' : 'in';
  const dirIcon = dir === 'out' ? 'bi-arrow-up-right' : 'bi-arrow-down-left';
  const trackColor = 'color-mix(in srgb, ' + cat.color + ' 18%, var(--surface-sunken))';

  return `
    <div class="up-item ${isLunas ? 'lunas' : ''}" onclick="openUpDetail('${u.id}')">
      <div class="up-item-pie" style="background: conic-gradient(${cat.color} ${pct}%, ${trackColor} ${pct}% 100%);">
        <div class="up-item-pie-inner">
          ${isLunas ? `<i class="bi bi-check-lg" style="color:#06A876;"></i>` : `<span class="up-item-pie-pct">${pct.toFixed(0)}%</span>`}
        </div>
      </div>
      <div class="up-item-body">
        <div class="up-item-top-row">
          <span class="up-item-name">${escapeHtml(u.name)}</span>
          ${!isLunas ? `<span class="up-item-dir-tag ${dir}"><i class="bi ${dirIcon}"></i></span>` : ''}
        </div>
        <div class="up-item-cat-tag" style="color:${cat.color};">${cat.label}</div>
        ${isLunas
          ? `<div class="up-item-lunas-total">${formatRupiah(u.totalAmount)}</div>`
          : `<div class="up-item-amt-row"><span class="up-item-amt-main">${formatRupiah(u.remaining)}</span><span class="up-item-amt-sub"> / ${formatRupiah(u.totalAmount)}</span></div>`}
        ${due && !isLunas ? `<div class="up-item-due-row ${due.danger ? 'danger' : ''}"><i class="bi bi-calendar-event"></i> ${due.label}</div>` : ''}
      </div>
      ${isLunas
        ? `<div class="up-item-lunas-badge"><i class="bi bi-check-circle-fill"></i> Lunas</div>` : ''}
    </div>`;
}

// ======================================================
// DETAIL PAGE
// ======================================================
function openUpDetail(id) {
  upDetailId = id;
  renderUpDetailPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-utang-detail').classList.add('active');
}

function closeUpDetail() { goTo('utang'); }

function renderUpDetailPage() {
  const u = getUpById(upDetailId);
  if (!u) { goTo('utang'); return; }

  const kindMeta = UP_KIND_META[u.kind];
  const cat = upItemMeta(u);
  const pct = upProgressPct(u);
  const due = upDueLabel(u);
  const isLunas = u.status === 'lunas';

  document.getElementById('upDetailTopTitle').textContent = u.kind === 'utang' ? 'Detail Utang' : 'Detail Piutang';

  document.getElementById('upDetailCard').innerHTML = `
    <div class="up-detail-card" style="border-color:color-mix(in srgb, ${cat.color} 35%, var(--border));">
      <div class="up-detail-card-top">
        <div class="up-detail-card-icon" style="background:color-mix(in srgb, ${cat.color} 14%, transparent);">
          <i class="bi ${cat.icon}" style="color:${cat.color};"></i>
        </div>
        <div class="up-detail-card-badges">
          <div class="up-pill" style="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color};">${cat.label}</div>
          ${isLunas ? `<div class="up-pill" style="background:rgba(6,168,118,0.14); color:#06A876;"><i class="bi bi-check-circle-fill"></i> Lunas</div>` : ''}
        </div>
      </div>
      <div class="up-detail-card-name">${escapeHtml(u.name)}</div>
      <div class="up-detail-card-nums">
        <div>
          <div class="up-detail-num" style="color:${isLunas ? 'var(--ink-900)' : cat.color};">${formatRupiah(u.remaining)}</div>
          <div class="up-detail-num-lbl">Sisa</div>
        </div>
        <div class="center">
          <div class="up-detail-num">${formatRupiah(u.totalAmount)}</div>
          <div class="up-detail-num-lbl">Total</div>
        </div>
        <div class="right">
          <div class="up-detail-num ok">${formatRupiah(u.totalAmount - u.remaining)}</div>
          <div class="up-detail-num-lbl">${u.kind === 'utang' ? 'Terbayar' : 'Diterima'}</div>
        </div>
      </div>
      <div class="bdg-bar-track" style="margin-top:12px;"><div style="height:100%; border-radius:99px; width:${pct}%; background:${cat.color};"></div></div>
      <div class="up-detail-card-meta">
        <span style="font-size:11px; font-weight:700; color:var(--ink-300);">${isLunas ? 'Lunas sepenuhnya' : `${(100 - pct).toFixed(0)}% lagi`}</span>
        <span class="up-detail-pct-badge" style="background:color-mix(in srgb, ${cat.color} 14%, transparent); color:${cat.color};">${pct.toFixed(0)}%</span>
      </div>
    </div>`;

  let bodyHTML = '';

  const stripItems = [];
  if (due && !isLunas) stripItems.push(`<div class="up-detail-strip-item ${due.danger ? 'danger' : ''}"><i class="bi bi-calendar-event"></i> ${due.label}</div>`);
  if (u.installmentAmount) stripItems.push(`<div class="up-detail-strip-item"><i class="bi bi-calendar-check"></i> ${formatRupiah(u.installmentAmount)}/bulan</div>`);
  if (stripItems.length) {
    bodyHTML += `<div class="up-detail-strip">${stripItems.join('<div class="up-detail-strip-sep"></div>')}</div>`;
  }

  if (isLunas) {
    const d = u.paidOffAt ? new Date(u.paidOffAt) : null;
    const label = d ? `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}` : '-';
    bodyHTML += `
      <div class="wl-completed-banner">
        <i class="bi bi-check-circle-fill"></i>
        <div>${u.kind === 'utang' ? 'Utang sudah lunas' : 'Piutang sudah selesai diterima'} pada ${label}</div>
      </div>`;
  } else {
    if (u.note) {
      bodyHTML += `<div class="wl-info-card">
        <div class="wl-info-row"><i class="bi bi-sticky"></i><div class="wl-info-label" style="width:auto; flex:1;">Catatan</div><div class="wl-amt-val" style="font-weight:600;">${escapeHtml(u.note)}</div></div>
      </div>`;
    }
    bodyHTML += `<button class="btn btn-primary" style="background:${kindMeta.color}; margin-top:4px;" onclick="openUpTxSheet()">${kindMeta.action}</button>`;
  }

  bodyHTML += `<div class="bdg-detail-tx-head" style="margin-top:22px;">Riwayat ${u.kind === 'utang' ? 'Pembayaran' : 'Penerimaan'}</div>`;
  const hist = (u.history || []).slice().reverse();
  if (!hist.length) {
    bodyHTML += `<div class="kt-empty">Belum ada riwayat tercatat.</div>`;
  } else {
    bodyHTML += hist.map(h => {
      const d = new Date(h.date);
      const dateLabel = `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}`;
      const defaultLabel = h.type === 'pinjam'
        ? (u.kind === 'utang' ? 'Terima Pinjaman' : 'Beri Pinjaman')
        : (u.kind === 'utang' ? 'Bayar Cicilan' : 'Terima Pembayaran');
      const isOutflow = h.type === 'pinjam' ? u.kind === 'piutang' : u.kind === 'utang';
      const amtColor = h.type === 'pinjam' ? 'var(--ink-500)' : (isOutflow ? 'var(--danger)' : '#06A876');
      return `
        <div class="bdg-tx-item">
          <div class="bdg-tx-note">${escapeHtml(h.note || defaultLabel)}<div style="font-size:10.5px; font-weight:600; color:var(--ink-300); margin-top:1px; white-space:normal;">${dateLabel}</div></div>
          <div class="bdg-tx-amt" style="color:${amtColor};">${formatRupiah(h.amount)}</div>
        </div>`;
    }).join('');
  }

  document.getElementById('upDetailBody').innerHTML = bodyHTML;
}

// ======================================================
// TAMBAH / EDIT (bottom sheet)
// ======================================================
function openUpForm(id) {
  upFormEditId = id;
  const u = id ? getUpById(id) : null;
  upFormKind = u ? u.kind : upKindTab;
  upFormCategory = u ? (u.category || 'kpr') : 'kpr';
  upFormMoveMode = 'catat';
  upFormAccountId = null;

  document.getElementById('upFormTitle').textContent = id ? 'Edit Catatan' : 'Tambah Catatan';
  document.getElementById('upFormDeleteBtn').style.display = id ? 'flex' : 'none';

  setUpFormKind(upFormKind, true);
  updateUpFormCategoryCard();

  document.getElementById('upFormNameInput').value = u ? u.name : '';
  document.getElementById('upFormNameInput').placeholder = upFormKind === 'utang' ? 'cth. Bank BCA, Kredivo, dll' : 'cth. Nama teman/kerabat';
  document.getElementById('upFormTotalInput').value = u ? u.totalAmount.toLocaleString('id-ID') : '';
  document.getElementById('upFormInstallmentInput').value = u && u.installmentAmount ? u.installmentAmount.toLocaleString('id-ID') : '';
  document.getElementById('upFormNoteInput').value = u ? (u.note || '') : '';
  document.getElementById('upFormDueLabel').textContent = u && u.dueDate ? formatUpDateShort(u.dueDate) : 'Pilih tanggal (opsional)';
  document.getElementById('upFormDueLabel').dataset.value = u && u.dueDate ? u.dueDate : '';
  document.getElementById('upFormErrMsg').style.display = 'none';

  // Cara pencatatan dana hanya relevan untuk catatan BARU — kalau edit,
  // pergerakan uang (kalau ada) sudah kejadian dan tidak diulang.
  document.getElementById('upFormMoveSection').style.display = id ? 'none' : 'block';
  setUpFormMoveMode('catat', true);
  updateUpFormMoveCard();

  openSheet('upFormOverlay');
}

function closeUpForm() { closeSheet('upFormOverlay'); }

function upFormDeleteFromSheet() {
  closeSheet('upFormOverlay');
  openUpHapusSheet();
}

function setUpFormKind(kind, silent) {
  upFormKind = kind;
  document.querySelectorAll('.up-form-kind-tab').forEach(el => el.classList.toggle('active', el.dataset.kind === kind));
  document.getElementById('upFormCategoryField').style.display = kind === 'utang' ? 'block' : 'none';
  if (!silent) document.getElementById('upFormNameInput').placeholder = kind === 'utang' ? 'cth. Bank BCA, Kredivo, dll' : 'cth. Nama teman/kerabat';
  document.getElementById('upFormAccountFieldLabel').textContent = kind === 'utang' ? 'Uang Masuk ke Akun' : 'Uang Keluar dari Akun';
  updateUpFormMoveCard();
}

function setUpFormCategory(cat) {
  upFormCategory = cat;
}

function setUpFormMoveMode(mode, silent) {
  upFormMoveMode = mode;
  document.getElementById('upFormAccountField').style.display = mode === 'pindah' ? 'block' : 'none';
  if (mode !== 'pindah') { upFormAccountId = null; resetUpFormAccountCard(); }
  if (!silent) renderUpFormMoveNote();
}

function resetUpFormAccountCard() {
  document.getElementById('upFormAccountLabel').textContent = 'Pilih akun';
  document.getElementById('upFormAccountIconWrap').innerHTML = `<i class="bi bi-wallet2"></i>`;
  document.getElementById('upFormAccountIconWrap').style.background = '';
  document.getElementById('upFormAccountIconWrap').style.color = '';
  document.getElementById('upFormAccountCard').classList.add('placeholder');
  document.getElementById('upFormAccountSub').style.display = 'none';
}

function renderUpFormMoveNote() {
  const total = parseInt(document.getElementById('upFormTotalInput').value.replace(/[^\d]/g, ''), 10) || 0;
  document.getElementById('upFormMoveNote').textContent = total
    ? `Nominal yang akan ${upFormKind === 'utang' ? 'masuk' : 'keluar'}: ${formatRupiah(total)}`
    : '';
}

// --- Picker: Kategori Utang (menggantikan toggle) ---
function openUpCategoryPicker() {
  const cats = ['kpr', 'paylater', 'lainnya'];
  document.getElementById('upCategoryPickerList').innerHTML = cats.map(c => {
    const m = UP_CATEGORY_META[c];
    return `
      <div class="picker-item" onclick="selectUpCategory('${c}')">
        <div class="picker-item-icon" style="background:color-mix(in srgb, ${m.color} 16%, transparent); border-radius:10px;">
          <i class="bi ${m.icon}" style="color:${m.color}; font-size:16px;"></i>
        </div>
        <div><div class="picker-item-name">${m.label}</div></div>
        ${upFormCategory === c ? `<i class="bi bi-check-lg" style="margin-left:auto; color:${m.color};"></i>` : ''}
      </div>`;
  }).join('');
  openSheet('upCategoryPickerOverlay');
}

function selectUpCategory(cat) {
  setUpFormCategory(cat);
  updateUpFormCategoryCard();
  closeSheet('upCategoryPickerOverlay');
}

function updateUpFormCategoryCard() {
  const m = UP_CATEGORY_META[upFormCategory] || UP_CATEGORY_META.lainnya;
  document.getElementById('upFormCategoryIconWrap').innerHTML = `<i class="bi ${m.icon}" style="color:${m.color};"></i>`;
  document.getElementById('upFormCategoryIconWrap').style.background = `color-mix(in srgb, ${m.color} 16%, transparent)`;
  document.getElementById('upFormCategoryLabel').textContent = m.label;
}

// --- Picker: Cara Pencatatan (menggantikan toggle) ---
function upMoveModeInfo(mode, kind) {
  if (mode === 'catat') {
    return { label: 'Sudah Ada Sebelumnya', sub: 'Saldo tidak berubah, cuma dicatat', icon: 'bi-clock-history' };
  }
  return kind === 'utang'
    ? { label: 'Pinjaman Baru', sub: 'Saldo akun otomatis bertambah', icon: 'bi-arrow-down-left' }
    : { label: 'Pinjaman Baru', sub: 'Saldo akun otomatis berkurang', icon: 'bi-arrow-up-right' };
}

function openUpMoveModePicker() {
  const catatM = upMoveModeInfo('catat', upFormKind);
  const pindahM = upMoveModeInfo('pindah', upFormKind);
  const rowHTML = (mode, m) => `
    <div class="picker-item" onclick="selectUpMoveMode('${mode}')">
      <div class="picker-item-icon" style="background:var(--surface-sunken); border-radius:10px;">
        <i class="bi ${m.icon}" style="color:var(--ink-700); font-size:16px;"></i>
      </div>
      <div><div class="picker-item-name">${m.label}</div><div class="picker-item-sub">${m.sub}</div></div>
      ${upFormMoveMode === mode ? `<i class="bi bi-check-lg" style="margin-left:auto; color:var(--primary);"></i>` : ''}
    </div>`;
  document.getElementById('upMoveModePickerList').innerHTML = rowHTML('catat', catatM) + rowHTML('pindah', pindahM);
  openSheet('upMoveModePickerOverlay');
}

function selectUpMoveMode(mode) {
  setUpFormMoveMode(mode);
  updateUpFormMoveCard();
  closeSheet('upMoveModePickerOverlay');
}

function updateUpFormMoveCard() {
  const m = upMoveModeInfo(upFormMoveMode, upFormKind);
  document.getElementById('upFormMoveIconWrap').innerHTML = `<i class="bi ${m.icon}"></i>`;
  document.getElementById('upFormMoveLabel').textContent = m.label;
  document.getElementById('upFormMoveSub').textContent = m.sub;
}

function openUpFormDuePicker() {
  const current = document.getElementById('upFormDueLabel').dataset.value || '';
  openDatePicker('tanggal', { value: current || todayISO() }, (r) => {
    document.getElementById('upFormDueLabel').textContent = formatUpDateShort(r.date);
    document.getElementById('upFormDueLabel').dataset.value = r.date;
  });
}

function clearUpFormDue(e) {
  if (e) e.stopPropagation();
  document.getElementById('upFormDueLabel').textContent = 'Pilih tanggal (opsional)';
  document.getElementById('upFormDueLabel').dataset.value = '';
}

function saveUpForm() {
  if (!allowSubmit('saveUpForm')) return;
  const errEl = document.getElementById('upFormErrMsg');
  errEl.style.display = 'none';

  const name = document.getElementById('upFormNameInput').value.trim();
  const total = parseInt(document.getElementById('upFormTotalInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const installment = parseInt(document.getElementById('upFormInstallmentInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const dueDate = document.getElementById('upFormDueLabel').dataset.value || null;
  const note = document.getElementById('upFormNoteInput').value.trim();

  if (!name) { upFormError(errEl, upFormKind === 'utang' ? 'Nama pemberi pinjaman wajib diisi' : 'Nama peminjam wajib diisi'); return; }
  if (!total) { upFormError(errEl, 'Nominal total wajib diisi'); return; }
  if (!upFormEditId && upFormMoveMode === 'pindah' && !upFormAccountId) {
    upFormError(errEl, upFormKind === 'utang' ? 'Pilih akun tujuan uang masuk' : 'Pilih akun sumber uang keluar');
    return;
  }
  let moveAcc = null;
  if (!upFormEditId && upFormMoveMode === 'pindah') {
    moveAcc = sources.find(s => s.id === upFormAccountId);
    if (!moveAcc) { upFormError(errEl, 'Akun tidak ditemukan'); return; }
    if (upFormKind === 'piutang' && total > moveAcc.saldo) {
      upFormError(errEl, `Saldo ${moveAcc.name} tidak cukup (butuh ${formatRupiah(total)}, tersedia ${formatRupiah(moveAcc.saldo)})`);
      return;
    }
  }

  const list = getUP();
  const nowIso = new Date().toISOString();

  if (upFormEditId) {
    const idx = list.findIndex(x => x.id === upFormEditId);
    if (idx === -1) return;
    const already = list[idx].totalAmount - list[idx].remaining;
    list[idx] = {
      ...list[idx],
      kind: upFormKind,
      category: upFormKind === 'utang' ? upFormCategory : null,
      name, totalAmount: total,
      remaining: Math.max(total - already, 0),
      installmentAmount: installment || null,
      dueDate, note, updatedAt: nowIso,
    };
    if (list[idx].remaining <= 0) { list[idx].status = 'lunas'; list[idx].paidOffAt = list[idx].paidOffAt || nowIso; }
    else { list[idx].status = 'berjalan'; list[idx].paidOffAt = null; }
    saveUtangPiutang(list);
    closeSheet('upFormOverlay');
    showToast('Perubahan disimpan');
    renderAll();
    openUpDetail(upFormEditId);
  } else {
    const id = 'up' + uniqueTick();
    const item = {
      id, kind: upFormKind,
      category: upFormKind === 'utang' ? upFormCategory : null,
      name, totalAmount: total, remaining: total,
      installmentAmount: installment || null,
      dueDate, note, status: 'berjalan', paidOffAt: null,
      history: [], createdAt: nowIso, updatedAt: nowIso,
    };

    if (moveAcc) {
      const mainTxId = 'tx' + uniqueTick();
      const historyId = 'uph' + uniqueTick();
      const dateStr = todayISO();
      if (upFormKind === 'utang') {
        moveAcc.saldo += total;
        transactions.unshift({
          id: mainTxId, type: 'transfer', amount: total, fee: 0,
          sourceId: id, destId: moveAcc.id,
          note: `Terima Pinjaman dari ${name}`, date: dateStr, time: nowTime(),
          upId: id, upHistoryId: historyId, upKind: 'pinjam',
        });
        item.history.push({ id: historyId, type: 'pinjam', amount: total, note: `Terima Pinjaman dari ${name}`, date: nowIso, txId: mainTxId });
      } else {
        moveAcc.saldo -= total;
        transactions.unshift({
          id: mainTxId, type: 'transfer', amount: total, fee: 0,
          sourceId: moveAcc.id, destId: id,
          note: `Beri Pinjaman ke ${name}`, date: dateStr, time: nowTime(),
          upId: id, upHistoryId: historyId, upKind: 'pinjam',
        });
        item.history.push({ id: historyId, type: 'pinjam', amount: total, note: `Beri Pinjaman ke ${name}`, date: nowIso, txId: mainTxId });
      }
      saveSources(sources);
      saveTransactions(transactions);
    }

    list.unshift(item);
    saveUtangPiutang(list);
    closeSheet('upFormOverlay');
    showToast(upFormKind === 'utang' ? 'Utang berhasil dicatat' : 'Piutang berhasil dicatat');
    renderAll();
    upKindTab = upFormKind;
    upStatusTab = 'aktif';
    renderUtangPiutangPage();
    const carousel = document.getElementById('upHeroCarousel');
    if (carousel) carousel.scrollTo({ left: upKindTab === 'utang' ? 0 : carousel.clientWidth, behavior: 'smooth' });
  }
}

function goToFaqUp() {
  openFaqSheet();
}

function upFormError(el, msg) { el.textContent = msg; el.style.display = 'block'; }

// ======================================================
// BAYAR CICILAN / TERIMA PEMBAYARAN
// ======================================================
function upLiquidAccounts() { return sources.filter(s => s.kategori === 'liquid'); }

function openUpTxSheet() {
  const u = getUpById(upDetailId);
  if (!u) return;
  const meta = UP_KIND_META[u.kind];

  upTxAccountId = null;
  document.getElementById('upTxTitle').textContent = meta.action;
  document.getElementById('upTxSubmitBtn').textContent = meta.action + ' Sekarang';
  document.getElementById('upTxSubmitBtn').style.background = meta.color;
  document.getElementById('upTxAccountLabelTitle').textContent = u.kind === 'utang' ? 'Dari Akun' : 'Ke Akun';
  document.getElementById('upTxSisaLabel').textContent = formatRupiah(u.remaining);
  document.getElementById('upTxAmountInput').value = '';
  document.getElementById('upTxNoteInput').value = '';
  document.getElementById('upTxErrMsg').style.display = 'none';

  const quicks = [u.installmentAmount, 50000, 100000, 250000, 500000, u.remaining]
    .filter((v, i, arr) => v && v > 0 && arr.indexOf(v) === i && v <= u.remaining);
  document.getElementById('upTxQuickRow').innerHTML = quicks.map(v =>
    `<div class="quick-amount-chip" onclick="upSetAmount(${v})">${v === u.remaining ? 'Lunas Semua' : '+' + formatRibu(v)}</div>`).join('');

  upResetAccountCard();
  renderUpTxSummary();
  openSheet('upTxOverlay');
}

function upSetAmount(v) {
  document.getElementById('upTxAmountInput').value = v.toLocaleString('id-ID');
  renderUpTxSummary();
}

function upResetAccountCard() {
  document.getElementById('upTxAccountLabel').textContent = 'Pilih akun';
  document.getElementById('upTxAccountIconWrap').innerHTML = `<i class="bi bi-wallet2"></i>`;
  document.getElementById('upTxAccountIconWrap').style.background = '';
  document.getElementById('upTxAccountIconWrap').style.color = '';
  document.getElementById('upTxAccountCard').classList.add('placeholder');
  document.getElementById('upTxAccountSub').style.display = 'none';
}

function upOpenAccountPicker(ctx) {
  upAccountPickerCtx = ctx || 'tx';
  const list = upLiquidAccounts();
  const listEl = document.getElementById('upAccountList');
  if (!list.length) {
    listEl.innerHTML = `<div class="kt-empty" style="border:none;">Belum ada akun Cash/Bank/E-Wallet.</div>`;
  } else {
    listEl.innerHTML = list.map(s => `
      <div class="picker-item" onclick="upSelectAccount('${s.id}')">
        <div class="picker-item-icon" style="background:${sourceTypeColors[s.jenis]}; border-radius:10px;">
          <i class="${sourceIcons[s.jenis] || 'bi-wallet2'}" style="color:#fff; font-size:16px;"></i>
        </div>
        <div>
          <div class="picker-item-name">${escapeHtml(s.name)}</div>
          <div class="picker-item-sub">${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}</div>
        </div>
      </div>`).join('');
  }
  openSheet('upAccountPickerOverlay');
}

function upSelectAccount(accId) {
  const s = sources.find(x => x.id === accId);
  if (!s) return;

  if (upAccountPickerCtx === 'form') {
    upFormAccountId = s.id;
    document.getElementById('upFormAccountLabel').textContent = s.name;
    const sub = document.getElementById('upFormAccountSub');
    sub.textContent = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
    sub.style.display = 'block';
    const iconWrap = document.getElementById('upFormAccountIconWrap');
    iconWrap.innerHTML = `<i class="${sourceIcons[s.jenis] || 'bi-wallet2'}"></i>`;
    iconWrap.style.background = sourceTypeColors[s.jenis] || 'var(--ink-300)';
    iconWrap.style.color = '#fff';
    document.getElementById('upFormAccountCard').classList.remove('placeholder');
    closeSheet('upAccountPickerOverlay');
    renderUpFormMoveNote();
    return;
  }

  upTxAccountId = s.id;
  document.getElementById('upTxAccountLabel').textContent = s.name;
  const sub = document.getElementById('upTxAccountSub');
  sub.textContent = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
  sub.style.display = 'block';
  const iconWrap = document.getElementById('upTxAccountIconWrap');
  iconWrap.innerHTML = `<i class="${sourceIcons[s.jenis] || 'bi-wallet2'}"></i>`;
  iconWrap.style.background = sourceTypeColors[s.jenis] || 'var(--ink-300)';
  iconWrap.style.color = '#fff';
  document.getElementById('upTxAccountCard').classList.remove('placeholder');
  closeSheet('upAccountPickerOverlay');
  renderUpTxSummary();
}

function renderUpTxSummary() {
  const u = getUpById(upDetailId);
  if (!u) return;
  const nominal = parseInt(document.getElementById('upTxAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const sisaSetelah = Math.max(u.remaining - nominal, 0);
  document.getElementById('upTxSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Sisa ${u.kind === 'utang' ? 'Utang' : 'Piutang'} Sekarang</div><div class="wl-info-val">${formatRupiah(u.remaining)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Sisa Setelah ${u.kind === 'utang' ? 'Bayar' : 'Diterima'}</div><div class="wl-info-val" style="color:${UP_KIND_META[u.kind].color};">${formatRupiah(sisaSetelah)}</div></div>`;
}

function submitUpTx() {
  if (!allowSubmit('submitUpTx')) return;
  const errEl = document.getElementById('upTxErrMsg');
  errEl.style.display = 'none';
  const u = getUpById(upDetailId);
  if (!u) return;

  const nominal = parseInt(document.getElementById('upTxAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const note = document.getElementById('upTxNoteInput').value.trim();

  if (!nominal) { upFormError(errEl, 'Nominal wajib diisi'); return; }
  if (!upTxAccountId) { upFormError(errEl, u.kind === 'utang' ? 'Pilih akun sumber dana' : 'Pilih akun tujuan'); return; }
  if (nominal > u.remaining) { upFormError(errEl, `Nominal melebihi sisa ${u.kind === 'utang' ? 'utang' : 'piutang'} (${formatRupiah(u.remaining)})`); return; }

  const acc = sources.find(s => s.id === upTxAccountId);
  if (!acc) { upFormError(errEl, 'Akun tidak ditemukan'); return; }
  if (u.kind === 'utang' && nominal > acc.saldo) {
    upFormError(errEl, `Saldo ${acc.name} tidak cukup (butuh ${formatRupiah(nominal)}, tersedia ${formatRupiah(acc.saldo)})`);
    return;
  }

  const nowIso = new Date().toISOString();
  const dateStr = todayISO();
  const mainTxId = 'tx' + uniqueTick();
  const historyId = 'uph' + uniqueTick();

  if (u.kind === 'utang') {
    acc.saldo -= nominal;
    saveSources(sources);
    transactions.unshift({
      id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
      sourceId: acc.id, destId: u.id,
      note: note || `Bayar Cicilan ${u.name}`, date: dateStr, time: nowTime(),
      upId: u.id, upHistoryId: historyId, upKind: 'cicilan',
    });
  } else {
    acc.saldo += nominal;
    saveSources(sources);
    transactions.unshift({
      id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
      sourceId: u.id, destId: acc.id,
      note: note || `Terima Pembayaran ${u.name}`, date: dateStr, time: nowTime(),
      upId: u.id, upHistoryId: historyId, upKind: 'cicilan',
    });
  }
  saveTransactions(transactions);

  const list = getUP();
  const idx = list.findIndex(x => x.id === u.id);
  if (idx > -1) {
    list[idx].remaining = Math.max(list[idx].remaining - nominal, 0);
    list[idx].history = list[idx].history || [];
    list[idx].history.push({ id: historyId, type: u.kind === 'utang' ? 'bayar' : 'terima', amount: nominal, note, date: nowIso, txId: mainTxId });
    list[idx].updatedAt = nowIso;
    if (list[idx].remaining <= 0) { list[idx].status = 'lunas'; list[idx].paidOffAt = nowIso; }
    saveUtangPiutang(list);
  }

  closeSheet('upTxOverlay');
  showToast(u.kind === 'utang' ? 'Pembayaran cicilan berhasil dicatat' : 'Penerimaan pembayaran berhasil dicatat');
  renderAll();
  renderUpDetailPage();
}

// ======================================================
// HAPUS
// ======================================================
function openUpHapusSheet() {
  const u = getUpById(upDetailId);
  if (!u) return;
  upHapusPending = u.id;
  document.getElementById('upHapusMsg').textContent =
    `Catatan "${u.name}" akan dihapus permanen${(u.history && u.history.length) ? ', beserta seluruh riwayat transaksinya di Riwayat' : ''}. Tindakan ini tidak bisa dibatalkan.`;
  openSheet('upHapusOverlay');
}

function submitUpHapus() {
  const id = upHapusPending;
  if (!id) return;
  const u = getUpById(id);
  if (!u) return;

  // Balikkan saldo akun untuk setiap transaksi terkait, lalu hapus transaksinya.
  transactions.filter(t => t.upId === id).forEach(t => {
    if (u.kind === 'utang') {
      const src = sources.find(s => s.id === t.sourceId);
      if (src) src.saldo += t.amount;
    } else {
      const dest = sources.find(s => s.id === t.destId);
      if (dest) dest.saldo -= t.amount;
    }
  });
  saveSources(sources);
  transactions = transactions.filter(t => t.upId !== id);
  saveTransactions(transactions);

  const list = getUP().filter(x => x.id !== id);
  saveUtangPiutang(list);

  closeSheet('upHapusOverlay');
  showToast('Catatan berhasil dihapus');
  upHapusPending = null;
  renderAll();
  goTo('utang');
}
