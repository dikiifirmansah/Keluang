// ======================================================
// MODULE: App (Dashboard, Transaksi, Riwayat)
// STATUS: Aktif
// ======================================================

// ======================================================
// DEPENDENCIES
// ======================================================
// storage.js via global scope

// ======================================================
// DATA: SHARED STATE
// ======================================================
let sources = loadSources();
let transactions = loadTransactions();
let profile = loadProfile();

// Categories and theme are initialized after DOM load (see bottom of file)

// ======================================================
// HELPER: Format Rupiah
// ======================================================
// Helper: render icon akun — prioritaskan customIcon (logo app) jika ada
function buildSourceIconHtml(s) {
  if (s && s.customIcon) {
    return { html: `<img src="${s.customIcon}" style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`, bg: 'var(--surface-sunken)' };
  }
  const jenis = s ? s.jenis : null;
  return {
    html: `<i class="bi ${sourceIcons[jenis] || 'bi-wallet2'}" style="color:#fff; font-size:16px;"></i>`,
    bg: sourceTypeColors[jenis] || 'var(--ink-300)'
  };
}

function formatRupiah(n) {
  return 'Rp' + Math.round(n).toLocaleString('id-ID');
}

function formatRupiahShort(n) {
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1000000) return sign + (abs/1000000).toFixed(1).replace(/\.0$/,'') + 'jt';
  if (abs >= 1000) return sign + Math.round(abs/1000) + 'rb';
  return sign + abs.toString();
}

// ======================================================
// HELPER: Date / Time
// ======================================================
// todayISO() didefinisikan di storage.js — tidak diduplikasi di sini

function nowTime() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}

const bulanSingkat = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const bulanPanjang = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

function formatTxDate(iso) {
  if (!iso) return 'Hari ini';
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const todayP = todayISO().split('-');
  if (y === todayP[0] && m === todayP[1] && d === todayP[2]) return 'Hari ini';
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yISO = `${yesterday.getFullYear()}-${(yesterday.getMonth()+1).toString().padStart(2,'0')}-${yesterday.getDate().toString().padStart(2,'0')}`;
  if (iso === yISO) return 'Kemarin';
  return `${parseInt(d,10)} ${bulanSingkat[parseInt(m,10)-1]} ${y}`;
}

// Format tanggal panjang untuk daftar riwayat (mis. "12 Jul 2026").
// Dipusatkan di sini supaya semua modul riwayat (Dana Darurat, Wishlist, dst)
// tampil konsisten, dan tidak masing-masing manggil toLocaleDateString sendiri.
function formatHistoryDateID(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${bulanSingkat[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTanggalLabel(dateStr) {
  if (!dateStr) return '—';
  const [y,m,d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return `${d} ${bulanSingkat[m-1]} ${y}`;
}

function relativeDayLabel(dateStr) {
  if (!dateStr) return '';
  const today = todayISO();
  if (dateStr === today) return 'Hari ini';
  const d1 = new Date(dateStr + 'T00:00:00');
  const d0 = new Date(today + 'T00:00:00');
  const diffDays = Math.round((d1 - d0) / 86400000);
  if (diffDays === -1) return 'Kemarin';
  if (diffDays === 1) return 'Besok';
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  return hari[d1.getDay()];
}

function isoOf(d) {
  return `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
}

function inRange(dateISO, from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return true;
  return dateISO >= from && dateISO <= to;
}

function isInPeriod(dateISO, period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return true;
  const d = new Date(dateISO + 'T00:00:00');
  const now = new Date();
  if (period === 'Minggu ini') {
    const startOfWeek = new Date(now);
    const dayNum = (now.getDay() + 6) % 7;
    startOfWeek.setDate(now.getDate() - dayNum);
    startOfWeek.setHours(0,0,0,0);
    return d >= startOfWeek && d <= now;
  }
  if (period === 'Tahun ini') {
    return d.getFullYear() === now.getFullYear();
  }
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function monthRangeOf(y, m) {
  const lastDay = new Date(y, m+1, 0).getDate();
  return { from: `${y}-${(m+1).toString().padStart(2,'0')}-01`, to: `${y}-${(m+1).toString().padStart(2,'0')}-${lastDay.toString().padStart(2,'0')}` };
}

// ======================================================
// ROUTER
// ======================================================
function goTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
  if (pageId === 'riwayat') renderRiwayat();
  if (pageId === 'kantong') renderKantong();
  if (pageId === 'statistik') renderStatistik();
  if (pageId === 'pengaturan') renderProfile();
  if (pageId === 'budget') initBudget();
  if (pageId === 'budget-detail') renderBudgetDetailPage();
  if (pageId === 'wishlist') initWishlist();
  if (pageId === 'darurat') initDanaDarurat();
  if (pageId === 'utang') initUtangPiutang();
  if (pageId === 'jurnal') initJurnalInvestasi();
  if (pageId === 'jurnal-detail') renderJrDetailPage();
  if (pageId === 'jurnal-evaluasi') renderJrEvaluasiPage();
}

// ======================================================
// PLACEHOLDER
// ======================================================
const placeholderMeta = {
  budget: {
    name: 'Budget',
    desc: 'Rencanakan pengeluaran bulanan kamu dengan anggaran kategori yang fleksibel.',
    icon: 'fi fi-ss-calculator-money',
    color: 'var(--accent2)',
  },
  darurat: {
    name: 'Dana Darurat',
    desc: 'Sisihkan dana cadangan yang aman dan mudah diakses kapan saja dibutuhkan.',
    icon: 'fi fi-sr-light-emergency-on',
    color: '#C0365F',
  },
  wishlist: {
    name: 'Wishlist',
    desc: 'Pantau dan rencanakan pembelian impianmu agar tidak bocor tanpa rencana.',
    icon: 'fi fi-ss-wishlist-heart',
    color: 'var(--warning)',
  },
  utang: {
    name: 'Utang-Piutang',
    desc: 'Catat pinjaman dan tagihan agar tidak ada yang terlewat atau terlupakan.',
    icon: 'fi fi-sr-handshake-deal-loan',
    color: '#6836C4',
  },
  jurnal: {
    name: 'Jurnal Investasi',
    desc: 'Lacak portofolio dan pertumbuhan investasimu dalam satu tempat.',
    icon: 'fi fi-ss-newspaper-open',
    color: '#0F7D6E',
  },
  kantong: {
    name: 'Akun',
    desc: 'Kelola berbagai dompet dan sumber dana dalam satu tampilan yang rapi.',
    icon: 'fi fi-sr-wallet-buyer',
    color: 'var(--primary)',
  },
  statistik: {
    name: 'Statistik',
    desc: 'Lihat pola pengeluaran dan tren keuangan kamu secara visual.',
    icon: 'fi fi-ss-chart-pie-simple-circle-dollar',
    color: 'var(--primary)',
  },
  riwayat: {
    name: 'Riwayat',
    desc: 'Telusuri semua transaksi masa lalu dengan filter tanggal dan kategori.',
    icon: 'fi fi-ss-receipt',
    color: 'var(--primary)',
  },
};

function goToPlaceholder(id) {
  if (id === 'kantong') { goTo('kantong'); return; }
  if (id === 'riwayat') { goTo('riwayat'); return; }
  if (id === 'statistik') { goTo('statistik'); return; }
  const meta = placeholderMeta[id];
  if (!meta) return;
  document.getElementById('placeholderTitle').textContent = meta.name;
  document.getElementById('placeholderSubtitle').textContent = (featureDefs[id] && featureDefs[id].sub) || '';
  document.getElementById('placeholderName').textContent = meta.name;
  document.getElementById('placeholderDesc').textContent = meta.desc;
  const iconEl = document.getElementById('placeholderIcon');
  iconEl.className = meta.icon;
  iconEl.style.color = meta.color;
  const badge = document.querySelector('.placeholder-badge span');
  badge.textContent = 'Belum tersedia';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-placeholder').classList.add('active');
}

// ======================================================
// SHORTCUT DATA
// ======================================================
const featureDefs = {
  budget: {
    name: 'Budget',
    short: 'Budget',
    sub: 'Rencanakan pengeluaran',
    color: 'c-blue',
    icon: 'fi fi-ss-calculator-money',
    locked: false,
  },
  darurat: {
    name: 'Dana Darurat',
    short: 'Darurat',
    sub: 'Sisihkan dana cadangan',
    color: 'c-rose',
    icon: 'fi fi-sr-light-emergency-on',
    locked: false,
  },
  wishlist: {
    name: 'Wishlist',
    short: 'Wishlist',
    sub: 'Rencanakan impianmu',
    color: 'c-amber',
    icon: 'fi fi-ss-wishlist-heart',
    locked: false,
  },
  utang: {
    name: 'Utang-Piutang',
    short: 'Utang',
    sub: 'Catat pinjaman & tagihan',
    color: 'c-violet',
    icon: 'fi fi-sr-handshake-deal-loan',
    locked: false,
  },
  jurnal: {
    name: 'Jurnal Investasi',
    short: 'Jurnal',
    sub: 'Lacak portofolio',
    color: 'c-teal',
    icon: 'fi fi-ss-newspaper-open',
    locked: false,
  },
  kantong: {
    name: 'Akun',
    short: 'Akun',
    sub: 'Kelola sumber dana',
    color: 'c-ink',
    icon: 'fi fi-sr-wallet-buyer',
    locked: false,
  },
  statistik: {
    name: 'Statistik',
    short: 'Statistik',
    sub: 'Lihat grafik & analisa',
    color: 'c-pink',
    icon: 'fi fi-ss-chart-pie-simple-circle-dollar',
    locked: false,
  },
  riwayat: {
    name: 'Riwayat',
    short: 'Riwayat',
    sub: 'Telusuri transaksi',
    color: 'c-indigo',
    icon: 'fi fi-ss-receipt',
    locked: false,
  },
};

const defaultOrder = ['budget','darurat','wishlist','utang','jurnal','kantong','statistik','riwayat'];
let shortcutOrder = loadShortcutOrder(defaultOrder);

const GRID_CAPACITY = 8; // grid 4x2 di Beranda

let homeEditMode = false;

function toggleHomeEditMode() {
  homeEditMode = !homeEditMode;
  const link = document.getElementById('aturUrutanLink');
  if (link) link.textContent = homeEditMode ? 'Selesai' : 'Atur Urutan';
  renderShortcutGrid();
  if (homeEditMode) showToast('Tahan dan geser untuk mengubah urutan');
}

function renderShortcutGrid() {
  const grid = document.getElementById('shortcutGrid');

  // Filter out stale IDs from localStorage that no longer exist in featureDefs
  const validOrder = shortcutOrder.filter(id => featureDefs[id]);
  if (validOrder.length !== shortcutOrder.length) {
    // Reset to default if stale IDs found
    shortcutOrder = [...defaultOrder];
    saveShortcutOrder(shortcutOrder);
  }

  const totalFeatures = Object.keys(featureDefs).length;
  const fitsAll = totalFeatures <= GRID_CAPACITY;
  const linkEl = document.getElementById('aturUrutanLink');

  if (fitsAll) {
    if (linkEl) linkEl.style.display = 'block';
    grid.innerHTML = shortcutOrder.map(id => shortcutItemHTML(id, homeEditMode)).join('');
    if (homeEditMode) attachHomeGridDrag();
    return;
  }

  if (linkEl) linkEl.style.display = 'none';
  homeEditMode = false;
  const visible = shortcutOrder.slice(0, GRID_CAPACITY - 1);
  let html = visible.map(id => shortcutItemHTML(id, false)).join('');
  html += `
    <div class="shortcut-item more" onclick="goTo('beranda')">
      <div class="shortcut-icon" style="color: white;">
        <i class="bi bi-grid-fill"></i>
      </div>
      <div class="shortcut-label">Lainnya</div>
    </div>`;
  grid.innerHTML = html;
}

function shortcutItemHTML(id, editMode) {
  const d = featureDefs[id];
  return `
    <div class="shortcut-item ${editMode ? 'edit-mode' : ''}" data-id="${id}" onclick="shortcutItemClick(event,'${id}')">
      <div class="shortcut-icon ${d.color}">
        <i class="${d.icon}"></i>
        ${d.locked && !editMode ? '<div class="lock-badge"><i class="bi bi-lock"></i></div>' : ''}
      </div>
      <div class="shortcut-label">${d.short}</div>
      ${editMode ? '<div class="drag-handle"><i class="bi bi-grip-vertical"></i></div>' : ''}
    </div>`;
}

function shortcutItemClick(e, id) {
  if (homeEditMode) return;
  if (id === 'budget') { goTo('budget'); return; }
  if (id === 'wishlist') { goTo('wishlist'); return; }
  if (id === 'darurat') { goTo('darurat'); return; }
  if (id === 'utang') { goTo('utang'); return; }
  if (id === 'jurnal') { goTo('jurnal'); return; }
  goToPlaceholder(id);
}

function attachHomeGridDrag() {
  const grid = document.getElementById('shortcutGrid');
  let dragItem = null, dragOverItem = null;
  const items = () => Array.from(grid.querySelectorAll('.shortcut-item'));

  items().forEach(item => {
    item.setAttribute('draggable', 'true');

    item.addEventListener('dragstart', () => { dragItem = item; item.classList.add('dragging'); });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      dragOverItem = item;
      items().forEach(i => i.classList.remove('drag-over'));
      item.classList.add('drag-over');
    });
    item.addEventListener('dragend', () => {
      items().forEach(i => i.classList.remove('drag-over', 'dragging'));
      if (dragItem && dragOverItem && dragItem !== dragOverItem) {
        reorderShortcut(dragItem.dataset.id, dragOverItem.dataset.id);
      }
      dragItem = null; dragOverItem = null;
    });

    // Touch support
    item.addEventListener('touchstart', () => { item._dragId = item.dataset.id; }, { passive: true });
    item.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      const target = document.elementFromPoint(t.clientX, t.clientY);
      const candidate = target && target.closest('.shortcut-item');
      if (candidate && candidate !== item) {
        items().forEach(i => i.classList.remove('drag-over'));
        candidate.classList.add('drag-over');
        item._dragOverId = candidate.dataset.id;
      }
    }, { passive: false });
    item.addEventListener('touchend', () => {
      items().forEach(i => i.classList.remove('drag-over'));
      if (item._dragId && item._dragOverId && item._dragId !== item._dragOverId) {
        reorderShortcut(item._dragId, item._dragOverId);
      }
      item._dragId = null; item._dragOverId = null;
    }, { passive: true });
  });
}

function reorderShortcut(fromId, toId) {
  const fromIdx = shortcutOrder.indexOf(fromId);
  const toIdx = shortcutOrder.indexOf(toId);
  if (fromIdx === -1 || toIdx === -1) return;
  const [removed] = shortcutOrder.splice(fromIdx, 1);
  shortcutOrder.splice(toIdx, 0, removed);
  saveShortcutOrder(shortcutOrder);
  renderShortcutGrid();
  showToast('Urutan disimpan');
}

// ======================================================
// HERO
// ======================================================
let eyeHidden = false;
let heroPeriod = 'Bulan ini';

function setHeroMode(mode) {
  document.getElementById('toggleTersedia').classList.toggle('active', mode === 'tersedia');
  document.getElementById('toggleNetWorth').classList.toggle('active', mode === 'networth');
  document.getElementById('toggleLiabilitas').classList.toggle('active', mode === 'liabilitas');
  renderAmount(mode);
}

// Komponen Net Worth. Semua modul (Wishlist, Dana Darurat, Utang-Piutang,
// Jurnal Investasi) sudah aktif dan punya data model sendiri-sendiri.
function getNetWorthComponents() {
  const liquidTotal = sources.filter(s => s.kategori === 'liquid').reduce((a,s) => a + s.saldo, 0);
  const investTotal = sources.filter(s => s.kategori === 'invest').reduce((a,s) => a + s.saldo, 0);
  const jurnalInvestasiTotal = calcJurnalInvestasiTotal();
  // Wishlist tetap milik user selama belum "Gunakan Dana" (belum dibelanjakan
  // keluar dari net worth). Yang Selesai sudah jadi pengeluaran nyata, gak
  // dihitung lagi di sini — biar gak dobel sama transaksi Keluar-nya.
  const wishlistTotal = loadWishlists().filter(w => !w.completed).reduce((a, w) => a + w.balance, 0);
  const danaDaruratTotal = getDanaDaruratTotal();
  const { utangTotal, piutangTotal } = getUtangPiutangTotals();
  return { liquidTotal, investTotal, jurnalInvestasiTotal, wishlistTotal, danaDaruratTotal, piutangTotal, utangTotal };
}

function renderAmount(mode) {
  const c = getNetWorthComponents();
  let val;
  if (mode === 'liabilitas') {
    val = c.utangTotal;
  } else if (mode === 'networth') {
    val = c.liquidTotal + c.investTotal + c.jurnalInvestasiTotal + c.wishlistTotal + c.danaDaruratTotal + c.piutangTotal - c.utangTotal;
  } else {
    val = c.liquidTotal;
  }
  const heroEl = document.getElementById('heroAmount');
  heroEl.classList.toggle('neg', mode === 'liabilitas');
  document.getElementById('heroAmountVal').textContent = eyeHidden ? '••••••' : Math.round(val).toLocaleString('id-ID');
  heroEl.dataset.mode = mode;
  renderBreakdown(mode);
}

function toggleEye() {
  eyeHidden = !eyeHidden;
  const mode = document.getElementById('heroAmount').dataset.mode || 'tersedia';
  renderAmount(mode);
  const icon = document.getElementById('eyeIcon');
  icon.className = eyeHidden ? 'bi bi-eye-slash' : 'bi bi-eye';
}

function renderBreakdown(mode) {
  const barEl = document.getElementById('breakdownBar');
  const groupsEl = document.getElementById('breakdownGroups');
  if (!barEl || !groupsEl) return;

  if (mode === 'liabilitas') {
    const utangList = loadUtangPiutang().filter(u => u.kind === 'utang' && u.status !== 'lunas');
    const utangTotal = utangList.reduce((a, u) => a + u.remaining, 0);
    barEl.innerHTML = `<div class="breakdown-bar-seg liquid" style="width:100%; opacity:0.15;"></div>`;
    if (!utangList.length) {
      groupsEl.innerHTML = `<div class="breakdown-empty">Belum ada utang tercatat</div>`;
      return;
    }
    const rows = utangList.map(u => `
      <div class="breakdown-row" onclick="openUpDetail('${u.id}')">
        <span class="breakdown-row-name">${u.name}</span>
        <span class="breakdown-row-amt">${formatRupiah(u.remaining)}</span>
      </div>`).join('');
    groupsEl.innerHTML = `
      <div class="breakdown-group">
        <div class="breakdown-group-head">
          <div class="breakdown-group-label"><span class="breakdown-dot liquid"></span>Utang Berjalan</div>
          <span class="breakdown-group-total">${formatRupiah(utangTotal)}</span>
        </div>
        ${rows}
      </div>`;
    return;
  }

  const liquid = sources.filter(s => s.kategori === 'liquid');
  const invest = sources.filter(s => s.kategori === 'invest');
  const liquidTotal = liquid.reduce((a,s) => a + s.saldo, 0);
  const investTotal = invest.reduce((a,s) => a + s.saldo, 0);
  const showInvest = mode === 'networth';
  const activeWishlists = showInvest ? loadWishlists().filter(w => !w.completed) : [];
  const wishlistTotal = activeWishlists.reduce((a, w) => a + w.balance, 0);
  const activePiutang = showInvest ? loadUtangPiutang().filter(u => u.kind === 'piutang' && u.status !== 'lunas') : [];
  const piutangTotal = activePiutang.reduce((a, u) => a + u.remaining, 0);
  const grandTotal = showInvest ? (liquidTotal + investTotal + wishlistTotal + piutangTotal) : liquidTotal;

  if (eyeHidden) {
    barEl.innerHTML = `<div class="breakdown-bar-seg liquid" style="width:100%;"></div>`;
    groupsEl.innerHTML = `<div class="breakdown-empty">Saldo disembunyikan</div>`;
    return;
  }

  if (grandTotal <= 0) {
    barEl.innerHTML = `<div class="breakdown-bar-seg liquid" style="width:100%;"></div>`;
    groupsEl.innerHTML = `<div class="breakdown-empty">Belum ada saldo tercatat</div>`;
    return;
  }

  const liquidPct = showInvest ? (liquidTotal / grandTotal * 100) : 100;
  const investPct = showInvest ? (investTotal / grandTotal * 100) : 0;
  const wishlistPct = showInvest ? (wishlistTotal / grandTotal * 100) : 0;
  const piutangPct = showInvest ? (piutangTotal / grandTotal * 100) : 0;

  barEl.innerHTML = `
    ${liquidPct > 0 ? `<div class="breakdown-bar-seg liquid" style="width:${liquidPct}%;"></div>` : ''}
    ${investPct > 0 ? `<div class="breakdown-bar-seg invest" style="width:${investPct}%;"></div>` : ''}
    ${wishlistPct > 0 ? `<div class="breakdown-bar-seg wishlist" style="width:${wishlistPct}%;"></div>` : ''}
    ${piutangPct > 0 ? `<div class="breakdown-bar-seg invest" style="width:${piutangPct}%; opacity:0.6;"></div>` : ''}
  `;

  function groupHTML(label, dotClass, total, pct, list, rowRenderer) {
    const rows = list.length
      ? list.map(rowRenderer).join('')
      : `<div class="breakdown-empty">Belum ada sumber dana</div>`;
    return `
      <div class="breakdown-group">
        <div class="breakdown-group-head">
          <div class="breakdown-group-label"><span class="breakdown-dot ${dotClass}"></span>${label} (${pct.toFixed(2)}%)</div>
          <span class="breakdown-group-total">${formatRupiah(total)}</span>
        </div>
        ${rows}
      </div>`;
  }

  const sourceRow = s => `
    <div class="breakdown-row" onclick="openSourceDetail('${s.id}')">
      <span class="breakdown-row-name">${escapeHtml(s.name)}</span>
      <span class="breakdown-row-amt">${formatRupiah(s.saldo)}</span>
    </div>`;
  const wishlistRow = w => `
    <div class="breakdown-row" onclick="openWlDetail('${w.id}')">
      <span class="breakdown-row-name">${escapeHtml(w.name)}</span>
      <span class="breakdown-row-amt">${formatRupiah(w.balance)}</span>
    </div>`;
  const piutangRow = u => `
    <div class="breakdown-row" onclick="openUpDetail('${u.id}')">
      <span class="breakdown-row-name">${u.name}</span>
      <span class="breakdown-row-amt">${formatRupiah(u.remaining)}</span>
    </div>`;

  let html = groupHTML('Kantong Saya', 'liquid', liquidTotal, liquidPct, liquid, sourceRow);
  if (showInvest) html += groupHTML('Investasi', 'invest', investTotal, investPct, invest, sourceRow);
  if (showInvest) html += groupHTML('Wishlist', 'wishlist', wishlistTotal, wishlistPct, activeWishlists, wishlistRow);
  if (showInvest) html += groupHTML('Piutang', 'invest', piutangTotal, piutangPct, activePiutang, piutangRow);
  groupsEl.innerHTML = html;
}

// ======================================================
// RINCIAN SHEET
// ======================================================
function openRincianSheet(e) {
  if (e) e.stopPropagation();
  const mode = document.getElementById('heroAmount').dataset.mode || 'tersedia';
  renderBreakdown(mode);
  document.getElementById('rincianOverlay').classList.add('open');
}

function closeRincianSheet() {
  document.getElementById('rincianOverlay').classList.remove('open');
}

function closeRincianOutside(e) {
  if (e.target.id === 'rincianOverlay') closeRincianSheet();
}

// ======================================================
// CONFIRM DIALOG (custom — menggantikan window.confirm)
// ======================================================
let _confirmResolve = null;

function showConfirmDialog(title, msg, okLabel) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('confirmDialogTitle').textContent = title;
    document.getElementById('confirmDialogMsg').textContent = msg;
    document.getElementById('confirmDialogOkBtn').textContent = okLabel || 'Hapus';
    document.getElementById('confirmDialogOverlay').classList.add('open');
  });
}

function confirmDialogResolve(result) {
  document.getElementById('confirmDialogOverlay').classList.remove('open');
  if (_confirmResolve) { _confirmResolve(result); _confirmResolve = null; }
}

// ======================================================
// TOAST
// ======================================================
let toastTimer;

// Haptic ringan -- browser yang gak dukung navigator.vibrate (iOS Safari)
// bakal diem aja, gak error, jadi aman dipanggil di mana pun.
function haptic(pattern) {
  if (navigator.vibrate) { try { navigator.vibrate(pattern || 12); } catch (e) {} }
}

// ======================================================
// DIALOG KONFIRMASI NATIVE -- pengganti confirm() browser di seluruh app.
// confirm() itu blocking & synchronous, jadi refactor tiap pemanggil dari
// "if (!confirm(msg)) return; ...lanjut..." jadi
// "nativeConfirm(msg, () => { ...lanjut... })".
// ======================================================
let _nativeConfirmCallback = null;

function nativeConfirm(message, onConfirm, opts) {
  opts = opts || {};
  document.getElementById('nativeConfirmMsg').textContent = message;
  const okBtn = document.getElementById('nativeConfirmOkBtn');
  okBtn.textContent = opts.okLabel || 'Ya, Lanjutkan';
  okBtn.style.background = opts.danger === false ? 'var(--primary)' : 'var(--danger)';
  const icon = document.getElementById('nativeConfirmIconWrap');
  icon.style.background = opts.danger === false ? 'var(--primary-100)' : 'var(--danger-100)';
  icon.querySelector('i').style.color = opts.danger === false ? 'var(--primary)' : 'var(--danger)';
  _nativeConfirmCallback = onConfirm;
  haptic(15);
  openSheet('nativeConfirmOverlay');
}

function _nativeConfirmOk() {
  closeSheet('nativeConfirmOverlay');
  const cb = _nativeConfirmCallback;
  _nativeConfirmCallback = null;
  if (cb) cb();
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
  haptic(12);
}

// ======================================================
// INSIGHT
// ======================================================
function renderHomeInsight() {
  const wrap = document.getElementById('insightCarouselWrap');
  const carousel = document.getElementById('insightCarousel');
  const dotsEl = document.getElementById('insightDots');

  const now = new Date();
  const thisMonthRange = monthRangeOf(now.getFullYear(), now.getMonth());
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const lastMonthRange = monthRangeOf(lastMonthDate.getFullYear(), lastMonthDate.getMonth());

  const thisMonthTx = transactions.filter(t => inRange(t.date, thisMonthRange.from, thisMonthRange.to) && !t.isFee && !t.isAdjustment && !t.isSaldoAwal);
  const lastMonthTx = transactions.filter(t => inRange(t.date, lastMonthRange.from, lastMonthRange.to) && !t.isFee && !t.isAdjustment && !t.isSaldoAwal);

  const thisExpense = thisMonthTx.filter(t=>t.type==='keluar').reduce((a,t)=>a+t.amount,0);
  const lastExpense = lastMonthTx.filter(t=>t.type==='keluar').reduce((a,t)=>a+t.amount,0);
  const thisIncome = thisMonthTx.filter(t=>t.type==='masuk').reduce((a,t)=>a+t.amount,0);

  const cards = [];

  if (lastExpense > 0) {
    const diffPct = Math.round(((thisExpense - lastExpense) / lastExpense) * 100);
    if (diffPct < 0) {
      cards.push({
        icon: 'bi-graph-down-arrow', tag: 'Insight untukmu',
        title: `Pengeluaranmu <b class="positive">turun ${Math.abs(diffPct)}%</b> dibanding bulan lalu 🎉`,
        sub: 'Pertahankan kebiasaan baik ini!'
      });
    } else if (diffPct > 0) {
      cards.push({
        icon: 'bi-graph-up-arrow', tag: 'Insight untukmu',
        title: `Pengeluaranmu <b class="negative">naik ${diffPct}%</b> dibanding bulan lalu`,
        sub: 'Coba cek kategori mana yang paling besar.'
      });
    }
  }

  const byCategory = {};
  thisMonthTx.filter(t=>t.type==='keluar').forEach(t => { byCategory[t.category] = (byCategory[t.category]||0)+t.amount; });
  const sortedCat = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
  if (sortedCat.length) {
    const [topCat, topAmt] = sortedCat[0];
    const pct = thisExpense ? Math.round((topAmt/thisExpense)*100) : 0;
    cards.push({
      icon: 'bi-bar-chart-fill', tag: 'Kategori teratas',
      title: `<b>${topCat}</b> adalah pengeluaran terbesar bulan ini`,
      sub: `${pct}% dari total · ${formatRupiah(topAmt)}`
    });
  }

  if (thisIncome > 0 && thisExpense > 0) {
    const sisa = thisIncome - thisExpense;
    cards.push({
      icon: sisa >= 0 ? 'bi-piggy-bank-fill' : 'bi-exclamation-triangle-fill',
      tag: 'Ringkasan bulan ini',
      title: sisa >= 0
        ? `Kamu <b class="positive">surplus ${formatRupiah(sisa)}</b> bulan ini`
        : `Kamu <b class="negative">defisit ${formatRupiah(Math.abs(sisa))}</b> bulan ini`,
      sub: 'Lihat detail lengkap di Statistik.'
    });
  }

  if (!cards.length) {
    if (!transactions.length) {
      cards.push({
        icon: 'bi-rocket-takeoff-fill', tag: 'Selamat datang 👋',
        title: 'Mulai catat transaksi pertamamu',
        sub: 'Insight akan muncul di sini setelah ada cukup data.'
      });
    } else {
      wrap.style.display = 'none';
      return;
    }
  }
  wrap.style.display = 'block';

  carousel.innerHTML = cards.map(c => `
    <div class="insight-card">
      <div class="insight-card-body">
        <div class="insight-card-tag"><i class="bi bi-stars"></i> ${c.tag}</div>
        <div class="insight-card-title">${c.title}</div>
        <div class="insight-card-sub">${c.sub}</div>
      </div>
      <div class="insight-card-icon"><i class="${c.icon}"></i></div>
    </div>`).join('');

  dotsEl.innerHTML = cards.length > 1 ? cards.map((_,i) => `<div class="insight-dot${i===0?' active':''}" data-idx="${i}"></div>`).join('') : '';

  if (cards.length > 1) {
    carousel.onscroll = () => {
      const idx = Math.round(carousel.scrollLeft / carousel.clientWidth);
      dotsEl.querySelectorAll('.insight-dot').forEach((d,i) => d.classList.toggle('active', i===idx));
    };
  }
}

// ======================================================
// TRANSACTION: CATEGORIES
// ======================================================
const DEFAULT_CATEGORIES = {
  keluar: ['Makan & Minum','Transport','Belanja','Tagihan','Hiburan','Kesehatan','Pendidikan','Cicilan/Utang','Biaya Admin/Fee','Lainnya'],
  masuk: ['Gaji','Bonus/THR','Hasil Usaha/Freelance','Hasil Investasi','Bunga Bank/Investasi','Saldo Awal','Lainnya']
};

const DEFAULT_CATEGORY_ICONS = {
  'Makan & Minum':'bi-cup-straw','Transport':'bi-car-front','Belanja':'bi-bag','Tagihan':'bi-receipt',
  'Hiburan':'bi-film','Kesehatan':'bi-heart-pulse','Pendidikan':'bi-mortarboard','Cicilan/Utang':'bi-people',
  'Biaya Admin/Fee':'bi-cash-coin','Lainnya':'bi-three-dots','Gaji':'bi-briefcase','Bonus/THR':'bi-gift',
  'Hasil Usaha/Freelance':'bi-laptop','Hasil Investasi':'bi-graph-up-arrow','Bunga Bank/Investasi':'bi-percent','Saldo Awal':'bi-piggy-bank'
};

const DEFAULT_CATEGORY_COLORS = {
  'Makan & Minum':'#E8633B','Transport':'#2D7DD2','Belanja':'#C0365F','Tagihan':'#B07A20',
  'Hiburan':'#7B4FE0','Kesehatan':'#D63B5C','Pendidikan':'#1E88A8','Cicilan/Utang':'#6836C4',
  'Biaya Admin/Fee':'#8A8A8A','Lainnya':'#6B628A','Gaji':'#1B9E5E','Bonus/THR':'#E0A800',
  'Hasil Usaha/Freelance':'#2D5BD1','Hasil Investasi':'#0F7D6E','Bunga Bank/Investasi':'#06A876','Saldo Awal':'#6C5CE7'
};

// Loaded from storage, merged with defaults
let categories = { keluar: [...DEFAULT_CATEGORIES.keluar], masuk: [...DEFAULT_CATEGORIES.masuk] };
let categoryIcons = { ...DEFAULT_CATEGORY_ICONS };
let categoryColors = { ...DEFAULT_CATEGORY_COLORS };

function initCategories() {
  const saved = loadCategories();
  if (saved) {
    if (saved.keluar) categories.keluar = saved.keluar;
    if (saved.masuk) categories.masuk = saved.masuk;
    if (saved.icons) categoryIcons = { ...DEFAULT_CATEGORY_ICONS, ...saved.icons };
    if (saved.colors) categoryColors = { ...DEFAULT_CATEGORY_COLORS, ...saved.colors };
  }
}

function persistCategories() {
  saveCategories({
    keluar: categories.keluar,
    masuk: categories.masuk,
    icons: categoryIcons,
    colors: categoryColors
  });
}

// ======================================================
// TRANSACTION: FORM STATE
// ======================================================
let txType = 'keluar';
let txEditId = null;
let txCategoryVal = null;
let txSourceVal = null;
let txDestVal = null;
let txAttachment = null;

const quickAmountPresets = {
  keluar: [25000, 50000, 100000, 200000],
  masuk: [50000, 100000, 200000, 500000],
  transfer: [50000, 100000, 200000, 500000]
};

function renderQuickAmounts() {
  const wrap = document.getElementById('txQuickAmounts');
  const presets = quickAmountPresets[txType] || quickAmountPresets.keluar;
  wrap.innerHTML = presets.map(v => `<div class="quick-amount-chip" onclick="addQuickAmount(${v})">+${formatRibu(v)}</div>`).join('');
}

function formatRibu(v) {
  if (v % 1000000 === 0) return (v/1000000) + 'jt';
  return Math.round(v/1000) + 'rb';
}

function addQuickAmount(v) {
  const el = document.getElementById('txAmount');
  const current = parseInt((el.value || '0').replace(/[^\d]/g,''), 10) || 0;
  el.value = (current + v).toLocaleString('id-ID');
  el.dispatchEvent(new Event('input'));
  toggleAmountClear();
}

function formatAmountInput(el) {
  const digits = el.value.replace(/[^\d]/g, '');
  el.value = digits ? parseInt(digits, 10).toLocaleString('id-ID') : '';
}

function toggleAmountClear() {
  const el = document.getElementById('txAmount');
  document.getElementById('txAmountClear').style.display = el.value ? 'flex' : 'none';
}

// ======================================================
// CALCULATOR (for Nominal field)
// ======================================================
let calcExpr = '';
let calcJustEvaluated = false;

function openCalcSheet() {
  const current = document.getElementById('txAmount').value.replace(/[^\d]/g, '');
  calcExpr = current && current !== '0' ? current : '';
  calcJustEvaluated = false;
  renderCalcDisplay();
  document.getElementById('calcOverlay').classList.add('open');
}

function closeCalcSheet() {
  document.getElementById('calcOverlay').classList.remove('open');
}

function closeCalcOutside(e) {
  if (e.target.id === 'calcOverlay') closeCalcSheet();
}

function renderCalcDisplay() {
  const display = calcExpr.replace(/\*/g, '×').replace(/\//g, '÷');
  document.getElementById('calcDisplay').textContent = display || '0';
}

function calcInput(val) {
  if (val === 'C') {
    calcExpr = '';
    calcJustEvaluated = false;
  } else if (val === 'back') {
    calcExpr = calcExpr.slice(0, -1);
    calcJustEvaluated = false;
  } else if (val === '=') {
    calcEvaluate();
    return;
  } else if (['+', '-', '*', '/', '%'].includes(val)) {
    if (!calcExpr && val !== '-') return;
    const lastChar = calcExpr.slice(-1);
    if (['+', '-', '*', '/', '%'].includes(lastChar)) {
      calcExpr = calcExpr.slice(0, -1) + val;
    } else {
      calcExpr += val;
    }
    calcJustEvaluated = false;
  } else {
    if (calcJustEvaluated) { calcExpr = ''; calcJustEvaluated = false; }
    calcExpr += val;
  }
  renderCalcDisplay();
}

function calcEvaluate() {
  if (!calcExpr) return;
  let expr = calcExpr.replace(/[+\-*/%]+$/, '');
  if (!expr) return;
  try {
    if (!/^[0-9+\-*/%.]+$/.test(expr)) throw new Error('invalid');
    const result = Function('"use strict"; return (' + expr.replace(/%/g, '/100*') + ')')();
    if (!isFinite(result) || isNaN(result)) throw new Error('invalid');
    calcExpr = String(Math.round(result * 100) / 100);
    calcJustEvaluated = true;
    renderCalcDisplay();
  } catch (_) {
    calcExpr = '';
    document.getElementById('calcDisplay').textContent = 'Error';
  }
}

function useCalcResult() {
  if (!calcExpr || calcExpr === 'Error') { closeCalcSheet(); return; }
  calcEvaluate();
  const num = parseFloat(calcExpr);
  if (isNaN(num) || num < 0) { showToast('Hasil tidak valid'); return; }
  const rounded = Math.round(num);
  const el = document.getElementById('txAmount');
  el.value = rounded.toLocaleString('id-ID');
  toggleAmountClear();
  closeCalcSheet();
}

function resetFieldCard(cardId, labelId, placeholderText, iconWrapId, defaultIcon, subId) {
  document.getElementById(labelId).textContent = placeholderText;
  document.getElementById(cardId).classList.add('placeholder');
  const sub = document.getElementById(subId);
  if (sub) { sub.style.display = 'none'; sub.textContent = ''; }
  const iconWrap = document.getElementById(iconWrapId);
  if (iconWrap) {
    iconWrap.innerHTML = `<i class="${defaultIcon}"></i>`;
    iconWrap.removeAttribute('style');
    iconWrap.classList.remove('field-card-icon');
    iconWrap.classList.add('field-card-icon-mono');
  }
}

function updateTxFormLayout() {
  const isTransfer = txType === 'transfer';
  document.getElementById('txKelMasukBlock').style.display = isTransfer ? 'none' : 'block';
  document.getElementById('txTransferBlock').style.display = isTransfer ? 'block' : 'none';
  resetFieldCard('txCategorySelect', 'txCategoryLabel', 'Pilih kategori', 'txCategoryIconWrap', 'bi-grid', 'txCategorySub');
  resetFieldCard('txSourceSelect', 'txSourceLabelVal', 'Pilih', 'txSourceIconWrap', 'bi-wallet2', 'txSourceSub');
  resetFieldCard('txSourceSelectTransfer', 'txSourceLabelValTransfer', 'Pilih kantong', 'txSourceIconWrapTransfer', 'bi-wallet2', 'txSourceSubTransfer');
  resetFieldCard('txDestSelect', 'txDestLabelVal', 'Pilih kantong', 'txDestIconWrap', 'bi-wallet2', 'txDestSub');
  document.getElementById('txErrorBanner').style.display = 'none';
  const today = todayISO();
  const now = nowTime();
  document.getElementById('txDate').value = today;
  document.getElementById('txDateTransfer').value = today;
  document.getElementById('txTime').value = now;
  document.getElementById('txTimeTransfer').value = now;
  document.getElementById('txDateLabel').textContent = formatTanggalLabel(today);
  document.getElementById('txDateTransferLabel').textContent = formatTanggalLabel(today);
  document.getElementById('txDateRelLabel').textContent = relativeDayLabel(today);
  document.getElementById('txDateTransferRelLabel').textContent = relativeDayLabel(today);
  document.getElementById('txTimeLabel').textContent = now;
  document.getElementById('txTimeTransferLabel').textContent = now;
  renderQuickAmounts();
}

// ======================================================
// TRANSACTION: ATTACHMENT
// ======================================================
function handleAttachFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar'); return; }
  if (file.size > 4 * 1024 * 1024) { showToast('Ukuran gambar maksimal 4MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    txAttachment = { name: file.name, dataUrl: e.target.result };
    document.getElementById('txAttachThumb').src = txAttachment.dataUrl;
    document.getElementById('txAttachName').textContent = txAttachment.name;
    document.getElementById('txAttachBox').style.display = 'none';
    document.getElementById('txAttachPreview').style.display = 'flex';
  };
  reader.readAsDataURL(file);
}

function removeAttachFile(e) {
  if (e) e.stopPropagation();
  txAttachment = null;
  document.getElementById('txAttachInput').value = '';
  document.getElementById('txAttachBox').style.display = 'flex';
  document.getElementById('txAttachPreview').style.display = 'none';
}

// ======================================================
// TRANSACTION: PICKER
// ======================================================
let pickerMode = null;

function openPicker(mode) {
  if (mode === 'dest' && txType === 'transfer' && !txSourceVal) {
    showToast('Pilih sumber asal terlebih dahulu');
    return;
  }
  pickerMode = mode;
  const titleMap = {
    category: 'Pilih Kategori',
    source: txType === 'transfer' ? 'Pilih Sumber Asal' : 'Pilih Akun',
    dest: 'Pilih Tujuan Transfer'
  };
  document.getElementById('pickerTitle').textContent = titleMap[mode];
  const listEl = document.getElementById('pickerList');

  if (mode === 'category') {
    const list = categories[txType === 'masuk' ? 'masuk' : 'keluar'];
    listEl.innerHTML = list.map(c => {
      const isSaldoAwal = c === 'Saldo Awal';
      return `
      <div class="picker-item" onclick="selectPickerItem('category','${c}')">
        <div class="picker-item-icon" style="background:${categoryColors[c] || 'var(--primary-100)'}"><i class="bi ${categoryIcons[c] || 'bi-circle'}" style="color:#fff"></i></div>
        <div>
          <div class="picker-item-name">${c}</div>
          ${isSaldoAwal ? '<div class="picker-item-sub" style="color:var(--warning,#E0A800);font-size:11px;">Gunakan hanya saat setup awal akun</div>' : ''}
        </div>
      </div>`;
    }).join('');
  } else {
    const exclude = mode === 'dest' ? txSourceVal : txDestVal;
    let list = sources.filter(s => s.id !== exclude);
    if (txType !== 'transfer') {
      list = list.filter(s => s.kategori !== 'invest');
    }
    if (!list.length) {
      listEl.innerHTML = `<div class="kt-empty" style="border:none;">
        ${txType !== 'transfer'
          ? 'Belum ada akun Cash/Bank/E-Wallet. Akun Investasi hanya bisa digunakan lewat Transfer.'
          : 'Belum ada akun tersedia.'}
      </div>`;
    } else {
      listEl.innerHTML = list.map(s => {
        const ico = buildSourceIconHtml(s);
        return `
        <div class="picker-item" onclick="selectPickerItem('${mode}','${s.id}')">
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
  }
  document.getElementById('pickerOverlay').classList.add('open');
}

function closePicker() {
  document.getElementById('pickerOverlay').classList.remove('open');
}

function closePickerOutside(e) {
  if (e.target.id === 'pickerOverlay') closePicker();
}

function selectPickerItem(mode, val) {
  if (mode === 'category') {
    txCategoryVal = val;
    const isMasuk = txType === 'masuk';
    document.getElementById('txCategoryLabel').textContent = val;
    const sub = document.getElementById('txCategorySub');
    sub.textContent = isMasuk ? 'Pemasukan' : 'Pengeluaran';
    sub.style.display = 'block';
    const iconWrap = document.getElementById('txCategoryIconWrap');
    iconWrap.innerHTML = `<i class="bi ${categoryIcons[val] || 'bi-circle'}"></i>`;
    iconWrap.style.background = categoryColors[val] || 'var(--ink-300)';
    iconWrap.classList.remove('field-card-icon-mono');
    iconWrap.classList.add('field-card-icon');
    document.getElementById('txCategorySelect').classList.remove('placeholder');
  } else if (mode === 'source') {
    txSourceVal = val;
    const s = sources.find(s=>s.id===val);
    const name = s?.name || val;
    const sub = s ? `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}` : '';
    document.getElementById('txSourceLabelVal').textContent = name;
    document.getElementById('txSourceLabelValTransfer').textContent = name;
    document.getElementById('txSourceSub').textContent = sub;
    document.getElementById('txSourceSub').style.display = sub ? 'block' : 'none';
    document.getElementById('txSourceSubTransfer').textContent = sub;
    document.getElementById('txSourceSubTransfer').style.display = sub ? 'block' : 'none';
    if (s) {
      const ico = buildSourceIconHtml(s);
      ['txSourceIconWrap','txSourceIconWrapTransfer'].forEach(id => {
        const el = document.getElementById(id);
        el.innerHTML = ico.html;
        el.style.background = ico.bg;
        el.classList.remove('field-card-icon-mono');
        el.classList.add('field-card-icon');
      });
    }
    document.getElementById('txSourceSelect').classList.remove('placeholder');
    document.getElementById('txSourceSelectTransfer').classList.remove('placeholder');
  } else if (mode === 'dest') {
    txDestVal = val;
    const s = sources.find(s=>s.id===val);
    document.getElementById('txDestLabelVal').textContent = s?.name || val;
    const sub = s ? `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}` : '';
    document.getElementById('txDestSub').textContent = sub;
    document.getElementById('txDestSub').style.display = sub ? 'block' : 'none';
    if (s) {
      const ico = buildSourceIconHtml(s);
      const iconWrap = document.getElementById('txDestIconWrap');
      iconWrap.innerHTML = ico.html;
      iconWrap.style.background = ico.bg;
      iconWrap.classList.remove('field-card-icon-mono');
      iconWrap.classList.add('field-card-icon');
    }
    document.getElementById('txDestSelect').classList.remove('placeholder');
  }
  closePicker();
}

// ======================================================
// TRANSACTION: SAVE
// ======================================================
function saveTransaction() {
  // Cegah double-submit (mis. double-tap di layar sentuh) yang bisa
  // mencatat transaksi dua kali dalam sekejap.
  if (!allowSubmit('saveTransaction')) return;
  const amountRaw = document.getElementById('txAmount').value.replace(/[^\d]/g, '');
  const amount = parseInt(amountRaw || '0', 10);
  const note = document.getElementById('txNote').value.trim();
  const errBanner = document.getElementById('txErrorBanner');
  const errText = document.getElementById('txErrorText');
  errBanner.style.display = 'none';

  if (!amount || amount <= 0) { errText.textContent = 'Nominal wajib diisi.'; errBanner.style.display = 'flex'; return; }

  if (txType === 'transfer') {
    const fee = parseInt((document.getElementById('txFee').value || '0').replace(/[^\d]/g, ''), 10) || 0;
    if (!txSourceVal || !txDestVal) { errText.textContent = 'Pilih sumber asal dan tujuan transfer.'; errBanner.style.display = 'flex'; return; }
    const src = sources.find(s => s.id === txSourceVal);
    if (!src) { errText.textContent = 'Akun sumber tidak ditemukan, mungkin sudah dihapus. Pilih ulang akun.'; errBanner.style.display = 'flex'; return; }
    const dest = sources.find(s => s.id === txDestVal);
    if (!dest) { errText.textContent = 'Akun tujuan tidak ditemukan, mungkin sudah dihapus. Pilih ulang akun.'; errBanner.style.display = 'flex'; return; }
    const total = amount + fee;
    if (total > src.saldo) {
      errText.textContent = `Saldo ${src.name} tidak cukup untuk nominal + biaya admin (butuh ${formatRupiah(total)}, tersedia ${formatRupiah(src.saldo)}).`;
      errBanner.style.display = 'flex';
      return;
    }
    src.saldo -= total;
    dest.saldo += amount;
    const txDateVal = document.getElementById('txDateTransfer').value || todayISO();
    const txTimeVal = document.getElementById('txTimeTransfer').value || nowTime();
    transactions.unshift({
      id: 'tx'+uniqueTick(), type: 'transfer', amount, fee, sourceId: src.id, destId: dest.id,
      note: note || `${src.name} → ${dest.name}`, date: txDateVal, time: txTimeVal, attachment: txAttachment
    });
    if (fee > 0) {
      transactions.unshift({
        id: 'tx'+uniqueTick()+'f', type: 'keluar', amount: fee, sourceId: src.id, category: 'Biaya Admin/Fee',
        note: 'Biaya admin transfer ke ' + dest.name, date: txDateVal, time: txTimeVal, isFee: true
      });
    }
    saveSources(sources);
    saveTransactions(transactions);
    closeSheet();
    renderAll();
    showToast('Transfer berhasil dicatat');
    return;
  }

  // keluar / masuk
  if (!txCategoryVal) { errText.textContent = 'Pilih kategori terlebih dahulu.'; errBanner.style.display = 'flex'; return; }
  if (!txSourceVal) { errText.textContent = 'Pilih akun terlebih dahulu.'; errBanner.style.display = 'flex'; return; }
  const src = sources.find(s => s.id === txSourceVal);
  if (!src) { errText.textContent = 'Akun tidak ditemukan.'; errBanner.style.display = 'flex'; return; }

  if (src.kategori === 'invest') {
    errText.textContent = `${src.name} adalah akun Investasi. Gunakan Transfer untuk memindahkan dana ke/dari akun ini.`;
    errBanner.style.display = 'flex';
    return;
  }

  if (txEditId) {
    const old = transactions.find(t => t.id === txEditId);
    if (old) {
      const oldSrc = sources.find(s => s.id === old.sourceId);
      if (oldSrc) oldSrc.saldo += (old.type === 'keluar' ? old.amount : -old.amount);
    }
  }

  if (txType === 'keluar' && amount > src.saldo) {
    errText.textContent = `Saldo ${src.name} tidak cukup (tersedia ${formatRupiah(src.saldo)}).`;
    errBanner.style.display = 'flex';
    if (txEditId) { const old = transactions.find(t => t.id === txEditId); if (old) { const s2 = sources.find(s=>s.id===old.sourceId); if(s2) s2.saldo -= (old.type==='keluar'?old.amount:-old.amount); } }
    return;
  }

  src.saldo += (txType === 'keluar' ? -amount : amount);

  if (txEditId) {
    const old = transactions.find(t => t.id === txEditId);
    old.type = txType; old.amount = amount; old.category = txCategoryVal; old.sourceId = txSourceVal;
    old.note = note; old.date = document.getElementById('txDate').value || todayISO();
    old.time = document.getElementById('txTime').value || old.time || nowTime();
    old.attachment = txAttachment;
    showToast('Transaksi diperbarui');
  } else {
    transactions.unshift({
      id: 'tx'+uniqueTick(), type: txType, amount, category: txCategoryVal, sourceId: txSourceVal,
      note: note || txCategoryVal, date: document.getElementById('txDate').value || todayISO(),
      time: document.getElementById('txTime').value || nowTime(), attachment: txAttachment
    });
    showToast('Transaksi tercatat');
  }
  saveSources(sources);
  saveTransactions(transactions);
  const wasEditingFromDetail = txEditId && document.getElementById('page-tx-detail').classList.contains('active');
  const editedTxId = txEditId;
  closeSheet();
  renderAll();
  if (wasEditingFromDetail) openTransactionDetail(editedTxId);
  if (txType === 'keluar') {
    checkBudgetRemindersNow();
    showNextReminderModal();
  }
}

// ======================================================
// TRANSACTION: LIST / RENDER
// ======================================================
// ======================================================
// TRANSACTION: ICON HELPER (dipakai di semua list transaksi)
// ======================================================
function txIconHTML(t, src) {
  if (t.type === 'transfer') {
    if (src && src.customIcon) {
      return `<img src="${src.customIcon}">`;
    }
    const jenis = src ? src.jenis : null;
    return `<i class="bi ${jenis ? (sourceIcons[jenis] || 'bi-wallet2') : 'bi-arrow-left-right'}"></i>`;
  }
  const icon = categoryIcons[t.category] || 'bi-circle';
  return `<i class="bi ${icon}"></i>`;
}

// ======================================================
// TRANSACTION: RESOLVE PARTY (akun ATAU wishlist, buat transfer)
// ======================================================
function resolveTxParty(id) {
  if (!id) return null;
  const s = sources.find(x => x.id === id);
  if (s) return s;
  const wl = loadWishlists().find(w => w.id === id);
  if (wl) return { name: wl.name, jenis: null, isWishlist: true };
  const up = loadUtangPiutang().find(u => u.id === id);
  if (up) return { name: up.name, jenis: null, isUtangPiutang: true };
  if (id === 'danadarurat') {
    const dd = loadDanaDarurat();
    if (dd) return { name: 'Dana Darurat', jenis: null, isDanaDarurat: true };
  }
  return null;
}

function txRowHTML(t) {
  const src = resolveTxParty(t.sourceId);
  const dest = t.destId ? resolveTxParty(t.destId) : null;
  let iconClass = 'out', amtClass = 'neg', amtPrefix = '−', name, sub;
  if (t.type === 'masuk') { iconClass='in'; amtClass='pos'; amtPrefix='+'; }
  if (t.type === 'transfer') { iconClass='transfer'; amtClass='neutral'; amtPrefix=''; }
  const iconHTML = txIconHTML(t, src);
  if (t.type === 'transfer') {
    const arrow = `${escapeHtml(src ? src.name : '—')} → ${escapeHtml(dest ? dest.name : '—')}`;
    name = t.note ? escapeHtml(t.note) : arrow;
    sub = t.note ? `${arrow} · ${formatTxDate(t.date)}` : formatTxDate(t.date);
  } else {
    name = t.note ? escapeHtml(t.note) : escapeHtml(t.category);
    sub = `${escapeHtml(t.category)} · ${formatTxDate(t.date)}`;
  }
  return `
    <div class="tx-row" data-tx="${t.id}" onclick="openTransactionDetail('${t.id}')">
      <div class="tx-icon ${iconClass}">${iconHTML}</div>
      <div class="tx-mid">
        <div class="tx-name">${name}</div>
        <div class="tx-meta">${sub}</div>
      </div>
      <div class="tx-amt ${amtClass}">${amtPrefix}${t.amount.toLocaleString('id-ID')}</div>
      <button class="tx-more-btn" onclick="event.stopPropagation(); openActionSheet('${t.id}')"><i class="bi bi-three-dots-vertical"></i></button>
    </div>`;
}

function renderTxList(containerId, limit) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let list = transactions;
  if (limit) list = list.slice(0, limit);

  if (!list.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = list.map(t => txRowHTML(t)).join('');
}

// ======================================================
// TRANSACTION: LONG PRESS (Action Sheet)
// ======================================================
let txActionId = null;

function openActionSheet(txId) {
  txActionId = txId;
  const t = transactions.find(x => x.id === txId);
  document.getElementById('actionSheetTitle').textContent = t ? (t.note || t.category) : 'Transaksi';
  document.getElementById('actionSheetOverlay').classList.add('open');
}

function closeActionSheet() {
  document.getElementById('actionSheetOverlay').classList.remove('open');
}

function closeActionSheetOutside(e) {
  if (e.target.id === 'actionSheetOverlay') closeActionSheet();
}

function editTxFromAction() {
  const t = transactions.find(x => x.id === txActionId);
  closeActionSheet();
  if (!t) return;
  if (t.type === 'transfer') { showToast('Edit transfer belum tersedia, hapus & catat ulang.'); return; }
  txEditId = t.id; txType = t.type; txCategoryVal = null; txSourceVal = null;
  document.querySelectorAll('#txTypeSeg .type-seg-item').forEach(el => el.classList.toggle('active', el.dataset.type === t.type));
  updateTxFormLayout();
  document.getElementById('txAmount').value = t.amount.toLocaleString('id-ID');
  toggleAmountClear();
  selectPickerItem('category', t.category);
  selectPickerItem('source', t.sourceId);
  document.getElementById('txNote').value = t.note || '';
  document.getElementById('txNoteCount').textContent = (t.note || '').length + '/60';
  const editDate = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : todayISO();
  const editTime = /^\d{2}:\d{2}$/.test(t.time) ? t.time : nowTime();
  document.getElementById('txDate').value = editDate;
  document.getElementById('txTime').value = editTime;
  document.getElementById('txDateLabel').textContent = formatTanggalLabel(editDate);
  document.getElementById('txDateRelLabel').textContent = relativeDayLabel(editDate);
  document.getElementById('txTimeLabel').textContent = editTime;
  if (t.attachment) {
    txAttachment = t.attachment;
    document.getElementById('txAttachThumb').src = txAttachment.dataUrl;
    document.getElementById('txAttachName').textContent = txAttachment.name;
    document.getElementById('txAttachBox').style.display = 'none';
    document.getElementById('txAttachPreview').style.display = 'flex';
  } else {
    removeAttachFile();
  }
  document.getElementById('noSourceBanner').style.display = 'none';
  openSheet();
}

function deleteTxFromAction() {
  const t = transactions.find(x => x.id === txActionId);
  closeActionSheet();
  if (!t) return;
  const wasInDetailPage = document.getElementById('page-tx-detail').classList.contains('active');
  if (t.type === 'transfer') {
    const src = sources.find(s => s.id === t.sourceId);
    const dest = sources.find(s => s.id === t.destId);
    if (src) src.saldo += (t.amount + (t.fee||0));
    if (dest) dest.saldo -= t.amount;
    saveSources(sources);

    // Sinkronkan balik ke Dana Darurat kalau transfer ini nyambung ke sana
    // (Dana Darurat bukan akun beneran di `sources`, jadi harus ditangani terpisah)
    if (t.sourceId === 'danadarurat' || t.destId === 'danadarurat') {
      const dd = loadDanaDarurat();
      if (dd) {
        if (t.destId === 'danadarurat') dd.balance -= t.amount;
        if (t.sourceId === 'danadarurat') dd.balance += (t.amount + (t.fee||0));
        if (t.ddHistoryId) dd.history = (dd.history || []).filter(h => h.id !== t.ddHistoryId);
        dd.updatedAt = new Date().toISOString();
        saveDanaDarurat(dd);
      }
    }

    // Sinkronkan balik ke Wishlist kalau transfer ini nyambung ke sana
    if (t.wishlistId) {
      const list = loadWishlists();
      const idx = list.findIndex(w => w.id === t.wishlistId);
      if (idx > -1) {
        if (t.destId === t.wishlistId) list[idx].balance -= t.amount;
        if (t.sourceId === t.wishlistId) list[idx].balance += (t.amount + (t.fee||0));
        if (t.wlHistoryId) list[idx].history = (list[idx].history || []).filter(h => h.id !== t.wlHistoryId);
        list[idx].updatedAt = new Date().toISOString();
        saveWishlists(list);
      }
    }

    // Sinkronkan balik ke Utang-Piutang kalau transfer ini nyambung ke sana
    if (t.upId) {
      const list = loadUtangPiutang();
      const idx = list.findIndex(u => u.id === t.upId);
      if (idx > -1) {
        if (t.upKind !== 'pinjam') {
          list[idx].remaining += t.amount;
          if (list[idx].remaining > list[idx].totalAmount) list[idx].remaining = list[idx].totalAmount;
          list[idx].status = list[idx].remaining <= 0 ? 'lunas' : 'berjalan';
          if (list[idx].status !== 'lunas') list[idx].paidOffAt = null;
        }
        if (t.upHistoryId) list[idx].history = (list[idx].history || []).filter(h => h.id !== t.upHistoryId);
        list[idx].updatedAt = new Date().toISOString();
        saveUtangPiutang(list);
      }
    }

    // Sinkronkan balik ke Jurnal Investasi kalau transfer ini nyambung ke sana
    if (t.jurnalId) {
      const list = loadJurnalInvestasi();
      const idx = list.findIndex(a => a.id === t.jurnalId);
      if (idx > -1) {
        const a = list[idx];
        a.riwayat = (a.riwayat || []).filter(h => h.txId !== t.id);
        if (t.destId === t.jurnalId) {
          // Beli dibatalkan: unit & modal yang ditambahkan saat itu ditarik lagi.
          // Amount transfer = total beli. Cari entri riwayat pasangannya sebelum difilter
          // sudah gak ada, jadi turunkan proporsional pakai harga rata-rata terkini
          // agar tetap konsisten (edge case sangat jarang: hapus tx beli lama).
          const avgNow = a.totalUnit > 0 ? a.totalModal / a.totalUnit : 0;
          if (avgNow > 0) {
            const unitBack = t.amount / avgNow;
            a.totalUnit = Math.max(0, a.totalUnit - unitBack);
          }
          a.totalModal = Math.max(0, a.totalModal - t.amount);
        }
        if (t.sourceId === t.jurnalId) {
          // Jual dibatalkan: modal yang berkurang saat jual dikembalikan
          // tidak bisa dihitung presisi tanpa data lot lama, jadi biarkan
          // status jadi 'aktif' lagi tanpa mengubah unit/modal otomatis.
          if (a.status === 'terjual') a.status = 'aktif';
        }
        a.updatedAt = new Date().toISOString();
        saveJurnalInvestasi(list);
      }
    }

    // Hapus juga transaksi isFee (biaya admin) yang dibuat bersamaan.
    // Prioritas: link presisi via feeOf (transaksi baru). Fallback: cocokin
    // sourceId+tanggal+nominal (transaksi lama sebelum feeOf ada).
    transactions = transactions.filter(x => !(x.isFee && (
      (t.id && x.feeOf === t.id) ||
      (!x.feeOf && x.sourceId === t.sourceId && x.date === t.date && x.amount === t.fee)
    )));
  } else {
    const src = sources.find(s => s.id === t.sourceId);
    if (src) src.saldo += (t.type === 'keluar' ? t.amount : -t.amount);
    saveSources(sources);
  }
  transactions = transactions.filter(x => x.id !== t.id);
  saveTransactions(transactions);
  if (wasInDetailPage) goTo(txDetailReturnPage);
  renderAll();
  if (document.getElementById('page-darurat').classList.contains('active')) renderDanaDaruratPage();
  if (document.getElementById('page-wishlist-detail').classList.contains('active') && typeof wlDetailId !== 'undefined' && wlDetailId) renderWlDetailPage();
  if (document.getElementById('page-jurnal-detail').classList.contains('active') && typeof jrDetailId !== 'undefined' && jrDetailId) renderJrDetailPage();
  showToast('Transaksi dihapus, saldo dikembalikan');
}

// ======================================================
// TRANSACTION: DETAIL PAGE
// ======================================================
let txDetailId = null;
let txDetailReturnPage = 'riwayat';

function openTransactionDetail(txId) {
  const t = transactions.find(x => x.id === txId);
  if (!t) return;
  txDetailId = txId;
  const activePage = document.querySelector('.page.active');
  const activePageId = activePage ? activePage.id.replace('page-', '') : 'riwayat';
  if (activePageId !== 'tx-detail') txDetailReturnPage = activePageId;

  const src = resolveTxParty(t.sourceId);
  const dest = t.destId ? resolveTxParty(t.destId) : null;

  let iconClass = 'out', amtClass = 'neg', amtPrefix = '−', tag = 'Pengeluaran';
  if (t.type === 'masuk') { iconClass = 'in'; amtClass = 'pos'; amtPrefix = '+'; tag = 'Pemasukan'; }
  if (t.type === 'transfer') { iconClass = 'transfer'; amtClass = 'neutral'; amtPrefix = ''; tag = 'Transfer'; }

  const iconEl = document.getElementById('txDetailIcon');
  iconEl.className = 'td-hero-icon ' + iconClass;
  iconEl.innerHTML = txIconHTML(t, src);

  document.getElementById('txDetailTag').textContent = tag;
  const amtEl = document.getElementById('txDetailAmount');
  amtEl.className = 'td-hero-amount ' + amtClass;
  amtEl.textContent = amtPrefix + t.amount.toLocaleString('id-ID');
  document.getElementById('txDetailName').textContent = t.type === 'transfer' ? (t.note || `${src ? src.name : '—'} → ${dest ? dest.name : '—'}`) : (t.note || t.category);

  const fields = [];
  fields.push({ label: 'Tanggal', value: formatTanggalLabel(t.date) });
  if (t.time) fields.push({ label: 'Waktu', value: t.time + ' WIB' });

  if (t.type === 'transfer') {
    fields.push({ label: 'Dari', value: src ? src.name : '—' });
    fields.push({ label: 'Ke', value: dest ? dest.name : '—' });
    if (t.fee) fields.push({ label: 'Biaya Admin', value: formatRupiah(t.fee) });
  } else {
    fields.push({ label: 'Kategori', value: t.category || '—' });
    fields.push({ label: 'Akun', value: src ? src.name : '—' });
    fields.push({ label: 'Metode', value: src ? (sourceTypeLabel[src.jenis] || src.jenis) : '—' });
  }
  fields.push({ label: 'Catatan', value: t.note || '—' });

  document.getElementById('txDetailFields').innerHTML = fields.map(f => `
    <div class="td-field-row">
      <span class="td-field-label">${f.label}</span>
      <span class="td-field-value">${f.value}</span>
    </div>`).join('');

  const attachWrap = document.getElementById('txDetailAttachWrap');
  if (t.attachment) {
    attachWrap.style.display = 'block';
    document.getElementById('txDetailAttachName').textContent = t.attachment.name || 'Lampiran.jpg';
    const sizeKB = t.attachment.dataUrl ? Math.round((t.attachment.dataUrl.length * 0.75) / 1024) : null;
    document.getElementById('txDetailAttachSize').textContent = sizeKB ? `${sizeKB} KB` : 'Gambar';
  } else {
    attachWrap.style.display = 'none';
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-tx-detail').classList.add('active');
}

function closeTransactionDetail() {
  goTo(txDetailReturnPage);
}

function previewTxDetailAttachment() {
  const t = transactions.find(x => x.id === txDetailId);
  if (!t || !t.attachment) return;
  document.getElementById('attachPreviewName').textContent = t.attachment.name || 'Lampiran';
  document.getElementById('attachPreviewImg').src = t.attachment.dataUrl;
  document.getElementById('attachPreviewOverlay').classList.add('open');
}

function closeAttachPreview() {
  document.getElementById('attachPreviewOverlay').classList.remove('open');
}

function closeAttachPreviewOutside(e) {
  if (e.target.id === 'attachPreviewOverlay') closeAttachPreview();
}

// ======================================================
// SHEET: ADD TRANSACTION
// ======================================================
function openAddTransaction() {
  txEditId = null;
  txType = 'keluar'; txCategoryVal = null; txSourceVal = null; txDestVal = null;
  document.querySelectorAll('#txTypeSeg .type-seg-item').forEach((el,i) => el.classList.toggle('active', i===0));
  document.getElementById('txAmount').value = '';
  document.getElementById('txFee').value = '';
  document.getElementById('txNote').value = '';
  document.getElementById('txNoteCount').textContent = '0/60';
  document.getElementById('txDate').value = todayISO();
  removeAttachFile();
  toggleAmountClear();
  updateTxFormLayout();
  const noSource = sources.length === 0;
  document.getElementById('noSourceBanner').style.display = noSource ? 'flex' : 'none';
  document.getElementById('txSaveBtn').style.opacity = noSource ? '0.5' : '1';
  openSheet();
}

function openSheet(sheetId) {
  const id = sheetId || 'sheetOverlay';
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeSheet(sheetId) {
  const id = sheetId || 'sheetOverlay';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function closeSheetOutside(e) {
  if (e.target.id === 'sheetOverlay') closeSheet();
}

// ======================================================
// PERIOD PANEL
// ======================================================
function togglePeriodPanel(e) {
  e.stopPropagation();
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('periodPanel').classList.toggle('open');
}

function selectPeriod(val) {
  heroPeriod = val;
  document.getElementById('periodLabel').textContent = val;
  document.querySelectorAll('.period-option').forEach(el => {
    el.classList.toggle('active', el.dataset.val === val);
  });
  document.getElementById('periodPanel').classList.remove('open');
  renderAll();
  showToast('Periode: ' + val);
}

// ======================================================
// NOTIF PANEL
// ======================================================
function toggleNotifPanel(e) {
  e.stopPropagation();
  document.getElementById('periodPanel').classList.remove('open');
  const panel = document.getElementById('notifPanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) renderNotifPanel();
}

// ======================================================
// RENDER ALL
// ======================================================
function renderAll() {
  renderProfile();
  renderKantong();
  renderShortcutGrid();
  renderHomeInsight();
  renderAmount(document.getElementById('heroAmount').dataset.mode || 'tersedia');
  const periodTx = transactions.filter(t => isInPeriod(t.date, heroPeriod) && !t.isFee && !t.isAdjustment && !t.isSaldoAwal);
  const masuk = periodTx.filter(t => t.type === 'masuk').reduce((a,t)=>a+t.amount,0);
  const keluar = periodTx.filter(t => t.type === 'keluar').reduce((a,t)=>a+t.amount,0);
  document.getElementById('heroMasukVal').textContent = masuk.toLocaleString('id-ID');
  document.getElementById('heroKeluarVal').textContent = keluar.toLocaleString('id-ID');
  renderTxList('txList', 5);
  document.getElementById('txEmptyState').style.display = transactions.length ? 'none' : 'block';
  if (document.getElementById('page-riwayat').classList.contains('active')) renderRiwayat();
  if (document.getElementById('page-source-detail').classList.contains('active') && sourceDetailId) {
    const s = sources.find(x => x.id === sourceDetailId);
    if (s) {
      document.getElementById('sourceDetailAmount').textContent = formatRupiah(s.saldo);
      renderSourceDetailTx();
    }
  }
  if (document.getElementById('page-statistik').classList.contains('active')) renderStatistik();
  if (document.getElementById('page-budget').classList.contains('active')) renderBudgetPage();
  if (document.getElementById('page-darurat').classList.contains('active')) renderDanaDaruratPage();
  if (document.getElementById('page-jurnal').classList.contains('active')) renderJurnalPage();
}

// ======================================================
// SOURCE DETAIL (terhubung dengan akun.js)
// ======================================================
let sourceDetailId = null;

function openSourceDetail(id) {
  const s = sources.find(x => x.id === id);
  if (!s) return;
  sourceDetailId = id;
  document.getElementById('sourceDetailTitle').textContent = s.name;
  document.getElementById('sourceDetailIcon').innerHTML = s.customIcon
    ? `<img src="${s.customIcon}">`
    : `<i class="bi ${sourceIcons[s.jenis] || 'bi-wallet2'}" style="color:#fff;"></i>`;
  document.getElementById('sourceDetailAmount').textContent = formatRupiah(s.saldo);
  updateSdChargeRow(s);
  renderSourceDetailTx();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-source-detail').classList.add('active');
}

// ======================================================
// BIAYA ADMIN & BUNGA BULANAN (Bank & Investasi)
// ======================================================
function updateSdChargeRow(s) {
  const row = document.getElementById('sdChargeRow');
  const adminBtn = document.getElementById('sdAdminBtn');
  const bungaBtn = document.getElementById('sdBungaBtn');
  if (!row || !adminBtn || !bungaBtn) return;
  if (s.jenis === 'rekening') {
    row.style.display = 'flex';
    adminBtn.style.display = '';
    bungaBtn.style.display = '';
  } else if (s.jenis === 'invest') {
    row.style.display = 'flex';
    adminBtn.style.display = 'none';
    bungaBtn.style.display = '';
  } else {
    row.style.display = 'none';
  }
}

function openAdminFeeSheet() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  document.getElementById('adminFeeInput').value = s.adminFee ? s.adminFee.toLocaleString('id-ID') : '';
  openSheet('adminFeeSheetOverlay');
}

function saveAdminFee() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  const val = parseInt((document.getElementById('adminFeeInput').value || '0').replace(/[^\d]/g, ''), 10) || 0;
  s.adminFee = val;
  saveSources(sources);
  closeSheet('adminFeeSheetOverlay');
  showToast('Biaya admin bulanan disimpan');
}

function openBungaSheet() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  document.getElementById('bungaPercentInput').value = s.bungaPercent || '';
  document.getElementById('pphPercentInput').value = (s.pphPercent === undefined || s.pphPercent === null) ? 20 : s.pphPercent;
  openSheet('bungaSheetOverlay');
}

function saveBunga() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  const bunga = parseFloat(document.getElementById('bungaPercentInput').value) || 0;
  const pphRaw = parseFloat(document.getElementById('pphPercentInput').value);
  s.bungaPercent = bunga;
  s.pphPercent = isNaN(pphRaw) ? 20 : pphRaw;
  saveSources(sources);
  closeSheet('bungaSheetOverlay');
  showToast('Pengaturan bunga disimpan');
}

// Diproses sekali tiap kali app dibuka di bulan baru (dipanggil di boot, sebelum renderAll).
// Akun baru dijadikan baseline dulu di bulan pertama dia terdeteksi, bukan langsung dikenai
// biaya/bunga, supaya akun yang baru dibuat tidak langsung "dipotong" di bulan yang sama.
function processMonthlyAccountCharges() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  let changed = false;

  sources.forEach(s => {
    if (s.jenis !== 'rekening' && s.jenis !== 'invest') return;
    if (s.lastChargeMonth === currentMonth) return;

    if (!s.lastChargeMonth) {
      s.lastChargeMonth = currentMonth;
      changed = true;
      return;
    }

    const basis = s.saldo;
    const adminFee = (s.jenis === 'rekening') ? (s.adminFee || 0) : 0;
    const bungaPercent = s.bungaPercent || 0;

    if (adminFee > 0 && basis > 0) {
      const feeAmt = Math.min(adminFee, s.saldo);
      s.saldo -= feeAmt;
      transactions.push({
        id: 'tx' + uniqueTick() + 'a' + s.id, type: 'keluar', amount: feeAmt, sourceId: s.id,
        category: 'Biaya Admin/Fee', note: 'Biaya admin bulanan otomatis',
        date: todayISO(), time: '00:00', isFee: true
      });
      changed = true;
    }

    if (bungaPercent > 0 && basis > 0) {
      const grossBunga = basis * bungaPercent / 100;
      const bebasPajak = basis <= 7500000;
      const effectivePph = bebasPajak ? 0 : (s.pphPercent === undefined || s.pphPercent === null ? 20 : s.pphPercent);
      const netBunga = Math.round(grossBunga * (1 - effectivePph / 100));
      if (netBunga > 0) {
        s.saldo += netBunga;
        transactions.push({
          id: 'tx' + uniqueTick() + 'b' + s.id, type: 'masuk', amount: netBunga, sourceId: s.id,
          category: 'Bunga Bank/Investasi',
          note: 'Bunga bulanan (estimasi)' + (bebasPajak ? ' - bebas pajak (saldo ≤ Rp7,5jt)' : ' - net PPh ' + effectivePph + '%'),
          date: todayISO(), time: '00:00', isFee: true
        });
        changed = true;
      }
    }

    s.lastChargeMonth = currentMonth;
    changed = true;
  });

  if (changed) {
    saveSources(sources);
    saveTransactions(transactions);
  }
}

function renderSourceDetailTx() {
  const listEl = document.getElementById('sourceDetailTxList');
  const emptyEl = document.getElementById('sourceDetailEmptyState');
  if (!listEl || !sourceDetailId) return;
  const list = transactions.filter(t => t.sourceId === sourceDetailId || t.destId === sourceDetailId);
  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = list.map(t => {
    const src = resolveTxParty(t.sourceId);
    const dest = t.destId ? resolveTxParty(t.destId) : null;
    let iconClass = 'out', amtClass = 'neg', amtPrefix = '−', name, sub;
    if (t.type === 'masuk') { iconClass='in'; amtClass='pos'; amtPrefix='+'; }
    if (t.type === 'transfer') {
      iconClass='transfer'; amtClass='neutral'; amtPrefix='';
      if (t.destId === sourceDetailId) { amtClass='pos'; amtPrefix='+'; }
      else { amtClass='neg'; amtPrefix='−'; }
      const arrow = `${src ? src.name : '—'} → ${dest ? dest.name : '—'}`;
      name = t.note || arrow;
      sub = t.note ? `${arrow} · ${formatTxDate(t.date)}` : formatTxDate(t.date);
    } else {
      name = t.note || t.category;
      sub = `${t.category} · ${formatTxDate(t.date)}`;
    }
    const iconHTML = txIconHTML(t, src);
    return `
      <div class="tx-row" data-tx="${t.id}" onclick="openTransactionDetail('${t.id}')">
        <div class="tx-icon ${iconClass}">${iconHTML}</div>
        <div class="tx-mid">
          <div class="tx-name">${name}</div>
          <div class="tx-meta">${sub}</div>
        </div>
        <div class="tx-amt ${amtClass}">${amtPrefix}${t.amount.toLocaleString('id-ID')}</div>
        <button class="tx-more-btn" onclick="event.stopPropagation(); openActionSheet('${t.id}')"><i class="bi bi-three-dots-vertical"></i></button>
      </div>`;
  }).join('');
}

function sourceDetailQuickTransfer(direction) {
  if (!sourceDetailId) return;
  if (sources.length < 2) {
    showToast('Butuh minimal 2 sumber dana untuk transfer. Tambahkan sumber dana lain dulu.');
    return;
  }
  openAddTransaction();
  txType = 'transfer';
  document.querySelectorAll('#txTypeSeg .type-seg-item').forEach(el => el.classList.toggle('active', el.dataset.type === 'transfer'));
  updateTxFormLayout();
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  const sub = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
  const ico = buildSourceIconHtml(s);
  if (direction === 'in') {
    txDestVal = sourceDetailId;
    document.getElementById('txDestLabelVal').textContent = s.name;
    document.getElementById('txDestSub').textContent = sub;
    document.getElementById('txDestSub').style.display = 'block';
    const iconWrap = document.getElementById('txDestIconWrap');
    iconWrap.innerHTML = ico.html;
    iconWrap.style.background = ico.bg;
    iconWrap.classList.remove('field-card-icon-mono');
    iconWrap.classList.add('field-card-icon');
    document.getElementById('txDestSelect').classList.remove('placeholder');
  } else {
    txSourceVal = sourceDetailId;
    // Transfer layout menggunakan txSourceLabelValTransfer dan txSourceIconWrapTransfer
    document.getElementById('txSourceLabelValTransfer').textContent = s.name;
    document.getElementById('txSourceSubTransfer').textContent = sub;
    document.getElementById('txSourceSubTransfer').style.display = 'block';
    ['txSourceIconWrap','txSourceIconWrapTransfer'].forEach(id => {
      const el = document.getElementById(id);
      el.innerHTML = ico.html;
      el.style.background = ico.bg;
      el.classList.remove('field-card-icon-mono');
      el.classList.add('field-card-icon');
    });
    document.getElementById('txSourceSelectTransfer').classList.remove('placeholder');
  }
}

function editSourceFromDetail() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  openSourceForm(s.kategori === 'invest' ? 'invest' : 'liquid', s.id, s.jenis);
}

async function deleteSourceFromDetail() {
  const s = sources.find(x => x.id === sourceDetailId);
  if (!s) return;
  await confirmAndDeleteSource(s, () => { goTo('kantong'); renderAll(); });
}

// ======================================================
// CONFIRM & DELETE SOURCE (terhubung dengan akun.js)
// ======================================================
async function confirmAndDeleteSource(s, onDone) {
  const hasHistory = transactions.some(t => t.sourceId === s.id || t.destId === s.id);

  // Jika saldo 0 dan tidak ada riwayat: hapus langsung tanpa konfirmasi
  if (s.saldo === 0 && !hasHistory) {
    sources = sources.filter(x => x.id !== s.id);
    saveSources(sources);
    onDone();
    showToast('Sumber dana dihapus');
    return;
  }

  // Susun pesan konfirmasi sesuai kondisi
  let msg = '';
  if (s.saldo !== 0 && hasHistory) {
    msg = `${s.name} masih punya saldo ${formatRupiah(s.saldo)} dan riwayat transaksi. Menghapusnya akan mencatat penyesuaian saldo ke riwayat secara otomatis.`;
  } else if (s.saldo !== 0) {
    msg = `${s.name} masih punya saldo ${formatRupiah(s.saldo)}. Menghapusnya akan mencatat penyesuaian saldo ke riwayat secara otomatis.`;
  } else {
    // saldo === 0 tapi ada riwayat
    msg = `${s.name} memiliki riwayat transaksi. Data riwayat akan tetap tersimpan meski akun ini dihapus.`;
  }

  const ok = await showConfirmDialog('Hapus Akun', msg, 'Hapus');
  if (!ok) return;

  // Catat penyesuaian jika ada saldo tersisa
  if (s.saldo !== 0) {
    transactions.unshift({
      id: 'tx'+uniqueTick(),
      type: s.saldo > 0 ? 'keluar' : 'masuk',
      amount: Math.abs(s.saldo),
      category: 'Lainnya',
      sourceId: s.id,
      note: `Penyesuaian: Hapus akun ${s.name}`,
      date: todayISO(),
      time: nowTime(),
      isAdjustment: true
    });
    saveTransactions(transactions);
    showToast(`Akun dihapus, saldo ${formatRupiah(Math.abs(s.saldo))} dicatat sebagai penyesuaian`);
  } else {
    showToast('Akun dihapus');
  }

  sources = sources.filter(x => x.id !== s.id);
  saveSources(sources);
  onDone();
}

// ======================================================
// EVENT BINDING
// ======================================================
document.querySelectorAll('#txTypeSeg .type-seg-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('#txTypeSeg .type-seg-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    txType = el.dataset.type;
    txCategoryVal = null; txSourceVal = null; txDestVal = null;
    updateTxFormLayout();
  });
});

// Tutup panel saat klik di luar
document.addEventListener('click', () => {
  document.getElementById('notifPanel').classList.remove('open');
  document.getElementById('periodPanel').classList.remove('open');
});

// ======================================================
// PWA / GESTURE PREVENT
// ======================================================
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
window.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && ['=','-','+','0'].includes(e.key)) e.preventDefault(); });
document.addEventListener('gesturestart', e => e.preventDefault());

// ======================================================
// ENTER KEY — tutup keyboard (blur aktif input)
// ======================================================
document.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      e.preventDefault();
      document.activeElement.blur();
    }
  }
});

// ======================================================
// BACK BUTTON (hardware/browser) — jangan tutup app
// ======================================================
// Peta "halaman aktif -> ke mana back-nya" -- nilainya bisa nama halaman
// (dipanggil lewat goTo) atau nama fungsi (kalau tujuan backnya dinamis,
// misal form yang bisa balik ke 2 tempat beda tergantung konteks).
// Ini SENGAJA niru persis onclick tombol panah-kembali yang udah ada di
// tiap halaman, biar tombol Back HP dan tombol Back di layar konsisten.
const PAGE_BACK_MAP = {
  'placeholder': 'beranda',
  'budget': 'beranda',
  'budget-detail': 'budget',
  'wishlist': 'beranda',
  'wishlist-form': 'closeWishlistForm',
  'wishlist-detail': 'closeWlDetail',
  'darurat': 'beranda',
  'utang': 'beranda',
  'utang-detail': 'closeUpDetail',
  'jurnal': 'beranda',
  'jurnal-evaluasi': 'jurnal',
  'jurnal-form': 'closeJurnalForm',
  'jurnal-detail': 'jurnal',
  'riwayat': 'beranda',
  'statistik': 'beranda',
  'pengaturan': 'beranda',
  'source-detail': 'kantong',
  'tx-detail': 'closeTransactionDetail',
};

(function initBackHandler() {
  // Push initial state supaya ada history entry untuk ditangkap
  history.pushState({ app: 'keluang', level: 0 }, '');

  window.addEventListener('popstate', e => {
    // Selalu push state baru agar back tidak exit app
    history.pushState({ app: 'keluang', level: 0 }, '');

    // Prioritas 1: tutup sheet yang terbuka
    const openSheet = document.querySelector('.sheet-overlay.open');
    if (openSheet) {
      closeSheet(openSheet.id !== 'sheetOverlay' ? openSheet.id : undefined);
      return;
    }

    // Prioritas 2: tutup panel yang terbuka
    const notifPanel = document.getElementById('notifPanel');
    const periodPanel = document.getElementById('periodPanel');
    if (notifPanel && notifPanel.classList.contains('open')) {
      notifPanel.classList.remove('open'); return;
    }
    if (periodPanel && periodPanel.classList.contains('open')) {
      periodPanel.classList.remove('open'); return;
    }

    // Prioritas 3: blur input aktif (tutup keyboard)
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA')) {
      document.activeElement.blur(); return;
    }

    // Prioritas 4: balik ke halaman/aksi yang SAMA PERSIS kayak tombol
    // panah-kembali di layar itu -- biar back HP konsisten sama back
    // di app, bukan selalu lompat ke Beranda.
    const activePage = document.querySelector('.page.active');
    if (activePage && activePage.id !== 'page-beranda') {
      const pid = activePage.id.replace('page-', '');
      const target = PAGE_BACK_MAP[pid] || 'beranda';
      if (typeof window[target] === 'function') window[target]();
      else goTo(target);
      return;
    }
    // Sudah di halaman utama, tidak ada yang terbuka — tampilkan konfirmasi keluar
    showExitConfirm();
  });
})();

// Dialog konfirmasi keluar app
function showExitConfirm() {
  // Cegah duplikat
  if (document.getElementById('exitConfirmOverlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'exitConfirmOverlay';
  overlay.style.cssText = `
    position:fixed; inset:0; z-index:99999;
    background:rgba(28,21,48,0.55);
    display:flex; align-items:center; justify-content:center;
    animation:fadeIn .15s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background:var(--surface); border-radius:var(--radius-lg);
      padding:28px 24px 20px; width:88%; max-width:320px;
      box-shadow:var(--shadow-lg); text-align:center;
      animation:slideUp .2s ease;
    ">
      <div style="font-size:32px; margin-bottom:10px;">👋</div>
      <div style="font-size:16px; font-weight:800; color:var(--ink-900); margin-bottom:6px;">Keluar dari Keluang?</div>
      <div style="font-size:13px; color:var(--ink-500); margin-bottom:22px; line-height:1.5;">Semua data kamu tersimpan dengan aman.</div>
      <div style="display:flex; gap:10px;">
        <button onclick="document.getElementById('exitConfirmOverlay').remove()" style="
          flex:1; padding:12px; border-radius:var(--radius-md);
          background:var(--surface-sunken); border:none; cursor:pointer;
          font-size:14px; font-weight:700; color:var(--ink-700);
        ">Batal</button>
        <button onclick="navigator.app ? navigator.app.exitApp() : window.close()" style="
          flex:1; padding:12px; border-radius:var(--radius-md);
          background:var(--danger); border:none; cursor:pointer;
          font-size:14px; font-weight:700; color:#fff;
        ">Keluar</button>
      </div>
    </div>
  `;

  // Tap overlay luar = batal
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('service-worker.js').catch(() => {}); });
}


// ======================================================
// ONBOARDING
// ======================================================
let onbStep = 0;
let onbPhotoData = null;

function onbShow() {
  document.getElementById('onbOverlay').classList.add('active');
  onbSetActivePage('onbPageWelcome');
}

function onbSetActivePage(id) {
  document.querySelectorAll('.onb-page').forEach(p => p.classList.toggle('active', p.id === id));
  const dots = document.getElementById('onbStepsDots');
  if (dots) dots.style.display = (id === 'onbPageWelcome') ? 'none' : 'flex';
}

function onbStartNew() {
  onbStep = 0;
  onbSetActivePage('onbStep0');
  document.querySelectorAll('.onb-step').forEach((d, i) => d.classList.toggle('active', i === 0));
}

function onbGoTo(step) {
  const ids = ['onbStep0', 'onbStep1', 'onbStep2'];
  onbSetActivePage(ids[step]);
  document.querySelectorAll('.onb-step').forEach((d, i) => d.classList.toggle('active', i === step));
  onbStep = step;
  if (step === 2) onbBuildSummary();
}

function onbNext() { onbGoTo(onbStep + 1); }
function onbBack() {
  if (onbStep === 0) { onbSetActivePage('onbPageWelcome'); return; }
  onbGoTo(onbStep - 1);
}

function onbValidateStep0() {
  const ok = document.getElementById('onbName').value.trim().length > 0;
  document.getElementById('onbBtn0').disabled = !ok;
}

function onbValidateStep1() {
  const ok = document.getElementById('onbAccName').value.trim().length > 0;
  document.getElementById('onbBtn1').disabled = !ok;
}

function onbHandleAvatar(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    onbPhotoData = ev.target.result;
    const el = document.getElementById('onbAvatarPreview');
    el.innerHTML = '<img src="' + onbPhotoData + '">';
  };
  reader.readAsDataURL(file);
}

function formatOnbSaldo(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  el.value = raw ? parseInt(raw, 10).toLocaleString('id-ID') : '';
}

function onbBuildSummary() {
  const name = document.getElementById('onbName').value.trim();
  const accName = document.getElementById('onbAccName').value.trim();
  const jenisEl = document.querySelector('#onbJenisSeg .type-seg-item.active');
  const jenis = jenisEl ? jenisEl.dataset.jenis : 'rekening';
  const jenisLabel = { tunai: 'Cash', rekening: 'Bank', ewallet: 'E-Wallet' };
  const saldoRaw = document.getElementById('onbSaldo').value.replace(/[^0-9]/g, '');
  const saldo = parseInt(saldoRaw || '0', 10);
  document.getElementById('onbConfirmTitle').textContent = 'Siap, ' + name + '!';
  document.getElementById('onbSummary').innerHTML =
    '<div class="onb-summary-row">' +
      '<span class="onb-summary-label">Nama</span>' +
      '<span class="onb-summary-val">' + name + '</span>' +
    '</div>' +
    '<div class="onb-summary-row">' +
      '<span class="onb-summary-label">Akun pertama</span>' +
      '<span class="onb-summary-val">' + accName + ' (' + (jenisLabel[jenis] || jenis) + ')</span>' +
    '</div>' +
    '<div class="onb-summary-row">' +
      '<span class="onb-summary-label">Saldo awal</span>' +
      '<span class="onb-summary-val">Rp ' + saldo.toLocaleString('id-ID') + '</span>' +
    '</div>';
}

function onbFinish() {
  const name = document.getElementById('onbName').value.trim();
  const accName = document.getElementById('onbAccName').value.trim();
  const jenisEl = document.querySelector('#onbJenisSeg .type-seg-item.active');
  const jenis = jenisEl ? jenisEl.dataset.jenis : 'rekening';
  const saldoRaw = document.getElementById('onbSaldo').value.replace(/[^0-9]/g, '');
  const saldo = parseInt(saldoRaw || '0', 10);

  profile = { name, photo: onbPhotoData };
  saveProfile(profile);

  const srcId = 's' + uniqueTick();
  sources.push({ id: srcId, name: accName, jenis, saldo, kategori: 'liquid', customIcon: null });
  saveSources(sources);

  if (saldo > 0) {
    transactions.unshift({
      id: 'tx' + (uniqueTick() + 1),
      type: 'masuk',
      amount: saldo,
      category: 'Saldo Awal',
      sourceId: srcId,
      note: 'Saldo awal ' + accName,
      date: todayISO(),
      time: nowTime(),
      isSaldoAwal: true
    });
    saveTransactions(transactions);
  }

  document.getElementById('onbOverlay').classList.remove('active');
  document.documentElement.classList.remove('onb-pending');
  renderAll();
  showToast('Selamat datang, ' + name + '!');
}

// ======================================================
// STATUS BAR COLOR SYNC (Android)
// ======================================================
// Warna teratas gradient .hero-wrap di beranda (persis warna yang
// tampak tepat di bawah status bar saat berada di posisi paling atas).
const STATUS_BAR_HERO_COLOR = '#2E2266';
let _statusBarMeta = null;

function getStatusBarMeta() {
  if (!_statusBarMeta) _statusBarMeta = document.querySelector('meta[name="theme-color"]');
  return _statusBarMeta;
}

function getPageBgColor() {
  const val = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  return val || '#F5F4FA';
}

function getPageSurfaceColor() {
  // Warna .lp-topbar (header halaman selain beranda) supaya status bar
  // menyatu persis dengan header tersebut, bukan warna --bg di baliknya.
  // Otomatis ikut tema aktif karena --surface berubah di [data-theme="dark"].
  const val = getComputedStyle(document.documentElement).getPropertyValue('--surface').trim();
  return val || '#FFFFFF';
}

function setStatusBarColor(color) {
  const meta = getStatusBarMeta();
  if (meta && meta.getAttribute('content') !== color) {
    meta.setAttribute('content', color);
  }
}

function syncStatusBarColor() {
  const beranda = document.getElementById('page-beranda');
  const berandaActive = beranda && beranda.classList.contains('active');
  if (berandaActive) {
    // hero-wrap selalu terlihat di Beranda (tidak ikut ter-scroll), jadi
    // status bar dibiarkan tetap warna hero berapa pun posisi scrollnya.
    setStatusBarColor(STATUS_BAR_HERO_COLOR);
  } else {
    setStatusBarColor(getPageSurfaceColor());
  }
}

function initStatusBarSync() {
  // Scroll di dalam beranda (event scroll tidak bubble, jadi dengar di
  // capture phase supaya tetap ke-detect dari elemen manapun yang discroll).
  document.addEventListener('scroll', function(e) {
    if (e.target && e.target.classList && e.target.classList.contains('scroll-content')) {
      syncStatusBarColor();
    }
  }, true);

  // Pantau perpindahan halaman (.page.active berubah), termasuk yang
  // di-toggle langsung tanpa lewat goTo() seperti detail transaksi/sumber.
  const appShell = document.getElementById('appShell');
  if (appShell && window.MutationObserver) {
    const observer = new MutationObserver(function(mutations) {
      for (const m of mutations) {
        if (m.attributeName === 'class') { syncStatusBarColor(); return; }
      }
    });
    observer.observe(appShell, { attributes: true, attributeFilter: ['class'], subtree: true });
  }

  syncStatusBarColor();
}

// ======================================================
// INIT
// ======================================================
initCategories();
initTheme();
initStatusBarSync();

document.addEventListener('DOMContentLoaded', function() {
  // Migrasi data lama ke format terkompresi + cleanup field redundan
  migrateToCompressed();
  // Arsip otomatis transaksi > 12 bulan
  archiveOldTransactions(12);

  document.querySelectorAll('#onbJenisSeg .type-seg-item').forEach(function(el) {
    el.addEventListener('click', function() {
      document.querySelectorAll('#onbJenisSeg .type-seg-item').forEach(function(x) { x.classList.remove('active'); });
      el.classList.add('active');
      onbValidateStep1();
    });
  });

  if (loadSources().length === 0) {
    onbShow();
  } else {
    processMonthlyAccountCharges();
    renderAll();
    updateNotifBadge();
    checkAutoReminders();
    setTimeout(showNextReminderModal, 500);
  }
});