// ======================================================
// MODULE: Notifikasi / Reminder
// STATUS: Aktif
// ======================================================
// Karena Keluang murni PWA client-side (tanpa server), push notification
// asli (yang bisa muncul walau app tertutup total) tidak realistis --
// butuh server pengirim. Jadi pendekatannya: tiap kali app dibuka, kita
// cek kondisi data (jatuh tempo, limit budget, dsb) dan tampilkan modal
// in-app untuk apa saja yang perlu diketahui user, lalu simpan riwayatnya
// di panel lonceng.
//
// Alur:
//   checkAutoReminders() -> scan semua modul, push reminder baru ke antrian
//   showNextReminderModal() -> tampilkan modal SATU per SATU dari antrian
//   tutup modal -> reminder itu masuk panel lonceng, status "belum dibaca"
//   klik item di panel lonceng -> ditandai "dibaca" + navigasi ke halaman terkait

// ======================================================
// KONFIGURASI TAMPILAN PER TIPE
// ======================================================
const REMINDER_TYPE_META = {
  'wl-due':        { icon: 'bi-hourglass-split',        bg: 'var(--warning-100)', color: 'var(--warning)' },
  'wl-achieved':   { icon: 'bi-trophy-fill',             bg: '#DFF6ED',            color: '#06A876' },
  'dd-used':       { icon: 'bi-shield-exclamation',      bg: 'var(--info-100)',    color: 'var(--info)' },
  'budget-warn':   { icon: 'bi-pie-chart-fill',          bg: 'var(--warning-100)', color: 'var(--warning)' },
  'budget-over':   { icon: 'bi-exclamation-triangle-fill', bg: 'var(--danger-100)', color: 'var(--danger)' },
  'up-due':        { icon: 'bi-cash-stack',              bg: 'var(--warning-100)', color: 'var(--warning)' },
  'invest-review': { icon: 'bi-graph-up-arrow',          bg: 'var(--accent2-100)', color: 'var(--accent2)' },
  'custom':        { icon: 'bi-bell-fill',               bg: 'var(--primary-100)', color: 'var(--primary)' }
};

let _reminderQueue = [];

// ======================================================
// HELPER TANGGAL
// ======================================================
function _daysFromToday(dateISO) {
  const today = new Date(todayISO() + 'T00:00:00');
  const target = new Date(dateISO + 'T00:00:00');
  return Math.round((target - today) / 86400000);
}

// ======================================================
// PUSH REMINDER BARU (dipanggil dari scanner otomatis ATAU trigger real-time)
// ======================================================
function pushReminder(data) {
  const list = loadReminders();
  const reminder = {
    id: 'ntf' + uniqueTick(),
    type: data.type,
    title: data.title,
    message: data.message,
    createdAt: new Date().toISOString(),
    read: false,
    navPage: data.navPage || null,
    navId: data.navId || null
  };
  list.unshift(reminder);
  saveReminders(list);
  _reminderQueue.push(reminder);
  updateNotifBadge();
  return reminder;
}

// ======================================================
// SCANNER OTOMATIS -- dipanggil saat app dibuka
// ======================================================
function checkAutoReminders() {
  _checkWishlistReminders();
  _checkUtangPiutangReminders();
  _checkInvestasiReminders();
  _checkBudgetReminders();
  _checkCustomReminders();
}

function _checkWishlistReminders() {
  const list = loadWishlists();
  let changed = false;
  list.forEach(w => {
    if (w.completed) return;
    // Tercapai
    if (!w.notifAchievedFired && w.balance >= w.targetAmount && w.targetAmount > 0) {
      w.notifAchievedFired = true;
      changed = true;
      pushReminder({
        type: 'wl-achieved',
        title: 'Target Tercapai! 🎉',
        message: `Selamat! Wishlist "${w.name}" sudah mencapai target ${formatRupiah(w.targetAmount)}.`,
        navPage: 'wishlist-detail', navId: w.id
      });
    }
    // Jatuh tempo (H-3)
    if (!w.notifDueFired && w.targetDate) {
      const days = _daysFromToday(w.targetDate);
      if (days <= 3 && days >= 0) {
        w.notifDueFired = true;
        changed = true;
        const sisa = Math.max(w.targetAmount - w.balance, 0);
        pushReminder({
          type: 'wl-due',
          title: 'Wishlist Jatuh Tempo',
          message: days === 0
            ? `"${w.name}" targetnya hari ini. Sisa ${formatRupiah(sisa)} lagi.`
            : `"${w.name}" jatuh tempo ${days} hari lagi. Sisa ${formatRupiah(sisa)} lagi.`,
          navPage: 'wishlist-detail', navId: w.id
        });
      }
    }
  });
  if (changed) saveWishlists(list);
}

function _checkUtangPiutangReminders() {
  const list = loadUtangPiutang();
  let changed = false;
  list.forEach(u => {
    if (u.status === 'lunas' || !u.dueDate || u.notifDueFired) return;
    const days = _daysFromToday(u.dueDate);
    if (days <= 3 && days >= 0) {
      u.notifDueFired = true;
      changed = true;
      const label = u.kind === 'utang' ? 'Utang' : 'Piutang';
      pushReminder({
        type: 'up-due',
        title: `${label} Jatuh Tempo`,
        message: days === 0
          ? `${label} "${u.name}" jatuh tempo hari ini (${formatRupiah(u.remaining)}).`
          : `${label} "${u.name}" jatuh tempo ${days} hari lagi (${formatRupiah(u.remaining)}).`,
        navPage: 'utang-detail', navId: u.id
      });
    }
  });
  if (changed) saveUtangPiutang(list);
}

function _checkInvestasiReminders() {
  const list = loadJurnalInvestasi();
  let changed = false;
  list.forEach(a => {
    if (!a.reviewDate || a.notifReviewFired) return;
    const days = _daysFromToday(a.reviewDate);
    if (days <= 0) {
      a.notifReviewFired = true;
      changed = true;
      pushReminder({
        type: 'invest-review',
        title: 'Waktunya Evaluasi Investasi',
        message: `Sudah waktunya evaluasi ulang aset "${a.nama || a.name}". Masih sesuai rencana awal?`,
        navPage: 'jurnal-detail', navId: a.id
      });
    }
  });
  if (changed) saveJurnalInvestasi(list);
}

// Dipakai baik oleh scanner boot-time maupun dipanggil langsung tiap
// selesai simpan transaksi (biar peringatan budget muncul real-time,
// gak nunggu buka app lagi).
function checkBudgetRemindersNow() {
  _checkBudgetReminders();
}

function _checkBudgetReminders() {
  if (typeof getBudgetsForMonth !== 'function' || typeof getSpentByCategory !== 'function') return;
  const month = todayISO().slice(0, 7); // YYYY-MM
  const budgets = getBudgetsForMonth(month);
  if (!budgets.length) return;
  const spent = getSpentByCategory(month);
  const state = loadBudgetNotifState();
  let changed = false;

  budgets.forEach(b => {
    const s = spent[b.category] || 0;
    const info = bdgStatusInfo(s, b.limit);
    const overKey = `${month}:${b.category}:over`;
    const warnKey = `${month}:${b.category}:warn`;

    if (info.over && !state[overKey]) {
      state[overKey] = true;
      changed = true;
      pushReminder({
        type: 'budget-over',
        title: 'Budget Terlampaui',
        message: `Pengeluaran "${b.category}" bulan ini ${formatRupiah(s)}, sudah melebihi budget ${formatRupiah(b.limit)}.`,
        navPage: 'budget-detail', navId: b.category
      });
    } else if (info.warn && !state[warnKey]) {
      state[warnKey] = true;
      changed = true;
      pushReminder({
        type: 'budget-warn',
        title: 'Budget Mendekati Limit',
        message: `Pengeluaran "${b.category}" bulan ini sudah ${Math.round(info.pct)}% dari budget ${formatRupiah(b.limit)}.`,
        navPage: 'budget-detail', navId: b.category
      });
    }
  });
  if (changed) saveBudgetNotifState(state);
}

function _checkCustomReminders() {
  const list = loadCustomReminders();
  const nowIso = new Date().toISOString();
  let changed = false;
  list.forEach(r => {
    if (r.fired) return;
    const scheduled = `${r.date}T${r.time}:00`;
    if (scheduled <= nowIso) {
      r.fired = true;
      changed = true;
      pushReminder({
        type: 'custom',
        title: r.title,
        message: r.message || 'Pengingat kamu.',
        navPage: null, navId: null
      });
    }
  });
  if (changed) saveCustomReminders(list);
}

// ======================================================
// MODAL ANTRIAN -- tampil satu per satu
// ======================================================
function showNextReminderModal() {
  if (!_reminderQueue.length) return;
  const r = _reminderQueue[0];
  const meta = REMINDER_TYPE_META[r.type] || REMINDER_TYPE_META.custom;

  document.getElementById('reminderModalIcon').className = 'bi ' + meta.icon;
  document.getElementById('reminderModalIconWrap').style.background = meta.bg;
  document.getElementById('reminderModalIcon').style.color = meta.color;
  document.getElementById('reminderModalTitle').textContent = r.title;
  document.getElementById('reminderModalMsg').textContent = r.message;

  openSheet('reminderModalOverlay');
}

function closeReminderModal() {
  closeSheet('reminderModalOverlay');
  _reminderQueue.shift();
  if (_reminderQueue.length) {
    setTimeout(showNextReminderModal, 260); // beri jeda supaya animasi tutup selesai dulu
  }
}

// ======================================================
// PANEL LONCENG
// ======================================================
function updateNotifBadge() {
  const unread = loadReminders().filter(r => !r.read).length;
  document.querySelectorAll('.notif-badge-dot').forEach(el => el.classList.toggle('show', unread > 0));
}

function renderNotifPanel() {
  const list = loadReminders();
  const listEl = document.getElementById('notifPanelList');
  const emptyEl = document.getElementById('notifPanelEmpty');
  if (!listEl || !emptyEl) return;

  if (!list.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = list.map(r => {
    const meta = REMINDER_TYPE_META[r.type] || REMINDER_TYPE_META.custom;
    return `
      <div class="notif-item ${r.read ? '' : 'unread'}" onclick="openReminderFromPanel('${r.id}')">
        <div class="notif-item-icon" style="background:${meta.bg}; color:${meta.color};"><i class="bi ${meta.icon}"></i></div>
        <div class="notif-item-mid">
          <div class="notif-item-title">${escapeHtml(r.title)}</div>
          <div class="notif-item-msg">${escapeHtml(r.message)}</div>
          <div class="notif-item-time">${_formatNotifTime(r.createdAt)}</div>
        </div>
        ${r.read ? '' : '<div class="notif-item-dot"></div>'}
      </div>`;
  }).join('');
}

function _formatNotifTime(iso) {
  const d = new Date(iso);
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const bulan = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const today = todayISO();
  const dIso = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
  const jam = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  if (dIso === today) return `Hari ini, ${jam}`;
  return `${d.getDate()} ${bulan[d.getMonth()]} ${d.getFullYear()}, ${jam}`;
}

function openReminderFromPanel(id) {
  const list = loadReminders();
  const r = list.find(x => x.id === id);
  if (!r) return;
  if (!r.read) {
    r.read = true;
    saveReminders(list);
    updateNotifBadge();
    renderNotifPanel();
  }
  document.getElementById('notifPanel').classList.remove('open');

  if (r.navPage === 'wishlist-detail') openWlDetail(r.navId);
  else if (r.navPage === 'utang-detail') openUpDetail(r.navId);
  else if (r.navPage === 'jurnal-detail') openJrDetail(r.navId);
  else if (r.navPage === 'budget-detail') { goTo('budget'); openBudgetDetail(r.navId); }
}

// ======================================================
// FORM REMINDER CUSTOM
// ======================================================
function openCustomReminderForm(e) {
  if (e) e.stopPropagation();
  document.getElementById('crFormTitle').value = '';
  document.getElementById('crFormMsg').value = '';
  document.getElementById('crFormDate').value = '';
  document.getElementById('crFormDateLabel').textContent = 'Pilih tanggal';
  document.getElementById('crFormTime').value = '';
  document.getElementById('crFormTimeLabel').textContent = 'Pilih jam';
  document.getElementById('crFormErrMsg').style.display = 'none';
  document.getElementById('notifPanel').classList.remove('open');
  openSheet('customReminderFormOverlay');
}

function saveCustomReminderForm() {
  if (!allowSubmit('saveCustomReminderForm')) return;
  const errEl = document.getElementById('crFormErrMsg');
  errEl.style.display = 'none';

  const title = document.getElementById('crFormTitle').value.trim();
  const message = document.getElementById('crFormMsg').value.trim();
  const date = document.getElementById('crFormDate').value;
  const time = document.getElementById('crFormTime').value;

  if (!title) { errEl.textContent = 'Judul pengingat wajib diisi.'; errEl.style.display = 'block'; return; }
  if (!date || !time) { errEl.textContent = 'Tanggal dan jam wajib dipilih.'; errEl.style.display = 'block'; return; }

  const scheduled = `${date}T${time}:00`;
  const nowIso = new Date().toISOString();
  const list = loadCustomReminders();
  list.push({
    id: 'cr' + uniqueTick(),
    title, message, date, time,
    fired: scheduled <= nowIso // kalau user pilih waktu yang udah lewat, langsung tandai fired & tampil sekarang
  });
  saveCustomReminders(list);
  closeSheet('customReminderFormOverlay');

  if (scheduled <= nowIso) {
    pushReminder({ type: 'custom', title, message: message || 'Pengingat kamu.', navPage: null, navId: null });
    showToast('Pengingat langsung ditampilkan (waktunya sudah lewat)');
    showNextReminderModal();
  } else {
    showToast('Pengingat disimpan');
  }
}
