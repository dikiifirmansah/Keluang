// ======================================================
// MODULE: Dana Darurat
// STATUS: Aktif
// ======================================================
// Data model (kantong TUNGGAL — beda dari Wishlist yang array multi-item,
// karena secara konsep cuma ada SATU Dana Darurat per user):
// {
//   targetAmount, balance,
//   storageNote (opsional, teks bebas), note (opsional, deskripsi),
//   reminders: { belumTarget: true } (flag saja, logic notifikasi menyusul),
//   history: [ { id, type:'setor'|'pakai', amount, fee, category (khusus 'pakai'),
//                note, date } ],
//   createdAt, updatedAt
// }
//
// Dana Darurat = kantong mandiri (persis Wishlist): setor/pakai TIDAK
// menyentuh saldo akun manapun secara "ganda" — perpindahan dicatat sebagai
// transfer manual (lihat submitDdSetor/submitDdPakai).
//
// Beda kunci dengan Wishlist:
// - Cuma 1 kantong, gak ada status tab (Berlangsung/Tercapai/Selesai) karena
//   dana darurat sifatnya JANGKA PANJANG & GAK PERNAH "selesai" — begitu
//   target tercapai, dana tetap mengendap & bisa terus dipupuk/dipakai.
// - Aksi pemakaian cuma SATU jenis: "Pakai Dana Darurat" — sekaligus
//   mencatatnya sebagai Pengeluaran (kategori dipilih user) DAN mengembalikan
//   uangnya ke akun Liquid tujuan (lihat Plan.txt poin 4: "catat keluar +
//   kembali ke liquid"). Ini beda dari Wishlist yang misahin Tarik (netral)
//   vs Gunakan (pure expense, gak nyentuh akun) — di Dana Darurat kedua efek
//   itu terjadi BERSAMAAN dalam satu aksi karena secara nyata begitu dana
//   darurat dipakai, uangnya emang harus balik ke rekening biar bisa dipakai
//   bayar kebutuhan darurat itu, dan itu juga harus kehitung sebagai
//   pengeluaran di Statistik & Budget kategori terkait.

// ======================================================
// STATE
// ======================================================
let ddEyeHidden = false;
let ddExtraOpen = false;

// ======================================================
// INIT
// ======================================================
function initDanaDarurat() {
  ddExtraOpen = false;
  renderDanaDaruratPage();
}

function getDD() { return loadDanaDarurat(); }

// ======================================================
// HELPERS
// ======================================================
function ddFmt(n) {
  return ddEyeHidden ? '••••••' : formatRupiah(n);
}

function ddPct(dd) {
  if (!dd || !dd.targetAmount) return 0;
  return Math.min((dd.balance / dd.targetAmount) * 100, 100);
}

function ddLiquidAccounts() {
  return sources.filter(s => s.kategori !== 'invest');
}

// Rata-rata pengeluaran bulanan (murni kategori 'keluar', bukan fee/transfer)
// dari transaksi 3 bulan terakhir — dipakai sebagai basis rekomendasi target
// "3-6x pengeluaran bulanan" di Kalkulator.
function ddAvgMonthlyExpense() {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const relevant = transactions.filter(t => t.type === 'keluar' && !t.isFee && new Date(t.date) >= cutoff);
  if (!relevant.length) return 0;
  const total = relevant.reduce((a, t) => a + t.amount, 0);
  const monthsSpan = Math.max(1, (now.getFullYear() - cutoff.getFullYear()) * 12 + (now.getMonth() - cutoff.getMonth()) + 1);
  return Math.round(total / monthsSpan);
}

// Basis "Cakupan berapa bulan" di hero: prioritaskan estimasi manual yang
// user isi sendiri lewat Kalkulator (lebih bisa dipercaya karena pengeluaran
// riil sering gak menentu), fallback ke rata-rata transaksi otomatis kalau
// belum pernah diisi.
function ddMonthlyBasis(dd) {
  if (dd && dd.monthlyExpenseEstimate) return dd.monthlyExpenseEstimate;
  return ddAvgMonthlyExpense();
}

function ddLastUpdatedLabel(dd) {
  if (!dd || !dd.updatedAt) return '-';
  const d = new Date(dd.updatedAt);
  const today = new Date();
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  if (d.toDateString() === today.toDateString()) return `Hari ini ${hh}:${mm}`;
  return `${d.getDate()} ${bulanPanjang[d.getMonth()]} ${d.getFullYear()}`;
}

// ======================================================
// RENDER: PAGE
// ======================================================
function renderDanaDaruratPage() {
  const dd = getDD();
  const body = document.getElementById('ddBody');

  if (!dd) {
    body.innerHTML = `
      <div class="bdg-empty" style="margin-top:24px;">
        <i class="fi fi-sr-light-emergency-on" style="font-size:38px; color:var(--ink-300);"></i>
        <div class="bdg-empty-title">Belum Ada Dana Darurat</div>
        <div class="bdg-empty-sub">Sisihkan dana cadangan untuk kebutuhan tak terduga — biasanya 3-6x pengeluaran bulanan kamu.</div>
        <button class="dd-empty-cta" style="margin-top:16px;" onclick="openDdSetup()">
          <i class="bi bi-plus-lg"></i> Atur Dana Darurat
        </button>
      </div>`;
    return;
  }

  const pct = ddPct(dd);
  const sisa = Math.max(dd.targetAmount - dd.balance, 0);
  const tercapai = dd.targetAmount > 0 && dd.balance >= dd.targetAmount;
  const avgExpense = ddMonthlyBasis(dd);
  const bulanTercover = avgExpense > 0 ? (dd.balance / avgExpense).toFixed(1) : '-';

  let html = `
    <div class="wl-hero">
      <div class="wl-hero-head">
        <div class="wl-hero-title">Ringkasan Dana Darurat</div>
        <div class="wl-hero-actions">
          <button class="wl-eye-btn" onclick="toggleDdEye()"><i class="bi ${ddEyeHidden ? 'bi-eye-slash' : 'bi-eye'}"></i></button>
          <button class="wl-hero-toggle-btn ${ddExtraOpen ? 'open' : ''}" onclick="toggleDdExtra()"><i class="bi bi-chevron-down"></i></button>
        </div>
      </div>
      <div class="bdg-hero-row" style="margin-top:10px;">
        <div class="bdg-hero-item">
          <div class="bdg-hero-label">Target</div>
          <div class="bdg-hero-val">${ddFmt(dd.targetAmount)}</div>
        </div>
        <div class="bdg-hero-item right">
          <div class="bdg-hero-label">Terkumpul</div>
          <div class="bdg-hero-val">${ddFmt(dd.balance)}</div>
        </div>
      </div>
      <div class="bdg-global-track" style="margin-top:2px;"><div class="wl-bar-fill" style="width:${pct}%; background:${tercapai ? 'linear-gradient(90deg, #06A876, #05C98C)' : 'linear-gradient(90deg, var(--primary), var(--primary-700))'};"></div></div>
      <div class="bdg-hero-row" style="margin-top:6px;">
        <div class="bdg-hero-pct ok-text">${pct.toFixed(0)}% ${tercapai ? '— Target Tercapai' : 'terkumpul'}</div>
        <div class="bdg-hero-sisa ok-text">${tercapai ? 'Dana aman' : 'Sisa ' + ddFmt(sisa)}</div>
      </div>
      <div class="st-extra-grid" style="display:${ddExtraOpen ? 'grid' : 'none'}; margin-top:14px;">
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-shield-check"></i> Status</div>
          <div class="ec-val" style="font-size:12.5px;">${tercapai ? 'Aman' : 'Menuju Target'}</div>
          <div class="ec-sub">${tercapai ? 'sudah sesuai target' : 'terus disisihkan ya'}</div>
        </div>
        <div class="st-extra-card">
          <div class="ec-head"><i class="bi bi-calendar-week"></i> Cakupan</div>
          <div class="ec-val">${bulanTercover}x</div>
          <div class="ec-sub">pengeluaran bulanan</div>
        </div>
      </div>
      <div class="wl-hero-updated" style="display:${ddExtraOpen ? 'block' : 'none'};">Terakhir diperbarui: ${ddLastUpdatedLabel(dd)}</div>
    </div>

    <div class="wl-action-row" style="margin-top:16px;">
      <div class="wl-action-btn" onclick="openDdSetor()">
        <div class="wl-action-btn-icon" style="background:var(--info-100);"><i class="bi bi-arrow-down" style="color:var(--info);"></i></div>
        <div class="wl-action-btn-label">Setor Dana</div>
      </div>
      <div class="wl-action-btn" onclick="openDdPakai()">
        <div class="wl-action-btn-icon" style="background:var(--warning-100);"><i class="bi bi-arrow-up" style="color:var(--warning);"></i></div>
        <div class="wl-action-btn-label">Pakai Dana</div>
      </div>
      <div class="wl-action-btn" onclick="openDdSettingsSheet()">
        <div class="wl-action-btn-icon" style="background:var(--surface-sunken);"><i class="bi bi-three-dots" style="color:var(--ink-500);"></i></div>
        <div class="wl-action-btn-label">Pengaturan</div>
      </div>
    </div>

    <div class="wl-info-card">
      <div class="wl-info-row"><i class="bi bi-wallet2"></i><div class="wl-info-label">Tempat Menyimpan</div><div class="wl-info-val">${escapeHtml(dd.storageNote || '-')}</div></div>
      <div class="wl-info-row"><i class="bi bi-clock-history"></i><div class="wl-info-label">Dibuat pada</div><div class="wl-info-val">${new Date(dd.createdAt).getDate()} ${bulanPanjang[new Date(dd.createdAt).getMonth()]} ${new Date(dd.createdAt).getFullYear()}</div></div>
      ${dd.note ? `<div class="wl-info-row"><i class="bi bi-file-text"></i><div class="wl-info-label">Catatan</div><div class="wl-info-val desc">${escapeHtml(dd.note)}</div></div>` : ''}
    </div>

    <div class="wl-section-title">Riwayat</div>`;

  if (!dd.history || !dd.history.length) {
    html += `<div class="kt-empty">Belum ada riwayat setoran/pemakaian.</div>`;
  } else {
    html += dd.history.slice().reverse().map(h => {
      const d = new Date(h.date);
      const dLabel = formatHistoryDateID(d);
      const isSetor = h.type === 'setor';
      const subNote = h.note || '';
      return `
        <div class="bdg-tx-item"${h.txId ? ` onclick="openTransactionDetail('${h.txId}')" style="cursor:pointer;"` : ''}>
          <div class="bdg-tx-note">${isSetor ? 'Setoran' : 'Pemakaian'}${subNote ? ' · ' + subNote : ''}<br><span style="font-weight:500;color:var(--ink-300);font-size:10.5px;">${dLabel}</span></div>
          <div class="bdg-tx-amt" style="color:${isSetor ? '#06A876' : 'var(--danger)'};">${isSetor ? '+' : '−'}${formatRupiah(h.amount)}</div>
        </div>`;
    }).join('');
  }

  html += `<div style="height:24px;"></div>`;
  body.innerHTML = html;
}

function toggleDdEye() { ddEyeHidden = !ddEyeHidden; renderDanaDaruratPage(); }
function toggleDdExtra() { ddExtraOpen = !ddExtraOpen; renderDanaDaruratPage(); }

// ======================================================
// SETUP / EDIT TARGET
// ======================================================
function openDdSetup() {
  const dd = getDD();
  document.getElementById('ddSetupTitle').textContent = dd ? 'Ubah Dana Darurat' : 'Atur Dana Darurat';
  document.getElementById('ddSetupTargetInput').value = dd && dd.targetAmount ? dd.targetAmount.toLocaleString('id-ID') : '';
  document.getElementById('ddSetupStorageInput').value = dd ? (dd.storageNote || '') : '';
  document.getElementById('ddSetupNoteInput').value = dd ? (dd.note || '') : '';
  document.getElementById('ddSetupErrMsg').style.display = 'none';
  closeSheet('ddSettingsOverlay');
  openSheet('ddSetupOverlay');
}

function saveDdSetup() {
  const errEl = document.getElementById('ddSetupErrMsg');
  errEl.style.display = 'none';

  const targetAmount = parseInt(document.getElementById('ddSetupTargetInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const storageNote = document.getElementById('ddSetupStorageInput').value.trim();
  const note = document.getElementById('ddSetupNoteInput').value.trim();

  if (!targetAmount) { errEl.textContent = 'Target nominal wajib diisi'; errEl.style.display = 'block'; return; }

  const nowIso = new Date().toISOString();
  let dd = getDD();
  if (dd) {
    dd.targetAmount = targetAmount;
    dd.storageNote = storageNote;
    dd.note = note;
    if (ddCalcMonthlyValue) dd.monthlyExpenseEstimate = ddCalcMonthlyValue;
    dd.updatedAt = nowIso;
  } else {
    dd = {
      targetAmount, balance: 0, storageNote, note,
      monthlyExpenseEstimate: ddCalcMonthlyValue || 0,
      reminders: { belumTarget: true, saldoTerpakai: true },
      history: [],
      createdAt: nowIso, updatedAt: nowIso,
    };
  }
  saveDanaDarurat(dd);
  closeSheet('ddSetupOverlay');
  showToast('Dana Darurat disimpan');
  renderAll();
  renderDanaDaruratPage();
}

// ---------- Kalkulator rekomendasi target ----------
// Sengaja berbasis input MANUAL, bukan rata-rata transaksi otomatis — karena
// pengeluaran bulanan riil biasanya gak menentu/fluktuatif, jadi rekomendasi
// lebih akurat kalau nominalnya user yang tentuin sendiri.
let ddCalcMonthlyValue = 0;

function openDdCalculator() {
  document.getElementById('ddCalcExpenseInput').value = ddCalcMonthlyValue ? ddCalcMonthlyValue.toLocaleString('id-ID') : '';
  document.getElementById('ddCalcResultList').innerHTML = '';
  openSheet('ddCalculatorOverlay');
}

function hitungDdRekomendasi() {
  const monthly = parseInt(document.getElementById('ddCalcExpenseInput').value.replace(/[^\d]/g, ''), 10) || 0;
  if (!monthly) { showToast('Isi dulu perkiraan pengeluaran bulanan'); return; }
  ddCalcMonthlyValue = monthly;

  const opsi = [
    { label: '3 Bulan', sub: 'dana darurat minimal', bulan: 3 },
    { label: '6 Bulan', sub: 'dana darurat ideal', bulan: 6 },
    { label: '1 Tahun', sub: 'dana darurat ekstra aman', bulan: 12 },
  ];
  document.getElementById('ddCalcResultList').innerHTML = opsi.map(o => `
    <div class="wl-calc-card">
      <div>
        <div class="wl-calc-card-label">${o.label} <span style="font-weight:500; color:var(--ink-300);">(${o.sub})</span></div>
        <div class="wl-calc-card-sub">${formatRupiah(monthly * o.bulan)}</div>
      </div>
      <button class="wl-calc-card-pick" onclick="pilihDdTarget(${monthly * o.bulan})">Pilih</button>
    </div>`).join('');
}

function pilihDdTarget(amount) {
  document.getElementById('ddSetupTargetInput').value = amount.toLocaleString('id-ID');
  closeSheet('ddCalculatorOverlay');
  showToast('Rekomendasi target diterapkan');
}

// ======================================================
// SETOR DANA
// ======================================================
let ddSetorAccountId = null;
let ddPakaiAccountId = null;
let ddHapusAccountId = null;
let ddTxAccountMode = null; // 'setor' | 'pakai' | 'hapus'

const DD_QUICK_AMOUNTS = [50000, 100000, 500000, 1000000];

function openDdSetor() {
  const dd = getDD();
  if (!dd) return;
  ddSetorAccountId = null;

  document.getElementById('ddSetorSaldoLabel').textContent = formatRupiah(dd.balance);
  document.getElementById('ddSetorSisaLabel').textContent = formatRupiah(Math.max(dd.targetAmount - dd.balance, 0));
  document.getElementById('ddSetorAmountInput').value = '';
  document.getElementById('ddSetorFeeInput').value = '';
  document.getElementById('ddSetorNoteInput').value = '';
  document.getElementById('ddSetorErrMsg').style.display = 'none';

  const sisa = Math.max(dd.targetAmount - dd.balance, 0);
  document.getElementById('ddSetorQuickRow').innerHTML =
    DD_QUICK_AMOUNTS.map(v => `<div class="quick-amount-chip" onclick="ddAddQuickAmount('ddSetorAmountInput',${v})">+${formatRibu(v)}</div>`).join('') +
    (sisa > 0 ? `<div class="quick-amount-chip" onclick="ddSetMaxAmount('ddSetorAmountInput',${sisa})">Sisa Target</div>` : '');

  ddResetAccountCard('ddSetorAccountCard', 'ddSetorAccountLabel', 'ddSetorAccountIconWrap', 'ddSetorAccountSub');
  renderDdSetorSummary();
  openSheet('ddSetorOverlay');
}

function renderDdSetorSummary() {
  const nominal = parseInt(document.getElementById('ddSetorAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('ddSetorFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const totalPotong = nominal + fee;
  document.getElementById('ddSetorSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Masuk ke Dana Darurat</div><div class="wl-info-val">${formatRupiah(nominal)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (akun asal)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Dipotong dari Akun</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(totalPotong)}</div></div>`;
}

function submitDdSetor() {
  if (!allowSubmit('submitDdSetor')) return;
  const errEl = document.getElementById('ddSetorErrMsg');
  errEl.style.display = 'none';
  const dd = getDD();
  if (!dd) return;

  const nominal = parseInt(document.getElementById('ddSetorAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('ddSetorFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const note = document.getElementById('ddSetorNoteInput').value.trim();

  if (!nominal) { ddTxError(errEl, 'Nominal setor wajib diisi'); return; }
  if (!ddSetorAccountId) { ddTxError(errEl, 'Pilih akun sumber dana'); return; }

  const src = sources.find(s => s.id === ddSetorAccountId);
  if (!src) { ddTxError(errEl, 'Akun tidak ditemukan'); return; }
  const totalPotong = nominal + fee;
  if (totalPotong > src.saldo) {
    ddTxError(errEl, `Saldo ${src.name} tidak cukup untuk nominal + biaya admin (butuh ${formatRupiah(totalPotong)}, tersedia ${formatRupiah(src.saldo)})`);
    return;
  }

  const nowIso = new Date().toISOString();
  const dateStr = todayISO();
  const mainTxId = 'tx' + uniqueTick();
  const historyId = 'ddh' + uniqueTick();

  src.saldo -= totalPotong;
  saveSources(sources);

  transactions.unshift({
    id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
    sourceId: src.id, destId: 'danadarurat',
    note: note, date: dateStr, time: nowTime(),
    isDdTx: true, ddHistoryId: historyId,
  });
  if (fee > 0) {
    transactions.unshift({
      id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: src.id,
      category: 'Biaya Admin/Fee', note: 'Biaya admin setor Dana Darurat',
      date: dateStr, time: nowTime(), isFee: true, feeOf: mainTxId,
    });
  }
  saveTransactions(transactions);

  dd.balance += nominal;
  dd.history = dd.history || [];
  dd.history.push({ id: historyId, type: 'setor', amount: nominal, fee, note, date: nowIso, txId: mainTxId });
  dd.updatedAt = nowIso;
  saveDanaDarurat(dd);

  closeSheet('ddSetorOverlay');
  showToast('Setor Dana Darurat berhasil');
  renderAll();
  renderDanaDaruratPage();
}

// ======================================================
// PAKAI DANA DARURAT (transfer balik ke akun Liquid — netral,
// TIDAK dihitung sebagai Pengeluaran, persis pola "Tarik Dana" Wishlist)
// ======================================================
function openDdPakai() {
  const dd = getDD();
  if (!dd) return;
  if (dd.balance <= 0) { showToast('Belum ada saldo Dana Darurat untuk dipakai'); return; }

  ddPakaiAccountId = null;

  document.getElementById('ddPakaiSaldoLabel').textContent = formatRupiah(dd.balance);
  document.getElementById('ddPakaiAmountInput').value = '';
  document.getElementById('ddPakaiFeeInput').value = '';
  document.getElementById('ddPakaiNoteInput').value = '';
  document.getElementById('ddPakaiErrMsg').style.display = 'none';

  document.getElementById('ddPakaiQuickRow').innerHTML =
    DD_QUICK_AMOUNTS.filter(v => v <= dd.balance).map(v => `<div class="quick-amount-chip" onclick="ddAddQuickAmount('ddPakaiAmountInput',${v})">+${formatRibu(v)}</div>`).join('') +
    `<div class="quick-amount-chip" onclick="ddSetMaxPakai()">Semua Saldo</div>`;

  ddResetAccountCard('ddPakaiAccountCard', 'ddPakaiAccountLabel', 'ddPakaiAccountIconWrap', 'ddPakaiAccountSub');
  renderDdPakaiSummary();
  openSheet('ddPakaiOverlay');
}

function ddSetMaxPakai() {
  const dd = getDD();
  if (!dd) return;
  const fee = parseInt(document.getElementById('ddPakaiFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const maxNominal = Math.max(dd.balance - fee, 0);
  document.getElementById('ddPakaiAmountInput').value = maxNominal.toLocaleString('id-ID');
  renderDdPakaiSummary();
}

function renderDdPakaiSummary() {
  const nominal = parseInt(document.getElementById('ddPakaiAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('ddPakaiFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const totalPotong = nominal + fee;
  document.getElementById('ddPakaiSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Masuk ke Akun Tujuan</div><div class="wl-info-val">${formatRupiah(nominal)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (dari Dana Darurat)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Dipotong dari Dana Darurat</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(totalPotong)}</div></div>`;
}

function submitDdPakai() {
  if (!allowSubmit('submitDdPakai')) return;
  const errEl = document.getElementById('ddPakaiErrMsg');
  errEl.style.display = 'none';
  const dd = getDD();
  if (!dd) return;

  const nominal = parseInt(document.getElementById('ddPakaiAmountInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const fee = parseInt(document.getElementById('ddPakaiFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const note = document.getElementById('ddPakaiNoteInput').value.trim();
  const totalPotong = nominal + fee;

  if (!nominal) { ddTxError(errEl, 'Nominal pakai wajib diisi'); return; }
  if (!ddPakaiAccountId) { ddTxError(errEl, 'Pilih akun tujuan'); return; }
  if (totalPotong > dd.balance) {
    ddTxError(errEl, `Saldo Dana Darurat tidak cukup untuk nominal + biaya admin (butuh ${formatRupiah(totalPotong)}, tersedia ${formatRupiah(dd.balance)})`);
    return;
  }

  const dest = sources.find(s => s.id === ddPakaiAccountId);
  if (!dest) { ddTxError(errEl, 'Akun tidak ditemukan'); return; }

  const nowIso = new Date().toISOString();
  const dateStr = todayISO();
  const mainTxId = 'tx' + uniqueTick();
  const historyId = 'ddh' + uniqueTick();

  // Transfer netral balik ke akun Liquid — TIDAK dicatat sebagai Pengeluaran,
  // biar gak dobel kehitung waktu uangnya nanti beneran dibelanjakan lewat
  // transaksi Keluar terpisah oleh user.
  dest.saldo += nominal;
  saveSources(sources);

  transactions.unshift({
    id: mainTxId, type: 'transfer', amount: nominal, fee: 0,
    sourceId: 'danadarurat', destId: dest.id,
    note: note, date: dateStr, time: nowTime(),
    isDdTx: true, ddHistoryId: historyId,
  });
  // Fee ditanggung Dana Darurat (bukan akun real), sourceId dikosongkan —
  // tetep tercatat & kehitung sebagai pengeluaran kategori Biaya Admin/Fee.
  if (fee > 0) {
    transactions.unshift({
      id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: null,
      category: 'Biaya Admin/Fee', note: 'Biaya admin pakai Dana Darurat',
      date: dateStr, time: nowTime(), isFee: true, feeOf: mainTxId,
    });
  }
  saveTransactions(transactions);

  dd.balance -= totalPotong;
  dd.history = dd.history || [];
  dd.history.push({ id: historyId, type: 'pakai', amount: nominal, fee, note, date: nowIso, txId: mainTxId });
  dd.updatedAt = nowIso;
  saveDanaDarurat(dd);

  closeSheet('ddPakaiOverlay');
  showToast('Dana Darurat berhasil dipakai');
  renderAll();
  renderDanaDaruratPage();
  pushReminder({
    type: 'dd-used',
    title: 'Dana Darurat Terpakai',
    message: `${formatRupiah(nominal)} dari Dana Darurat dipindahkan ke ${dest.name}. Sisa saldo: ${formatRupiah(dd.balance)}.`,
    navPage: null, navId: null
  });
  showNextReminderModal();
}

// ======================================================
// PENGATURAN (3-dot)
// ======================================================
function openDdSettingsSheet() {
  const dd = getDD();
  if (!dd) return;
  document.getElementById('ddSettingsBody').innerHTML = `
    <div class="wl-settings-section">
      <div class="wl-settings-section-title">Kelola Dana Darurat</div>
      <div class="wl-settings-item" onclick="openDdSetup()">
        <i class="bi bi-pencil"></i><div class="wl-settings-item-label">Ubah Target &amp; Info</div>
      </div>
      <div class="wl-settings-item" onclick="closeSheet('ddSettingsOverlay'); openDdCalculator();">
        <i class="bi bi-calculator"></i><div class="wl-settings-item-label">Kalkulator Rekomendasi Target</div>
      </div>
      <div class="wl-settings-item" onclick="resetDdProgress()">
        <i class="bi bi-arrow-counterclockwise"></i><div class="wl-settings-item-label">Reset Progress</div>
      </div>
      <div class="wl-settings-item danger" onclick="openDdHapus()">
        <i class="bi bi-trash3"></i><div class="wl-settings-item-label">Hapus Dana Darurat</div>
      </div>
    </div>`;
  openSheet('ddSettingsOverlay');
}

function resetDdProgress() {
  const dd = getDD();
  if (!dd) return;
  nativeConfirm('Reset progress Dana Darurat? Saldo & riwayat akan dikosongkan (target tetap tersimpan).', () => {
    dd.balance = 0;
    dd.history = [];
    dd.updatedAt = new Date().toISOString();
    saveDanaDarurat(dd);
    closeSheet('ddSettingsOverlay');
    showToast('Progress direset');
    renderAll();
    renderDanaDaruratPage();
  });
}

// ---------- HAPUS DANA DARURAT ----------
function openDdHapus() {
  const dd = getDD();
  if (!dd) return;

  if (dd.balance <= 0) {
    nativeConfirm('Hapus Dana Darurat? Tindakan ini tidak bisa dibatalkan.', () => {
      saveDanaDarurat(null);
      closeSheet('ddSettingsOverlay');
      showToast('Dana Darurat dihapus');
      renderAll();
      renderDanaDaruratPage();
    });
    return;
  }

  ddHapusAccountId = null;
  document.getElementById('ddHapusFeeInput').value = '';
  document.getElementById('ddHapusErrMsg').style.display = 'none';
  ddResetAccountCard('ddHapusAccountCard', 'ddHapusAccountLabel', 'ddHapusAccountIconWrap', 'ddHapusAccountSub');
  renderDdHapusSummary();
  closeSheet('ddSettingsOverlay');
  openSheet('ddHapusOverlay');
}

function renderDdHapusSummary() {
  const dd = getDD();
  if (!dd) return;
  const fee = parseInt(document.getElementById('ddHapusFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  const diterima = Math.max(dd.balance - fee, 0);
  document.getElementById('ddHapusSummaryCard').innerHTML = `
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Saldo Dana Darurat (ditutup)</div><div class="wl-info-val">${formatRupiah(dd.balance)}</div></div>
    <div class="wl-info-row"><div class="wl-info-label" style="width:auto;">Biaya Admin (dari saldo)</div><div class="wl-info-val">${formatRupiah(fee)}</div></div>
    <div class="wl-info-row" style="border-top:1px solid var(--border); margin-top:4px; padding-top:10px;"><div class="wl-info-label" style="width:auto; font-weight:800; color:var(--ink-900);">Total Diterima Akun</div><div class="wl-info-val" style="color:var(--primary);">${formatRupiah(diterima)}</div></div>`;
}

function submitDdHapus() {
  const errEl = document.getElementById('ddHapusErrMsg');
  errEl.style.display = 'none';
  const dd = getDD();
  if (!dd) return;

  const fee = parseInt(document.getElementById('ddHapusFeeInput').value.replace(/[^\d]/g, ''), 10) || 0;
  if (!ddHapusAccountId) { ddTxError(errEl, 'Pilih akun tujuan pemindahan dana'); return; }
  if (fee >= dd.balance) { ddTxError(errEl, 'Biaya admin tidak boleh lebih besar dari saldo'); return; }

  nativeConfirm('Hapus Dana Darurat? Dana akan dipindahkan dan Dana Darurat dihapus permanen.', () => {
    const dest = sources.find(s => s.id === ddHapusAccountId);
    if (!dest) { ddTxError(errEl, 'Akun tidak ditemukan'); return; }

    const diterima = dd.balance - fee;
    const dateStr = todayISO();

    dest.saldo += diterima;
    saveSources(sources);

    transactions.unshift({
      id: 'tx' + uniqueTick(), type: 'transfer', amount: diterima, fee: 0,
      sourceId: 'danadarurat', destId: dest.id,
      note: '', date: dateStr, time: nowTime(),
      isDdTx: true,
    });
    if (fee > 0) {
      transactions.unshift({
        id: 'tx' + uniqueTick() + 'f', type: 'keluar', amount: fee, sourceId: null,
        category: 'Biaya Admin/Fee', note: 'Biaya admin hapus Dana Darurat',
        date: dateStr, time: nowTime(), isFee: true,
      });
    }
    saveTransactions(transactions);

    saveDanaDarurat(null);
    closeSheet('ddHapusOverlay');
    showToast('Dana Darurat dihapus, dana dipindahkan');
    renderAll();
    renderDanaDaruratPage();
  });
}

// ======================================================
// SHARED: PICKER AKUN
// ======================================================
function ddOpenAccountPicker(mode) {
  ddTxAccountMode = mode;
  const list = ddLiquidAccounts();
  const listEl = document.getElementById('ddAccountList');
  if (!list.length) {
    listEl.innerHTML = `<div class="kt-empty" style="border:none;">Belum ada akun Cash/Bank/E-Wallet.</div>`;
  } else {
    listEl.innerHTML = list.map(s => `
      <div class="picker-item" onclick="ddSelectAccount('${s.id}')">
        <div class="picker-item-icon" style="background:${sourceTypeColors[s.jenis]}; border-radius:10px;">
          <i class="${sourceIcons[s.jenis] || 'bi-wallet2'}" style="color:#fff; font-size:16px;"></i>
        </div>
        <div>
          <div class="picker-item-name">${escapeHtml(s.name)}</div>
          <div class="picker-item-sub">${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}</div>
        </div>
      </div>`).join('');
  }
  openSheet('ddAccountPickerOverlay');
}

function ddSelectAccount(accId) {
  const s = sources.find(x => x.id === accId);
  if (!s) return;

  const map = {
    setor: { card: 'ddSetorAccountCard', label: 'ddSetorAccountLabel', icon: 'ddSetorAccountIconWrap', sub: 'ddSetorAccountSub' },
    pakai: { card: 'ddPakaiAccountCard', label: 'ddPakaiAccountLabel', icon: 'ddPakaiAccountIconWrap', sub: 'ddPakaiAccountSub' },
    hapus: { card: 'ddHapusAccountCard', label: 'ddHapusAccountLabel', icon: 'ddHapusAccountIconWrap', sub: 'ddHapusAccountSub' },
  };
  const ids = map[ddTxAccountMode];
  if (!ids) return;

  if (ddTxAccountMode === 'setor') ddSetorAccountId = s.id;
  if (ddTxAccountMode === 'pakai') ddPakaiAccountId = s.id;
  if (ddTxAccountMode === 'hapus') ddHapusAccountId = s.id;

  document.getElementById(ids.label).textContent = s.name;
  const sub = document.getElementById(ids.sub);
  sub.textContent = `${sourceTypeLabel[s.jenis]} · ${formatRupiah(s.saldo)}`;
  sub.style.display = 'block';
  const iconWrap = document.getElementById(ids.icon);
  iconWrap.innerHTML = `<i class="${sourceIcons[s.jenis] || 'bi-wallet2'}"></i>`;
  iconWrap.style.background = sourceTypeColors[s.jenis] || 'var(--ink-300)';
  iconWrap.style.color = '#fff';
  document.getElementById(ids.card).classList.remove('placeholder');

  closeSheet('ddAccountPickerOverlay');
}

function ddResetAccountCard(cardId, labelId, iconId, subId) {
  document.getElementById(labelId).textContent = 'Pilih akun';
  document.getElementById(iconId).innerHTML = `<i class="bi bi-wallet2"></i>`;
  document.getElementById(iconId).style.background = '';
  document.getElementById(iconId).style.color = '';
  document.getElementById(cardId).classList.add('placeholder');
  document.getElementById(subId).style.display = 'none';
}

// ---------- HELPERS ----------
function ddAddQuickAmount(inputId, v) {
  const el = document.getElementById(inputId);
  const current = parseInt((el.value || '0').replace(/[^\d]/g, ''), 10) || 0;
  el.value = (current + v).toLocaleString('id-ID');
  el.dispatchEvent(new Event('input'));
}

function ddSetMaxAmount(inputId, maxVal) {
  const el = document.getElementById(inputId);
  el.value = Math.max(maxVal, 0).toLocaleString('id-ID');
  el.dispatchEvent(new Event('input'));
}

function ddTxError(errEl, msg) {
  errEl.textContent = msg;
  errEl.style.display = 'block';
}

// ======================================================
// NET WORTH HOOK (dipanggil dari app.js getNetWorthComponents)
// ======================================================
function getDanaDaruratTotal() {
  const dd = getDD();
  return dd ? dd.balance : 0;
}
