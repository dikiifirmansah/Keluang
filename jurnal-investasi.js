// ======================================================
// MODULE: Jurnal Investasi
// STATUS: Aktif
// ======================================================
// Konsep: tiap ASET (saham/reksadana/obligasi/crypto/emas/lainnya) dibeli
// pakai dana dari Akun Investasi (kategori 'invest'). Modal dihitung pakai
// metode Average Cost (bukan FIFO) biar sederhana. Update harga pasar
// dilakukan manual (app offline-first, gak ada feed harga live) dan gak
// menggerakkan saldo akun manapun -- cuma mengubah nilai wajar portofolio.
// Jual aset mengembalikan dana ke Akun Investasi tujuan.
//
// Dividen/Bunga & benchmark vs IHSG SENGAJA belum ada di versi ini --
// dividen/bunga butuh jalur hitung baru (gak ngurangin unit/modal kayak
// jual), dan benchmark butuh data pasar dari internet padahal app ini
// offline-first (harga diisi manual). Ditunda, bukan kelupaan.
// ======================================================

const JR_JENIS = {
  saham:     { label: 'Saham',     icon: 'bi-graph-up-arrow',        color: '#499AFD' },
  reksadana: { label: 'Reksadana', icon: 'bi-pie-chart-fill',        color: '#775EED' },
  obligasi:  { label: 'Obligasi',  icon: 'bi-file-earmark-text-fill',color: '#06A876' },
  crypto:    { label: 'Crypto',    icon: 'bi-currency-bitcoin',      color: '#F98F00' },
  emas:      { label: 'Emas',      icon: 'bi-gem',                   color: '#D4A855' },
  lainnya:   { label: 'Lainnya',   icon: 'bi-briefcase-fill',        color: '#6C7789' },
};

// Alasan Keputusan -- murni alasan RASIONAL (bukan kondisi emosi, itu field
// terpisah). FOMO sengaja gak ada di sini karena itu emosi, bukan alasan.
const JR_ALASAN_KEPUTUSAN = [
  'Fundamental Membaik', 'Valuasi Menarik', 'DCA Rutin',
  'Diversifikasi', 'Ikut Rekomendasi Orang Lain',
];
const JR_ALASAN_JUAL = ['Untung Sesuai Target', 'Kena Batas Rugi', 'Butuh Dana Mendadak', 'Ganti ke Aset Lain', 'Panic Selling', 'Fundamental Berubah'];
const JR_EMOSI = {
  sangatTakut:  { label: 'Sangat Takut',  emoji: '😨', color: '#E5484D' },
  takut:        { label: 'Takut',         emoji: '😟', color: '#F98F00' },
  netral:       { label: 'Netral',        emoji: '😐', color: '#6C7789' },
  optimis:      { label: 'Optimis',       emoji: '🙂', color: '#499AFD' },
  sangatYakin:  { label: 'Sangat Yakin',  emoji: '😎', color: '#06A876' },
  fomo:         { label: 'FOMO',          emoji: '🤯', color: '#F98F00' },
  revengeTrade: { label: 'Revenge Trade', emoji: '🔥', color: '#E5484D' },
};
const JR_HORIZON = ['<1 Tahun', '1-3 Tahun', '3-5 Tahun', '>5 Tahun'];
// Breakdown pola (emosi/alasan/holding/bias) baru ditampilkan kalau transaksi
// jual udah sebanyak ini -- di bawah itu polanya gampang menyesatkan.
const JR_EVAL_MIN_TRADES = 5;

let jrEyeHidden = false;
let jrExtraOpen = false;
let jrFilterJenis = null; // null = semua jenis
let jrCustomTags = { alasan: [], alasanJual: [] };
let jrCustomTagKind = null;

// Form state (dipakai page-jurnal-form, untuk Tambah Aset & Beli Lagi)
let jrFormAssetId = null;   // null = aset baru
let jrFormJenis = null;
let jrFormAccountId = null;
let jrAccountPickerContext = 'form'; // 'form' (beli) atau 'jual' -- 1 sheet dipakai bareng
let jrFormDate = null;
let jrFormAlasan = [];
let jrFormEmosi = null;
let jrFormAdvancedOpen = false;
let jrFormLogo = null;
let jrFormHorizon = null;
let jrFormReviewDate = null;

// Transaksi sheet state
let jrTxAssetId = null;
let jrTxAccountId = null;
let jrJualAlasan = [];
let jrJualEmosiVal = null;
let jrJualSesuaiRencana = null;
let jrJualAdvancedOpen = false;

// Logo/crop state
let jrCropSourceDataUrl = null;
let jrCropInstance = null;
let jrLogoEditAssetId = null; // kalau diisi = lagi ubah logo aset yg sudah ada (bukan lewat form)

// Detail page tab state
let jrDetailId = null;
let jrDetailTab = 'ringkasan';
let jrEvalTab = 'ringkasan';

// ======================================================
// INIT & HELPERS DASAR
// ======================================================
function initJurnalInvestasi() {
  jrCustomTags = loadJrCustomTags();
  renderJurnalPage();
}

function getJI() { return loadJurnalInvestasi(); }

function jrInvestAccounts() { return sources.filter(s => s.kategori === 'invest'); }

function jrAvgHarga(a) { return a.totalUnit > 0 ? a.totalModal / a.totalUnit : 0; }
function jrNilaiPasar(a) { return a.totalUnit * (a.hargaPasar || 0); }
function jrPnlNominal(a) { return jrNilaiPasar(a) - a.totalModal; }
function jrPnlPct(a) { return a.totalModal > 0 ? (jrPnlNominal(a) / a.totalModal) * 100 : 0; }

function calcJurnalInvestasiTotal() {
  return getJI().filter(a => a.status === 'aktif').reduce((sum, a) => sum + jrNilaiPasar(a), 0);
}

function jrTxError(errEl, msg) { errEl.textContent = msg; errEl.style.display = 'block'; }

function jrDaysBetween(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return null;
  const d1 = new Date(dateStr1 + 'T00:00:00');
  const d2 = new Date(dateStr2 + 'T00:00:00');
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

function jrFindLastPlan(a, juaEntryId) {
  const idx = a.riwayat.findIndex(h => h.id === juaEntryId);
  if (idx === -1) return null;
  for (let i = idx - 1; i >= 0; i--) {
    const h = a.riwayat[i];
    if (h.type === 'beli' && (h.targetPct || h.stopLossPct)) return h;
  }
  return null;
}

// ======================================================
// VISUALISASI: donut alokasi per jenis aset & sparkline histori harga --
// biar gak cuma baris teks angka doang (dashboard fintech mestinya
// nunjukin pola secara visual, bukan cuma daftar).
// ======================================================
function jrBuildDonutSVG(aktif) {
  const byJenis = {};
  aktif.forEach(a => {
    const nilai = jrNilaiPasar(a);
    if (!byJenis[a.jenis]) byJenis[a.jenis] = 0;
    byJenis[a.jenis] += nilai;
  });
  const total = Object.values(byJenis).reduce((s, v) => s + v, 0);
  const keys = Object.keys(byJenis).sort((x, y) => byJenis[y] - byJenis[x]);
  if (!total || !keys.length) return '';

  const R = 40, C = 2 * Math.PI * R, CX = 50, CY = 50;
  let offset = 0;
  const circles = keys.map(k => {
    const meta = JR_JENIS[k] || JR_JENIS.lainnya;
    const pct = byJenis[k] / total;
    const dash = pct * C;
    const circle = `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${meta.color}" stroke-width="14" stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${CX} ${CY})"></circle>`;
    offset += dash;
    return circle;
  }).join('');

  const legend = keys.map(k => {
    const meta = JR_JENIS[k] || JR_JENIS.lainnya;
    const pct = (byJenis[k] / total) * 100;
    return `<div class="jr-donut-legend-row"><span class="jr-donut-legend-dot" style="background:${meta.color};"></span>${meta.label}<span class="jr-donut-legend-pct">${pct.toFixed(0)}%</span></div>`;
  }).join('');

  return `
    <div class="jr-donut-wrap">
      <svg width="100" height="100" viewBox="0 0 100 100">${circles}</svg>
      <div class="jr-donut-legend">${legend}</div>
    </div>`;
}

// ======================================================
// RENDER: HALAMAN UTAMA (Overview Portofolio)
// ======================================================
function renderJurnalPage() {
  const list = getJI();
  const body = document.getElementById('jrBody');
  const aktif = list.filter(a => a.status === 'aktif');
  document.getElementById('jrEvaluasiBtn').style.display = list.length ? 'flex' : 'none';

  if (!list.length) {
    body.innerHTML = `
      <div class="bdg-empty" style="margin-top:24px;">
        <i class="bi bi-graph-up-arrow" style="font-size:38px; color:var(--ink-300);"></i>
        <div class="bdg-empty-title">Belum Ada Aset Investasi</div>
        <div class="bdg-empty-sub">Catat pembelian saham, reksadana, crypto, emas, atau aset lain di sini buat pantau modal dan untung/rugimu.</div>
        <button class="dd-empty-cta" style="margin-top:16px;" onclick="openJurnalForm(null)">
          <i class="bi bi-plus-lg"></i> Tambah Aset
        </button>
      </div>`;
    return;
  }

  const totalModal = aktif.reduce((s, a) => s + a.totalModal, 0);
  const totalNilai = aktif.reduce((s, a) => s + jrNilaiPasar(a), 0);
  const totalPnl = totalNilai - totalModal;
  const totalPnlPct = totalModal > 0 ? (totalPnl / totalModal) * 100 : 0;
  const untung = totalPnl >= 0;
  const eye = (v) => jrEyeHidden ? '••••••' : v;

  let html = `
    <div class="wl-hero">
      <div class="wl-hero-head">
        <div class="wl-hero-title">Ringkasan Portofolio</div>
        <div class="wl-hero-actions">
          <button class="wl-eye-btn" onclick="toggleJrEye()"><i class="bi ${jrEyeHidden ? 'bi-eye-slash' : 'bi-eye'}"></i></button>
          <button class="wl-hero-toggle-btn ${jrExtraOpen ? 'open' : ''}" onclick="toggleJrExtra()"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div class="bdg-hero-row" style="margin-top:10px;">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">Total Modal</div>
          <div class="bdg-hero-val">${eye(formatRupiah(totalModal))}</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Nilai Pasar Saat Ini</div>
          <div class="bdg-hero-val">${eye(formatRupiah(totalNilai))}</div>
        </div>
      </div>
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct" style="color:${untung ? '#06A876' : 'var(--danger)'};">${untung ? '▲' : '▼'} ${eye(formatRupiah(Math.abs(totalPnl)))}</div>
        <div class="bdg-hero-sisa" style="color:${untung ? '#06A876' : 'var(--danger)'};">${eye(totalPnlPct.toFixed(1) + '%')} ${untung ? 'untung' : 'rugi'}</div>
      </div>
      <div class="st-extra-grid" style="display:${jrExtraOpen ? 'grid' : 'none'}; margin-top:14px;">
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-collection"></i> Jumlah Aset</div>
          <div class="ec-val">${aktif.length}</div>
          <div class="ec-sub">aset aktif</div>
        </div>
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-graph-up"></i> Return</div>
          <div class="ec-val" style="color:${untung ? '#06A876' : 'var(--danger)'};">${untung ? '+' : ''}${eye(totalPnlPct.toFixed(1) + '%')}</div>
          <div class="ec-sub">sejak awal beli</div>
        </div>
      </div>
      ${jrExtraOpen && (new Set(aktif.map(a => a.jenis))).size >= 2 ? `
      <div style="margin-top:10px; padding-top:14px; border-top:1px solid var(--border);">
        <div style="font-size:11px; font-weight:700; color:var(--ink-300); margin-bottom:10px;">Alokasi per Jenis Aset</div>
        ${jrBuildDonutSVG(aktif)}
      </div>` : ''}
    </div>

    <div class="wl-section-title jr-gap-lg">Daftar Aset</div>
    ${(new Set(aktif.map(a => a.jenis))).size >= 2 ? `
    <div class="rw-chip-wrap" style="margin-bottom:12px;">
      <button type="button" class="rw-fchip ${!jrFilterJenis ? 'active' : ''}" onclick="jrSetFilterJenis(null)">Semua</button>
      ${[...new Set(aktif.map(a => a.jenis))].map(j => `<button type="button" class="rw-fchip ${jrFilterJenis === j ? 'active' : ''}" onclick="jrSetFilterJenis('${j}')">${(JR_JENIS[j] || JR_JENIS.lainnya).label}</button>`).join('')}
    </div>` : ''}
    <div id="jrList" class="wl-list">${aktif.filter(a => !jrFilterJenis || a.jenis === jrFilterJenis).map(jrItemHTML).join('')}</div>
    <button class="kt-add-btn" onclick="openJurnalForm(null)" style="margin-top:12px;">
      <i class="bi bi-plus-lg"></i> Tambah Aset
    </button>`;

  const terjual = list.filter(a => a.status === 'terjual');
  if (terjual.length) {
    html += `<div class="wl-section-title jr-gap-lg">Sudah Terjual Habis</div>
      <div class="wl-list">${terjual.map(jrItemHTML).join('')}</div>`;
  }

  html += `<div style="height:24px;"></div>`;
  body.innerHTML = html;
}

function toggleJrEye() { jrEyeHidden = !jrEyeHidden; renderJurnalPage(); }
function toggleJrExtra() { jrExtraOpen = !jrExtraOpen; renderJurnalPage(); }
function jrSetFilterJenis(j) { jrFilterJenis = j; renderJurnalPage(); }

function jrItemHTML(a) {
  const meta = JR_JENIS[a.jenis] || JR_JENIS.lainnya;
  const nilai = jrNilaiPasar(a);
  const pnl = jrPnlNominal(a);
  const pnlPct = jrPnlPct(a);
  const untung = pnl >= 0;
  const soldOut = a.status === 'terjual';
  const thumb = a.logo
    ? `<img src="${a.logo}" style="width:44px; height:44px; border-radius:12px; object-fit:cover; display:block; flex-shrink:0;" alt="">`
    : `<div style="width:44px; height:44px; border-radius:12px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${meta.color}20;">
         <i class="bi ${meta.icon}" style="color:${meta.color}; font-size:19px;"></i>
       </div>`;

  return `
    <div class="wl-item jr-item-accent" style="padding:12px 14px; align-items:center; border-left-color:${soldOut ? 'var(--border)' : meta.color};" onclick="openJrDetail('${a.id}')">
      ${thumb}
      <div class="wl-item-body">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div class="wl-item-name">${escapeHtml(a.nama)}</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:13px; font-weight:700; color:${soldOut ? 'var(--ink-300)' : untung ? '#06A876' : 'var(--danger)'}; flex-shrink:0;">${soldOut ? 'Terjual' : (untung ? '+' : '') + pnlPct.toFixed(1) + '%'}</div>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:3px;">
          <div style="font-size:11px; color:var(--ink-500); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${soldOut ? 'Modal ' + formatRupiah(a.totalModal) : a.totalUnit + ' unit · Modal ' + formatRupiah(a.totalModal)}</div>
          <div style="font-family:'JetBrains Mono',monospace; font-size:11.5px; font-weight:700; color:var(--ink-700); flex-shrink:0;">${formatRupiah(soldOut ? 0 : nilai)}</div>
        </div>
      </div>
      </div>
    </div>`;
}

function getJrById(id) { return getJI().find(a => a.id === id); }

function openJrDetail(id) {
  jrDetailId = id;
  jrDetailTab = 'ringkasan';
  goTo('jurnal-detail');
}
// ======================================================
// DETAIL ASET -- 3 tab: Ringkasan (data) / Jurnal (alasan+evaluasi) / Lampiran
// ======================================================
function jrSwitchDetailTab(tab) {
  jrDetailTab = tab;
  renderJrDetailPage();
}

function renderJrDetailPage() {
  const a = getJrById(jrDetailId);
  const body = document.getElementById('jrDetailBody');
  if (!a) { goTo('jurnal'); return; }

  const meta = JR_JENIS[a.jenis] || JR_JENIS.lainnya;
  document.getElementById('jrDetailTitle').textContent = a.nama;
  document.getElementById('jrDetailSubtitle').textContent = meta.label;

  const tabs = [['ringkasan', 'Ringkasan'], ['jurnal', 'Jurnal'], ['lampiran', 'Lampiran']];
  let html = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px;">
      <div style="position:relative; width:56px; height:56px; flex-shrink:0;" onclick="openJrLogoUpload('${a.id}')">
        ${a.logo
          ? `<img src="${a.logo}" style="width:56px; height:56px; border-radius:14px; object-fit:cover; display:block;" alt="">`
          : `<div style="width:56px; height:56px; border-radius:14px; display:flex; align-items:center; justify-content:center; background:${meta.color}20;"><i class="bi ${meta.icon}" style="color:${meta.color}; font-size:24px;"></i></div>`}
        <div style="position:absolute; bottom:-4px; right:-4px; width:20px; height:20px; border-radius:50%; background:var(--primary); display:flex; align-items:center; justify-content:center; border:2px solid var(--surface);">
          <i class="bi bi-pencil-fill" style="color:#fff; font-size:9px;"></i>
        </div>
      </div>
      <div style="font-size:11.5px; color:var(--ink-300); font-weight:600;">Tap logo untuk mengganti gambar aset</div>
    </div>

    <div class="jr-tabbar">
      ${tabs.map(([key, label]) => `<div class="jr-tab ${jrDetailTab === key ? 'active' : ''}" onclick="jrSwitchDetailTab('${key}')">${label}</div>`).join('')}
    </div>
  `;

  if (jrDetailTab === 'ringkasan') html += jrRenderTabRingkasan(a, meta);
  else if (jrDetailTab === 'jurnal') html += jrRenderTabCatatan(a) + jrRenderTabEvaluasiAset(a);
  else if (jrDetailTab === 'lampiran') html += jrRenderTabLampiran(a);

  html += `<div style="height:24px;"></div>`;
  body.innerHTML = html;
}

// ---------- TAB: RINGKASAN ----------
function jrRenderTabRingkasan(a, meta) {
  const nilai = jrNilaiPasar(a);
  const pnl = jrPnlNominal(a);
  const pnlPct = jrPnlPct(a);
  const untung = pnl >= 0;
  const avg = jrAvgHarga(a);
  const akun = sources.find(s => s.id === a.akunId);
  const soldOut = a.status === 'terjual';
  const firstBeli = (a.riwayat || []).find(h => h.type === 'beli');
  const holdDays = firstBeli ? jrDaysBetween(firstBeli.tanggal, soldOut ? (a.riwayat.slice().reverse().find(h => h.type === 'jual') || {}).tanggal : todayISO()) : null;

  let html = `
    <div class="wl-hero">
      <div class="wl-hero-head">
        <div class="wl-hero-title">${soldOut ? 'Sudah Terjual Habis' : 'Nilai Pasar Saat Ini'}</div>
      </div>
      <div class="bdg-hero-row" style="margin-top:10px;">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">${soldOut ? 'Modal' : 'Nilai Pasar'}</div>
          <div class="bdg-hero-val">${formatRupiah(soldOut ? 0 : nilai)}</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Unit Dimiliki</div>
          <div class="bdg-hero-val">${soldOut ? '0' : a.totalUnit}</div>
        </div>
      </div>
      ${soldOut ? '' : `
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct" style="color:${untung ? '#06A876' : 'var(--danger)'};">${untung ? '▲' : '▼'} ${formatRupiah(Math.abs(pnl))}</div>
        <div class="bdg-hero-sisa" style="color:${untung ? '#06A876' : 'var(--danger)'};">${pnlPct.toFixed(1)}% ${untung ? 'untung' : 'rugi'}</div>
      </div>`}
    </div>

    ${soldOut ? '' : `
    <div class="wl-action-row jr-gap-md">
      <div class="wl-action-btn" onclick="openJrUpdateHarga('${a.id}')">
        <div class="wl-action-btn-icon" style="background:var(--info-100);"><i class="bi bi-arrow-repeat" style="color:var(--info);"></i></div>
        <div class="wl-action-btn-label">Update Harga</div>
      </div>
      <div class="wl-action-btn" onclick="openJurnalForm('${a.id}')">
        <div class="wl-action-btn-icon" style="background:var(--primary-100);"><i class="bi bi-plus-lg" style="color:var(--primary);"></i></div>
        <div class="wl-action-btn-label">Beli Lagi</div>
      </div>
      <div class="wl-action-btn" onclick="openJrJual('${a.id}')">
        <div class="wl-action-btn-icon" style="background:var(--warning-100);"><i class="bi bi-cash-coin" style="color:var(--warning);"></i></div>
        <div class="wl-action-btn-label">Jual Aset</div>
      </div>
    </div>`}

    <div class="wl-info-card jr-gap-md">
      <div class="wl-info-row"><i class="bi bi-tag"></i><div class="wl-info-label">Jenis Aset</div><div class="wl-info-val">${meta.label}</div></div>
      <div class="wl-info-row"><i class="bi bi-wallet2"></i><div class="wl-info-label">Akun Investasi</div><div class="wl-info-val">${akun ? escapeHtml(akun.name) : '-'}</div></div>
      ${soldOut ? '' : `<div class="wl-info-row"><i class="bi bi-graph-up"></i><div class="wl-info-label">Harga Rata-rata</div><div class="wl-info-val">${formatRupiah(avg)}</div></div>
      <div class="wl-info-row"><i class="bi bi-cash"></i><div class="wl-info-label">Harga Pasar</div><div class="wl-info-val">${formatRupiah(a.hargaPasar || 0)}${a.hargaPasarUpdatedAt ? ` <span style="font-weight:600;color:var(--ink-300);">· ${formatTanggalLabel(a.hargaPasarUpdatedAt.slice(0,10))}</span>` : ''}</div></div>`}
      <div class="wl-info-row"><i class="bi bi-clock-history"></i><div class="wl-info-label">Status</div><div class="wl-info-val">${soldOut ? 'Sudah Dijual' : 'Masih Dipegang'}</div></div>
      <div class="wl-info-row"><i class="bi bi-calendar-range"></i><div class="wl-info-label">Durasi Disimpan</div><div class="wl-info-val">${holdDays !== null ? holdDays + ' hari' : '-'}</div></div>
    </div>

    <div class="wl-section-title jr-gap-lg" style="display:flex; align-items:center; justify-content:space-between;">
      <span>Riwayat Transaksi</span>
      <button class="wl-eye-btn" style="padding:0;" onclick="openJrHapus('${a.id}')"><i class="bi bi-trash3" style="color:var(--danger); font-size:15px;"></i></button>
    </div>`;

  if (!a.riwayat || !a.riwayat.length) {
    html += `<div class="kt-empty">Belum ada riwayat.</div>`;
  } else {
    html += a.riwayat.slice().reverse().map(h => {
      const dLabel = formatTanggalLabel(h.tanggal);
      let label, amtColor, amtText;
      if (h.type === 'beli') {
        label = `Beli ${h.jumlah} unit di harga ${formatRupiah(h.harga)}`;
        amtColor = 'var(--danger)'; amtText = `−${formatRupiah(h.total)}`;
      } else if (h.type === 'jual') {
        label = `Jual ${h.jumlah} unit di harga ${formatRupiah(h.harga)}`;
        amtColor = '#06A876'; amtText = `+${formatRupiah(h.total)}`;
      } else {
        label = `Update harga pasar jadi ${formatRupiah(h.harga)}/unit`;
        amtColor = 'var(--ink-300)'; amtText = '—';
      }
      const hasDetail = h.type === 'beli' || h.type === 'jual';
      return `
        <div class="bdg-tx-item" ${hasDetail ? `onclick="openJrRiwayatDetail('${a.id}','${h.id}')" style="cursor:pointer;"` : ''}>
          <div class="bdg-tx-note">${label}<br><span style="font-weight:500;color:var(--ink-300);font-size:10.5px;">${dLabel}</span></div>
          <div style="display:flex; align-items:center; gap:6px;">
            <div class="bdg-tx-amt" style="color:${amtColor};">${amtText}</div>
            ${hasDetail ? '<i class="bi bi-chevron-right" style="color:var(--ink-300); font-size:12px;"></i>' : ''}
          </div>
        </div>`;
    }).join('');
  }
  return html;
}

// ---------- TAB: CATATAN (konteks keputusan beli terakhir) ----------
function jrRenderTabCatatan(a) {
  const beliList = (a.riwayat || []).filter(h => h.type === 'beli').slice().reverse();
  if (!beliList.length) return '';

  const h = beliList[0];
  return `
    <div class="wl-section-title jr-gap-lg">Keputusan Beli Terakhir</div>
    <div class="wl-info-card" style="margin-bottom:8px;">
      <div style="padding:14px 14px 0; font-size:11.5px; font-weight:700; color:var(--ink-300);">${formatTanggalLabel(h.tanggal)}</div>
      <div class="wl-info-row"><i class="bi bi-list-check"></i><div class="wl-info-label">Alasan Keputusan</div><div class="wl-info-val" style="text-align:right; max-width:60%;">${(h.alasan || []).length ? h.alasan.map(escapeHtml).join(', ') : '-'}</div></div>
      <div class="wl-info-row"><i class="bi bi-emoji-smile"></i><div class="wl-info-label">Kondisi Emosi</div><div class="wl-info-val">${h.emosi && JR_EMOSI[h.emosi] ? JR_EMOSI[h.emosi].label : '-'}</div></div>
      ${h.horizon ? `<div class="wl-info-row"><i class="bi bi-signpost-split"></i><div class="wl-info-label">Rencana Jangka Waktu</div><div class="wl-info-val">${escapeHtml(h.horizon)}</div></div>` : ''}
      ${h.targetPct || h.stopLossPct ? `<div class="wl-info-row"><i class="bi bi-bullseye"></i><div class="wl-info-label">Target Untung / Batas Rugi</div><div class="wl-info-val">${h.targetPct ? '+' + h.targetPct + '%' : '-'} / ${h.stopLossPct ? '-' + h.stopLossPct + '%' : '-'}</div></div>` : ''}
      ${h.skenarioTerbaik ? `<div class="wl-info-row"><i class="bi bi-emoji-laughing"></i><div class="wl-info-label">Kalau Harganya Naik</div><div class="wl-info-val" style="text-align:right; max-width:60%;">${escapeHtml(h.skenarioTerbaik)}</div></div>` : ''}
      ${h.skenarioTerburuk ? `<div class="wl-info-row"><i class="bi bi-emoji-frown"></i><div class="wl-info-label">Kalau Harganya Turun</div><div class="wl-info-val" style="text-align:right; max-width:60%;">${escapeHtml(h.skenarioTerburuk)}</div></div>` : ''}
      ${h.catatan ? `<div class="wl-info-row"><i class="bi bi-chat-left-text"></i><div class="wl-info-label">Catatan</div><div class="wl-info-val" style="text-align:right; max-width:60%;">${escapeHtml(h.catatan)}</div></div>` : ''}
    </div>
    <div style="font-size:10.5px; color:var(--ink-300); margin-bottom:8px;">Keputusan beli sebelumnya bisa dilihat di Riwayat Transaksi di bawah.</div>`;
}

// ---------- TAB: EVALUASI (performa + catatan evaluasi + review) ----------
function jrRenderTabEvaluasiAset(a) {
  return `
    <div class="wl-section-title jr-gap-lg">Catatan Evaluasi</div>
    <label class="field-label">Catatan (Opsional)</label>
    <textarea id="jrEvalNoteInput" placeholder="Evaluasi berkala aset ini: masih sesuai thesis? ada yang berubah?" maxlength="400"
              style="width:100%; min-height:80px; border-radius:var(--radius-sm); border:1.5px solid var(--border-strong); background:var(--surface); padding:10px 12px; font-size:13px; color:var(--ink-900); font-family:inherit; margin-bottom:10px; resize:vertical;">${escapeHtml(a.catatanEvaluasi || '')}</textarea>

    <div class="field-card" id="jrEvalReviewDateCard" onclick="jrOpenEvalReviewDatePicker()" style="margin-bottom:14px;">
      <div class="field-card-icon" style="background:var(--accent2);"><i class="bi bi-calendar-check"></i></div>
      <div class="field-card-body">
        <div class="field-card-title" style="font-size:11px; color:var(--ink-300); font-weight:700;">Review Selanjutnya</div>
        <div class="field-card-title" id="jrEvalReviewDateLabel">${a.reviewDate ? formatTanggalLabel(a.reviewDate) : 'Belum diatur'}</div>
      </div>
    </div>

    <button class="btn" style="background:var(--surface-sunken); color:var(--ink-700);" onclick="saveJrAssetEvaluasi('${a.id}')">Simpan Evaluasi</button>`;
}

let jrEvalReviewDateTemp = null;
function jrOpenEvalReviewDatePicker() {
  const a = getJrById(jrDetailId);
  openDatePicker('tanggal', { value: jrEvalReviewDateTemp || (a && a.reviewDate) || todayISO() }, (res) => {
    jrEvalReviewDateTemp = res.date;
    document.getElementById('jrEvalReviewDateLabel').textContent = formatTanggalLabel(res.date);
  });
}

function saveJrAssetEvaluasi(assetId) {
  const list = getJI();
  const a = list.find(x => x.id === assetId);
  if (!a) return;
  a.catatanEvaluasi = document.getElementById('jrEvalNoteInput').value.trim();
  if (jrEvalReviewDateTemp) a.reviewDate = jrEvalReviewDateTemp;
  a.updatedAt = new Date().toISOString();
  saveJurnalInvestasi(list);
  jrEvalReviewDateTemp = null;
  showToast('Evaluasi disimpan');
}

// ---------- TAB: LAMPIRAN (screenshot/chart pendukung) ----------
function jrRenderTabLampiran(a) {
  const lampiran = a.lampiran || [];
  let html = `
    <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:16px;">
      ${lampiran.map((src, i) => `
        <div style="position:relative; width:104px; height:104px;">
          <img src="${src}" style="width:104px; height:104px; border-radius:12px; object-fit:cover; display:block; cursor:pointer;" onclick="window.open('${src}','_blank')" alt="">
          <div class="wl-photo-remove" onclick="removeJrLampiran('${a.id}', ${i})"><i class="bi bi-x"></i></div>
        </div>`).join('')}
      <div class="wl-photo-box" style="width:104px; height:104px; border-radius:12px; flex-direction:column; display:flex;" onclick="document.getElementById('jrLampiranInputHidden').click()">
        <i class="bi bi-plus-lg" style="font-size:20px;"></i>
        <div class="wl-photo-box-text" style="font-size:9.5px; margin-top:2px;">Tambah</div>
      </div>
    </div>
    <div class="info-banner">
      <i class="bi bi-info-circle"></i>
      <div class="info-banner-text">Simpan screenshot chart, laporan keuangan, atau bukti riset lain di sini biar gampang dilihat lagi.</div>
    </div>`;
  return html;
}

function handleJrLampiranFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar'); return; }
  if (file.size > 8 * 1024 * 1024) { showToast('Ukuran gambar maksimal 8MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    const list = getJI();
    const a = list.find(x => x.id === jrDetailId);
    if (!a) return;
    if (!a.lampiran) a.lampiran = [];
    a.lampiran.push(e.target.result);
    a.updatedAt = new Date().toISOString();
    saveJurnalInvestasi(list);
    document.getElementById('jrLampiranInputHidden').value = '';
    renderJrDetailPage();
  };
  reader.readAsDataURL(file);
}

function removeJrLampiran(assetId, index) {
  const list = getJI();
  const a = list.find(x => x.id === assetId);
  if (!a || !a.lampiran) return;
  a.lampiran.splice(index, 1);
  a.updatedAt = new Date().toISOString();
  saveJurnalInvestasi(list);
  renderJrDetailPage();
}

// ======================================================
// LOGO ASET (upload + crop persegi, pakai Cropper.js yang sama kayak Wishlist)
// ======================================================
function openJrLogoUpload(assetId) {
  jrLogoEditAssetId = assetId || null; // null = lagi isi form Tambah Aset
  document.getElementById('jrLogoInputHidden').value = '';
  document.getElementById('jrLogoInputHidden').click();
}

function handleJrLogoFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { showToast('File harus berupa gambar'); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Ukuran logo maksimal 5MB'); return; }
  const reader = new FileReader();
  reader.onload = (e) => { jrCropSourceDataUrl = e.target.result; openJrCropOverlay(); };
  reader.readAsDataURL(file);
}

function openJrCropOverlay() {
  const overlay = document.getElementById('jrCropOverlay');
  const img = document.getElementById('jrCropImage');
  img.src = jrCropSourceDataUrl;
  overlay.classList.add('open');
  const initCropper = () => {
    if (jrCropInstance) { jrCropInstance.destroy(); jrCropInstance = null; }
    jrCropInstance = new Cropper(img, {
      aspectRatio: 1, viewMode: 1, dragMode: 'move', autoCropArea: 1,
      background: false, responsive: true, guides: false, center: false, highlight: false,
    });
  };
  if (img.complete) initCropper(); else img.onload = initCropper;
}

function cancelJrCrop() {
  document.getElementById('jrCropOverlay').classList.remove('open');
  if (jrCropInstance) { jrCropInstance.destroy(); jrCropInstance = null; }
}

function confirmJrCrop() {
  if (!jrCropInstance) return;
  const canvas = jrCropInstance.getCroppedCanvas({ width: 200, height: 200, imageSmoothingQuality: 'high' });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  if (jrLogoEditAssetId) {
    const list = getJI();
    const a = list.find(x => x.id === jrLogoEditAssetId);
    if (a) {
      a.logo = dataUrl;
      a.updatedAt = new Date().toISOString();
      saveJurnalInvestasi(list);
      renderJrDetailPage();
      renderJurnalPage();
      showToast('Logo aset diperbarui');
    }
  } else {
    jrFormLogo = dataUrl;
    jrRenderLogoPreview();
  }
  cancelJrCrop();
}

function removeJrLogo(e) {
  if (e) e.stopPropagation();
  jrFormLogo = null;
  jrRenderLogoPreview();
}

function jrRenderLogoPreview() {
  const box = document.getElementById('jrLogoBox');
  const preview = document.getElementById('jrLogoPreview');
  if (!box || !preview) return;
  if (jrFormLogo) {
    document.getElementById('jrLogoPreviewImg').src = jrFormLogo;
    box.style.display = 'none';
    preview.style.display = 'flex';
  } else {
    box.style.display = 'flex';
    preview.style.display = 'none';
  }
}

// ======================================================
// CHECKLIST "JURNAL": ALASAN KEPUTUSAN / EMOSI (chip ceklis + custom)
// Aturan: checklist ATAU catatan, minimal salah satu harus diisi.
// ======================================================
function jrRenderBeliChips() {
  const all = JR_ALASAN_KEPUTUSAN.map(o => ({ label: o, custom: false }))
    .concat(jrCustomTags.alasan.map(o => ({ label: o, custom: true })));
  document.getElementById('jrAlasanChips').innerHTML =
    all.map(o => jrCheckRowHTML(o.label, jrFormAlasan.includes(o.label), 'box', `jrToggleAlasan('${jrEsc(o.label)}', this)`, { removable: o.custom, removeFn: `jrRemoveCustomTag('alasan','${jrEsc(o.label)}')` })).join('') +
    jrCheckRowHTML('+ Tambah Sendiri', false, 'box', `jrOpenCustomTagSheet('alasan')`, { dashed: true, wide: true });
}

// Isi dropdown emosi (dipakai form Beli & sheet Jual) -- dropdown biar ringkas,
// gak makan tempat kayak grid/chip.
function jrFillEmosiSelect(selectId, selectedKey) {
  const el = document.getElementById(selectId);
  el.innerHTML = `<option value="">Gak diisi</option>` +
    Object.keys(JR_EMOSI).map(k => `<option value="${k}" ${selectedKey === k ? 'selected' : ''}>${JR_EMOSI[k].emoji} ${JR_EMOSI[k].label}</option>`).join('');
}

// Helper generik: satu baris checklist (checkbox kotak / radio bulat), seluruh
// baris jadi area tap (bukan cuma ikonnya) -- lebih akurat buat jari di mobile.
// opts: { dashed, wide (span 2 kolom), removable (tampilin tombol hapus), removeFn }
function jrCheckRowHTML(label, active, shape, onclick, opts) {
  opts = opts || {};
  let iconInner = '';
  if (active) iconInner = shape === 'dot' ? '<div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>' : '<i class="bi bi-check-lg"></i>';
  const classes = ['jr-check-row'];
  if (active) classes.push('active');
  if (opts.wide) classes.push('wide');
  return `
    <div class="${classes.join(' ')}" ${opts.dashed ? 'style="border-style:dashed; justify-content:center;"' : ''} onclick="${onclick}">
      <div class="jr-check-icon ${shape}">${iconInner}</div>
      <div class="jr-check-label">${label}</div>
      ${opts.removable ? `<i class="bi bi-x-circle-fill" style="color:var(--ink-300); font-size:14px;" onclick="event.stopPropagation(); ${opts.removeFn}"></i>` : ''}
    </div>`;
}

function jrEsc(s) { return s.replace(/'/g, "\\'"); }

function jrToggleAlasan(val, el) {
  const i = jrFormAlasan.indexOf(val);
  if (i > -1) jrFormAlasan.splice(i, 1); else jrFormAlasan.push(val);
  el.classList.toggle('active');
  el.querySelector('.jr-check-icon').innerHTML = el.classList.contains('active') ? '<i class="bi bi-check-lg"></i>' : '';
}

// Custom tag bisa dihapus kapan aja -- gak nempel selamanya begitu ditambah.
function jrRemoveCustomTag(kind, val) {
  const tags = loadJrCustomTags();
  const key = kind === 'alasan' ? 'alasan' : 'alasanJual';
  tags[key] = tags[key].filter(x => x !== val);
  saveJrCustomTags(tags);
  jrCustomTags = tags;
  if (kind === 'alasan') {
    jrFormAlasan = jrFormAlasan.filter(x => x !== val);
    jrRenderBeliChips();
  } else {
    jrJualAlasan = jrJualAlasan.filter(x => x !== val);
    jrRenderJualChips();
  }
}

function jrRenderJualChips() {
  const all = JR_ALASAN_JUAL.map(o => ({ label: o, custom: false }))
    .concat(jrCustomTags.alasanJual.map(o => ({ label: o, custom: true })));
  document.getElementById('jrJualAlasanChips').innerHTML =
    all.map(o => jrCheckRowHTML(o.label, jrJualAlasan.includes(o.label), 'box', `jrToggleJualAlasan('${jrEsc(o.label)}', this)`, { removable: o.custom, removeFn: `jrRemoveCustomTag('alasanJual','${jrEsc(o.label)}')` })).join('') +
    jrCheckRowHTML('+ Tambah Sendiri', false, 'box', `jrOpenCustomTagSheet('alasanJual')`, { dashed: true, wide: true });
}

function jrToggleJualAlasan(val, el) {
  const i = jrJualAlasan.indexOf(val);
  if (i > -1) jrJualAlasan.splice(i, 1); else jrJualAlasan.push(val);
  el.classList.toggle('active');
  el.querySelector('.jr-check-icon').innerHTML = el.classList.contains('active') ? '<i class="bi bi-check-lg"></i>' : '';
}

// ---------- Radio "Sesuai Rencana?" (Ya/Tidak) -- ganti checklist alasan jual
// yang wajib dulu jadi satu penanda biner. Ini yang paling berharga secara
// riset: satu tag ini lebih kebuka polanya dibanding checklist panjang.
function jrRenderSesuaiRencanaRadio() {
  const opts = [['ya', 'Ya, sesuai rencana'], ['tidak', 'Tidak, di luar rencana']];
  document.getElementById('jrSesuaiRencanaChips').innerHTML = opts.map(([val, label]) =>
    jrCheckRowHTML(label, jrJualSesuaiRencana === val, 'dot', `jrSelectSesuaiRencana('${val}', this)`, { wide: true })
  ).join('');
}

function jrSelectSesuaiRencana(val, el) {
  const same = jrJualSesuaiRencana === val;
  jrJualSesuaiRencana = same ? null : val;
  jrRenderSesuaiRencanaRadio();
}

// ---------- Toggle "Detail Lanjutan (Opsional)" -- collapsed by default ----------
function jrToggleAdvanced() {
  jrFormAdvancedOpen = !jrFormAdvancedOpen;
  document.getElementById('jrAdvancedSection').style.display = jrFormAdvancedOpen ? 'block' : 'none';
  document.getElementById('jrAdvancedToggleBtn').classList.toggle('open', jrFormAdvancedOpen);
}

function jrToggleJualAdvanced() {
  jrJualAdvancedOpen = !jrJualAdvancedOpen;
  document.getElementById('jrJualAdvancedSection').style.display = jrJualAdvancedOpen ? 'block' : 'none';
  document.getElementById('jrJualAdvancedToggleBtn').classList.toggle('open', jrJualAdvancedOpen);
}

function jrOpenCustomTagSheet(kind) {
  jrCustomTagKind = kind;
  document.getElementById('jrCustomTagInput').value = '';
  document.getElementById('jrCustomTagTitle').textContent = kind === 'alasan' ? 'Tambah Alasan Keputusan' : 'Tambah Alasan Jual';
  openSheet('jrCustomTagOverlay');
}

function confirmJrCustomTag() {
  const val = document.getElementById('jrCustomTagInput').value.trim();
  if (!val) { closeSheet('jrCustomTagOverlay'); return; }
  const tags = loadJrCustomTags();
  const key = jrCustomTagKind === 'alasan' ? 'alasan' : 'alasanJual';
  if (!tags[key].includes(val)) tags[key].push(val);
  saveJrCustomTags(tags);
  jrCustomTags = tags;
  if (jrCustomTagKind === 'alasan') {
    if (!jrFormAlasan.includes(val)) jrFormAlasan.push(val);
    jrRenderBeliChips();
  } else {
    if (!jrJualAlasan.includes(val)) jrJualAlasan.push(val);
    jrRenderJualChips();
  }
  closeSheet('jrCustomTagOverlay');
}

// ======================================================
// FORM: TAMBAH ASET / BELI LAGI (+ langkah Review sebelum Simpan)
// ======================================================
function openJurnalForm(assetId) {
  jrFormAssetId = assetId || null;
  jrFormAccountId = null;
  jrFormDate = todayISO();
  jrFormAlasan = [];
  jrFormEmosi = null;
  jrFormLogo = null;
  jrFormHorizon = null;
  jrFormReviewDate = null;
  jrFormAdvancedOpen = false;
  jrLogoEditAssetId = null;

  const isNew = !jrFormAssetId;
  document.getElementById('jrFormTitle').textContent = isNew ? 'Tambah Aset' : 'Beli Lagi';
  document.getElementById('jrLogoField').style.display = isNew ? 'flex' : 'none';
  document.getElementById('jrFormNameInput').value = '';
  document.getElementById('jrFormJumlahInput').value = '';
  document.getElementById('jrFormHargaInput').value = '';
  document.getElementById('jrFormNoteInput').value = '';
  document.getElementById('jrFormTargetInput').value = '';
  document.getElementById('jrFormStopLossInput').value = '';
  document.getElementById('jrFormSkenarioBaikInput').value = '';
  document.getElementById('jrFormSkenarioBurukInput').value = '';
  document.getElementById('jrFormErrMsg').style.display = 'none';
  document.getElementById('jrHorizonLabel').textContent = 'Pilih horizon';
  document.getElementById('jrReviewDateLabel').textContent = 'Belum diatur';
  document.getElementById('jrAdvancedSection').style.display = 'none';
  document.getElementById('jrAdvancedToggleBtn').classList.remove('open');
  jrFormJenis = isNew ? null : getJrById(jrFormAssetId).jenis;
  jrRenderFormJenisCard();
  jrRenderLogoPreview();
  jrRenderBeliChips();
  jrFillEmosiSelect('jrFormEmosiSelect', null);
  jrResetAccountCard('jrFormAccountCard', 'jrFormAccountLabel', 'jrFormAccountIconWrap', 'jrFormAccountSub');
  jrRenderFormDateCard();
  jrRenderFormTotal();
  goTo('jurnal-form');
}

function closeJurnalForm() {
  goTo(jrFormAssetId ? 'jurnal-detail' : 'jurnal');
}

function jrFormOpenJenisPicker() {
  const listEl = document.getElementById('jrJenisList');
  listEl.innerHTML = Object.keys(JR_JENIS).map(key => {
    const m = JR_JENIS[key];
    return `
      <div class="picker-item" onclick="jrFormSelectJenis('${key}')">
        <div class="picker-item-icon" style="background:${m.color}20;"><i class="bi ${m.icon}" style="color:${m.color};"></i></div>
        <div><div class="picker-item-name">${m.label}</div></div>
      </div>`;
  }).join('');
  openSheet('jrJenisPickerOverlay');
}

function jrFormSelectJenis(key) {
  jrFormJenis = key;
  jrRenderFormJenisCard();
  closeSheet('jrJenisPickerOverlay');
}

function jrRenderFormJenisCard() {
  const card = document.getElementById('jrJenisCard');
  const label = document.getElementById('jrJenisLabel');
  const iconWrap = document.getElementById('jrJenisIconWrap');
  if (jrFormJenis) {
    const m = JR_JENIS[jrFormJenis];
    label.textContent = m.label;
    iconWrap.innerHTML = `<i class="bi ${m.icon}"></i>`;
    iconWrap.style.background = m.color;
    iconWrap.style.color = '#fff';
    card.classList.remove('placeholder');
  } else {
    label.textContent = 'Pilih jenis aset';
    iconWrap.innerHTML = `<i class="bi bi-grid"></i>`;
    iconWrap.style.background = '';
    iconWrap.style.color = '';
    card.classList.add('placeholder');
  }
}

// Satu sheet, satu fungsi -- dipakai bareng sama form Beli & sheet Jual,
// biar gak ada 2 sheet kembar cuma beda dikit.
function jrOpenAccountPicker(context) {
  jrAccountPickerContext = context;
  const list = jrInvestAccounts();
  const listEl = document.getElementById('jrAccountList');
  if (!list.length) {
    listEl.innerHTML = `<div class="kt-empty" style="border:none;">Belum ada Akun Investasi. Tambah dulu di halaman Akun.</div>`;
  } else {
    listEl.innerHTML = list.map(s => `
      <div class="picker-item" onclick="jrSelectAccount('${s.id}')">
        <div class="picker-item-icon" style="background:${sourceTypeColors[s.jenis]}; border-radius:10px;">
          <i class="${sourceIcons[s.jenis] || 'bi-wallet2'}" style="color:#fff; font-size:16px;"></i>
        </div>
        <div>
          <div class="picker-item-name">${escapeHtml(s.name)}</div>
          <div class="picker-item-sub">${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}</div>
        </div>
      </div>`).join('');
  }
  openSheet('jrAccountPickerOverlay');
}

function jrSelectAccount(accId) {
  const s = sources.find(x => x.id === accId);
  if (!s) return;
  const isJual = jrAccountPickerContext === 'jual';
  if (isJual) jrTxAccountId = s.id; else jrFormAccountId = s.id;

  const labelId = isJual ? 'jrJualAccountLabel' : 'jrFormAccountLabel';
  const subId = isJual ? 'jrJualAccountSub' : 'jrFormAccountSub';
  const iconId = isJual ? 'jrJualAccountIconWrap' : 'jrFormAccountIconWrap';
  const cardId = isJual ? 'jrJualAccountCard' : 'jrFormAccountCard';

  document.getElementById(labelId).textContent = s.name;
  const sub = document.getElementById(subId);
  sub.textContent = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
  sub.style.display = 'block';
  const iconWrap = document.getElementById(iconId);
  iconWrap.innerHTML = `<i class="${sourceIcons[s.jenis] || 'bi-wallet2'}"></i>`;
  iconWrap.style.background = sourceTypeColors[s.jenis] || 'var(--ink-300)';
  iconWrap.style.color = '#fff';
  document.getElementById(cardId).classList.remove('placeholder');
  closeSheet('jrAccountPickerOverlay');
}

function jrResetAccountCard(cardId, labelId, iconId, subId) {
  document.getElementById(labelId).textContent = 'Pilih akun';
  document.getElementById(iconId).innerHTML = `<i class="bi bi-wallet2"></i>`;
  document.getElementById(iconId).style.background = '';
  document.getElementById(iconId).style.color = '';
  document.getElementById(cardId).classList.add('placeholder');
  document.getElementById(subId).style.display = 'none';
}

function jrFormOpenDatePicker() {
  openDatePicker('tanggal', { value: jrFormDate || todayISO() }, (res) => {
    jrFormDate = res.date;
    jrRenderFormDateCard();
  });
}

function jrRenderFormDateCard() {
  document.getElementById('jrFormDateLabel').textContent = formatTanggalLabel(jrFormDate);
}

function jrFormOpenReviewDatePicker() {
  openDatePicker('tanggal', { value: jrFormReviewDate || todayISO() }, (res) => {
    jrFormReviewDate = res.date;
    document.getElementById('jrReviewDateLabel').textContent = formatTanggalLabel(res.date);
  });
}

function jrFormOpenHorizonPicker() {
  const listEl = document.getElementById('jrHorizonList');
  listEl.innerHTML = JR_HORIZON.map(h => `
    <div class="picker-item" onclick="jrFormSelectHorizon('${h}')">
      <div class="picker-item-icon" style="background:var(--primary-100);"><i class="bi bi-signpost-split" style="color:var(--primary);"></i></div>
      <div><div class="picker-item-name">${h}</div></div>
    </div>`).join('');
  openSheet('jrHorizonPickerOverlay');
}

function jrFormSelectHorizon(h) {
  jrFormHorizon = h;
  document.getElementById('jrHorizonLabel').textContent = h;
  closeSheet('jrHorizonPickerOverlay');
}

function jrRenderFormTotal() {
  const jumlah = parseFloat((document.getElementById('jrFormJumlahInput').value || '0').replace(/[^\d.]/g, '')) || 0;
  const harga = parseInt((document.getElementById('jrFormHargaInput').value || '0').replace(/[^\d]/g, ''), 10) || 0;
  document.getElementById('jrFormTotalVal').textContent = formatRupiah(jumlah * harga);
}

// Langkah 1: validasi semua input form beli. Kalau lolos, tampilkan Review.
// Buka sheet ringkasan (bukan pindah halaman) sebelum benar-benar disimpan.
// Validasi + simpan langsung, gak ada layar/sheet review terpisah lagi --
// begitu tap Simpan, ya kesimpen. Yang mau dicek ulang tinggal liat form-nya
// sebelum tap (semua field masih keliatan di layar yang sama).
function saveJurnalForm() {
  if (!allowSubmit('saveJurnalForm')) return;
  const errEl = document.getElementById('jrFormErrMsg');
  errEl.style.display = 'none';
  const isNew = !jrFormAssetId;

  const nama = isNew ? document.getElementById('jrFormNameInput').value.trim() : getJrById(jrFormAssetId).nama;
  const jumlah = parseFloat((document.getElementById('jrFormJumlahInput').value || '0').replace(/[^\d.]/g, '')) || 0;
  const harga = parseInt((document.getElementById('jrFormHargaInput').value || '0').replace(/[^\d]/g, ''), 10) || 0;
  const catatan = document.getElementById('jrFormNoteInput').value.trim();

  if (isNew && !nama) { jrTxError(errEl, 'Nama aset wajib diisi'); return; }
  if (isNew && !jrFormJenis) { jrTxError(errEl, 'Pilih jenis aset dulu'); return; }
  if (!jrFormAlasan.length && !catatan) { jrTxError(errEl, 'Isi minimal 1 Alasan Keputusan ATAU tulis Catatan'); return; }
  if (!jrFormAccountId) { jrTxError(errEl, 'Pilih akun investasi sumber dana'); return; }
  if (!jumlah) { jrTxError(errEl, 'Jumlah unit wajib diisi'); return; }
  if (!harga) { jrTxError(errEl, 'Harga per unit wajib diisi'); return; }

  const src = sources.find(s => s.id === jrFormAccountId);
  if (!src) { jrTxError(errEl, 'Akun tidak ditemukan'); return; }
  const total = jumlah * harga;
  if (total > src.saldo) {
    jrTxError(errEl, `Saldo ${src.name} tidak cukup (butuh ${formatRupiah(total)}, tersedia ${formatRupiah(src.saldo)})`);
    return;
  }

  const targetPct = parseFloat(document.getElementById('jrFormTargetInput').value) || null;
  const stopLossPct = parseFloat(document.getElementById('jrFormStopLossInput').value) || null;
  const skenarioTerbaik = document.getElementById('jrFormSkenarioBaikInput').value.trim();
  const skenarioTerburuk = document.getElementById('jrFormSkenarioBurukInput').value.trim();
  const dateStr = jrFormDate || todayISO();
  const txId = 'tx' + uniqueTick();
  const list = getJI();

  src.saldo -= total;
  saveSources(sources);

  let asset;
  if (isNew) {
    asset = {
      id: 'ja' + uniqueTick(), nama, jenis: jrFormJenis, akunId: jrFormAccountId, logo: jrFormLogo || null,
      totalUnit: 0, totalModal: 0, hargaPasar: harga, hargaPasarUpdatedAt: new Date().toISOString(),
      status: 'aktif', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      catatanEvaluasi: '', reviewDate: jrFormReviewDate || null, lampiran: [], riwayat: [],
    };
    list.push(asset);
  } else {
    asset = list.find(a => a.id === jrFormAssetId);
    asset.akunId = jrFormAccountId;
    asset.updatedAt = new Date().toISOString();
    if (jrFormReviewDate) asset.reviewDate = jrFormReviewDate;
  }

  asset.totalUnit += jumlah;
  asset.totalModal += total;
  asset.riwayat.push({
    id: 'jh' + uniqueTick(), type: 'beli', jumlah, harga, total, tanggal: dateStr, catatan, txId,
    alasan: [...jrFormAlasan], emosi: jrFormEmosi, targetPct, stopLossPct,
    horizon: jrFormHorizon, skenarioTerbaik, skenarioTerburuk, reviewDate: jrFormReviewDate || null,
  });
  saveJurnalInvestasi(list);

  transactions.unshift({
    id: txId, type: 'transfer', amount: total, fee: 0,
    sourceId: src.id, destId: asset.id,
    note: catatan || `Beli ${asset.nama} (${jumlah} unit)`, date: dateStr, time: nowTime(),
    isJurnalTx: true, jurnalId: asset.id,
  });
  saveTransactions(transactions);

  showToast(isNew ? 'Aset berhasil ditambahkan' : 'Pembelian berhasil dicatat');
  jrDetailId = asset.id;
  jrDetailTab = 'ringkasan';
  renderAll();
  goTo('jurnal-detail');
}

// ======================================================
// UPDATE HARGA PASAR
// ======================================================
function openJrUpdateHarga(id) {
  jrTxAssetId = id;
  const a = getJrById(id);
  if (!a) return;
  document.getElementById('jrHargaCurrentLabel').textContent = formatRupiah(a.hargaPasar || 0);
  document.getElementById('jrHargaInput').value = a.hargaPasar ? a.hargaPasar.toLocaleString('id-ID') : '';
  document.getElementById('jrHargaErrMsg').style.display = 'none';
  openSheet('jrHargaOverlay');
}

function submitJrUpdateHarga() {
  const errEl = document.getElementById('jrHargaErrMsg');
  errEl.style.display = 'none';
  const list = getJI();
  const a = list.find(x => x.id === jrTxAssetId);
  if (!a) return;

  const harga = parseInt((document.getElementById('jrHargaInput').value || '0').replace(/[^\d]/g, ''), 10) || 0;
  if (!harga) { jrTxError(errEl, 'Harga pasar wajib diisi'); return; }

  a.hargaPasar = harga;
  a.hargaPasarUpdatedAt = new Date().toISOString();
  a.updatedAt = a.hargaPasarUpdatedAt;
  a.riwayat.push({ id: 'jh' + uniqueTick(), type: 'update_harga', jumlah: a.totalUnit, harga, total: 0, tanggal: todayISO(), catatan: '' });
  saveJurnalInvestasi(list);

  closeSheet('jrHargaOverlay');
  showToast('Harga pasar diperbarui');
  renderAll();
  renderJrDetailPage();
}

// ======================================================
// JUAL ASET
// ======================================================
function openJrJual(id) {
  jrTxAssetId = id;
  jrTxAccountId = null;
  jrJualAlasan = [];
  jrJualEmosiVal = null;
  jrJualSesuaiRencana = null;
  jrJualAdvancedOpen = false;
  const a = getJrById(id);
  if (!a) return;

  document.getElementById('jrJualUnitLabel').textContent = a.totalUnit;
  document.getElementById('jrJualAvgLabel').textContent = formatRupiah(jrAvgHarga(a));
  document.getElementById('jrJualJumlahInput').value = '';
  document.getElementById('jrJualHargaInput').value = a.hargaPasar ? a.hargaPasar.toLocaleString('id-ID') : '';
  document.getElementById('jrJualNoteInput').value = '';
  document.getElementById('jrJualErrMsg').style.display = 'none';
  document.getElementById('jrJualAdvancedSection').style.display = 'none';
  document.getElementById('jrJualAdvancedToggleBtn').classList.remove('open');
  jrResetAccountCard('jrJualAccountCard', 'jrJualAccountLabel', 'jrJualAccountIconWrap', 'jrJualAccountSub');
  jrRenderJualChips();
  jrFillEmosiSelect('jrJualEmosiSelect', null);
  jrRenderSesuaiRencanaRadio();
  jrAccountPickerContext = 'jual';

  const defAkun = sources.find(s => s.id === a.akunId);
  if (defAkun) jrSelectAccount(defAkun.id);

  openSheet('jrJualOverlay');
}

function submitJrJual() {
  if (!allowSubmit('submitJrJual')) return;
  const errEl = document.getElementById('jrJualErrMsg');
  errEl.style.display = 'none';
  const list = getJI();
  const a = list.find(x => x.id === jrTxAssetId);
  if (!a) return;

  const jumlah = parseFloat((document.getElementById('jrJualJumlahInput').value || '0').replace(/[^\d.]/g, '')) || 0;
  const harga = parseInt((document.getElementById('jrJualHargaInput').value || '0').replace(/[^\d]/g, ''), 10) || 0;
  const catatan = document.getElementById('jrJualNoteInput').value.trim();

  if (!jumlah) { jrTxError(errEl, 'Jumlah unit dijual wajib diisi'); return; }
  if (jumlah > a.totalUnit) { jrTxError(errEl, `Jumlah melebihi unit yang dimiliki (maks ${a.totalUnit})`); return; }
  if (!harga) { jrTxError(errEl, 'Harga jual per unit wajib diisi'); return; }
  if (!jrJualSesuaiRencana) { jrTxError(errEl, 'Pilih apakah penjualan ini sesuai rencana awal atau enggak'); return; }
  if (!jrTxAccountId) { jrTxError(errEl, 'Pilih akun tujuan dana hasil jual'); return; }

  const dest = sources.find(s => s.id === jrTxAccountId);
  if (!dest) { jrTxError(errEl, 'Akun tidak ditemukan'); return; }

  const dateStr = todayISO();
  const txId = 'tx' + uniqueTick();
  const total = jumlah * harga;
  const avg = jrAvgHarga(a);
  const modalTerjual = avg * jumlah;

  dest.saldo += total;
  saveSources(sources);

  a.totalUnit -= jumlah;
  a.totalModal -= modalTerjual;
  if (a.totalUnit <= 0.0000001) {
    a.totalUnit = 0;
    a.totalModal = 0;
    a.status = 'terjual';
  }
  a.updatedAt = new Date().toISOString();

  const realizedPnl = total - modalTerjual;
  const realizedPnlPct = modalTerjual > 0 ? (realizedPnl / modalTerjual) * 100 : 0;
  const newEntryId = 'jh' + uniqueTick();
  const beliSebelum = a.riwayat.slice().reverse().find(h => h.type === 'beli');
  const holdingDays = beliSebelum ? jrDaysBetween(beliSebelum.tanggal, dateStr) : null;

  a.riwayat.push({
    id: newEntryId, type: 'jual', jumlah, harga, total, tanggal: dateStr, catatan, txId,
    sesuaiRencana: jrJualSesuaiRencana, alasanJual: [...jrJualAlasan], emosi: jrJualEmosiVal,
    avgHargaSaatJual: avg, realizedPnl, realizedPnlPct, pelajaran: '', holdingDays,
  });
  saveJurnalInvestasi(list);

  transactions.unshift({
    id: txId, type: 'transfer', amount: total, fee: 0,
    sourceId: a.id, destId: dest.id,
    note: catatan || `Jual ${a.nama} (${jumlah} unit)`, date: dateStr, time: nowTime(),
    isJurnalTx: true, jurnalId: a.id,
  });
  saveTransactions(transactions);

  closeSheet('jrJualOverlay');
  showToast('Penjualan berhasil dicatat');
  renderAll();
  renderJrDetailPage();
}

// ======================================================
// HAPUS ASET
// ======================================================
function openJrHapus(id) {
  jrTxAssetId = id;
  const a = getJrById(id);
  if (!a) return;
  const refund = a.totalModal;
  document.getElementById('jrHapusInfoText').textContent = refund > 0
    ? `Modal yang masih tertanam (${formatRupiah(refund)}) akan dikembalikan ke akun investasi terkait tanpa dihitung untung/rugi.`
    : `Aset ini sudah tidak punya modal tertanam. Riwayat akan dihapus permanen.`;
  openSheet('jrHapusOverlay');
}

function submitJrHapus() {
  const list = getJI();
  const idx = list.findIndex(x => x.id === jrTxAssetId);
  if (idx === -1) return;
  const a = list[idx];

  if (a.totalModal > 0) {
    const akun = sources.find(s => s.id === a.akunId);
    if (akun) {
      akun.saldo += a.totalModal;
      saveSources(sources);
      transactions.unshift({
        id: 'tx' + uniqueTick(), type: 'transfer', amount: a.totalModal, fee: 0,
        sourceId: a.id, destId: akun.id,
        note: `Hapus Aset ${a.nama} · Modal dikembalikan`, date: todayISO(), time: nowTime(),
        isJurnalTx: true, jurnalId: a.id,
      });
      saveTransactions(transactions);
    }
  }

  list.splice(idx, 1);
  saveJurnalInvestasi(list);

  closeSheet('jrHapusOverlay');
  showToast('Aset dihapus');
  renderAll();
  goTo('jurnal');
}

// ======================================================
// DETAIL SATU RIWAYAT (alasan/emosi/target -- bukan di cardlist!)
// ======================================================
function saveJrPelajaran(assetId, riwayatId) {
  const list = getJI();
  const a = list.find(x => x.id === assetId);
  if (!a) return;
  const h = (a.riwayat || []).find(x => x.id === riwayatId);
  if (!h) return;
  h.pelajaran = document.getElementById('jrPelajaranInput').value.trim();
  saveJurnalInvestasi(list);
  showToast('Pelajaran disimpan');
}

function openJrRiwayatDetail(assetId, riwayatId) {
  const a = getJrById(assetId);
  if (!a) return;
  const h = (a.riwayat || []).find(x => x.id === riwayatId);
  if (!h) return;

  const isBeli = h.type === 'beli';
  document.getElementById('jrRiwayatDetailTitle').textContent = isBeli ? 'Detail Beli' : 'Detail Jual';

  const alasanList = isBeli ? (h.alasan || []) : (h.alasanJual || []);
  const alasanLabel = isBeli ? 'Alasan Keputusan' : 'Alasan Jual';
  const emosiLabel = h.emosi && JR_EMOSI[h.emosi] ? JR_EMOSI[h.emosi].label : '-';
  const plan = !isBeli ? jrFindLastPlan(a, h.id) : null;
  const tx = h.txId ? transactions.find(t => t.id === h.txId) : null;
  const akun = sources.find(s => s.id === (isBeli ? tx?.sourceId : tx?.destId));

  let html = `
    <div class="wl-info-card" style="margin-bottom:16px;">
      <div class="wl-info-row"><i class="bi bi-calendar3"></i><div class="wl-info-label">Tanggal</div><div class="wl-info-val">${formatTanggalLabel(h.tanggal)}${tx?.time ? ' · ' + tx.time : ''}</div></div>
      <div class="wl-info-row"><i class="bi bi-wallet2"></i><div class="wl-info-label">${isBeli ? 'Dari Akun' : 'Ke Akun'}</div><div class="wl-info-val">${akun ? escapeHtml(akun.name) : '-'}</div></div>
      <div class="wl-info-row"><i class="bi bi-hash"></i><div class="wl-info-label">Jumlah Unit</div><div class="wl-info-val">${h.jumlah}</div></div>
      <div class="wl-info-row"><i class="bi bi-cash"></i><div class="wl-info-label">Harga per Unit</div><div class="wl-info-val">${formatRupiah(h.harga)}</div></div>
      <div class="wl-info-row"><i class="bi bi-calculator"></i><div class="wl-info-label">Total</div><div class="wl-info-val">${formatRupiah(h.total)}</div></div>
      ${!isBeli && h.realizedPnl !== undefined ? `<div class="wl-info-row"><i class="bi bi-graph-up-arrow"></i><div class="wl-info-label">Untung/Rugi Direalisasi</div><div class="wl-info-val" style="color:${h.realizedPnl >= 0 ? '#06A876' : 'var(--danger)'};">${h.realizedPnl >= 0 ? '+' : ''}${formatRupiah(h.realizedPnl)} (${h.realizedPnlPct >= 0 ? '+' : ''}${h.realizedPnlPct.toFixed(1)}%)</div></div>` : ''}
      ${!isBeli && h.holdingDays !== null && h.holdingDays !== undefined ? `<div class="wl-info-row"><i class="bi bi-calendar-range"></i><div class="wl-info-label">Lama Disimpan</div><div class="wl-info-val">${h.holdingDays} hari</div></div>` : ''}
      ${!isBeli && h.sesuaiRencana ? `<div class="wl-info-row"><i class="bi bi-check2-square"></i><div class="wl-info-label">Sesuai Rencana</div><div class="wl-info-val" style="color:${h.sesuaiRencana === 'ya' ? '#06A876' : 'var(--danger)'};">${h.sesuaiRencana === 'ya' ? 'Ya' : 'Tidak'}</div></div>` : ''}
    </div>

    ${plan ? `
    <div class="info-banner" style="background:${h.realizedPnlPct >= (plan.targetPct || Infinity) ? 'rgba(6,168,118,0.12)' : (plan.stopLossPct && h.realizedPnlPct <= -plan.stopLossPct ? 'var(--danger-100)' : 'var(--surface-sunken)')};">
      <i class="bi bi-bullseye"></i>
      <div class="info-banner-text">Rencana saat beli: Target +${plan.targetPct || 0}% / SL -${plan.stopLossPct || 0}%. Hasil sebenarnya: ${h.realizedPnlPct >= 0 ? '+' : ''}${h.realizedPnlPct.toFixed(1)}% — ${plan.targetPct && h.realizedPnlPct >= plan.targetPct ? 'sesuai target 🎯' : (plan.stopLossPct && h.realizedPnlPct <= -plan.stopLossPct ? 'kena stop loss' : 'di luar rencana awal')}.</div>
    </div>` : ''}

    <div class="wl-section-title">${alasanLabel}</div>
    <div class="rw-chip-wrap" style="margin-bottom:16px;">
      ${alasanList.length ? alasanList.map(x => `<span class="rw-fchip active" style="cursor:default;">${escapeHtml(x)}</span>`).join('') : '<span style="font-size:12px; color:var(--ink-300);">-</span>'}
    </div>

    <div class="wl-info-card" style="margin-bottom:16px;">
      <div class="wl-info-row"><i class="bi bi-emoji-smile"></i><div class="wl-info-label">Kondisi Emosi</div><div class="wl-info-val">${emosiLabel}</div></div>
      ${isBeli && h.horizon ? `<div class="wl-info-row"><i class="bi bi-signpost-split"></i><div class="wl-info-label">Horizon</div><div class="wl-info-val">${h.horizon}</div></div>` : ''}
      ${isBeli && (h.targetPct || h.stopLossPct) ? `
      <div class="wl-info-row"><i class="bi bi-bullseye"></i><div class="wl-info-label">Target Untung</div><div class="wl-info-val">${h.targetPct ? '+' + h.targetPct + '%' : '-'}</div></div>
      <div class="wl-info-row"><i class="bi bi-shield-exclamation"></i><div class="wl-info-label">Batas Rugi</div><div class="wl-info-val">${h.stopLossPct ? '-' + h.stopLossPct + '%' : '-'}</div></div>` : ''}
    </div>

    ${isBeli && h.skenarioTerbaik ? `<div class="wl-section-title">Kalau Harganya Naik</div><div class="wl-info-card" style="margin-bottom:16px; padding:14px;"><div style="font-size:13px; color:var(--ink-700);">${h.skenarioTerbaik}</div></div>` : ''}
    ${isBeli && h.skenarioTerburuk ? `<div class="wl-section-title">Kalau Harganya Turun</div><div class="wl-info-card" style="margin-bottom:16px; padding:14px;"><div style="font-size:13px; color:var(--ink-700);">${escapeHtml(h.skenarioTerburuk)}</div></div>` : ''}

    ${h.catatan ? `
    <div class="wl-section-title">Catatan</div>
    <div class="wl-info-card" style="margin-bottom:16px; padding:14px;"><div style="font-size:13px; color:var(--ink-700);">${escapeHtml(h.catatan)}</div></div>` : ''}

    ${!isBeli ? `
    <div class="wl-section-title">Pelajaran (Isi Belakangan Aja, Pas Udah Tenang)</div>
    <textarea id="jrPelajaranInput" placeholder="Apa yang bisa dipelajari dari transaksi ini?" maxlength="300"
              style="width:100%; min-height:70px; border-radius:var(--radius-sm); border:1.5px solid var(--border-strong); background:var(--surface); padding:10px 12px; font-size:13px; color:var(--ink-900); font-family:inherit; margin-bottom:10px; resize:vertical;">${h.pelajaran || ''}</textarea>
    <button class="btn" style="background:var(--surface-sunken); color:var(--ink-700); margin-bottom:16px;" onclick="saveJrPelajaran('${a.id}','${h.id}')">Simpan Pelajaran</button>` : ''}
  `;

  document.getElementById('jrRiwayatDetailBody').innerHTML = html;
  openSheet('jrRiwayatDetailOverlay');
}

// ======================================================
// EVALUASI JURNAL -- inti "jurnal" (bukan cuma rekap saldo).
// Tab: Ringkasan / Emosi / Alasan / Holding Period / Bias
// ======================================================
function jrSwitchEvalTab(tab) {
  jrEvalTab = tab;
  renderJrEvaluasiPage();
}

function jrCollectJualList() {
  const jualList = [];
  getJI().forEach(a => {
    (a.riwayat || []).forEach(h => {
      if (h.type === 'jual') jualList.push({ ...h, assetId: a.id, assetNama: a.nama, plan: jrFindLastPlan(a, h.id) });
    });
  });
  return jualList;
}

function renderJrEvaluasiPage() {
  const body = document.getElementById('jrEvaluasiBody');
  const jualList = jrCollectJualList();

  const tabs = [['ringkasan', 'Ringkasan'], ['pola', 'Pola & Kesimpulan']];
  let html = `<div class="jr-tabbar">
    ${tabs.map(([key, label]) => `<div class="jr-tab ${jrEvalTab === key ? 'active' : ''}" onclick="jrSwitchEvalTab('${key}')">${label}</div>`).join('')}
  </div>`;

  if (!jualList.length) {
    html += `
      <div class="bdg-empty" style="margin-top:12px;">
        <i class="bi bi-clipboard-data" style="font-size:38px; color:var(--ink-300);"></i>
        <div class="bdg-empty-title">Belum Ada Data Evaluasi</div>
        <div class="bdg-empty-sub">Evaluasi baru muncul setelah kamu jual aset minimal sekali. Semakin banyak transaksi, semakin akurat pola yang kelihatan.</div>
      </div>`;
    body.innerHTML = html;
    return;
  }

  // Ringkasan selalu boleh dilihat sejak transaksi jual pertama. Tapi breakdown
  // pola (emosi/alasan/holding/bias) baru ditampilkan kalau datanya udah cukup --
  // biar gak nyimpulin pola dari 1-2 data doang yang gampang menyesatkan.
  const gated = jrEvalTab === 'pola' && jualList.length < JR_EVAL_MIN_TRADES;
  if (gated) {
    html += `
      <div class="bdg-empty" style="margin-top:12px;">
        <i class="bi bi-hourglass-split" style="font-size:38px; color:var(--ink-300);"></i>
        <div class="bdg-empty-title">Kumpulin Data Dulu</div>
        <div class="bdg-empty-sub">Baru ${jualList.length} dari minimal ${JR_EVAL_MIN_TRADES} transaksi jual. Pola yang kelihatan dari data sedikit gampang menyesatkan -- lanjut jurnaling dulu.</div>
      </div>`;
    body.innerHTML = html;
    return;
  }

  if (jrEvalTab === 'ringkasan') {
    html += jrRenderEvalRingkasan(jualList);
  } else if (jrEvalTab === 'pola') {
    html += `<div class="wl-section-title" style="margin-top:0;">Emosi vs Hasil</div>` + jrRenderEvalBreakdown(jualList, 'emosi');
    html += `<div class="wl-section-title jr-gap-lg">Alasan Jual vs Hasil</div>` + jrRenderEvalBreakdown(jualList, 'alasan');
    html += `<div class="wl-section-title jr-gap-lg">Holding Period</div>` + jrRenderEvalHolding(jualList);
    html += `<div class="wl-section-title jr-gap-lg">Bias & Insight</div>` + jrRenderEvalBias(jualList);
  }

  html += `<div style="height:24px;"></div>`;
  body.innerHTML = html;
}

function jrRenderEvalRingkasan(jualList) {
  const totalPnl = jualList.reduce((s, h) => s + (h.realizedPnl || 0), 0);
  const menang = jualList.filter(h => (h.realizedPnl || 0) > 0);
  const winRate = (menang.length / jualList.length) * 100;
  const avgPnlPct = jualList.reduce((s, h) => s + (h.realizedPnlPct || 0), 0) / jualList.length;

  let kenaTarget = 0, kenaSL = 0, diLuarRencana = 0, tanpaRencana = 0;
  jualList.forEach(h => {
    if (!h.plan) { tanpaRencana++; return; }
    if (h.plan.targetPct && h.realizedPnlPct >= h.plan.targetPct) kenaTarget++;
    else if (h.plan.stopLossPct && h.realizedPnlPct <= -h.plan.stopLossPct) kenaSL++;
    else diLuarRencana++;
  });

  const pelajaranList = jualList.filter(h => h.pelajaran && h.pelajaran.trim()).sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));

  return `
    <div class="wl-hero">
      <div class="wl-hero-head"><div class="wl-hero-title">Ringkasan Evaluasi</div></div>
      <div class="bdg-hero-row" style="margin-top:10px;">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">Tingkat Menang</div>
          <div class="bdg-hero-val">${winRate.toFixed(0)}%</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Total Direalisasi</div>
          <div class="bdg-hero-val" style="color:${totalPnl >= 0 ? '#06A876' : 'var(--danger)'};">${totalPnl >= 0 ? '+' : ''}${formatRupiah(totalPnl)}</div>
        </div>
      </div>
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct" style="color:var(--ink-300);">${jualList.length} transaksi jual tercatat</div>
        <div class="bdg-hero-sisa" style="color:${avgPnlPct >= 0 ? '#06A876' : 'var(--danger)'};">Rata-rata ${avgPnlPct >= 0 ? '+' : ''}${avgPnlPct.toFixed(1)}%/transaksi</div>
      </div>
    </div>

    <div class="wl-section-title jr-gap-lg">Realisasi vs Rencana Awal</div>
    <div class="wl-info-card">
      <div class="wl-info-row"><i class="bi bi-bullseye"></i><div class="wl-info-label">Sesuai Target Untung</div><div class="wl-info-val" style="color:#06A876;">${kenaTarget}x</div></div>
      <div class="wl-info-row"><i class="bi bi-shield-exclamation"></i><div class="wl-info-label">Kena Batas Rugi</div><div class="wl-info-val" style="color:var(--danger);">${kenaSL}x</div></div>
      <div class="wl-info-row"><i class="bi bi-signpost-split"></i><div class="wl-info-label">Di Luar Rencana</div><div class="wl-info-val">${diLuarRencana}x</div></div>
      <div class="wl-info-row"><i class="bi bi-question-circle"></i><div class="wl-info-label">Gak Ada Rencana Dipasang</div><div class="wl-info-val">${tanpaRencana}x</div></div>
    </div>

    <div class="wl-section-title jr-gap-lg">Kumpulan Pelajaran</div>
    ${pelajaranList.length ? pelajaranList.map(h => `
      <div class="wl-info-card" style="margin-bottom:10px; padding:14px;">
        <div style="font-size:11.5px; font-weight:700; color:var(--ink-300); margin-bottom:4px;">${h.assetNama} · ${formatTanggalLabel(h.tanggal)}</div>
        <div style="font-size:13px; color:var(--ink-700);">${h.pelajaran}</div>
      </div>`).join('') : `<div class="kt-empty">Belum ada pelajaran yang dicatat. Isi lewat halaman detail tiap transaksi jual.</div>`}`;
}

// Breakdown dipakai buat tab Emosi & tab Alasan -- pola sama, sumber beda.
function jrRenderEvalBreakdown(jualList, mode) {
  const map = {};
  if (mode === 'emosi') {
    jualList.forEach(h => {
      if (!h.emosi) return;
      if (!map[h.emosi]) map[h.emosi] = { count: 0, win: 0, totalPct: 0 };
      map[h.emosi].count++; map[h.emosi].totalPct += (h.realizedPnlPct || 0);
      if ((h.realizedPnl || 0) > 0) map[h.emosi].win++;
    });
  } else {
    jualList.forEach(h => (h.alasanJual || []).forEach(x => {
      if (!map[x]) map[x] = { count: 0, win: 0, totalPct: 0 };
      map[x].count++; map[x].totalPct += (h.realizedPnlPct || 0);
      if ((h.realizedPnl || 0) > 0) map[x].win++;
    }));
  }

  const keys = Object.keys(map).sort((a, b) => map[b].count - map[a].count);
  if (!keys.length) return `<div class="kt-empty" style="margin-top:12px;">Belum ada data ${mode === 'emosi' ? 'emosi' : 'alasan jual'} yang tercatat.</div>`;

  const rows = keys.map(key => {
    const d = map[key];
    const winRate = (d.win / d.count) * 100;
    const label = mode === 'emosi' ? (JR_EMOSI[key] ? JR_EMOSI[key].label : key) : key;
    const prefix = mode === 'emosi' && JR_EMOSI[key] ? JR_EMOSI[key].emoji : '<i class="bi bi-tag"></i>';
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:var(--ink-900);">${prefix} ${label} <span style="color:var(--ink-300); font-weight:600;">(${d.count}x)</span></div>
          <div style="font-size:12.5px; font-weight:700; color:${winRate >= 50 ? '#06A876' : 'var(--danger)'};">${winRate.toFixed(0)}% win</div>
        </div>
        <div style="height:8px; border-radius:100px; background:var(--surface-sunken); overflow:hidden;">
          <div style="height:100%; width:${winRate}%; border-radius:100px; background:${winRate >= 50 ? '#06A876' : 'var(--danger)'};"></div>
        </div>
      </div>`;
  }).join('');

  return `<div class="wl-info-card" style="padding:16px;">${rows}</div>`;
}

function jrRenderEvalHolding(jualList) {
  const withHolding = jualList.filter(h => h.holdingDays !== null && h.holdingDays !== undefined);
  if (!withHolding.length) return `<div class="kt-empty" style="margin-top:12px;">Belum ada data lama holding.</div>`;

  const avgHolding = withHolding.reduce((s, h) => s + h.holdingDays, 0) / withHolding.length;
  const menang = withHolding.filter(h => (h.realizedPnl || 0) > 0);
  const rugi = withHolding.filter(h => (h.realizedPnl || 0) <= 0);
  const avgHoldingWin = menang.length ? menang.reduce((s, h) => s + h.holdingDays, 0) / menang.length : 0;
  const avgHoldingLoss = rugi.length ? rugi.reduce((s, h) => s + h.holdingDays, 0) / rugi.length : 0;

  return `
    <div class="wl-info-card" style="margin-bottom:16px;">
      <div class="wl-info-row"><i class="bi bi-calendar-range"></i><div class="wl-info-label">Rata-rata Lama Disimpan</div><div class="wl-info-val">${avgHolding.toFixed(0)} hari</div></div>
      <div class="wl-info-row"><i class="bi bi-emoji-smile"></i><div class="wl-info-label">Holding Saat Untung</div><div class="wl-info-val" style="color:#06A876;">${avgHoldingWin.toFixed(0)} hari</div></div>
      <div class="wl-info-row"><i class="bi bi-emoji-frown"></i><div class="wl-info-label">Holding Saat Rugi</div><div class="wl-info-val" style="color:var(--danger);">${avgHoldingLoss.toFixed(0)} hari</div></div>
    </div>
    <div class="wl-section-title">Riwayat Lama Disimpan</div>
    <div class="wl-info-card">
      ${withHolding.slice().sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || '')).map(h => `
        <div class="wl-info-row"><i class="bi bi-clock-history"></i><div class="wl-info-label">${h.assetNama} · ${formatTanggalLabel(h.tanggal)}</div><div class="wl-info-val">${h.holdingDays} hari</div></div>
      `).join('')}
    </div>`;
}

// Bias & Insight -- kesimpulan berbahasa manusia, bukan cuma angka mentah.
function jrRenderEvalBias(jualList) {
  const insights = [];

  // 1) Bias emosi dengan win rate terendah (dan cukup sering terjadi)
  const emosiMap = {};
  jualList.forEach(h => {
    if (!h.emosi) return;
    if (!emosiMap[h.emosi]) emosiMap[h.emosi] = { count: 0, win: 0 };
    emosiMap[h.emosi].count++;
    if ((h.realizedPnl || 0) > 0) emosiMap[h.emosi].win++;
  });
  const emosiKeys = Object.keys(emosiMap).filter(k => emosiMap[k].count >= 2);
  if (emosiKeys.length) {
    const worst = emosiKeys.reduce((a, b) => (emosiMap[a].win / emosiMap[a].count) <= (emosiMap[b].win / emosiMap[b].count) ? a : b);
    const wr = (emosiMap[worst].win / emosiMap[worst].count) * 100;
    if (wr < 50) {
      insights.push({ level: 'danger', icon: 'bi-exclamation-triangle-fill',
        title: `Bias Terbesar Anda: Terlalu sering jual saat "${JR_EMOSI[worst] ? JR_EMOSI[worst].label : worst}"`,
        text: `${emosiMap[worst].count} transaksi dengan kondisi emosi ini, win rate cuma ${wr.toFixed(0)}%. Coba hindari ambil keputusan saat emosi lagi kayak gini.` });
    }
  }

  // 2) Alasan jual dengan win rate terendah
  const alasanMap = {};
  jualList.forEach(h => (h.alasanJual || []).forEach(x => {
    if (!alasanMap[x]) alasanMap[x] = { count: 0, win: 0 };
    alasanMap[x].count++;
    if ((h.realizedPnl || 0) > 0) alasanMap[x].win++;
  }));
  const alasanKeys = Object.keys(alasanMap).filter(k => alasanMap[k].count >= 2);
  if (alasanKeys.length) {
    const best = alasanKeys.reduce((a, b) => (alasanMap[a].win / alasanMap[a].count) >= (alasanMap[b].win / alasanMap[b].count) ? a : b);
    const wr = (alasanMap[best].win / alasanMap[best].count) * 100;
    insights.push({ level: 'ok', icon: 'bi-check-circle-fill',
      title: `Keputusan berbasis "${best}" performanya terbaik`,
      text: `Win rate ${wr.toFixed(0)}% dari ${alasanMap[best].count} transaksi. Pola ini layak dipertahankan.` });
  }

  // 3) Holding period pendek dibanding rata-rata (cenderung jual cepat)
  const withHolding = jualList.filter(h => h.holdingDays !== null && h.holdingDays !== undefined);
  if (withHolding.length >= 3) {
    const avgHolding = withHolding.reduce((s, h) => s + h.holdingDays, 0) / withHolding.length;
    if (avgHolding < 30) {
      insights.push({ level: 'warning', icon: 'bi-hourglass-split',
        title: 'Anda cenderung menjual terlalu cepat',
        text: `Rata-rata holding period cuma ${avgHolding.toFixed(0)} hari. Kalau horizon investasimu jangka panjang, coba lebih sabar nunggu thesis-nya main out.` });
    }
  }

  // 4) Realisasi vs rencana -- sering di luar rencana
  const withPlan = jualList.filter(h => h.plan);
  if (withPlan.length >= 3) {
    const diLuar = withPlan.filter(h => {
      const hitTarget = h.plan.targetPct && h.realizedPnlPct >= h.plan.targetPct;
      const hitSL = h.plan.stopLossPct && h.realizedPnlPct <= -h.plan.stopLossPct;
      return !hitTarget && !hitSL;
    });
    if (diLuar.length / withPlan.length > 0.5) {
      insights.push({ level: 'warning', icon: 'bi-signpost-split',
        title: 'Rencana sering gak ditaati',
        text: `${diLuar.length} dari ${withPlan.length} transaksi ditutup di luar target/stop loss yang udah dipasang. Coba lebih disiplin sama rencana awal.` });
    }
  }

  if (!insights.length) {
    return `<div class="kt-empty" style="margin-top:12px;">Belum cukup data buat nemuin pola bias. Catat lebih banyak transaksi jual dulu.</div>`;
  }

  return insights.map(ins => `
    <div class="info-banner" style="background:${ins.level === 'danger' ? 'var(--danger-100)' : ins.level === 'ok' ? 'rgba(6,168,118,0.12)' : 'var(--warning-100)'}; margin-bottom:12px;">
      <i class="bi ${ins.icon}" style="color:${ins.level === 'danger' ? 'var(--danger)' : ins.level === 'ok' ? '#06A876' : 'var(--warning)'};"></i>
      <div class="info-banner-text"><strong>${ins.title}</strong><br>${ins.text}</div>
    </div>`).join('');
}
