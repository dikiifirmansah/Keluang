// ======================================================
// MODULE: Storage
// STATUS: Aktif
// ======================================================
// Satu-satunya file yang boleh mengakses localStorage

// ======================================================
// KEYS
// ======================================================
const STORAGE_KEYS = {
  SOURCES: 'keluangSources',
  TRANSACTIONS: 'keluangTransactions',
  PROFILE: 'keluangProfile',
  SHORTCUT_ORDER: 'shortcutOrder',
  CATEGORIES: 'keluangCategories',
  THEME: 'keluangTheme',
  BUDGETS: 'keluangBudgets',
  BUDGET_SETTINGS: 'keluangBudgetSettings',
  WISHLISTS: 'keluangWishlists',
  DANA_DARURAT: 'keluangDanaDarurat',
  UTANG_PIUTANG: 'keluangUtangPiutang',
  JURNAL_INVESTASI: 'keluangJurnalInvestasi',
  JURNAL_CUSTOM_TAGS: 'keluangJurnalCustomTags',
  REMINDERS: 'keluangReminders',
  CUSTOM_REMINDERS: 'keluangCustomReminders',
  BUDGET_NOTIF_STATE: 'keluangBudgetNotifState'
};

// ======================================================
// GENERIC HELPERS
// ======================================================
// Escape teks bebas user (catatan, nama, dsb) sebelum dimasukkan ke
// template innerHTML, supaya karakter seperti < & > " tidak merusak
// tampilan atau disalahgunakan sebagai HTML/script.
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ======================================================
// COMPRESSION HELPERS (LZ-String)
// ======================================================
// Semua data disimpan dalam bentuk terkompresi untuk menghemat
// storage. Format: "lz:" + compressed string.
// Data lama (tanpa prefix "lz:") tetap bisa dibaca (backward compat).

function _compress(jsonStr) {
  try {
    if (typeof LZString !== 'undefined') {
      return 'lz:' + LZString.compressToUTF16(jsonStr);
    }
  } catch (_) {}
  return jsonStr;
}

function _decompress(raw) {
  try {
    if (raw && raw.startsWith('lz:') && typeof LZString !== 'undefined') {
      return LZString.decompressFromUTF16(raw.slice(3));
    }
  } catch (_) {}
  return raw;
}

function storageGet(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    const data = _decompress(raw);
    return JSON.parse(data);
  } catch (_) {
    return defaultValue;
  }
}

// Dipanggil saat storageSet gagal menulis ke localStorage (paling sering
// karena kuota penuh — umumnya gara-gara foto profil / ikon custom yang
// disimpan sebagai base64). Ditaruh terpusat di sini (bukan di tiap
// pemanggil save*()) supaya SEMUA kegagalan simpan otomatis dapat
// peringatan, tanpa perlu mengubah satu-satu titik pemanggilan.
let _lastStorageWarningAt = 0;
function _warnStorageFailure(key, err) {
  const now = Date.now();
  // Cegah spam toast kalau beberapa save() gagal beruntun dalam waktu singkat
  if (now - _lastStorageWarningAt < 3000) return;
  _lastStorageWarningAt = now;
  const isQuota = err && (err.name === 'QuotaExceededError' || err.code === 22 || err.code === 1014);
  const msg = isQuota
    ? 'Penyimpanan penuh — perubahan terakhir GAGAL disimpan. Coba hapus foto/ikon custom yang besar, lalu ulangi.'
    : 'Gagal menyimpan data. Perubahan terakhir mungkin tidak tersimpan.';
  if (typeof showToast === 'function') {
    showToast(msg);
  } else {
    // Fallback kalau showToast belum ter-load (harusnya tidak pernah terjadi
    // di alur normal karena semua script sudah jalan saat user berinteraksi)
    console.error('[Keluang] ' + msg, err);
  }
}

function storageSet(key, value) {
  try {
    const jsonStr = JSON.stringify(value);
    const compressed = _compress(jsonStr);
    localStorage.setItem(key, compressed);
    return true;
  } catch (err) {
    _warnStorageFailure(key, err);
    return false;
  }
}

// ======================================================
// SOURCES
// ======================================================
function loadSources() {
  return storageGet(STORAGE_KEYS.SOURCES, []);
}

function saveSources(sources) {
  return storageSet(STORAGE_KEYS.SOURCES, sources);
}

// ======================================================
// TRANSACTIONS
// ======================================================
function loadTransactions() {
  return storageGet(STORAGE_KEYS.TRANSACTIONS, []);
}

function saveTransactions(transactions) {
  return storageSet(STORAGE_KEYS.TRANSACTIONS, transactions);
}

// ======================================================
// PROFILE
// ======================================================
function loadProfile() {
  return storageGet(STORAGE_KEYS.PROFILE, { name: '', photo: null });
}

function saveProfile(profile) {
  return storageSet(STORAGE_KEYS.PROFILE, profile);
}

// ======================================================
// SHORTCUT ORDER
// ======================================================
function loadShortcutOrder(defaultOrder) {
  const saved = storageGet(STORAGE_KEYS.SHORTCUT_ORDER, null);
  if (!saved || !Array.isArray(saved)) return defaultOrder;
  return saved;
}

function saveShortcutOrder(order) {
  return storageSet(STORAGE_KEYS.SHORTCUT_ORDER, order);
}
// ======================================================
// CATEGORIES
// ======================================================
function loadCategories() {
  return storageGet(STORAGE_KEYS.CATEGORIES, null);
}

function saveCategories(categories) {
  return storageSet(STORAGE_KEYS.CATEGORIES, categories);
}

// ======================================================
// THEME
// ======================================================
function loadTheme() {
  return storageGet(STORAGE_KEYS.THEME, 'system');
}

function saveTheme(theme) {
  return storageSet(STORAGE_KEYS.THEME, theme);
}

// ======================================================
// BUDGETS
// ======================================================
function loadBudgets() {
  return storageGet(STORAGE_KEYS.BUDGETS, []);
}

function saveBudgets(budgets) {
  return storageSet(STORAGE_KEYS.BUDGETS, budgets);
}

// Pengaturan global Budget (bukan per-kategori) — notifikasi limit dsb.
function loadBudgetSettings() {
  return storageGet(STORAGE_KEYS.BUDGET_SETTINGS, { hampirHabis: true, terlampaui: true });
}

function saveBudgetSettings(s) {
  return storageSet(STORAGE_KEYS.BUDGET_SETTINGS, s);
}

// ======================================================
// WISHLISTS
// ======================================================
function loadWishlists() {
  return storageGet(STORAGE_KEYS.WISHLISTS, []);
}

function saveWishlists(wishlists) {
  return storageSet(STORAGE_KEYS.WISHLISTS, wishlists);
}

// ======================================================
// JURNAL INVESTASI (array of aset)
// ======================================================
function loadJurnalInvestasi() {
  return storageGet(STORAGE_KEYS.JURNAL_INVESTASI, []);
}

function saveJurnalInvestasi(list) {
  return storageSet(STORAGE_KEYS.JURNAL_INVESTASI, list);
}

function loadJrCustomTags() {
  return storageGet(STORAGE_KEYS.JURNAL_CUSTOM_TAGS, { alasan: [], alasanJual: [] });
}

function saveJrCustomTags(tags) {
  return storageSet(STORAGE_KEYS.JURNAL_CUSTOM_TAGS, tags);
}

// ======================================================
// DANA DARURAT (kantong tunggal — bukan array seperti Wishlist)
// ======================================================
function loadDanaDarurat() {
  return storageGet(STORAGE_KEYS.DANA_DARURAT, null);
}

function saveDanaDarurat(dd) {
  return storageSet(STORAGE_KEYS.DANA_DARURAT, dd);
}

// ======================================================
// UTANG-PIUTANG
// ======================================================
function loadUtangPiutang() {
  return storageGet(STORAGE_KEYS.UTANG_PIUTANG, []);
}

function saveUtangPiutang(list) {
  return storageSet(STORAGE_KEYS.UTANG_PIUTANG, list);
}

// ======================================================
// NOTIFIKASI / REMINDER
// ======================================================
// reminders: riwayat reminder yang sudah pernah tampil (masuk panel lonceng)
function loadReminders() {
  return storageGet(STORAGE_KEYS.REMINDERS, []);
}

function saveReminders(list) {
  return storageSet(STORAGE_KEYS.REMINDERS, list);
}

// customReminders: reminder buatan user sendiri (judul, pesan, jadwal)
function loadCustomReminders() {
  return storageGet(STORAGE_KEYS.CUSTOM_REMINDERS, []);
}

function saveCustomReminders(list) {
  return storageSet(STORAGE_KEYS.CUSTOM_REMINDERS, list);
}

// budgetNotifState: penanda anti-spam untuk reminder budget, per
// "bulan:kategori:tipe" (misal "2026-07:Makanan:warn") supaya reminder
// yang sama gak muncul berkali-kali dalam bulan yang sama.
function loadBudgetNotifState() {
  return storageGet(STORAGE_KEYS.BUDGET_NOTIF_STATE, {});
}

function saveBudgetNotifState(state) {
  return storageSet(STORAGE_KEYS.BUDGET_NOTIF_STATE, state);
}

// ======================================================
// ID HELPER (dipakai cross-module untuk bikin ID unik)
// ======================================================
// Sebelumnya semua ID dibuat murni dari Date.now() (resolusi 1ms).
// Kalau dua record dibuat di milidetik yang sama — misal user
// double-tap tombol Simpan, atau dua record dibuat berurutan cepat
// dalam satu fungsi (tx utama + tx biaya admin) — ID bisa tabrakan,
// dan pencarian .find(x => x.id === id) jadi salah sasaran.
// uniqueTick() menambahkan counter + karakter acak supaya setiap
// pemanggilan dijamin unik walau dipanggil berkali-kali di milidetik
// yang sama.
// Cegah double-submit (double-tap) pada tombol yang mencatat transaksi
// keuangan. Panggil di baris pertama fungsi submit: `if (!allowSubmit('wlSetor')) return;`
const _submitGuardMap = {};
function allowSubmit(key, ms = 600) {
  const now = Date.now();
  const last = _submitGuardMap[key] || 0;
  if (now - last < ms) return false;
  _submitGuardMap[key] = now;
  return true;
}

let _idTickCounter = 0;
function uniqueTick() {
  _idTickCounter = (_idTickCounter + 1) % 46656; // 36^3
  const rand = Math.random().toString(36).slice(2, 6);
  return Date.now().toString(36) + _idTickCounter.toString(36) + rand;
}

// ======================================================
// OPSI 3: CLEANUP — hapus field redundan dari transaksi
// ======================================================
// Dipanggil sekali saat app load untuk bersihkan data lama.
// - attachment: null → dihapus (field tidak perlu kalau kosong)
// - note yang sama persis dengan category → dihapus (redundan)
function cleanupTransactions() {
  const txs = loadTransactions();
  let changed = false;
  const cleaned = txs.map(t => {
    const o = { ...t };
    if (o.attachment === null || o.attachment === undefined) {
      delete o.attachment;
      changed = true;
    }
    if (o.note === o.category || o.note === '') {
      delete o.note;
      changed = true;
    }
    return o;
  });
  if (changed) saveTransactions(cleaned);
}

// ======================================================
// OPSI 1: ARSIP OTOMATIS transaksi lama (> N bulan)
// ======================================================
// Transaksi lebih dari `monthsOld` bulan lalu dipindahkan ke key
// arsip terpisah (tetap terkompresi). Tidak dihapus permanen.
// Default: arsip transaksi > 12 bulan.
const STORAGE_KEYS_ARCHIVE = 'keluangTransactionsArchive';

function archiveOldTransactions(monthsOld = 12) {
  const txs = loadTransactions();
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - monthsOld);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  const active = [];
  const toArchive = [];
  txs.forEach(t => {
    if (t.date && t.date < cutoffStr) {
      toArchive.push(t);
    } else {
      active.push(t);
    }
  });

  if (toArchive.length === 0) return 0;

  // Gabung dengan arsip lama kalau ada
  const existingArchive = storageGet(STORAGE_KEYS_ARCHIVE, []);
  const mergedArchive = [...existingArchive, ...toArchive];
  storageSet(STORAGE_KEYS_ARCHIVE, mergedArchive);
  saveTransactions(active);
  return toArchive.length;
}

// Ambil transaksi arsip (untuk ditampilkan jika user mau lihat history jauh)
function loadArchivedTransactions() {
  return storageGet(STORAGE_KEYS_ARCHIVE, []);
}

// ======================================================
// MIGRASI: kompres data lama yang belum terkompresi
// ======================================================
// Dipanggil sekali saat app pertama load setelah update ini.
// Re-save semua key supaya langsung terkompresi.
function migrateToCompressed() {
  const alreadyMigrated = localStorage.getItem('keluangCompressedV1');
  if (alreadyMigrated) return;
  const keys = Object.values(STORAGE_KEYS);
  keys.forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw || raw.startsWith('lz:')) return; // sudah compressed / kosong
      const parsed = JSON.parse(raw);
      storageSet(key, parsed); // re-save dengan compression
    } catch (_) {}
  });
  localStorage.setItem('keluangCompressedV1', '1');
  cleanupTransactions();
}

// ======================================================
// DATE HELPER (dipakai cross-module sebelum app.js load)
// ======================================================
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth()+1).toString().padStart(2,'0');
  const day = d.getDate().toString().padStart(2,'0');
  return `${y}-${m}-${day}`;
}
