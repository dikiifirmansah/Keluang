// ======================================================
// MODULE: Settings
// STATUS: Aktif
// ======================================================

// ======================================================
// RENDER PROFILE
// ======================================================
function renderProfile() {
  const ini = profile.name && profile.name.trim() ? profile.name.trim()[0].toUpperCase() : 'A';
  const berandaAvatar = document.getElementById('berandaAvatar');
  if (berandaAvatar) berandaAvatar.innerHTML = profile.photo ? `<img src="${profile.photo}">` : ini;

  const settingsAvatar = document.getElementById('settingsAvatarPreview');
  if (settingsAvatar) settingsAvatar.innerHTML = profile.photo ? `<img src="${profile.photo}">` : ini;

  document.querySelectorAll('.topbar-name').forEach(el => {
    el.textContent = profile.name && profile.name.trim() ? profile.name.trim() : 'Halo 👋';
  });

  const nameInput = document.getElementById('settingsNameInput');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = profile.name || '';
}

// ======================================================
// UPDATE PROFILE
// ======================================================
function updateProfileName(val) {
  profile.name = val;
  saveProfile(profile);
  renderProfile();
}

// ======================================================
// AVATAR UPLOAD
// ======================================================
function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran foto maksimal 2MB'); return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    profile.photo = ev.target.result;
    saveProfile(profile);
    renderProfile();
    showToast('Foto profil diperbarui');
  };
  reader.readAsDataURL(file);
}

// ======================================================
// REMOVE AVATAR
// ======================================================
function removeAvatar() {
  profile.photo = null;
  saveProfile(profile);
  renderProfile();
  showToast('Foto profil dihapus');
  closeSheet('avatarOptionsSheet');
}

function openAvatarOptions() {
  if (profile.photo) {
    openSheet('avatarOptionsSheet');
  } else {
    document.getElementById('avatarFileInput').click();
  }
}

// ======================================================
// THEME
// ======================================================
let _currentTheme = 'system';

function initTheme() {
  _currentTheme = loadTheme() || 'system';
  applyTheme(_currentTheme);
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.setAttribute('data-theme', 'dark');
  } else if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
  } else {
    // system
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  }
  if (typeof syncStatusBarColor === 'function') syncStatusBarColor();
}

function setTheme(theme) {
  _currentTheme = theme;
  saveTheme(theme);
  applyTheme(theme);
  renderThemeSelector();
  showToast('Tema diperbarui');
}

function renderThemeSelector() {
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('active', el.dataset.theme === _currentTheme);
  });
}

function openThemeSheet() {
  renderThemeSelector();
  openSheet('themeSheet');
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (_currentTheme === 'system') applyTheme('system');
});

// ======================================================
// KELOLA KATEGORI
// ======================================================
let _editingCatType = 'keluar';
let _editingCatIndex = null;
let _katFormIcon = 'bi-circle';
let _katFormColor = '#6C5CE7';

const CATEGORY_COLOR_PALETTE = [
  '#E8633B','#2D7DD2','#C0365F','#B07A20','#7B4FE0','#D63B5C',
  '#1E88A8','#6836C4','#8A8A8A','#6B628A','#1B9E5E','#E0A800',
  '#2D5BD1','#0F7D6E','#6C5CE7','#E91E8C','#00897B','#F4511E'
];

const CATEGORY_ICON_LIST = [
  'bi-cup-straw','bi-car-front','bi-bag','bi-receipt','bi-film','bi-heart-pulse',
  'bi-mortarboard','bi-people','bi-cash-coin','bi-three-dots','bi-briefcase','bi-gift',
  'bi-laptop','bi-graph-up-arrow','bi-piggy-bank','bi-house','bi-phone','bi-cart',
  'bi-scissors','bi-music-note','bi-airplane','bi-bicycle','bi-book','bi-camera',
  'bi-cloud','bi-controller','bi-cup-hot','bi-droplet','bi-egg-fried','bi-flower1',
  'bi-fuel-pump','bi-gem','bi-hospital','bi-lightning','bi-palette','bi-shield',
  'bi-shop','bi-stars','bi-tools','bi-tree','bi-tv','bi-umbrella',
  'bi-wallet','bi-wifi','bi-wrench','bi-box','bi-building','bi-credit-card'
];

function openKategoriSheet() {
  _editingCatType = 'keluar';
  document.querySelectorAll('.ktab-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.type === 'keluar');
  });
  renderKategoriList();
  openSheet('kategoriSheet');
}

function switchKategoriType(type) {
  _editingCatType = type;
  document.querySelectorAll('.ktab-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.type === type);
  });
  renderKategoriList();
}

function renderKategoriList() {
  const list = categories[_editingCatType] || [];
  const container = document.getElementById('kategoriList');
  if (!list.length) {
    container.innerHTML = '<div class="kt-empty" style="padding:24px 0;">Belum ada kategori</div>';
    return;
  }
  container.innerHTML = list.map((name, i) => {
    const icon = categoryIcons[name] || 'bi-circle';
    const color = categoryColors[name] || '#6C5CE7';
    const isDefault = (DEFAULT_CATEGORIES[_editingCatType] || []).includes(name);
    return `
      <div class="kat-row">
        <div class="kat-row-icon" style="background:${color}"><i class="bi ${icon}"></i></div>
        <div class="kat-row-name">${name}${isDefault ? '<span class="kat-default-badge">default</span>' : ''}</div>
        <div class="kat-row-actions">
          <button class="kat-btn-edit" onclick="openEditKategori(${i})"><i class="bi bi-pencil"></i></button>
          ${!isDefault ? `<button class="kat-btn-delete" onclick="deleteKategori(${i})"><i class="bi bi-trash"></i></button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function openAddKategori() {
  _editingCatIndex = null;
  _katFormIcon = 'bi-circle';
  _katFormColor = '#6C5CE7';
  document.getElementById('kategoriFormTitle').textContent = 'Tambah Kategori';
  document.getElementById('kategoriNameInput').value = '';
  document.getElementById('katNamePreviewLabel').textContent = '—';
  renderKatFormPreview();
  openSheet('kategoriFormSheet');
}

function openEditKategori(i) {
  _editingCatIndex = i;
  const name = categories[_editingCatType][i];
  _katFormIcon = categoryIcons[name] || 'bi-circle';
  _katFormColor = categoryColors[name] || '#6C5CE7';
  document.getElementById('kategoriFormTitle').textContent = 'Edit Kategori';
  document.getElementById('kategoriNameInput').value = name;
  document.getElementById('katNamePreviewLabel').textContent = name;
  renderKatFormPreview();
  openSheet('kategoriFormSheet');
}

function renderKatFormPreview() {
  const preview = document.getElementById('katIconPreview');
  preview.style.background = _katFormColor;
  preview.innerHTML = `<i class="bi ${_katFormIcon}"></i>`;

  const iconGrid = document.getElementById('katIconGrid');
  iconGrid.innerHTML = CATEGORY_ICON_LIST.map(ic => `
    <div class="kat-icon-opt ${ic === _katFormIcon ? 'active' : ''}" onclick="selectKatIcon('${ic}')">
      <i class="bi ${ic}"></i>
    </div>`).join('');

  const colorGrid = document.getElementById('katColorGrid');
  colorGrid.innerHTML = CATEGORY_COLOR_PALETTE.map(c => `
    <div class="kat-color-opt ${c === _katFormColor ? 'active' : ''}"
         style="background:${c}" onclick="selectKatColor('${c}')"></div>`).join('');
}

function selectKatIcon(ic) {
  _katFormIcon = ic;
  renderKatFormPreview();
}

function selectKatColor(c) {
  _katFormColor = c;
  renderKatFormPreview();
}

function saveKategoriForm() {
  const name = document.getElementById('kategoriNameInput').value.trim();
  if (!name) { showToast('Nama kategori tidak boleh kosong'); return; }
  const list = categories[_editingCatType];

  if (_editingCatIndex !== null) {
    const oldName = list[_editingCatIndex];
    if (oldName !== name) {
      categoryIcons[name] = _katFormIcon;
      categoryColors[name] = _katFormColor;
      delete categoryIcons[oldName];
      delete categoryColors[oldName];
      transactions.forEach(t => { if (t.category === oldName) t.category = name; });
      saveTransactions(transactions);
    } else {
      categoryIcons[name] = _katFormIcon;
      categoryColors[name] = _katFormColor;
    }
    list[_editingCatIndex] = name;
  } else {
    if (list.includes(name)) { showToast('Kategori sudah ada'); return; }
    list.push(name);
    categoryIcons[name] = _katFormIcon;
    categoryColors[name] = _katFormColor;
  }

  persistCategories();
  renderKategoriList();
  closeSheet('kategoriFormSheet');
  showToast(_editingCatIndex !== null ? 'Kategori diperbarui' : 'Kategori ditambahkan');
}

function deleteKategori(i) {
  const name = categories[_editingCatType][i];
  nativeConfirm(`Hapus kategori "${name}"?\nTransaksi dengan kategori ini tidak akan terhapus.`, () => {
    categories[_editingCatType].splice(i, 1);
    persistCategories();
    renderKategoriList();
    showToast('Kategori dihapus');
  });
}

// ======================================================
// BACKUP / RESTORE / DELETE DATA
// ======================================================
function openDataSheet() {
  renderStorageSummary();
  openSheet('dataSheet');
}

function renderStorageSummary() {
  const txCount = transactions.length;
  const srcCount = sources.length;
  let total = 0;
  try {
    for (let key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length + key.length) * 2;
      }
    }
  } catch(e) {}
  const kb = (total / 1024).toFixed(1);
  document.getElementById('dataSummaryTx').textContent = txCount + ' transaksi';
  document.getElementById('dataSummarySrc').textContent = srcCount + ' sumber dana';
  document.getElementById('dataSummarySize').textContent = kb + ' KB digunakan';
}

function backupData() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    sources: sources,
    transactions: transactions,
    profile: { name: profile.name, photo: profile.photo },
    categories: {
      keluar: categories.keluar,
      masuk: categories.masuk,
      icons: categoryIcons,
      colors: categoryColors
    },
    shortcutOrder: shortcutOrder,
    theme: loadTheme(),
    budgets: loadBudgets(),
    budgetSettings: loadBudgetSettings(),
    wishlists: loadWishlists(),
    danaDarurat: loadDanaDarurat(),
    utangPiutang: loadUtangPiutang(),
    jurnalInvestasi: loadJurnalInvestasi(),
    jurnalCustomTags: loadJrCustomTags()
  };
  const filename = `keluang-backup-${new Date().toISOString().slice(0,10)}.json`;
  const json = JSON.stringify(data, null, 2);

  // Kalau browser dukung File System Access API (saat ini baru Chrome/Edge desktop),
  // munculkan dialog "Simpan sebagai..." biar bisa pilih folder sendiri, sama seperti
  // saat memilih file waktu Restore. Kalau tidak didukung (mis. Chrome/Safari di HP),
  // otomatis fallback ke unduhan biasa lewat folder Download bawaan browser.
  if (window.showSaveFilePicker) {
    (async () => {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Backup Keluang', accept: { 'application/json': ['.json'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        showToast('Backup berhasil disimpan');
      } catch (err) {
        if (err && err.name === 'AbortError') return; // user membatalkan dialog, gak perlu toast error
        downloadBackupFallback(json, filename);
      }
    })();
  } else {
    downloadBackupFallback(json, filename);
  }
}

function downloadBackupFallback(json, filename) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Backup berhasil diunduh');
}

function triggerRestoreFile() {
  document.getElementById('restoreFileInput').click();
}

function handleRestoreFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.version || !data.sources || !data.transactions) {
        showToast('File backup tidak valid'); return;
      }
      const dateStr = data.exportedAt ? data.exportedAt.slice(0,10) : '—';
      nativeConfirm(`Restore data dari backup ${dateStr}?\nData saat ini akan diganti.`, () => {
        sources = data.sources || [];
        transactions = data.transactions || [];
        saveSources(sources);
        saveTransactions(transactions);

        if (data.profile) {
          profile.name = data.profile.name || '';
          profile.photo = data.profile.photo || null;
          saveProfile(profile);
        }
        if (data.categories) {
          if (data.categories.keluar) categories.keluar = data.categories.keluar;
          if (data.categories.masuk) categories.masuk = data.categories.masuk;
          if (data.categories.icons) Object.assign(categoryIcons, data.categories.icons);
          if (data.categories.colors) Object.assign(categoryColors, data.categories.colors);
          persistCategories();
        }

        // Modul-modul berikut ditambahkan sejak backup v2 -- backup lama (v1)
        // tidak akan punya field ini, jadi cukup dilewati (biar gak menimpa
        // data yang sudah ada di HP dengan kosong tanpa alasan).
        if (data.shortcutOrder) saveShortcutOrder(data.shortcutOrder);
        if (data.theme) saveTheme(data.theme);
        if (data.budgets) saveBudgets(data.budgets);
        if (data.budgetSettings) saveBudgetSettings(data.budgetSettings);
        if (data.wishlists) saveWishlists(data.wishlists);
        if (data.danaDarurat !== undefined) saveDanaDarurat(data.danaDarurat);
        if (data.utangPiutang) saveUtangPiutang(data.utangPiutang);
        if (data.jurnalInvestasi) saveJurnalInvestasi(data.jurnalInvestasi);
        if (data.jurnalCustomTags) saveJrCustomTags(data.jurnalCustomTags);

        showToast('Data berhasil dipulihkan. Memuat ulang...');
        setTimeout(() => location.reload(), 700);
      });
    } catch(err) {
      showToast('Gagal membaca file backup');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function deleteAllData() {
  nativeConfirm('Hapus semua data? Tindakan ini tidak dapat dibatalkan.', () => {
    nativeConfirm('Yakin? Semua transaksi, akun, dan pengaturan akan dihapus permanen.', () => {
      sources = []; transactions = [];
      saveSources(sources);
      saveTransactions(transactions);

      profile = { name: '', photo: null };
      saveProfile(profile);

      categories.keluar = [...DEFAULT_CATEGORIES.keluar];
      categories.masuk = [...DEFAULT_CATEGORIES.masuk];
      Object.keys(categoryIcons).forEach(k => delete categoryIcons[k]);
      Object.assign(categoryIcons, DEFAULT_CATEGORY_ICONS);
      Object.keys(categoryColors).forEach(k => delete categoryColors[k]);
      Object.assign(categoryColors, DEFAULT_CATEGORY_COLORS);
      persistCategories();

      saveShortcutOrder([...defaultOrder]);
      saveTheme('system');
      saveBudgets([]);
      saveBudgetSettings({ hampirHabis: true, terlampaui: true });
      saveWishlists([]);
      saveDanaDarurat(null);
      saveUtangPiutang([]);
      saveJurnalInvestasi([]);
      saveJrCustomTags({ alasan: [], alasanJual: [] });

      showToast('Semua data telah dihapus. Memuat ulang...');
      setTimeout(() => location.reload(), 700);
    });
  });
}

function resetAppCache() {
  nativeConfirm(
    'Reset Aplikasi?\nData kamu (transaksi, saldo, wishlist, dll) TIDAK akan terhapus. Ini cuma memuat ulang file aplikasi dari internet — berguna kalau ada update baru atau aplikasi terasa nyangkut.',
    async () => {
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map(r => r.unregister()));
        }
        showToast('Aplikasi direset. Memuat ulang...');
      } catch (err) {
        showToast('Gagal mereset cache aplikasi');
      } finally {
        setTimeout(() => location.reload(), 600);
      }
    }
  );
}

// ======================================================
// FAQ
// ======================================================
const faqData = [
  {
    q: 'Bagaimana cara membuat budget?',
    a: 'Buka halaman Budget melalui menu Lainnya, lalu tap tombol "Buat Budget" di bagian bawah. Pilih kategori pengeluaran, masukkan nominal batas, lalu simpan.'
  },
  {
    q: 'Apakah budget otomatis berulang setiap bulan?',
    a: 'Ya, jika kamu mengaktifkan opsi "Ulangi setiap bulan" saat membuat budget, budget tersebut akan otomatis muncul di bulan berikutnya dengan nominal yang sama. Kamu tetap bisa mengubah atau menghapusnya kapan saja.'
  },
  {
    q: 'Apa yang terjadi kalau pengeluaran melebihi budget?',
    a: 'Budget akan menampilkan status "Over budget" dengan warna merah dan menunjukkan selisih kelebihan. Ini membantu kamu evaluasi dan menyesuaikan pengeluaran di bulan berikutnya.'
  },
  {
    q: 'Darimana data pengeluaran budget diambil?',
    a: 'Budget dihitung otomatis dari transaksi Keluar yang sudah kamu catat, sesuai kategori dan bulan yang dipilih. Tidak perlu input manual.'
  },
  {
    q: 'Apa itu Keluang?',
    a: 'Keluang adalah aplikasi pencatat keuangan pribadi yang berjalan langsung di browser. Data disimpan di perangkat kamu sendiri, tanpa server.'
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Ya. Semua data disimpan secara lokal di perangkat kamu menggunakan localStorage. Data tidak pernah dikirim ke server manapun.'
  },
  {
    q: 'Bagaimana cara backup data?',
    a: 'Buka Pengaturan → Backup & Restore → Backup Data. File JSON akan diunduh ke perangkat kamu. Simpan di tempat yang aman.'
  },
  {
    q: 'Bagaimana cara pindah data ke perangkat lain?',
    a: 'Lakukan backup di perangkat lama, lalu di perangkat baru buka Pengaturan → Backup & Restore → Pulihkan Data dan pilih file backup tersebut.'
  },
  {
    q: 'Apakah bisa digunakan offline?',
    a: 'Ya, Keluang mendukung offline sebagai Progressive Web App (PWA). Install ke homescreen untuk pengalaman terbaik.'
  },
  {
    q: 'Bagaimana cara menambah kategori?',
    a: 'Buka Pengaturan → Kelola Kategori, pilih tab Keluar atau Masuk, lalu tap "+ Tambah Kategori".'
  },
  {
    q: 'Bisakah mengubah ikon dan warna kategori?',
    a: 'Ya. Di Kelola Kategori, tap ikon pensil pada kategori yang ingin diedit, lalu pilih ikon dan warna baru.'
  },
  {
    q: 'Apa bedanya Sumber Dana Liquid dan Investasi?',
    a: 'Liquid (rekening, dompet digital, kas) adalah dana operasional sehari-hari. Investasi (saham, reksa dana) adalah aset jangka panjang yang tidak dihitung dalam saldo utama.'
  },
  {
    q: 'Apa itu fitur Utang-Piutang?',
    a: 'Tempat mencatat dua hal berlawanan: Utang (uang yang kamu pinjam dari orang/lembaga lain, jadi kewajiban) dan Piutang (uang yang dipinjam orang lain darimu, jadi hak tagih). Keduanya ikut dihitung dalam Net Worth kamu.'
  },
  {
    q: 'Apa bedanya "Sudah Ada Sebelumnya" dan "Pinjaman Baru" saat menambah catatan Utang-Piutang?',
    a: '"Sudah Ada Sebelumnya" dipakai untuk utang/piutang yang memang sudah berjalan dari dulu (misal KPR yang sudah lama cair, atau piutang teman dari bulan lalu) — uangnya sudah lama berpindah di luar catatan Keluang, jadi saldo akun tidak diubah, cuma angkanya saja yang dicatat. "Pinjaman Baru" dipakai kalau uangnya benar-benar cair/dikasihkan hari ini juga — pilihan ini akan meminta kamu memilih akun, lalu saldo akun otomatis disesuaikan saat itu juga (nambah kalau Utang, berkurang kalau Piutang).'
  },
  {
    q: 'Kenapa saldo akun saya berubah otomatis saat menambah Piutang baru?',
    a: 'Karena saat kamu benar-benar kasih pinjaman ke orang lain, uangnya keluar dari kantongmu saat itu juga — jadi saldo akun ikut berkurang. Ini hanya terjadi kalau kamu memilih "Pinjaman Baru" saat menambah catatan. Kalau kamu pilih "Sudah Ada Sebelumnya", saldo tidak akan berubah.'
  }
];

function openFaqSheet() {
  const container = document.getElementById('faqList');
  container.innerHTML = faqData.map((item, i) => `
    <div class="faq-item" onclick="toggleFaq(${i})">
      <div class="faq-question">
        <span>${item.q}</span>
        <i class="bi bi-chevron-down faq-chevron" id="faqChevron${i}"></i>
      </div>
      <div class="faq-answer" id="faqAnswer${i}">${item.a}</div>
    </div>`).join('');
  openSheet('faqSheet');
}

function toggleFaq(i) {
  const answer = document.getElementById('faqAnswer' + i);
  const chevron = document.getElementById('faqChevron' + i);
  const isOpen = answer.classList.contains('open');
  document.querySelectorAll('.faq-answer').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.faq-chevron').forEach(el => el.classList.remove('open'));
  if (!isOpen) {
    answer.classList.add('open');
    chevron.classList.add('open');
  }
}

// ======================================================
// INIT THEME — dipanggil dari app.js setelah DOM siap
// ======================================================
// initTheme() dipanggil di bagian INIT app.js
