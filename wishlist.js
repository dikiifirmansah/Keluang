// ======================================================
// MODULE: Wishlist
// STATUS: Dalam pengembangan (Segmen A — List, Hero, Filter)
// ======================================================
// Data model per item:
// {
//   id, name, photo (dataURL|null), category (ref categories.keluar),
//   priority: 'tinggi' | 'sedang' | 'rendah',
//   targetAmount, targetDate (ISO|null), storageNote (opsional, teks bebas),
//   note (deskripsi opsional), balance (default 0),
//   completed (boolean, default false), completedAt (ISO|null),
//   savingPlan: { type:'harian'|'mingguan'|'bulanan', amount } | null,
//   reminders: { tabungan, jatuhTempoSebelum, jatuhTempoSetelah } (flag saja,
//               logic notifikasi in-app menyusul — lihat Plan.txt poin 7),
//   history: [ { id, type:'setor'|'tarik', amount, fee, note, date } ],
//   createdAt, updatedAt
// }
//
// Wishlist = kantong mandiri: setor/tarik TIDAK menyentuh saldo akun manapun,
// dicatat sebagai transfer (lihat Segmen D). storageNote hanya catatan bebas.

// ======================================================
// STATE
// ======================================================
let wlStatusTab = 'berlangsung';   // 'berlangsung' | 'tercapai' | 'selesai'
let wlViewMode = 'list';           // 'list' | 'grid'
let wlEyeHidden = false;
let wlExtraOpen = false;
let wlSearchVal = '';
let wlCatFilter = [];
let wlPriorityFilter = [];
let wlDraft = null;

const WL_PRIORITY_META = {
  tinggi: { label: 'Prioritas Tinggi', icon: 'bi-star-fill', color: '#B07A20', weight: 3 },
  sedang: { label: 'Prioritas Sedang', icon: 'bi-star-half', color: '#2065B8', weight: 2 },
  rendah: { label: 'Prioritas Rendah', icon: 'bi-star',      color: '#6B628A', weight: 1 },
};

const WL_STATUS_META = {
  berlangsung: { label: 'Berlangsung', emptyIcon: 'bi-hourglass-split',
    emptyTitle: 'Belum Ada Wishlist Berjalan',
    emptySub: 'Tap tombol + di bawah untuk mulai merencanakan wishlist impianmu.' },
  tercapai: { label: 'Tercapai', emptyIcon: 'bi-flag',
    emptyTitle: 'Belum Ada yang Tercapai',
    emptySub: 'Wishlist yang dananya sudah penuh tapi belum dipakai akan muncul di sini.' },
  selesai: { label: 'Selesai', emptyIcon: 'bi-check-circle',
    emptyTitle: 'Belum Ada yang Selesai',
    emptySub: 'Wishlist yang dananya sudah dipakai akan tersimpan di sini sebagai riwayat.' },
};

// ======================================================
// INIT
// ======================================================
function initWishlist() {
  wlStatusTab = 'berlangsung';
  wlViewMode = 'list';
  wlExtraOpen = false;
  wlSearchVal = '';
  const searchInput = document.getElementById('wlSearchInput');
  if (searchInput) searchInput.value = '';
  document.querySelectorAll('.wl-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === wlStatusTab));
  document.getElementById('wlViewToggleIcon').className = 'bi bi-grid-3x3-gap-fill';
  document.getElementById('wlAddBtn').style.display = 'flex';
  renderWishlistPage();
}

// Satu tombol, ikonnya nunjukin mode TUJUAN (bukan mode aktif) — tap buat pindah.
function toggleWlViewMode() {
  wlViewMode = wlViewMode === 'list' ? 'grid' : 'list';
  document.getElementById('wlViewToggleIcon').className = wlViewMode === 'list' ? 'bi bi-grid-3x3-gap-fill' : 'bi bi-list-ul';
  document.getElementById('wlAddBtn').style.display = wlViewMode === 'list' ? 'flex' : 'none';
  renderWishlistPage();
}

// ======================================================
// HELPERS: STATUS & PROGRESS
// ======================================================
function wlStatusOf(w) {
  if (w.completed) return 'selesai';
  if (w.targetAmount > 0 && w.balance >= w.targetAmount) return 'tercapai';
  return 'berlangsung';
}

function wlProgressPct(w) {
  if (!w.targetAmount) return 0;
  return Math.min((w.balance / w.targetAmount) * 100, 100);
}

function wlFmt(n) {
  return wlEyeHidden ? '••••••' : formatRupiah(n);
}

function wlLastUpdatedLabel(list) {
  if (!list.length) return '-';
  const latestTs = Math.max(...list.map(w => new Date(w.updatedAt || w.createdAt).getTime()));
  const d = new Date(latestTs);
  const today = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (d.toDateString() === today.toDateString()) return `Hari ini ${hh}:${mm}`;
  return `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}`;
}

// ======================================================
// FILTER + SORT
// ======================================================
function getFilteredWishlists() {
  const all = loadWishlists();
  let list = all.filter(w => wlStatusOf(w) === wlStatusTab);
  if (wlCatFilter.length) list = list.filter(w => wlCatFilter.includes(w.category));
  if (wlPriorityFilter.length) list = list.filter(w => wlPriorityFilter.includes(w.priority));
  if (wlSearchVal) {
    const q = wlSearchVal.toLowerCase();
    list = list.filter(w => w.name.toLowerCase().includes(q));
  }
  // Prioritas tinggi & progress terdekat tercapai naik ke atas — biar yang
  // paling butuh perhatian/paling deket kelar gampang kelihatan duluan.
  list.sort((a, b) => {
    const wA = WL_PRIORITY_META[a.priority] ? WL_PRIORITY_META[a.priority].weight : 0;
    const wB = WL_PRIORITY_META[b.priority] ? WL_PRIORITY_META[b.priority].weight : 0;
    if (wA !== wB) return wB - wA;
    return wlProgressPct(b) - wlProgressPct(a);
  });
  return list;
}

// ======================================================
// RENDER: PAGE
// ======================================================
function renderWishlistPage() {
  const isTrulyEmpty = loadWishlists().length === 0;
  document.getElementById('wlSearchRow').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('wlTabRow').style.display = isTrulyEmpty ? 'none' : 'flex';
  document.getElementById('wlAddBtn').style.display = isTrulyEmpty ? 'none' : 'flex';

  if (isTrulyEmpty) {
    document.getElementById('wlList').innerHTML = '';
    document.getElementById('wlHero').innerHTML = '';
    const emptyEl = document.getElementById('wlEmptyState');
    emptyEl.style.display = 'flex';
    emptyEl.innerHTML = `
      <i class="bi bi-hourglass-split"></i>
      <div class="bdg-empty-title">Belum Ada Wishlist</div>
      <div class="bdg-empty-sub">Rencanakan impianmu dan sisihkan dana sedikit demi sedikit sampai tercapai.</div>
      <button class="dd-empty-cta" style="margin-top:16px;" onclick="openWishlistForm(null)">
        <i class="bi bi-plus-lg"></i> Tambah Wishlist
      </button>`;
    return;
  }

  renderWlHero();
  renderWlActiveChips();
  updateWlFilterBadge();

  const list = getFilteredWishlists();
  const listEl = document.getElementById('wlList');
  const emptyEl = document.getElementById('wlEmptyState');
  const meta = WL_STATUS_META[wlStatusTab];

  listEl.classList.toggle('wl-grid-row', wlViewMode === 'grid');

  if (wlViewMode === 'grid') {
    emptyEl.style.display = 'none';
    const addCard = `
      <div class="wl-grid-add-card" onclick="openWishlistForm(null)">
        <div class="wl-grid-add-card-icon"><i class="bi bi-plus-lg"></i></div>
        <div class="wl-grid-add-card-text">Tambah Wishlist Baru</div>
        <div class="wl-grid-add-card-sub">+</div>
      </div>`;
    listEl.innerHTML = list.map(w => wlGridCardHTML(w)).join('') + addCard;
    return;
  }

  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    emptyEl.innerHTML = `
      <i class="bi bi-hourglass-split"></i>
      <div class="bdg-empty-title"></div>
      <div class="bdg-empty-sub"></div>`;
    const hasFilter = wlCatFilter.length || wlPriorityFilter.length || wlSearchVal;
    emptyEl.querySelector('.bdg-empty i').className = 'bi ' + (hasFilter ? 'bi-search' : meta.emptyIcon);
    emptyEl.querySelector('.bdg-empty-title').textContent = hasFilter ? 'Tidak Ditemukan' : meta.emptyTitle;
    emptyEl.querySelector('.bdg-empty-sub').textContent = hasFilter ? 'Coba ubah kata kunci atau filter yang dipakai.' : meta.emptySub;
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = list.map(w => wlItemHTML(w)).join('');
}

function setWlStatusTab(tab) {
  wlStatusTab = tab;
  document.querySelectorAll('.wl-tab').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
  renderWishlistPage();
}

// ======================================================
// RENDER: HERO (ringkasan + eye toggle + expand)
// ======================================================
function renderWlHero() {
  const heroEl = document.getElementById('wlHero');
  const all = loadWishlists();

  if (!all.length) { heroEl.innerHTML = ''; return; }

  // Total Target/Terkumpul cuma dihitung dari yang masih "aktif" (Berlangsung +
  // Tercapai) — yang Selesai dananya udah cair jadi pengeluaran, gak relevan lagi.
  const active = all.filter(w => wlStatusOf(w) !== 'selesai');
  const totalTarget = active.reduce((a, w) => a + w.targetAmount, 0);
  const totalTerkumpul = active.reduce((a, w) => a + w.balance, 0);
  const pct = totalTarget > 0 ? Math.min((totalTerkumpul / totalTarget) * 100, 100) : 0;

  const countBerlangsung = all.filter(w => wlStatusOf(w) === 'berlangsung').length;
  const countTercapai = all.filter(w => wlStatusOf(w) === 'tercapai').length;
  const countSelesai = all.filter(w => wlStatusOf(w) === 'selesai').length;
  const avgProgress = active.length
    ? Math.round(active.reduce((a, w) => a + wlProgressPct(w), 0) / active.length)
    : 0;

  heroEl.innerHTML = `
    <div class="wl-hero">
      <div class="wl-hero-head">
        <div class="wl-hero-title">Ringkasan Wishlist</div>
        <div class="wl-hero-actions">
          <button class="wl-eye-btn" onclick="toggleWlEye()"><i class="bi ${wlEyeHidden ? 'bi-eye-slash' : 'bi-eye'}"></i></button>
          <button class="wl-hero-toggle-btn ${wlExtraOpen ? 'open' : ''}" onclick="toggleWlExtra()"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div class="bdg-hero-row" style="margin-top:10px;">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">Total Target</div>
          <div class="bdg-hero-val">${wlFmt(totalTarget)}</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Terkumpul</div>
          <div class="bdg-hero-val">${wlFmt(totalTerkumpul)}</div>
        </div>
      </div>
      <div class="bdg-global-track" style="margin-top:2px;"><div class="wl-bar-fill" style="width:${pct}%;"></div></div>
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct ok-text">${pct.toFixed(0)}% terkumpul</div>
        <div class="bdg-hero-sisa ok-text">Sisa ${wlFmt(Math.max(totalTarget - totalTerkumpul, 0))}</div>
      </div>
      <div class="st-extra-grid" style="display:${wlExtraOpen ? 'grid' : 'none'}; margin-top:14px;">
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-hourglass-split"></i> Wishlist Aktif</div>
          <div class="ec-val">${countBerlangsung}</div>
          <div class="ec-sub">sedang berjalan</div>
        </div>
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-flag-fill"></i> Tercapai</div>
          <div class="ec-val">${countTercapai}</div>
          <div class="ec-sub">belum digunakan</div>
        </div>
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-check-circle-fill"></i> Selesai</div>
          <div class="ec-val">${countSelesai}</div>
          <div class="ec-sub">dana sudah dipakai</div>
        </div>
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-bar-chart-line"></i> Rata-rata Progress</div>
          <div class="ec-val">${avgProgress}%</div>
          <div class="ec-sub">dari wishlist aktif</div>
        </div>
      </div>
      <div class="wl-hero-updated" style="display:${wlExtraOpen ? 'block' : 'none'};">Terakhir diperbarui: ${wlLastUpdatedLabel(all)}</div>
    </div>`;
}

function toggleWlEye() {
  wlEyeHidden = !wlEyeHidden;
  renderWlHero();
}

function toggleWlExtra() {
  wlExtraOpen = !wlExtraOpen;
  renderWlHero();
}

// ======================================================
// RENDER: ITEM CARD
// ======================================================
function wlItemHTML(w) {
  const pct = wlProgressPct(w);
  const pr = WL_PRIORITY_META[w.priority] || WL_PRIORITY_META.rendah;
  const catIcon = (categoryIcons && categoryIcons[w.category]) || 'bi-circle';
  const catColor = (categoryColors && categoryColors[w.category]) || 'var(--ink-300)';
  const status = wlStatusOf(w);
  const sisa = Math.max(w.targetAmount - w.balance, 0);

  const thumb = w.photo
    ? `<img src="${w.photo}" class="wl-item-thumb" alt="">`
    : `<div class="wl-item-thumb wl-item-thumb-icon" style="background:${catColor}20;">
         <i class="bi ${catIcon}" style="color:${catColor};"></i>
       </div>`;

  const bottomText = status === 'selesai'
    ? 'Dana sudah digunakan'
    : status === 'tercapai'
      ? 'Target tercapai'
      : `Sisa ${formatRupiah(sisa)}`;

  return `
    <div class="wl-item" onclick="openWlDetail('${w.id}')">
      ${thumb}
      <div class="wl-item-body">
        <div class="wl-item-top">
          <div class="wl-item-name">${escapeHtml(w.name)}</div>
        </div>
        <div class="wl-pill" style="background:${pr.color}20; color:${pr.color};">
          <i class="bi ${pr.icon}"></i> ${pr.label}
        </div>
        <div class="wl-item-amounts">
          <div class="wl-amt"><span class="wl-amt-label">Terkumpul</span><span class="wl-amt-val">${formatRupiah(w.balance)}</span></div>
          <div class="wl-amt right"><span class="wl-amt-label">Target</span><span class="wl-amt-val">${formatRupiah(w.targetAmount)}</span></div>
        </div>
        <div class="bdg-bar-track"><div class="wl-bar-fill" style="width:${pct}%;"></div></div>
        <div class="wl-item-bottom">
          <span class="wl-item-sisa">${bottomText}</span>
          <span class="wl-item-pct">${pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>`;
}

// ======================================================
// RENDER: GRID CARD (Segmen E2)
// ======================================================
function wlGridCardHTML(w) {
  const pct = wlProgressPct(w);
  const status = wlStatusOf(w);
  const pr = WL_PRIORITY_META[w.priority] || WL_PRIORITY_META.rendah;
  const catIcon = (categoryIcons && categoryIcons[w.category]) || 'bi-circle';
  const catColor = (categoryColors && categoryColors[w.category]) || 'var(--ink-300)';
  const sisa = Math.max(w.targetAmount - w.balance, 0);

  const photoLayer = w.photo
    ? `<img class="wl-grid-card-img" src="${w.photo}" alt="">`
    : `<div class="wl-grid-card-fallback" style="background:${catColor};"><i class="bi ${catIcon}"></i></div>`;

  const statusBadge = status === 'selesai'
    ? `<div class="wl-grid-card-badge"><i class="bi bi-check-circle-fill"></i> Selesai</div>`
    : status === 'tercapai'
      ? `<div class="wl-grid-card-badge"><i class="bi bi-flag-fill"></i> Tercapai</div>`
      : '';

  const bottomText = status === 'selesai' ? 'Sudah digunakan' : `Sisa ${formatRupiah(sisa)}`;

  return `
    <div class="wl-grid-card" onclick="openWlDetail('${w.id}')">
      ${photoLayer}
      <div class="wl-grid-card-gradient"></div>
      ${statusBadge}
      <div class="wl-grid-card-badge wl-grid-card-badge-priority" style="background:${pr.color}CC;">
        <i class="bi ${pr.icon}"></i>
      </div>
      <div class="wl-grid-card-bottom">
        <div class="wl-grid-card-name">${escapeHtml(w.name)}</div>
        <div class="wl-grid-card-amt">${formatRupiah(w.balance)} / ${formatRupiah(w.targetAmount)}</div>
        <div class="wl-grid-card-bar-track"><div class="wl-grid-card-bar-fill" style="width:${pct}%;"></div></div>
        <div class="wl-grid-card-bottom-row">
          <span class="wl-grid-card-sisa">${bottomText}</span>
          <span class="wl-grid-card-pct">${pct.toFixed(0)}%</span>
        </div>
      </div>
    </div>`;
}

// ======================================================
// DETAIL WISHLIST (Segmen C)
// ======================================================
let wlDetailId = null;

function openWlDetail(id) {
  wlDetailId = id;
  renderWlDetailPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-wishlist-detail').classList.add('active');
}

function closeWlDetail() { goTo('wishlist'); }

function getWlById(id) { return loadWishlists().find(w => w.id === id); }

function wlEstimate(w) {
  const sisa = Math.max(w.targetAmount - w.balance, 0);
  if (sisa <= 0) return null;

  let ratePerWeek = 0;
  if (w.history && w.history.length) {
    const first = new Date(w.history[w.history.length - 1].date);
    const spanWeeks = Math.max(1, (Date.now() - first.getTime()) / (7 * 86400000));
    const net = w.history.reduce((a, h) => a + (h.type === 'setor' ? h.amount : -h.amount), 0);
    ratePerWeek = net / spanWeeks;
  } else if (w.savingPlan) {
    const { type, amount } = w.savingPlan;
    ratePerWeek = type === 'harian' ? amount * 7 : type === 'mingguan' ? amount : (amount * 12) / 52;
  }
  if (ratePerWeek <= 0) return { none: true };

  const days = Math.max(1, Math.ceil((sisa / ratePerWeek) * 7));
  const estDate = new Date(Date.now() + days * 86400000);
  return {
    days,
    ratePerWeek,
    estDateLabel: `${estDate.getDate()} ${bulanPanjang[estDate.getMonth()]} ${estDate.getFullYear()}`,
  };
}

function renderWlDetailPage() {
  const w = getWlById(wlDetailId);
  if (!w) { goTo('wishlist'); return; }

  const status = wlStatusOf(w);
  const pct = wlProgressPct(w);
  const pr = WL_PRIORITY_META[w.priority] || WL_PRIORITY_META.rendah;
  const catIcon = (categoryIcons && categoryIcons[w.category]) || 'bi-circle';

  // ---------- Hero ----------
  const photoLayer = w.photo
    ? `<img class="wl-detail-hero-img" src="${w.photo}" alt="">`
    : `<div class="wl-detail-hero-fallback"><i class="bi ${catIcon}"></i></div>`;

  const heroEl = document.getElementById('wlDetailHero');
  heroEl.style.aspectRatio = w.photo ? String(parseFloat(w.photoAspect || '0.75')) : '4/5';

  heroEl.innerHTML = `
    ${photoLayer}
    <div class="wl-detail-hero-gradient"></div>
    <div class="wl-detail-topbar-overlay">
      <button class="wl-detail-topbar-btn" onclick="closeWlDetail()"><i class="bi bi-arrow-left"></i></button>
      <div class="wl-detail-topbar-actions">
        <button class="wl-detail-topbar-btn" onclick="openWishlistForm('${w.id}')"><i class="bi bi-pencil"></i></button>
        <button class="wl-detail-topbar-btn" onclick="openWlSettingsSheet()"><i class="bi bi-three-dots"></i></button>
      </div>
    </div>
    <div class="wl-detail-bottom">
      <div class="wl-detail-badge-row">
        <div class="wl-pill" style="background:rgba(255,255,255,0.2); color:#fff;">
          <i class="bi ${pr.icon}"></i> ${pr.label}
        </div>
      </div>
      <div class="wl-detail-name">${escapeHtml(w.name)}</div>
      <div class="wl-detail-target-label">Target</div>
      <div class="wl-detail-target-val">${formatRupiah(w.targetAmount)}</div>
      <div class="wl-detail-stats-row">
        <div><div class="wl-detail-stat-label">Terkumpul</div><div class="wl-detail-stat-val">${formatRupiah(w.balance)}</div></div>
        <div style="text-align:right;"><div class="wl-detail-stat-label">Sisa</div><div class="wl-detail-stat-val">${formatRupiah(Math.max(w.targetAmount - w.balance, 0))}</div></div>
      </div>
      <div class="wl-detail-bar-track"><div class="wl-detail-bar-fill" style="width:${pct}%;"></div></div>
      <div class="wl-detail-pct">${pct.toFixed(0)}%</div>
    </div>`;

  // ---------- Body ----------
  let bodyHTML = '';

  if (status === 'selesai') {
    const doneDate = w.completedAt ? new Date(w.completedAt) : null;
    const doneLabel = doneDate ? `${doneDate.getDate()} ${bulanPanjang[doneDate.getMonth()]} ${doneDate.getFullYear()}` : '-';
    bodyHTML += `
      <div class="wl-completed-banner">
        <i class="bi bi-check-circle-fill"></i>
        <div>Dana sudah digunakan pada ${doneLabel}</div>
      </div>`;
  } else {
    // ---------- Estimasi ----------
    const est = wlEstimate(w);
    if (status === 'tercapai') {
      bodyHTML += `
        <div class="wl-estimate-card">
          <div class="wl-estimate-left">
            <div class="wl-estimate-icon"><i class="bi bi-flag-fill"></i></div>
            <div>
              <div class="wl-estimate-days">Target Tercapai!</div>
              <div class="wl-estimate-days-sub">Siap dipakai kapan aja</div>
            </div>
          </div>
        </div>`;
    } else if (est && !est.none) {
      bodyHTML += `
        <div class="wl-estimate-card">
          <div class="wl-estimate-left">
            <div class="wl-estimate-icon"><i class="bi bi-hourglass-split"></i></div>
            <div>
              <div class="wl-estimate-days">${est.days} hari lagi</div>
              <div class="wl-estimate-days-sub">estimasi tercapai</div>
            </div>
          </div>
          <div class="wl-estimate-divider"></div>
          <div class="wl-estimate-right">
            <div class="wl-estimate-right-label">Jika menabung rata-rata</div>
            <div class="wl-estimate-right-val">${formatRupiah(Math.round(est.ratePerWeek))} / minggu</div>
            <div class="wl-estimate-right-label" style="margin-top:6px;">Target tercapai pada</div>
            <div class="wl-estimate-right-val">${est.estDateLabel}</div>
          </div>
        </div>`;
    } else {
      bodyHTML += `
        <div class="wl-estimate-card">
          <div class="wl-estimate-left">
            <div class="wl-estimate-icon"><i class="bi bi-graph-up"></i></div>
            <div>
              <div class="wl-estimate-days" style="font-size:12.5px;">Belum ada estimasi</div>
              <div class="wl-estimate-days-sub">Atur rencana pengisian atau mulai setor dana</div>
            </div>
          </div>
        </div>`;
    }
  }

  // ---------- Informasi ----------
  const createdDate = new Date(w.createdAt);
  const createdLabel = `${createdDate.getDate()} ${bulanPanjang[createdDate.getMonth()]} ${createdDate.getFullYear()}`;
  let targetDateLabel = '-';
  if (w.targetDate) {
    const [y, m, d] = w.targetDate.split('-').map(Number);
    targetDateLabel = `${d} ${bulanPanjang[m - 1]} ${y}`;
  }

  bodyHTML += `
    <div class="wl-info-card">
      <div class="wl-info-row"><i class="bi bi-tag"></i><div class="wl-info-label">Kategori</div><div class="wl-info-val">${escapeHtml(w.category)}</div></div>
      <div class="wl-info-row"><i class="bi bi-wallet2"></i><div class="wl-info-label">Tempat Menyimpan</div><div class="wl-info-val">${escapeHtml(w.storageNote || '-')}</div></div>
      <div class="wl-info-row"><i class="bi bi-calendar-event"></i><div class="wl-info-label">Target Tanggal</div><div class="wl-info-val">${targetDateLabel}</div></div>
      <div class="wl-info-row"><i class="bi bi-clock-history"></i><div class="wl-info-label">Dibuat pada</div><div class="wl-info-val">${createdLabel}</div></div>
      ${w.note ? `<div class="wl-info-row"><i class="bi bi-file-text"></i><div class="wl-info-label">Deskripsi</div><div class="wl-info-val desc">${escapeHtml(w.note)}</div></div>` : ''}
    </div>`;

  // ---------- Action buttons ----------
  if (status === 'berlangsung') {
    bodyHTML += `
      <div class="wl-action-row">
        <div class="wl-action-btn" onclick="openWlSetorDana('${w.id}')">
          <div class="wl-action-btn-icon" style="background:var(--info-100);"><i class="bi bi-arrow-down" style="color:var(--info);"></i></div>
          <div class="wl-action-btn-label">Setor Dana</div>
        </div>
        <div class="wl-action-btn" onclick="openWlTarikDana('${w.id}')">
          <div class="wl-action-btn-icon" style="background:var(--warning-100);"><i class="bi bi-arrow-up" style="color:var(--warning);"></i></div>
          <div class="wl-action-btn-label">Tarik Dana</div>
        </div>
        <div class="wl-action-btn" onclick="openWlHapusWishlist('${w.id}')">
          <div class="wl-action-btn-icon" style="background:var(--danger-100);"><i class="bi bi-trash3" style="color:var(--danger);"></i></div>
          <div class="wl-action-btn-label">Hapus Wishlist</div>
        </div>
      </div>`;
  } else if (status === 'tercapai') {
    bodyHTML += `
      <div class="wl-action-row">
        <div class="wl-action-btn" onclick="openWlTarikDana('${w.id}')">
          <div class="wl-action-btn-icon" style="background:var(--warning-100);"><i class="bi bi-arrow-up" style="color:var(--warning);"></i></div>
          <div class="wl-action-btn-label">Tarik Dana</div>
        </div>
        <div class="wl-action-btn" onclick="openWlGunakanDana('${w.id}')">
          <div class="wl-action-btn-icon" style="background:#E3F7EE;"><i class="bi bi-check-lg" style="color:#06A876;"></i></div>
          <div class="wl-action-btn-label">Gunakan Dana</div>
        </div>
        <div class="wl-action-btn" onclick="openWlHapusWishlist('${w.id}')">
          <div class="wl-action-btn-icon" style="background:var(--danger-100);"><i class="bi bi-trash3" style="color:var(--danger);"></i></div>
          <div class="wl-action-btn-label">Hapus Wishlist</div>
        </div>
      </div>`;
  }

  // ---------- Riwayat Tabungan ----------
  bodyHTML += `<div class="wl-section-title">Riwayat Tabungan</div>`;
  if (!w.history || !w.history.length) {
    bodyHTML += `<div class="kt-empty">Belum ada riwayat setoran/tarikan.</div>`;
  } else {
    bodyHTML += w.history.slice().reverse().map(h => {
      const d = new Date(h.date);
      const dLabel = formatHistoryDateID(d);
      const isSetor = h.type === 'setor';
      return `
        <div class="bdg-tx-item"${h.txId ? ` onclick="openTransactionDetail('${h.txId}')" style="cursor:pointer;"` : ''}>
          <div class="bdg-tx-note">${isSetor ? 'Setoran' : 'Penarikan'}${h.note ? ' · ' + escapeHtml(h.note) : ''}<br><span style="font-weight:500;color:var(--ink-300);font-size:10.5px;">${dLabel}</span></div>
          <div class="bdg-tx-amt" style="color:${isSetor ? '#06A876' : 'var(--danger)'};">${isSetor ? '+' : '−'}${formatRupiah(h.amount)}</div>
        </div>`;
    }).join('');
  }

  document.getElementById('wlDetailBody').innerHTML = bodyHTML;
}

// ======================================================
// SETOR / TARIK / GUNAKAN DANA / HAPUS (Segmen D)
// ======================================================
let wlTxId = null;        // wishlist yang sedang ditransaksikan
let wlTxAccountMode = null; // 'setor' | 'tarik' | 'hapus' -> penanda picker akun dipakai untuk sheet mana
let wlSetorAccountId = null;
let wlTarikAccountId = null;
let wlHapusAccountId = null;

const WL_QUICK_AMOUNTS = [50000, 100000, 500000, 1000000];

function wlLiquidAccounts() {
  return sources.filter(s => s.kategori !== 'invest');
}

// ---------- SETOR DANA ----------
function openWlSetorDana(id) {
  const w = getWlById(id);
  if (!w) return;
  wlTxId = id;
  wlSetorAccountId = null;

  document.getElementById('wlSetorSaldoLabel').textContent = formatRupiah(w.balance);
  document.getElementById('wlSetorSisaLabel').textContent = formatRupiah(Math.max(w.targetAmount - w.balance, 0));
  document.getElementById('wlSetorAmountInput').value = '';
  document.getElementById('wlSetorFeeInput').value = '';
  document.getElementById('wlSetorNoteInput').value = '';
  document.getElementById('wlSetorErrMsg').style.display = 'none';

  const sisa = Math.max(w.targetAmount - w.balance, 0);
  document.getElementById('wlSetorQuickRow').innerHTML =
    WL_QUICK_AMOUNTS.map(v => `<div class="quick-amount-chip" onclick="wlAddQuickAmount('wlSetorAmountInput',${v})">+${formatRibu(v)}</div>`).join('') +
    `<div class="quick-amount-chip" onclick="wlSetMaxAmount('wlSetorAmountInput',${sisa})">Sisa Target</div>`;

  wlResetAccountCard('wlSetorAccountCard', 'wlSetorAccountLabel', 'wlSetorAccountIconWrap', 'wlSetorAccountSub');
  renderWlSetorSummary();
  openSheet('wlSetorOverlay');
}

// Model: Nominal = jumlah yang BENERAN masuk ke Wishlist (utuh, gak dipotong
// fee). Fee itu biaya EKSTRA di luar nominal, dibebankan ke akun asal — persis
// pola transfer antar-akun yang udah ada di app ini. Jadi target tabungan
// selalu tercapai pas, gak "kurang" gara-gara fee.
function renderWlSetorSummary() {
  const nominal = parseInt(document.getElementById('wlSetorAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('wlSetorFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const totalPotong = nominal + fee;
  document.getElementById('wlSetorSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Masuk ke Wishlist</div><div class="wl-info-val">${formatRupiah(nominal)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (akun asal)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Dipotong dari Akun</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(totalPotong)}</div></div>`;
}

function submitWlSetor() {
  if (!allowSubmit('submitWlSetor')) return;
  const errEl = document.getElementById('wlSetorErrMsg');
  errEl.style.display = 'none';
  const w = getWlById(wlTxId);
  if (!w) return;

  const nominal = parseInt(document.getElementById('wlSetorAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('wlSetorFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const note = document.getElementById('wlSetorNoteInput').value.trim();

  if (!nominal) { wlTxError(errEl, 'Nominal setor wajib diisi'); return; }
  if (!wlSetorAccountId) { wlTxError(errEl, 'Pilih akun sumber dana'); return; }

  const src = sources.find(s => s.id === wlSetorAccountId);
  if (!src) { wlTxError(errEl, 'Akun tidak ditemukan'); return; }
  const totalPotong = nominal + fee;
  if (totalPotong > src.saldo) {
    wlTxError(errEl, `Saldo ${src.name} tidak cukup untuk nominal + biaya admin (butuh ${formatRupiah(totalPotong)}, tersedia ${formatRupiah(src.saldo)})`);
    return;
  }

  const nowIso = new Date().toISOString();
  const dateStr = todayISO();
  const mainTxId = 'tx' + uniqueTick();
  const historyId = 'wh' + uniqueTick();

  // Akun asal kepotong nominal + fee, Wishlist nerima nominal utuh
  src.saldo -= totalPotong;
  saveSources(sources);

  // Transfer utama (gak dihitung pemasukan/pengeluaran)
  transactions.unshift({
    id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
    sourceId: src.id, destId: w.id,
    note: note || `Setor ke Wishlist: ${w.name}`, date: dateStr, time: nowTime(),
    isWishlistTx: true, wishlistId: w.id, wlHistoryId: historyId,
  });
  // Fee dicatat terpisah sebagai pengeluaran (ledger buat laporan; saldo akun
  // udah dipotong sekaligus di atas, ini gak motong lagi)
  if (fee > 0) {
    transactions.unshift({
      id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: src.id,
      category: 'Biaya Admin/Fee', note: `Biaya admin setor Wishlist: ${w.name}`,
      date: dateStr, time: nowTime(), isFee: true, feeOf: mainTxId,
    });
  }
  saveTransactions(transactions);

  const list = loadWishlists();
  const idx = list.findIndex(x => x.id === w.id);
  list[idx].balance += nominal;
  list[idx].history = list[idx].history || [];
  list[idx].history.push({ id: historyId, type: 'setor', amount: nominal, fee, note, date: nowIso, txId: mainTxId });
  list[idx].updatedAt = nowIso;
  saveWishlists(list);

  closeSheet('wlSetorOverlay');
  showToast('Setor dana berhasil');
  renderAll();
  openWlDetail(w.id);
}

// ---------- TARIK DANA ----------
function openWlTarikDana(id) {
  const w = getWlById(id);
  if (!w) return;
  wlTxId = id;
  wlTarikAccountId = null;

  document.getElementById('wlTarikSaldoLabel').textContent = formatRupiah(w.balance);
  document.getElementById('wlTarikSisaLabel').textContent = formatRupiah(Math.max(w.targetAmount - w.balance, 0));
  document.getElementById('wlTarikAmountInput').value = '';
  document.getElementById('wlTarikFeeInput').value = '';
  document.getElementById('wlTarikNoteInput').value = '';
  document.getElementById('wlTarikErrMsg').style.display = 'none';

  document.getElementById('wlTarikQuickRow').innerHTML =
    WL_QUICK_AMOUNTS.filter(v => v <= w.balance).map(v => `<div class="quick-amount-chip" onclick="wlAddQuickAmount('wlTarikAmountInput',${v})">+${formatRibu(v)}</div>`).join('') +
    `<div class="quick-amount-chip" onclick="wlSetMaxTarik()">Semua Saldo</div>`;

  wlResetAccountCard('wlTarikAccountCard', 'wlTarikAccountLabel', 'wlTarikAccountIconWrap', 'wlTarikAccountSub');
  renderWlTarikSummary();
  openSheet('wlTarikOverlay');
}

// "Semua Saldo" = tarik abis-abisan: nominal dihitung mundur dari saldo
// dikurangi fee yang udah/lagi diisi, biar nominal+fee pas sama saldo.
function wlSetMaxTarik() {
  const w = getWlById(wlTxId);
  if (!w) return;
  const fee = parseInt(document.getElementById('wlTarikFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const maxNominal = Math.max(w.balance - fee, 0);
  document.getElementById('wlTarikAmountInput').value = maxNominal.toLocaleString('id-ID');
  renderWlTarikSummary();
}

// Model: Nominal = jumlah yang BENERAN masuk ke akun tujuan (utuh). Fee jadi
// beban ekstra yang dipotong dari saldo Wishlist (karena yang "kirim" di sini
// ya Wishlist itu sendiri) — sama persis arah logika Setor, cuma dibalik.
function renderWlTarikSummary() {
  const nominal = parseInt(document.getElementById('wlTarikAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('wlTarikFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const totalPotong = nominal + fee;
  document.getElementById('wlTarikSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Masuk ke Akun</div><div class="wl-info-val">${formatRupiah(nominal)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (dari Wishlist)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Dipotong dari Wishlist</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(totalPotong)}</div></div>`;
}

function submitWlTarik() {
  if (!allowSubmit('submitWlTarik')) return;
  const errEl = document.getElementById('wlTarikErrMsg');
  errEl.style.display = 'none';
  const w = getWlById(wlTxId);
  if (!w) return;

  const nominal = parseInt(document.getElementById('wlTarikAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('wlTarikFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const note = document.getElementById('wlTarikNoteInput').value.trim();
  const totalPotong = nominal + fee;

  if (!nominal) { wlTxError(errEl, 'Nominal tarik wajib diisi'); return; }
  if (!wlTarikAccountId) { wlTxError(errEl, 'Pilih akun tujuan'); return; }
  if (totalPotong > w.balance) {
    wlTxError(errEl, `Saldo wishlist tidak cukup untuk nominal + biaya admin (butuh ${formatRupiah(totalPotong)}, tersedia ${formatRupiah(w.balance)})`);
    return;
  }

  const dest = sources.find(s => s.id === wlTarikAccountId);
  if (!dest) { wlTxError(errEl, 'Akun tidak ditemukan'); return; }

  const nowIso = new Date().toISOString();
  const dateStr = todayISO();
  const mainTxId = 'tx' + uniqueTick();
  const historyId = 'wh' + uniqueTick();

  dest.saldo += nominal;
  saveSources(sources);

  transactions.unshift({
    id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
    sourceId: w.id, destId: dest.id,
    note: note || `Tarik dari Wishlist: ${w.name}`, date: dateStr, time: nowTime(),
    isWishlistTx: true, wishlistId: w.id, wlHistoryId: historyId,
  });
  // Fee ditanggung Wishlist (bukan akun real), jadi sourceId dikosongkan —
  // tetep tercatat & kehitung sebagai pengeluaran kategori Biaya Admin/Fee.
  if (fee > 0) {
    transactions.unshift({
      id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: null,
      category: 'Biaya Admin/Fee', note: `Biaya admin tarik Wishlist: ${w.name}`,
      date: dateStr, time: nowTime(), isFee: true, wishlistId: w.id, feeOf: mainTxId,
    });
  }
  saveTransactions(transactions);

  const list = loadWishlists();
  const idx = list.findIndex(x => x.id === w.id);
  list[idx].balance -= totalPotong;
  list[idx].history = list[idx].history || [];
  list[idx].history.push({ id: historyId, type: 'tarik', amount: nominal, fee, note, date: nowIso, txId: mainTxId });
  list[idx].updatedAt = nowIso;
  saveWishlists(list);

  closeSheet('wlTarikOverlay');
  showToast('Tarik dana berhasil');
  renderAll();
  openWlDetail(w.id);
}

// ---------- GUNAKAN DANA ----------
function openWlGunakanDana(id) {
  const w = getWlById(id);
  if (!w) return;
  wlTxId = id;
  document.getElementById('wlGunakanNoteInput').value = '';
  document.getElementById('wlGunakanInfoCard').innerHTML = `
    <div class="wl-info-row"><i class="bi bi-cash-stack"></i><div class="wl-info-label">Saldo Digunakan</div><div class="wl-info-val">${formatRupiah(w.balance)}</div></div>
    <div class="wl-info-row"><i class="bi bi-tag"></i><div class="wl-info-label">Kategori</div><div class="wl-info-val">${escapeHtml(w.category)}</div></div>`;
  openSheet('wlGunakanOverlay');
}

function submitWlGunakanDana() {
  if (!allowSubmit('submitWlGunakanDana')) return;
  const w = getWlById(wlTxId);
  if (!w) return;
  if (w.completed) return; // sudah pernah digunakan, cegah tercatat dobel
  const note = document.getElementById('wlGunakanNoteInput').value.trim();
  const nowIso = new Date().toISOString();

  // Dicatat sebagai pengeluaran murni untuk kebutuhan Statistik & Budget kategori
  // terkait. sourceId sengaja null karena uangnya sudah keluar dari akun real
  // sejak proses Setor Dana — ini bukan pengurangan saldo akun kedua kalinya,
  // cuma catatan/ledger biar konsisten kehitung di laporan.
  const mainTxId = 'tx' + uniqueTick();
  transactions.unshift({
    id: mainTxId, type: 'keluar', amount: w.balance, sourceId: null,
    category: w.category, note: note || `Wishlist: ${w.name}`,
    date: todayISO(), time: nowTime(), isWishlistUsage: true, wishlistId: w.id,
  });
  saveTransactions(transactions);

  const list = loadWishlists();
  const idx = list.findIndex(x => x.id === w.id);
  list[idx].completed = true;
  list[idx].completedAt = nowIso;
  list[idx].updatedAt = nowIso;
  list[idx].history = list[idx].history || [];
  list[idx].history.push({ id: 'wh' + uniqueTick(), type: 'gunakan', amount: w.balance, fee: 0, note, date: nowIso, txId: mainTxId });
  saveWishlists(list);

  closeSheet('wlGunakanOverlay');
  showToast('Wishlist selesai — dana sudah digunakan');
  renderAll();
  openWlDetail(w.id);
}

// ---------- HAPUS WISHLIST ----------
function openWlHapusWishlist(id) {
  const w = getWlById(id);
  if (!w) return;

  if (w.balance <= 0) {
    nativeConfirm(`Hapus wishlist "${w.name}"? Tindakan ini tidak bisa dibatalkan.`, () => {
      const list = loadWishlists().filter(x => x.id !== id);
      saveWishlists(list);
      closeSheet('wlSettingsOverlay');
      showToast('Wishlist dihapus');
      renderAll();
      goTo('wishlist');
    });
    return;
  }

  wlTxId = id;
  wlHapusAccountId = null;
  document.getElementById('wlHapusFeeInput').value = '';
  document.getElementById('wlHapusErrMsg').style.display = 'none';
  wlResetAccountCard('wlHapusAccountCard', 'wlHapusAccountLabel', 'wlHapusAccountIconWrap', 'wlHapusAccountSub');
  renderWlHapusSummary();
  closeSheet('wlSettingsOverlay');
  openSheet('wlHapusOverlay');
}

// Kasus khusus: Hapus = tarik SELURUH saldo sekaligus tutup wishlist. Gak
// kayak Tarik biasa yang masih nyisa saldo buat "nampung" fee di luar
// nominal — di sini saldo yang ada itu-itu aja jumlahnya (gak nambah), jadi
// fee MAU TAK MAU diambil dari situ juga. Ini kasus wajar (mirip biaya admin
// tutup rekening yang dipotong dari sisa saldo akhir), bukan inkonsistensi.
function renderWlHapusSummary() {
  const w = getWlById(wlTxId);
  if (!w) return;
  const fee = parseInt(document.getElementById('wlHapusFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const diterima = Math.max(w.balance - fee, 0);
  document.getElementById('wlHapusSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Saldo Wishlist (ditutup)</div><div class="wl-info-val">${formatRupiah(w.balance)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (dari saldo)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Diterima Akun</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(diterima)}</div></div>`;
}

function submitWlHapus() {
  const errEl = document.getElementById('wlHapusErrMsg');
  errEl.style.display = 'none';
  const w = getWlById(wlTxId);
  if (!w) return;

  const fee = parseInt(document.getElementById('wlHapusFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  if (!wlHapusAccountId) { wlTxError(errEl, 'Pilih akun tujuan pemindahan dana'); return; }
  if (fee >= w.balance) { wlTxError(errEl, 'Biaya admin tidak boleh lebih besar dari saldo'); return; }

  nativeConfirm(`Hapus wishlist "${w.name}"? Dana akan dipindahkan dan wishlist dihapus permanen.`, () => {
    const dest = sources.find(s => s.id === wlHapusAccountId);
    if (!dest) { wlTxError(errEl, 'Akun tidak ditemukan'); return; }

    const diterima = w.balance - fee;
    const dateStr = todayISO();

    dest.saldo += diterima;
    saveSources(sources);

    transactions.unshift({
      id: 'tx' + uniqueTick(), type: 'transfer', amount: diterima, fee: 0,
      sourceId: w.id, destId: dest.id,
      note: `Hapus Wishlist: ${w.name}`, date: dateStr, time: nowTime(),
      isWishlistTx: true, wishlistId: w.id, wishlistName: w.name,
    });
    if (fee > 0) {
      transactions.unshift({
        id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: null,
        category: 'Biaya Admin/Fee', note: `Biaya admin hapus Wishlist: ${w.name}`,
        date: dateStr, time: nowTime(), isFee: true, wishlistId: w.id,
      });
    }
    saveTransactions(transactions);

    const list = loadWishlists().filter(x => x.id !== w.id);
    saveWishlists(list);

    closeSheet('wlHapusOverlay');
    showToast('Wishlist dihapus, dana dipindahkan');
    renderAll();
    goTo('wishlist');
  });
}

// ---------- SHARED: PICKER AKUN ----------
function wlOpenAccountPicker(mode) {
  wlTxAccountMode = mode;
  const list = wlLiquidAccounts();
  const listEl = document.getElementById('wlAccountList');
  if (!list.length) {
    listEl.innerHTML = `<div class="kt-empty" style="border:none;">Belum ada akun Cash/Bank/E-Wallet.</div>`;
  } else {
    listEl.innerHTML = list.map(s => {
      const ico = buildSourceIconHtml(s);
      return `
      <div class="picker-item" onclick="wlSelectAccount('${s.id}')">
        <div class="picker-item-icon" style="background:${ico.bg}; border-radius:10px;">
          ${ico.html}
        </div>
        <div>
          <div class="picker-item-name">${escapeHtml(s.name)}</div>
          <div class="picker-item-sub">${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}</div>
        </div>
      </div>`;
    }).join('');
  }
  openSheet('wlAccountPickerOverlay');
}

function wlSelectAccount(accId) {
  const s = sources.find(x => x.id === accId);
  if (!s) return;

  const map = {
    setor: { card: 'wlSetorAccountCard', label: 'wlSetorAccountLabel', icon: 'wlSetorAccountIconWrap', sub: 'wlSetorAccountSub' },
    tarik: { card: 'wlTarikAccountCard', label: 'wlTarikAccountLabel', icon: 'wlTarikAccountIconWrap', sub: 'wlTarikAccountSub' },
    hapus: { card: 'wlHapusAccountCard', label: 'wlHapusAccountLabel', icon: 'wlHapusAccountIconWrap', sub: 'wlHapusAccountSub' },
  };
  const ids = map[wlTxAccountMode];
  if (!ids) return;

  if (wlTxAccountMode === 'setor') wlSetorAccountId = s.id;
  if (wlTxAccountMode === 'tarik') wlTarikAccountId = s.id;
  if (wlTxAccountMode === 'hapus') wlHapusAccountId = s.id;

  document.getElementById(ids.label).textContent = s.name;
  const sub = document.getElementById(ids.sub);
  sub.textContent = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
  sub.style.display = 'block';
  const iconWrap = document.getElementById(ids.icon);
  const ico = buildSourceIconHtml(s);
  iconWrap.innerHTML = ico.html;
  iconWrap.style.background = ico.bg;
  iconWrap.style.color = '#fff';
  document.getElementById(ids.card).classList.remove('placeholder');

  closeSheet('wlAccountPickerOverlay');
}

function wlResetAccountCard(cardId, labelId, iconId, subId) {
  document.getElementById(labelId).textContent = 'Pilih akun';
  document.getElementById(iconId).innerHTML = `<i class="bi bi-wallet2"></i>`;
  document.getElementById(iconId).style.background = '';
  document.getElementById(iconId).style.color = '';
  document.getElementById(cardId).classList.add('placeholder');
  document.getElementById(subId).style.display = 'none';
}

// ---------- HELPERS ----------
function wlAddQuickAmount(inputId, v) {
  const el = document.getElementById(inputId);
  const current = parseInt((el.value || '0').replace(/[^\d]/g, ''), 10) || 0;
  el.value = (current + v).toLocaleString('id-ID');
  el.dispatchEvent(new Event('input'));
}

function wlSetMaxAmount(inputId, maxVal) {
  const el = document.getElementById(inputId);
  el.value = Math.max(maxVal, 0).toLocaleString('id-ID');
  el.dispatchEvent(new Event('input'));
}

function wlTxError(errEl, msg) {
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

// ======================================================
// PENGATURAN WISHLIST (Segmen C)
// ======================================================
function openWlSettingsSheet() {
  const w = getWlById(wlDetailId);
  if (!w) return;

  document.getElementById('wlSettingsBody').innerHTML = `
    <div class="wl-settings-section">
      <div class="wl-settings-section-title">Kelola Wishlist</div>
      <div class="wl-settings-item" onclick="closeSheet('wlSettingsOverlay'); openWishlistForm('${w.id}');">
        <i class="bi bi-pencil"></i><div class="wl-settings-item-label">Edit Wishlist</div>
      </div>
      <div class="wl-settings-item" onclick="closeSheet('wlSettingsOverlay'); openWishlistForm('${w.id}');">
        <i class="bi bi-star"></i><div class="wl-settings-item-label">Ubah Prioritas</div>
      </div>
      <div class="wl-settings-item" onclick="closeSheet('wlSettingsOverlay'); openWishlistForm('${w.id}');">
        <i class="bi bi-tag"></i><div class="wl-settings-item-label">Ubah Kategori</div>
      </div>
      <div class="wl-settings-item" onclick="closeSheet('wlSettingsOverlay'); openWishlistForm('${w.id}');">
        <i class="bi bi-wallet2"></i><div class="wl-settings-item-label">Ubah Tempat Menyimpan Uang</div>
      </div>
      <div class="wl-settings-item" onclick="closeSheet('wlSettingsOverlay'); openWishlistForm('${w.id}');">
        <i class="bi bi-calendar-event"></i><div class="wl-settings-item-label">Ubah Target &amp; Tanggal</div>
      </div>
      <div class="wl-settings-item" onclick="duplicateWishlist('${w.id}')">
        <i class="bi bi-files"></i><div class="wl-settings-item-label">Duplikat Wishlist</div>
      </div>
      <div class="wl-settings-item danger" onclick="openWlHapusWishlist('${w.id}')">
        <i class="bi bi-trash3"></i><div class="wl-settings-item-label">Hapus Wishlist</div>
      </div>
    </div>

    <div class="wl-settings-section">
      <div class="wl-settings-section-title">Lainnya</div>
      <div class="wl-settings-item" onclick="resetWlProgress('${w.id}')">
        <i class="bi bi-arrow-counterclockwise"></i><div class="wl-settings-item-label">Reset Progress</div>
      </div>
    </div>`;

  openSheet('wlSettingsOverlay');
}

function duplicateWishlist(id) {
  const w = getWlById(id);
  if (!w) return;
  const list = loadWishlists();
  const nowIso = new Date().toISOString();
  const copy = {
    ...w,
    id: 'wl' + uniqueTick(),
    name: w.name + ' (Copy)',
    balance: 0,
    completed: false,
    completedAt: null,
    history: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  list.push(copy);
  saveWishlists(list);
  closeSheet('wlSettingsOverlay');
  showToast('Wishlist diduplikat');
  goTo('wishlist');
}

function resetWlProgress(id) {
  const w = getWlById(id);
  if (!w) return;
  nativeConfirm(`Reset progress "${w.name}"? Saldo & riwayat tabungan akan dikosongkan.`, () => {
    const list = loadWishlists();
    const idx = list.findIndex(x => x.id === id);
    if (idx < 0) return;
    list[idx].balance = 0;
    list[idx].completed = false;
    list[idx].completedAt = null;
    list[idx].history = [];
    list[idx].updatedAt = new Date().toISOString();
    saveWishlists(list);
    closeSheet('wlSettingsOverlay');
    showToast('Progress direset');
    renderWlDetailPage();
  });
}

// ======================================================
// FORM TAMBAH / EDIT WISHLIST (Segmen B)
// ======================================================
let wlFormMode = 'add';      // 'add' | 'edit'
let wlFormEditId = null;
let wlFormReturnTo = 'list'; // 'list' | 'detail'
let wlFormPhoto = null;      // dataURL | null
let wlFormCategory = null;
let wlFormPriority = null;
let wlFormTargetDate = null; // ISO 'YYYY-MM-DD' | null
let wlFormPlanType = 'harian';

function openWishlistForm(id) {
  wlFormMode = id ? 'edit' : 'add';
  wlFormEditId = id || null;
  wlFormReturnTo = id ? 'detail' : 'list';
  const existing = id ? loadWishlists().find(w => w.id === id) : null;

  document.getElementById('wlFormTitle').textContent = existing ? 'Edit Wishlist' : 'Tambah Wishlist';
  document.getElementById('wlFormErrMsg').style.display = 'none';

  // Foto
  wlFormPhoto = existing ? (existing.photo || null) : null;
  wlFormPhotoAspect = existing ? (existing.photoAspect || '0.75') : '0.75';
  wlRenderPhotoPreview();

  // Nama
  document.getElementById('wlNameInput').value = existing ? existing.name : '';

  // Kategori
  wlFormCategory = existing ? existing.category : null;
  wlRenderFormCategoryCard();

  // Prioritas
  wlFormPriority = existing ? existing.priority : null;
  wlRenderFormPriorityCard();

  // Target nominal
  const targetInput = document.getElementById('wlTargetInput');
  targetInput.value = existing && existing.targetAmount ? existing.targetAmount.toLocaleString('id-ID') : '';

  // Target tanggal
  wlFormTargetDate = existing ? (existing.targetDate || null) : null;
  wlRenderFormDateCard();

  // Tempat menyimpan uang
  document.getElementById('wlStorageInput').value = existing ? (existing.storageNote || '') : '';

  // Rencana pengisian
  const planToggle = document.getElementById('wlPlanToggle');
  const planSection = document.getElementById('wlPlanSection');
  const planAmountInput = document.getElementById('wlPlanAmountInput');
  if (existing && existing.savingPlan) {
    planToggle.checked = true;
    planSection.style.display = 'block';
    wlFormPlanType = existing.savingPlan.type;
    planAmountInput.value = existing.savingPlan.amount.toLocaleString('id-ID');
  } else {
    planToggle.checked = false;
    planSection.style.display = 'none';
    wlFormPlanType = 'harian';
    planAmountInput.value = '';
  }
  document.querySelectorAll('.wl-plan-tab').forEach(el => el.classList.toggle('active', el.dataset.type === wlFormPlanType));

  // Catatan
  const noteInput = document.getElementById('wlNoteInput');
  noteInput.value = existing ? (existing.note || '') : '';
  document.getElementById('wlNoteCounter').textContent = noteInput.value.length + '/150';

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-wishlist-form').classList.add('active');
}

function closeWishlistForm() {
  if (wlFormReturnTo === 'detail' && wlFormEditId) { openWlDetail(wlFormEditId); return; }
  goTo('wishlist');
}

// ---------- Foto ----------
let wlFormPhotoAspect = '0.75'; // '1' | '0.75' (3:4) | '1.3333' (4:3) — rasio TERSIMPAN, dipakai di hero Detail
let wlCropInstance = null;
let wlCropSourceDataUrl = null;

function handleWlPhotoUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar'); return; }
  if (file.size > 8 * 1024 * 1024) { showToast('Ukuran foto maksimal 8MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    wlCropSourceDataUrl = e.target.result;
    openWlCropOverlay(wlFormPhotoAspect);
  };
  reader.readAsDataURL(file);
}

function editWlPhoto(e) {
  if (e) e.stopPropagation();
  if (!wlFormPhoto) return;
  wlCropSourceDataUrl = wlFormPhoto; // crop ulang dari foto yang udah tersimpan
  openWlCropOverlay(wlFormPhotoAspect);
}

function removeWlPhoto(e) {
  if (e) e.stopPropagation();
  wlFormPhoto = null;
  document.getElementById('wlPhotoInput').value = '';
  wlRenderPhotoPreview();
}

function wlRenderPhotoPreview() {
  const box = document.getElementById('wlPhotoBox');
  const preview = document.getElementById('wlPhotoPreview');
  if (wlFormPhoto) {
    document.getElementById('wlPhotoPreviewImg').src = wlFormPhoto;
    preview.style.aspectRatio = String(parseFloat(wlFormPhotoAspect || '0.75'));
    box.style.display = 'none';
    preview.style.display = 'block';
  } else {
    box.style.display = 'flex';
    preview.style.display = 'none';
  }
}

// ---------- Crop Foto (Cropper.js) ----------
function openWlCropOverlay(initialRatio) {
  const overlay = document.getElementById('wlCropOverlay');
  const img = document.getElementById('wlCropImage');
  img.src = wlCropSourceDataUrl;

  document.querySelectorAll('.wl-crop-aspect-tab').forEach(el =>
    el.classList.toggle('active', el.dataset.ratio === String(initialRatio)));

  overlay.classList.add('open');

  // Cropper butuh gambar sudah ke-load di DOM dulu baru bisa di-init
  const initCropper = () => {
    if (wlCropInstance) { wlCropInstance.destroy(); wlCropInstance = null; }
    wlCropInstance = new Cropper(img, {
      aspectRatio: parseFloat(initialRatio),
      viewMode: 1,
      dragMode: 'move',
      autoCropArea: 1,
      background: false,
      responsive: true,
      guides: false,
      center: false,
      highlight: false,
    });
  };
  if (img.complete) initCropper(); else img.onload = initCropper;
}

function setWlCropAspect(ratio, el) {
  document.querySelectorAll('.wl-crop-aspect-tab').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  wlFormPhotoAspect = ratio;
  if (wlCropInstance) wlCropInstance.setAspectRatio(parseFloat(ratio));
}

function cancelWlCrop() {
  document.getElementById('wlCropOverlay').classList.remove('open');
  if (wlCropInstance) { wlCropInstance.destroy(); wlCropInstance = null; }
}

function confirmWlCrop() {
  if (!wlCropInstance) return;
  // Resolusi output disesuaikan rasio, dijaga gak kegedean (hemat storage)
  const outSizes = { '1': [720, 720], '0.75': [720, 960], '1.3333': [960, 720] };
  const [w, h] = outSizes[wlFormPhotoAspect] || [720, 960];
  const canvas = wlCropInstance.getCroppedCanvas({ width: w, height: h, imageSmoothingQuality: 'high' });
  wlFormPhoto = canvas.toDataURL('image/jpeg', 0.85);
  wlRenderPhotoPreview();
  cancelWlCrop();
}

// ---------- Kategori ----------
function wlFormOpenCategoryPicker() {
  const list = (categories && categories.keluar) || [];
  document.getElementById('wlFormCategoryList').innerHTML = list.map(c => `
    <div class="picker-item" onclick="wlFormSelectCategory('${c}')">
      <div class="picker-item-icon" style="background:${(categoryColors && categoryColors[c]) || 'var(--primary-100)'}">
        <i class="bi ${(categoryIcons && categoryIcons[c]) || 'bi-circle'}" style="color:#fff"></i>
      </div>
      <div class="picker-item-name">${c}</div>
    </div>`).join('');
  openSheet('wlFormCategoryPickerOverlay');
}

function wlFormSelectCategory(cat) {
  wlFormCategory = cat;
  wlRenderFormCategoryCard();
  closeSheet('wlFormCategoryPickerOverlay');
}

function wlRenderFormCategoryCard() {
  const card = document.getElementById('wlCategoryCard');
  const label = document.getElementById('wlCategoryLabel');
  const iconWrap = document.getElementById('wlCategoryIconWrap');
  if (wlFormCategory) {
    label.textContent = wlFormCategory;
    iconWrap.innerHTML = `<i class="bi ${(categoryIcons && categoryIcons[wlFormCategory]) || 'bi-circle'}"></i>`;
    iconWrap.style.background = (categoryColors && categoryColors[wlFormCategory]) || 'var(--ink-300)';
    iconWrap.style.color = '#fff';
    card.classList.remove('placeholder');
  } else {
    label.textContent = 'Pilih kategori';
    iconWrap.innerHTML = `<i class="bi bi-grid"></i>`;
    iconWrap.style.background = '';
    iconWrap.style.color = '';
    card.classList.add('placeholder');
  }
}

// ---------- Prioritas ----------
function wlFormOpenPriorityPicker() {
  document.getElementById('wlFormPriorityList').innerHTML = Object.keys(WL_PRIORITY_META).map(key => {
    const pr = WL_PRIORITY_META[key];
    return `
      <div class="picker-item" onclick="wlFormSelectPriority('${key}')">
        <div class="picker-item-icon" style="background:${pr.color}"><i class="bi ${pr.icon}" style="color:#fff"></i></div>
        <div class="picker-item-name">${pr.label}</div>
      </div>`;
  }).join('');
  openSheet('wlFormPriorityPickerOverlay');
}

function wlFormSelectPriority(key) {
  wlFormPriority = key;
  wlRenderFormPriorityCard();
  closeSheet('wlFormPriorityPickerOverlay');
}

function wlRenderFormPriorityCard() {
  const card = document.getElementById('wlPriorityCard');
  const label = document.getElementById('wlPriorityLabel');
  const iconWrap = document.getElementById('wlPriorityIconWrap');
  const pr = wlFormPriority ? WL_PRIORITY_META[wlFormPriority] : null;
  if (pr) {
    label.textContent = pr.label;
    iconWrap.innerHTML = `<i class="bi ${pr.icon}"></i>`;
    iconWrap.style.background = pr.color;
    iconWrap.style.color = '#fff';
    card.classList.remove('placeholder');
  } else {
    label.textContent = 'Pilih prioritas';
    iconWrap.innerHTML = `<i class="bi bi-star"></i>`;
    iconWrap.style.background = '';
    iconWrap.style.color = '';
    card.classList.add('placeholder');
  }
}

// ---------- Target Tanggal ----------
function wlFormOpenDatePicker() {
  openDatePicker('tanggal', { value: wlFormTargetDate || todayISO() }, (res) => {
    wlFormTargetDate = res.date;
    wlRenderFormDateCard();
  });
}

function wlRenderFormDateCard() {
  const label = document.getElementById('wlTargetDateLabel');
  if (wlFormTargetDate) {
    const [y, m, d] = wlFormTargetDate.split('-').map(Number);
    label.textContent = `${d} ${bulanPanjang[m - 1]} ${y}`;
  } else {
    label.textContent = 'Pilih tanggal';
  }
}

// ---------- Rencana Pengisian ----------
function toggleWlPlanSection() {
  const on = document.getElementById('wlPlanToggle').checked;
  document.getElementById('wlPlanSection').style.display = on ? 'block' : 'none';
}

function setWlPlanType(type) {
  wlFormPlanType = type;
  document.querySelectorAll('.wl-plan-tab').forEach(el => el.classList.toggle('active', el.dataset.type === type));
}

// ---------- Simpan ----------
function saveWishlistForm() {
  const errEl = document.getElementById('wlFormErrMsg');
  errEl.style.display = 'none';

  const name = document.getElementById('wlNameInput').value.trim();
  const targetAmount = parseInt(document.getElementById('wlTargetInput').value.replace(/[^\d]/g, ''), 10) || 0;

  if (!name) { wlFormError('Nama wishlist wajib diisi'); return; }
  if (!wlFormCategory) { wlFormError('Kategori wajib dipilih'); return; }
  if (!wlFormPriority) { wlFormError('Prioritas wajib dipilih'); return; }
  if (!targetAmount) { wlFormError('Target nominal wajib diisi'); return; }
  if (!wlFormTargetDate) { wlFormError('Target tanggal wajib dipilih'); return; }

  let savingPlan = null;
  if (document.getElementById('wlPlanToggle').checked) {
    const planAmount = parseInt(document.getElementById('wlPlanAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
    if (planAmount > 0) savingPlan = { type: wlFormPlanType, amount: planAmount };
  }

  const note = document.getElementById('wlNoteInput').value.trim();
  const storageNote = document.getElementById('wlStorageInput').value.trim();
  const nowIso = new Date().toISOString();

  const list = loadWishlists();

  if (wlFormMode === 'edit' && wlFormEditId) {
    const idx = list.findIndex(w => w.id === wlFormEditId);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        name, category: wlFormCategory, priority: wlFormPriority,
        targetAmount, targetDate: wlFormTargetDate,
        storageNote, note, photo: wlFormPhoto, photoAspect: wlFormPhotoAspect, savingPlan,
        updatedAt: nowIso,
      };
    }
  } else {
    list.push({
      id: 'wl' + uniqueTick(),
      name, photo: wlFormPhoto, photoAspect: wlFormPhotoAspect,
      category: wlFormCategory, priority: wlFormPriority,
      targetAmount, targetDate: wlFormTargetDate,
      storageNote, note,
      balance: 0, completed: false, completedAt: null,
      savingPlan,
      reminders: { tabungan: true, jatuhTempoSebelum: true, jatuhTempoSetelah: false },
      history: [],
      createdAt: nowIso, updatedAt: nowIso,
    });
  }

  saveWishlists(list);
  showToast(wlFormMode === 'edit' ? 'Wishlist diperbarui' : 'Wishlist ditambahkan');
  if (wlFormReturnTo === 'detail' && wlFormEditId) { openWlDetail(wlFormEditId); return; }
  goTo('wishlist');
}

function wlFormError(msg) {
  const errEl = document.getElementById('wlFormErrMsg');
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

// ======================================================
// KALKULATOR TARGET (Segmen B)
// ======================================================
let wlCalcDate = null;

function openWlCalculator() {
  const nominalInput = document.getElementById('wlCalcNominalInput');
  const formTarget = document.getElementById('wlTargetInput').value.replace(/[^\d]/g, '');
  nominalInput.value = formTarget ? parseInt(formTarget, 10).toLocaleString('id-ID') : '';

  wlCalcDate = wlFormTargetDate || null;
  document.getElementById('wlCalcDateLabel').textContent = wlCalcDate
    ? (() => { const [y, m, d] = wlCalcDate.split('-').map(Number); return `${d} ${bulanPanjang[m - 1]} ${y}`; })()
    : 'Pilih tanggal';

  document.getElementById('wlCalcResultWrap').style.display = 'none';
  openSheet('wlCalculatorOverlay');
}

function wlCalcOpenDatePicker() {
  openDatePicker('tanggal', { value: wlCalcDate || todayISO() }, (res) => {
    wlCalcDate = res.date;
    const [y, m, d] = wlCalcDate.split('-').map(Number);
    document.getElementById('wlCalcDateLabel').textContent = `${d} ${bulanPanjang[m - 1]} ${y}`;
  });
}

function hitungWlRencana() {
  const nominal = parseInt(document.getElementById('wlCalcNominalInput').value.replace(/[^\d]/g, ''), 10) || 0;
  if (!nominal) { showToast('Isi nominal target dulu'); return; }
  if (!wlCalcDate) { showToast('Pilih tanggal tercapai dulu'); return; }

  const days = Math.round((new Date(wlCalcDate) - new Date(todayISO())) / 86400000);
  if (days <= 0) { showToast('Tanggal tercapai harus setelah hari ini'); return; }

  const weeks = Math.max(1, Math.floor(days / 7));
  const months = Math.max(1, Math.floor(days / 30));

  const harian = Math.floor(nominal / days);
  const mingguan = Math.floor(nominal / weeks);
  const bulanan = Math.floor(nominal / months);

  const [y, m, d] = wlCalcDate.split('-').map(Number);
  document.getElementById('wlCalcSummaryLabel').textContent =
    `Target: ${formatRupiah(nominal)} • ${d} ${bulanPanjang[m - 1]} ${y} (${days} Hari)`;

  document.getElementById('wlCalcResultList').innerHTML = `
    <div class="wl-calc-card">
      <div>
        <div class="wl-calc-card-label">Harian</div>
        <div class="wl-calc-card-sub">${formatRupiah(harian)} · Selama ${days} Hari</div>
      </div>
      <button class="wl-calc-card-pick" onclick="pilihWlRencana('harian', ${harian})">Pilih</button>
    </div>
    <div class="wl-calc-card">
      <div>
        <div class="wl-calc-card-label">Mingguan</div>
        <div class="wl-calc-card-sub">${formatRupiah(mingguan)} · Selama ${weeks} Minggu</div>
      </div>
      <button class="wl-calc-card-pick" onclick="pilihWlRencana('mingguan', ${mingguan})">Pilih</button>
    </div>
    <div class="wl-calc-card">
      <div>
        <div class="wl-calc-card-label">Bulanan</div>
        <div class="wl-calc-card-sub">${formatRupiah(bulanan)} · Selama ${months} Bulan</div>
      </div>
      <button class="wl-calc-card-pick" onclick="pilihWlRencana('bulanan', ${bulanan})">Pilih</button>
    </div>`;

  document.getElementById('wlCalcResultWrap').style.display = 'block';
}

function pilihWlRencana(type, amount) {
  // Sinkron balik ke form utama
  document.getElementById('wlPlanToggle').checked = true;
  document.getElementById('wlPlanSection').style.display = 'block';
  setWlPlanType(type);
  document.getElementById('wlPlanAmountInput').value = amount.toLocaleString('id-ID');

  const nominal = parseInt(document.getElementById('wlCalcNominalInput').value.replace(/[^\d]/g, ''), 10) || 0;
  if (nominal) document.getElementById('wlTargetInput').value = nominal.toLocaleString('id-ID');
  if (wlCalcDate) { wlFormTargetDate = wlCalcDate; wlRenderFormDateCard(); }

  closeSheet('wlCalculatorOverlay');
  showToast('Rencana pengisian diterapkan');
}

// ======================================================
// SEARCH
// ======================================================
function filterWishlistSearch() {
  wlSearchVal = document.getElementById('wlSearchInput').value.toLowerCase();
  renderWishlistPage();
}

// ======================================================
// FILTER SHEET (Kategori + Prioritas) — pola sama seperti Riwayat
// ======================================================
function openWlFilterSheet() {
  wlDraft = { catFilter: [...wlCatFilter], priorityFilter: [...wlPriorityFilter] };
  renderWlFilterSheet();
  openSheet('wlFilterOverlay');
}

function closeWlFilterSheet() { closeSheet('wlFilterOverlay'); }

function renderWlFilterSheet() {
  const catWrap = document.getElementById('wlfCatChips');
  const cats = (categories && categories.keluar) || [];
  catWrap.innerHTML = cats.map(c => `
    <div class="rw-fchip ${wlDraft.catFilter.includes(c) ? 'active' : ''}" onclick="wlDraftToggleCat('${c}')">
      <i class="bi ${(categoryIcons && categoryIcons[c]) || 'bi-circle'}"></i>${c}
    </div>`).join('');

  const prWrap = document.getElementById('wlfPriorityChips');
  prWrap.innerHTML = Object.keys(WL_PRIORITY_META).map(key => {
    const pr = WL_PRIORITY_META[key];
    return `
      <div class="rw-fchip ${wlDraft.priorityFilter.includes(key) ? 'active' : ''}" onclick="wlDraftTogglePriority('${key}')">
        <i class="bi ${pr.icon}"></i>${pr.label}
      </div>`;
  }).join('');
}

function wlDraftToggleCat(cat) {
  const idx = wlDraft.catFilter.indexOf(cat);
  if (idx >= 0) wlDraft.catFilter.splice(idx, 1); else wlDraft.catFilter.push(cat);
  renderWlFilterSheet();
}

function wlDraftTogglePriority(key) {
  const idx = wlDraft.priorityFilter.indexOf(key);
  if (idx >= 0) wlDraft.priorityFilter.splice(idx, 1); else wlDraft.priorityFilter.push(key);
  renderWlFilterSheet();
}

function applyWlFilter() {
  wlCatFilter = [...wlDraft.catFilter];
  wlPriorityFilter = [...wlDraft.priorityFilter];
  closeWlFilterSheet();
  renderWishlistPage();
}

function resetWlFilter() {
  wlCatFilter = [];
  wlPriorityFilter = [];
  if (wlDraft) { wlDraft.catFilter = []; wlDraft.priorityFilter = []; renderWlFilterSheet(); }
  renderWishlistPage();
}

function removeWlCatFilter(c) { wlCatFilter = wlCatFilter.filter(x => x !== c); renderWishlistPage(); }
function removeWlPriorityFilter(p) { wlPriorityFilter = wlPriorityFilter.filter(x => x !== p); renderWishlistPage(); }

function renderWlActiveChips() {
  const wrap = document.getElementById('wlActiveChips');
  const chips = [];
  wlPriorityFilter.forEach(p => {
    const pr = WL_PRIORITY_META[p];
    if (pr) chips.push({ label: pr.label, onclick: `removeWlPriorityFilter('${p}')` });
  });
  wlCatFilter.forEach(c => chips.push({ label: c, onclick: `removeWlCatFilter('${c}')` }));

  if (!chips.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = `
    <button class="rw-chip-clear-all" onclick="resetWlFilter()"><i class="bi bi-x"></i> Hapus</button>
    ${chips.map(c => `<div class="rw-active-chip">${c.label}<i class="bi bi-x" onclick="${c.onclick}"></i></div>`).join('')}`;
}

function updateWlFilterBadge() {
  const count = wlCatFilter.length + wlPriorityFilter.length;
  const badge = document.getElementById('wlFilterBadge');
  const btn = document.getElementById('wlFilterBtn');
  if (count > 0) {
    badge.textContent = count; badge.style.display = 'flex'; btn.classList.add('has-filter');
  } else {
    badge.style.display = 'none'; btn.classList.remove('has-filter');
  }
}
