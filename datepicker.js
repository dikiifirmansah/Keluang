// ======================================================
// MODULE: Date Picker (Reusable Bottom Sheet)
// STATUS: Aktif
// ======================================================
// Komponen tanggal terpusat, dipakai oleh Statistik, Riwayat,
// dan form Transaksi. Dipanggil lewat openDatePicker(mode, options, onApply).
//
// mode:
//   'bulan'   -> pilih 1 bulan dalam tahun tertentu. options: { year, month } (month 0-11)
//                hasil: { year, month }
//   'tahun'   -> pilih 1 tahun. options: { year }
//                hasil: { year }
//   'tanggal' -> pilih 1 tanggal harian. options: { value (ISO) }
//                hasil: { date (ISO) }
//   'rentang' -> pilih rentang tanggal (custom). options: { from (ISO), to (ISO) }
//                hasil: { from (ISO), to (ISO) }

let dpMode = null;
let dpOnApply = null;

// State internal per mode
let dpBulanYear = new Date().getFullYear();
let dpBulanSelected = new Date().getMonth();
let dpYearPageStart = Math.floor(new Date().getFullYear() / 9) * 9;
let dpYearSelected = new Date().getFullYear();
let dpCalViewYear = new Date().getFullYear();
let dpCalViewMonth = new Date().getMonth();
let dpCalSelected = todayISO();
let dpRangeFrom = null;
let dpRangeTo = null;
let dpRangePicking = 'from'; // 'from' lalu 'to'

// ======================================================
// OPEN / CLOSE
// ======================================================
function openDatePicker(mode, options, onApply) {
  dpMode = mode;
  dpOnApply = onApply;
  options = options || {};

  document.querySelectorAll('#dpOverlay [id^="dpMode"]').forEach(el => el.style.display = 'none');

  const titleMap = { bulan: 'Pilih Bulan', tahun: 'Pilih Tahun', tanggal: 'Pilih Tanggal', rentang: 'Pilih Rentang Tanggal' };
  document.getElementById('dpTitle').textContent = titleMap[mode] || 'Pilih Tanggal';

  if (mode === 'bulan') {
    dpBulanYear = options.year != null ? options.year : new Date().getFullYear();
    dpBulanSelected = options.month != null ? options.month : new Date().getMonth();
    document.getElementById('dpModeBulan').style.display = 'block';
    renderDpMonthGrid();
  } else if (mode === 'tahun') {
    dpYearSelected = options.year != null ? options.year : new Date().getFullYear();
    dpYearPageStart = Math.floor(dpYearSelected / 9) * 9;
    document.getElementById('dpModeTahun').style.display = 'block';
    renderDpYearGrid();
  } else if (mode === 'tanggal') {
    dpCalSelected = options.value || todayISO();
    const [y, m] = dpCalSelected.split('-').map(Number);
    dpCalViewYear = y; dpCalViewMonth = m - 1;
    document.getElementById('dpModeTanggal').style.display = 'block';
    renderDpCalGrid('dpCalGrid', 'dpCalLabel', false);
  } else if (mode === 'rentang') {
    dpRangeFrom = options.from || null;
    dpRangeTo = options.to || null;
    dpRangePicking = dpRangeFrom && !dpRangeTo ? 'to' : 'from';
    const refDate = dpRangeFrom || todayISO();
    const [y, m] = refDate.split('-').map(Number);
    dpCalViewYear = y; dpCalViewMonth = m - 1;
    document.getElementById('dpModeRentang').style.display = 'block';
    renderDpCalGrid('dpRangeCalGrid', 'dpRangeCalLabel', true);
    updateDpRangeLabels();
  }

  document.getElementById('dpOverlay').classList.add('open');
}

function closeDatePicker() {
  document.getElementById('dpOverlay').classList.remove('open');
}

function closeDatePickerOutside(e) {
  if (e.target.id === 'dpOverlay') closeDatePicker();
}

function dpApply() {
  if (dpMode === 'bulan') {
    dpOnApply && dpOnApply({ year: dpBulanYear, month: dpBulanSelected });
  } else if (dpMode === 'tahun') {
    dpOnApply && dpOnApply({ year: dpYearSelected });
  } else if (dpMode === 'tanggal') {
    dpOnApply && dpOnApply({ date: dpCalSelected });
  } else if (dpMode === 'rentang') {
    if (!dpRangeFrom || !dpRangeTo) { showToast('Pilih tanggal awal dan akhir'); return; }
    dpOnApply && dpOnApply({ from: dpRangeFrom, to: dpRangeTo });
  }
  closeDatePicker();
}

// ======================================================
// MODE: BULAN
// ======================================================
function dpShiftYear(dir) {
  dpBulanYear += dir;
  renderDpMonthGrid();
}

function renderDpMonthGrid() {
  document.getElementById('dpBulanYearLabel').textContent = dpBulanYear;
  const grid = document.getElementById('dpMonthGrid');
  grid.innerHTML = bulanSingkat.map((lbl, i) => `
    <div class="dp-month-item${i === dpBulanSelected ? ' active' : ''}" onclick="dpSelectMonth(${i})">${lbl}</div>
  `).join('');
}

function dpSelectMonth(i) {
  dpBulanSelected = i;
  renderDpMonthGrid();
}

// ======================================================
// MODE: TAHUN
// ======================================================
function dpShiftYearPage(dir) {
  dpYearPageStart += dir * 9;
  renderDpYearGrid();
}

function renderDpYearGrid() {
  document.getElementById('dpYearPageLabel').textContent = `${dpYearPageStart} – ${dpYearPageStart + 8}`;
  const grid = document.getElementById('dpYearGrid');
  let html = '';
  for (let y = dpYearPageStart; y <= dpYearPageStart + 8; y++) {
    html += `<div class="dp-year-item${y === dpYearSelected ? ' active' : ''}" onclick="dpSelectYear(${y})">${y}</div>`;
  }
  grid.innerHTML = html;
}

function dpSelectYear(y) {
  dpYearSelected = y;
  renderDpYearGrid();
}

// ======================================================
// MODE: TANGGAL & RENTANG (shared calendar grid)
// ======================================================
function dpShiftCalMonth(dir) {
  dpCalViewMonth += dir;
  if (dpCalViewMonth < 0) { dpCalViewMonth = 11; dpCalViewYear--; }
  if (dpCalViewMonth > 11) { dpCalViewMonth = 0; dpCalViewYear++; }
  if (dpMode === 'rentang') {
    renderDpCalGrid('dpRangeCalGrid', 'dpRangeCalLabel', true);
  } else {
    renderDpCalGrid('dpCalGrid', 'dpCalLabel', false);
  }
}

function renderDpCalGrid(gridId, labelId, isRange) {
  document.getElementById(labelId).textContent = `${bulanPanjang[dpCalViewMonth]} ${dpCalViewYear}`;
  const grid = document.getElementById(gridId);

  const firstOfMonth = new Date(dpCalViewYear, dpCalViewMonth, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Minggu
  const daysInMonth = new Date(dpCalViewYear, dpCalViewMonth + 1, 0).getDate();
  const today = todayISO();

  let cells = [];
  for (let i = 0; i < startOffset; i++) cells.push('<span class="dp-cal-cell empty"></span>');

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${dpCalViewYear}-${(dpCalViewMonth+1).toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;
    let classes = 'dp-cal-cell';
    if (iso === today) classes += ' today';

    if (isRange) {
      if (dpRangeFrom && iso === dpRangeFrom) classes += ' range-start';
      if (dpRangeTo && iso === dpRangeTo) classes += ' range-end';
      if (dpRangeFrom && dpRangeTo && iso > dpRangeFrom && iso < dpRangeTo) classes += ' range-mid';
      if (dpRangeFrom && !dpRangeTo && iso === dpRangeFrom) classes += ' range-start range-end';
    } else {
      if (iso === dpCalSelected) classes += ' selected';
    }
    cells.push(`<span class="${classes}" onclick="${isRange ? `dpRangePickDate('${iso}')` : `dpPickDate('${iso}')`}">${d}</span>`);
  }
  grid.innerHTML = cells.join('');
}

function dpPickDate(iso) {
  dpCalSelected = iso;
  renderDpCalGrid('dpCalGrid', 'dpCalLabel', false);
}

function dpRangePickDate(iso) {
  if (dpRangePicking === 'from' || !dpRangeFrom) {
    dpRangeFrom = iso;
    dpRangeTo = null;
    dpRangePicking = 'to';
  } else {
    if (iso < dpRangeFrom) {
      dpRangeTo = dpRangeFrom;
      dpRangeFrom = iso;
    } else {
      dpRangeTo = iso;
    }
    dpRangePicking = 'from';
  }
  renderDpCalGrid('dpRangeCalGrid', 'dpRangeCalLabel', true);
  updateDpRangeLabels();
}

function updateDpRangeLabels() {
  document.getElementById('dpRangeFromLabel').textContent = dpRangeFrom ? formatTanggalLabel(dpRangeFrom) : '—';
  document.getElementById('dpRangeToLabel').textContent = dpRangeTo ? formatTanggalLabel(dpRangeTo) : '—';
}

// ======================================================
// TIME PICKER — drum scroll + ketik langsung
// ======================================================
let _dpTimeHour = 0;
let _dpTimeMinute = 0;
let _dpTimeTargetId = null;
let _dpTimeLabelId = null;

const HOURS = Array.from({length:24},(_,i)=>i);
const MINUTES = Array.from({length:60},(_,i)=>i);

function _buildDrum(innerId, items, selected, unit) {
  const inner = document.getElementById(innerId);
  const drum = inner.parentElement;

  // Tambah sel highlight jika belum ada
  if (!drum.querySelector('.dp-time-drum-sel')) {
    const sel = document.createElement('div');
    sel.className = 'dp-time-drum-sel';
    drum.appendChild(sel);
  }

  // Reset inner saja — input di dalam drum tetap di DOM
  inner.innerHTML = items.map((v,i) =>
    `<div class="dp-time-drum-item${i===selected?' active':''}" data-val="${v}">` +
    v.toString().padStart(2,'0') + `</div>`
  ).join('');

  // Scroll ke selected
  inner.style.transition = 'none';
  inner.style.transform = `translateY(${40 - selected * 40}px)`;

  // Set nilai input
  const inputId = unit === 'hour' ? 'dpTimeHourInput' : 'dpTimeMinuteInput';
  const inp = document.getElementById(inputId);
  if (inp) inp.value = selected.toString().padStart(2, '0');

  // Attach drag — gunakan flag agar tidak numpuk
  if (!drum._dragInited) {
    _attachDrumDrag(drum, inner, items, unit);
    drum._dragInited = true;
  }
}

function _attachDrumDrag(drum, inner, items, unit) {
  let startY = 0, startVal = 0, hasMoved = false;
  const n = items.length;
  const ITEM_H = 40;
  const max = unit === 'hour' ? 23 : 59;
  const inputId = unit === 'hour' ? 'dpTimeHourInput' : 'dpTimeMinuteInput';

  function getCurrent() { return unit === 'hour' ? _dpTimeHour : _dpTimeMinute; }
  function setCurrent(v) {
    v = ((v % n) + n) % n;
    if (unit === 'hour') _dpTimeHour = v;
    else _dpTimeMinute = v;
    return v;
  }
  function snapDrum(v) {
    v = setCurrent(v);
    inner.style.transition = 'transform 0.15s cubic-bezier(.32,.72,0,1)';
    inner.style.transform = `translateY(${40 - v * ITEM_H}px)`;
    inner.querySelectorAll('.dp-time-drum-item').forEach((el,i) => {
      el.classList.toggle('active', i === v);
    });
    // Sync → input
    const inp = document.getElementById(inputId);
    if (inp) inp.value = v.toString().padStart(2, '0');
  }

  // Input → drum (dua arah), pasang listener sekali saja
  const inp = document.getElementById(inputId);
  if (inp && !inp._listenerInited) {
    inp._listenerInited = true;
    inp.addEventListener('input', () => {
      let val = inp.value.replace(/\D/g, '');
      if (val.length > 2) val = val.slice(-2);
      inp.value = val;
      const num = parseInt(val, 10);
      if (!isNaN(num) && num >= 0 && num <= max) {
        const v = setCurrent(num);
        inner.style.transition = 'transform 0.15s cubic-bezier(.32,.72,0,1)';
        inner.style.transform = `translateY(${40 - v * ITEM_H}px)`;
        inner.querySelectorAll('.dp-time-drum-item').forEach((el,i) => {
          el.classList.toggle('active', i === v);
        });
      }
    });
    inp.addEventListener('blur', () => {
      let num = parseInt(inp.value, 10);
      if (isNaN(num) || num < 0) num = 0;
      if (num > max) num = max;
      inp.value = num.toString().padStart(2, '0');
      const v = setCurrent(num);
      inner.style.transition = 'transform 0.15s cubic-bezier(.32,.72,0,1)';
      inner.style.transform = `translateY(${40 - v * ITEM_H}px)`;
      inner.querySelectorAll('.dp-time-drum-item').forEach((el,i) => {
        el.classList.toggle('active', i === v);
      });
    });
  }

  // Touch drag
  drum.addEventListener('touchstart', e => {
    hasMoved = false;
    startY = e.touches[0].clientY;
    startVal = getCurrent();
    inner.style.transition = 'none';
  }, {passive: true});

  drum.addEventListener('touchmove', e => {
    const d = startY - e.touches[0].clientY;
    if (Math.abs(d) > 5) {
      hasMoved = true;
      const cur = ((startVal + Math.round(d / ITEM_H)) % n + n) % n;
      inner.style.transform = `translateY(${40 - (startVal + d/ITEM_H) * ITEM_H}px)`;
      inner.querySelectorAll('.dp-time-drum-item').forEach((el,i) => {
        el.classList.toggle('active', i === cur);
      });
    }
  }, {passive: true});

  drum.addEventListener('touchend', e => {
    const dy = startY - e.changedTouches[0].clientY;
    snapDrum(startVal + Math.round(dy / ITEM_H));
    hasMoved = false;
  }, {passive: true});

  // Mouse drag (desktop/dev)
  drum.addEventListener('mousedown', e => {
    hasMoved = false;
    startY = e.clientY;
    startVal = getCurrent();
    inner.style.transition = 'none';
  });
  window.addEventListener('mousemove', e => {
    if (startVal === null) return;
    const d = startY - e.clientY;
    if (Math.abs(d) > 5) {
      hasMoved = true;
      inner.style.transform = `translateY(${40 - (startVal + d/ITEM_H) * ITEM_H}px)`;
    }
  });
  window.addEventListener('mouseup', e => {
    if (hasMoved) {
      const dy = startY - e.clientY;
      snapDrum(startVal + Math.round(dy / ITEM_H));
    }
    hasMoved = false;
  });
}

function openTxTimePicker(targetId, labelId) {
  const inputEl = document.getElementById(targetId);
  const current = inputEl ? inputEl.value : '';
  const parts = (current || nowTime()).split(':');
  _dpTimeHour   = parseInt(parts[0], 10) || 0;
  _dpTimeMinute = parseInt(parts[1], 10) || 0;
  _dpTimeTargetId = targetId;
  _dpTimeLabelId  = labelId;

  document.querySelectorAll('#dpOverlay [id^="dpMode"]').forEach(el => el.style.display = 'none');
  document.getElementById('dpTitle').textContent = 'Pilih Waktu';
  document.getElementById('dpModeWaktu').style.display = 'block';

  // Build drums
  _buildDrum('dpDrumHourInner',   HOURS,   _dpTimeHour,   'hour');
  _buildDrum('dpDrumMinuteInner', MINUTES, _dpTimeMinute, 'minute');

  // Set nilai input sesuai waktu aktif
  document.getElementById('dpTimeHourInput').value   = _dpTimeHour.toString().padStart(2, '0');
  document.getElementById('dpTimeMinuteInput').value = _dpTimeMinute.toString().padStart(2, '0');

  dpOnApply = () => {
    const val = _dpTimeHour.toString().padStart(2,'0') + ':' + _dpTimeMinute.toString().padStart(2,'0');
    if (inputEl) inputEl.value = val;
    document.getElementById(_dpTimeLabelId).textContent = val;
    closeDatePicker();
    dpOnApply = null;
  };

  document.getElementById('dpOverlay').classList.add('open');
}

// ======================================================
// TX DATE / TIME PICKER HELPERS (untuk tambah transaksi)
// ======================================================
function openTxDatePicker(targetId, labelId, relLabelId) {
  const inputEl = document.getElementById(targetId);
  const current = inputEl ? inputEl.value : todayISO();
  openDatePicker('tanggal', { value: current }, (res) => {
    if (inputEl) inputEl.value = res.date;
    document.getElementById(labelId).textContent = formatTanggalLabel(res.date);
    if (relLabelId) document.getElementById(relLabelId).textContent = relativeDayLabel(res.date);
  });
}
