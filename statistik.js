// ======================================================
// MODULE: Statistik
// STATUS: Aktif
// ======================================================

// ======================================================
// STATE
// ======================================================
let statUnit = 'all';         // 1d | 1w | 1m | 3m | 6m | 1y | all | custom
let statOffset = 0;
let statCustomMode = 'tanggal'; // 'tanggal' | 'rentang'
let statCustomDate = null;      // ISO, dipakai saat mode = tanggal
let statCustomRange = null;     // {from,to}, dipakai saat mode = rentang

let trendLineState = { masuk: true, keluar: true, selisih: true };

let statLastPeriodTx = [];
let statLastRange = null;
let statLastBuckets = [];

const pieColors = ['#06A876','#499AFD','#F98F00','#C23E6B','#775EED','#0F8A7A','#D14343','#5C6A5F','#94A3B8'];
const COLOR_MASUK = '#06A876';
const COLOR_KELUAR = '#F02626';
const COLOR_SELISIH = '#775EED';

// ======================================================
// RENDER STATISTIK (ENTRY POINT)
// ======================================================
function renderStatistik() {
  const range = getStatRange();
  const labelEl = document.getElementById('statNavLabel');
  const labelText = statUnit === 'custom' ? range.label : `${range.label}${range.sub ? ' · ' + range.sub : ''}`;
  labelEl.innerHTML = `${labelText} <i class="bi bi-chevron-down" style="font-size:11px; margin-left:4px;"></i>`;
  labelEl.classList.add('st-nav-label-clickable');
  labelEl.onclick = openStatUnitSheet;

  // Update chip aktif
  document.querySelectorAll('.st-unit-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.unit === statUnit);
  });

  // Nav row hanya tampil kalau ada prev/next yang bisa dinavigasi
  const noNav = statUnit === 'custom' || statUnit === 'all';
  document.getElementById('statNavRow').style.display = noNav ? 'none' : 'flex';
  document.getElementById('statNavPrevBtn').style.display = 'flex';
  document.getElementById('statNavNextBtn').style.display = 'flex';
  document.getElementById('statNavNextBtn').disabled = statOffset >= 0;
  const showJump = STAT_JUMP_UNITS.includes(statUnit);
  document.getElementById('statJumpBtn').style.display = showJump ? 'flex' : 'none';
  document.getElementById('statJumpSpacer').style.display = showJump ? 'inline-block' : 'none';
  if (statUnit === 'custom') renderStatCustomLabel();

  const periodTx = transactions.filter(t => inRange(t.date, range.from, range.to) && !t.isFee && !t.isAdjustment && !t.isSaldoAwal);
  const prevTx = range.prevFrom ? transactions.filter(t => inRange(t.date, range.prevFrom, range.prevTo) && !t.isFee && !t.isAdjustment && !t.isSaldoAwal) : [];

  statLastPeriodTx = periodTx;
  statLastRange = range;

  renderTrendChart(periodTx, range);
  renderTrendSummary(periodTx, prevTx, range);
  renderPieChart(periodTx);
  renderStatExtra(periodTx, range);
}

// ======================================================
// RANGE
// ======================================================
function getStatRange() {
  const now = new Date();

  if (statUnit === 'custom') {
    if (statCustomMode === 'tanggal') {
      const d = statCustomDate || todayISO();
      const prev = isoOf(addDays(new Date(d + 'T00:00:00'), -1));
      return { from: d, to: d, label: formatTanggalLabel(d), prevFrom: prev, prevTo: prev };
    }
    const range = statCustomRange || { from: todayISO(), to: todayISO() };
    const span = dayDiffInclusive(range.from, range.to);
    const prevTo = isoOf(addDays(new Date(range.from + 'T00:00:00'), -1));
    const prevFrom = isoOf(addDays(new Date(prevTo + 'T00:00:00'), -(span - 1)));
    return { from: range.from, to: range.to, label: formatCustomLabel(range.from, range.to), prevFrom, prevTo };
  }

  if (statUnit === '1d') {
    const ref = addDays(now, statOffset);
    const iso = isoOf(ref);
    const prevIso = isoOf(addDays(ref, -1));
    const label = statOffset === 0 ? 'Hari ini' : statOffset === -1 ? 'Kemarin' : `${Math.abs(statOffset)} hari lalu`;
    return { from: iso, to: iso, label, sub: formatTxDate(iso), prevFrom: prevIso, prevTo: prevIso };
  }

  if (statUnit === '1w') {
    const ref = new Date(now); ref.setDate(now.getDate() + statOffset * 7);
    const dayNum = (ref.getDay() + 6) % 7;
    const monday = new Date(ref); monday.setDate(ref.getDate() - dayNum); monday.setHours(0,0,0,0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const fromISO = isoOf(monday), toISO = isoOf(sunday);
    const prevMonday = addDays(monday, -7), prevSunday = addDays(sunday, -7);
    const label = statOffset === 0 ? 'Minggu ini' : statOffset === -1 ? 'Minggu lalu' : `${Math.abs(statOffset)} minggu lalu`;
    return { from: fromISO, to: toISO, label, sub: `${formatTxDate(fromISO)} – ${formatTxDate(toISO)}`, prevFrom: isoOf(prevMonday), prevTo: isoOf(prevSunday) };
  }

  if (statUnit === '1m') {
    const ref = new Date(now.getFullYear(), now.getMonth() + statOffset, 1);
    const y = ref.getFullYear(), m = ref.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    const label = statOffset === 0 ? 'Bulan ini' : statOffset === -1 ? 'Bulan lalu' : `${Math.abs(statOffset)} bulan lalu`;
    const sub = `${bulanPanjang[m]} ${y}`;
    const from = `${y}-${(m+1).toString().padStart(2,'0')}-01`;
    const to = `${y}-${(m+1).toString().padStart(2,'0')}-${lastDay.toString().padStart(2,'0')}`;
    const prevRef = new Date(y, m - 1, 1);
    const py = prevRef.getFullYear(), pm = prevRef.getMonth();
    const pLastDay = new Date(py, pm + 1, 0).getDate();
    return { from, to, label, sub, prevFrom: `${py}-${(pm+1).toString().padStart(2,'0')}-01`, prevTo: `${py}-${(pm+1).toString().padStart(2,'0')}-${pLastDay.toString().padStart(2,'0')}` };
  }

  if (statUnit === '3m' || statUnit === '6m') {
    const span = statUnit === '3m' ? 3 : 6;
    const totalIdx = now.getFullYear() * 12 + now.getMonth() + statOffset * span;
    const startIdx = totalIdx - (span - 1);
    const sy = Math.floor(startIdx / 12), sm = ((startIdx % 12) + 12) % 12;
    const ey = Math.floor(totalIdx / 12), em = ((totalIdx % 12) + 12) % 12;
    const lastDay = new Date(ey, em + 1, 0).getDate();
    const from = `${sy}-${(sm+1).toString().padStart(2,'0')}-01`;
    const to = `${ey}-${(em+1).toString().padStart(2,'0')}-${lastDay.toString().padStart(2,'0')}`;
    const label = statOffset === 0 ? `${span} Bulan Terakhir` : `${Math.abs(statOffset)*span} bulan lalu`;
    const sub = sy === ey ? `${bulanSingkat[sm]} – ${bulanSingkat[em]} ${ey}` : `${bulanSingkat[sm]} ${sy} – ${bulanSingkat[em]} ${ey}`;
    const pStartIdx = startIdx - span, pEndIdx = totalIdx - span;
    const psy = Math.floor(pStartIdx/12), psm = ((pStartIdx%12)+12)%12;
    const pey = Math.floor(pEndIdx/12), pem = ((pEndIdx%12)+12)%12;
    const pLastDay = new Date(pey, pem+1, 0).getDate();
    return {
      from, to, label, sub,
      prevFrom: `${psy}-${(psm+1).toString().padStart(2,'0')}-01`,
      prevTo: `${pey}-${(pem+1).toString().padStart(2,'0')}-${pLastDay.toString().padStart(2,'0')}`
    };
  }

  if (statUnit === '1y') {
    const y = now.getFullYear() + statOffset;
    const label = statOffset === 0 ? 'Tahun ini' : statOffset === -1 ? 'Tahun lalu' : `${Math.abs(statOffset)} tahun lalu`;
    return { from: `${y}-01-01`, to: `${y}-12-31`, label, sub: String(y), prevFrom: `${y-1}-01-01`, prevTo: `${y-1}-12-31` };
  }

  // all
  if (!transactions.length) {
    const iso = todayISO();
    return { from: iso, to: iso, label: 'Semua', sub: '', prevFrom: null, prevTo: null };
  }
  const sortedDates = transactions.map(t => t.date).sort();
  const from = sortedDates[0];
  const to = todayISO();
  return { from, to, label: 'Semua', sub: `${formatTxDate(from)} – ${formatTxDate(to)}`, prevFrom: null, prevTo: null };
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function dayDiffInclusive(fromISO, toISO) {
  const f = new Date(fromISO + 'T00:00:00'), t = new Date(toISO + 'T00:00:00');
  return Math.round((t - f) / 86400000) + 1;
}

function formatCustomLabel(from, to) {
  return `${formatTxDate(from)} – ${formatTxDate(to)}`;
}

// ======================================================
// CONTROL
// ======================================================
const STAT_UNIT_LABELS = {
  '1d': '1 Hari', '1w': '1 Minggu', '1m': '1 Bulan', '3m': '3 Bulan',
  '6m': '6 Bulan', '1y': '1 Tahun', 'all': 'Semua Waktu', 'custom': 'Custom'
};
const STAT_UNIT_ORDER = ['1d','1w','1m','3m','6m','1y','all','custom'];
const STAT_JUMP_UNITS = ['1d','1m','3m','6m','1y','custom'];

function setStatUnit(unit) {
  statUnit = unit;
  statOffset = 0;
  if (unit === 'custom') {
    showStatUnitCustomStep();
    return;
  }
  renderStatistik();
}

function openStatUnitSheet() {
  if (statUnit === 'custom') { showStatUnitCustomStep(); return; }
  showStatUnitListStep();
  document.getElementById('statUnitSheetOverlay').classList.add('open');
}
function showStatUnitListStep() {
  const list = document.getElementById('statUnitOptionList');
  list.innerHTML = STAT_UNIT_ORDER.map(u => `
    <div class="st-unit-option ${statUnit === u ? 'active' : ''}" onclick="selectStatUnit('${u}')">
      <span>${STAT_UNIT_LABELS[u]}</span>
      <i class="bi bi-check-circle-fill uo-check"></i>
    </div>`).join('');
  list.style.display = 'flex';
  document.getElementById('statUnitCustomStep').style.display = 'none';
}
function showStatUnitCustomStep() {
  document.getElementById('statUnitOptionList').style.display = 'none';
  document.getElementById('statUnitCustomStep').style.display = 'block';
  document.querySelectorAll('.st-custom-mode-chip').forEach(el => el.classList.toggle('active', el.dataset.mode === statCustomMode));
  renderStatCustomLabel();
  document.getElementById('statUnitSheetOverlay').classList.add('open');
}
function statUnitSheetBack() {
  showStatUnitListStep();
}
function closeStatUnitSheet() {
  document.getElementById('statUnitSheetOverlay').classList.remove('open');
}
function closeStatUnitSheetOutside(e) {
  if (e.target.id === 'statUnitSheetOverlay') closeStatUnitSheet();
}
function selectStatUnit(unit) {
  if (unit === 'custom') { setStatUnit('custom'); showStatUnitCustomStep(); return; }
  closeStatUnitSheet();
  setStatUnit(unit);
}

function setStatCustomMode(mode) {
  statCustomMode = mode;
  document.querySelectorAll('.st-custom-mode-chip').forEach(el => el.classList.toggle('active', el.dataset.mode === mode));
  renderStatCustomLabel();
  renderStatistik();
}

function renderStatCustomLabel() {
  const el = document.getElementById('statCustomRangeLabel');
  if (!el) return;
  if (statCustomMode === 'tanggal') {
    el.textContent = statCustomDate ? formatTanggalLabel(statCustomDate) : 'Pilih tanggal';
  } else {
    el.textContent = statCustomRange
      ? `${formatTanggalLabel(statCustomRange.from)} – ${formatTanggalLabel(statCustomRange.to)}`
      : 'Pilih rentang tanggal';
  }
}

function navStatPeriod(dir) {
  statOffset += dir;
  if (statOffset > 0) statOffset = 0;
  renderStatistik();
}

function openStatDatePicker() {
  const range = getStatRange();
  if (statUnit === '1d') {
    openDatePicker('tanggal', { date: range.from }, (res) => {
      const now = new Date();
      const target = new Date(res.date + 'T00:00:00');
      statOffset = Math.round((target - new Date(isoOf(now) + 'T00:00:00')) / 86400000);
      if (statOffset > 0) statOffset = 0;
      renderStatistik();
    });
  } else if (statUnit === '1w') {
    openDatePicker('tanggal', { date: range.from }, (res) => {
      const now = new Date();
      const nowDay = (now.getDay() + 6) % 7;
      const thisMonday = new Date(now); thisMonday.setDate(now.getDate() - nowDay); thisMonday.setHours(0,0,0,0);
      const target = new Date(res.date + 'T00:00:00');
      const targetDay = (target.getDay() + 6) % 7;
      const targetMonday = new Date(target); targetMonday.setDate(target.getDate() - targetDay); targetMonday.setHours(0,0,0,0);
      statOffset = Math.round((targetMonday - thisMonday) / (7 * 86400000));
      if (statOffset > 0) statOffset = 0;
      renderStatistik();
    });
  } else if (statUnit === '1m' || statUnit === '3m' || statUnit === '6m') {
    const [y, m] = range.to.split('-').map(Number);
    openDatePicker('bulan', { year: y, month: m - 1 }, (res) => {
      const now = new Date();
      statOffset = (res.year - now.getFullYear()) * 12 + (res.month - now.getMonth());
      if (statUnit === '3m') statOffset = Math.round(statOffset / 3);
      if (statUnit === '6m') statOffset = Math.round(statOffset / 6);
      if (statOffset > 0) statOffset = 0;
      renderStatistik();
    });
  } else if (statUnit === '1y') {
    const y = parseInt(range.from.split('-')[0], 10);
    openDatePicker('tahun', { year: y }, (res) => {
      const now = new Date();
      statOffset = res.year - now.getFullYear();
      if (statOffset > 0) statOffset = 0;
      renderStatistik();
    });
  } else if (statUnit === 'custom') {
    if (statCustomMode === 'tanggal') {
      openDatePicker('tanggal', { date: statCustomDate || todayISO() }, (res) => {
        statCustomDate = res.date;
        renderStatCustomLabel();
        closeStatUnitSheet();
        renderStatistik();
      });
    } else {
      openDatePicker('rentang', statCustomRange || {}, (res) => {
        if (res.from > res.to) { showToast('Tanggal awal harus sebelum tanggal akhir'); return; }
        statCustomRange = { from: res.from, to: res.to };
        renderStatCustomLabel();
        closeStatUnitSheet();
        renderStatistik();
      });
    }
  }
}

// ======================================================
// TREND LINE TOGGLE
// ======================================================
function toggleTrendLine(line) {
  const activeCount = Object.values(trendLineState).filter(Boolean).length;
  if (trendLineState[line] && activeCount === 1) {
    showToast('Minimal satu garis harus aktif');
    return;
  }
  trendLineState[line] = !trendLineState[line];
  document.querySelector(`.st-legend-item[data-line="${line}"]`).classList.toggle('active', trendLineState[line]);
  if (statLastRange) renderTrendChart(statLastPeriodTx, statLastRange);
}

// ======================================================
// BUCKETS
// ======================================================
function getStatBuckets(periodTx, range) {
  const isHourly = statUnit === '1d' || (statUnit === 'custom' && statCustomMode === 'tanggal');

  if (isHourly) {
    const hourSpans = [[0,3],[3,6],[6,9],[9,12],[12,15],[15,18],[18,21],[21,24]];
    return hourSpans.map(([h1, h2]) => buildBucketValues({
      label: `${h1.toString().padStart(2,'0')}`,
      dateLabel: `${range.from ? formatTxDate(range.from) : ''}, ${h1.toString().padStart(2,'0')}:00–${h2.toString().padStart(2,'0')}:00`,
      match: t => {
        const hh = parseInt((t.time || '00:00').split(':')[0], 10);
        return hh >= h1 && hh < h2;
      }
    }, periodTx));
  }

  if (statUnit === '1w') {
    const labels = ['Sen','Sel','Rab','Kam','Jum','Sab','Min'];
    const monday = new Date(range.from + 'T00:00:00');
    return labels.map((lbl, i) => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      const iso = isoOf(d);
      return buildBucketValues({ label: lbl, dateLabel: formatTxDate(iso), match: t => t.date === iso }, periodTx);
    });
  }

  if (statUnit === '1m') {
    const lastDay = parseInt(range.to.split('-')[2], 10);
    const weekCount = Math.ceil(lastDay / 7);
    return Array.from({ length: weekCount }, (_, i) => {
      const startDay = i * 7 + 1;
      const endDay = Math.min(startDay + 6, lastDay);
      return buildBucketValues({
        label: 'W' + (i + 1),
        dateLabel: `Tgl ${startDay}–${endDay}`,
        match: t => { const day = parseInt(t.date.split('-')[2], 10); return day >= startDay && day <= endDay; }
      }, periodTx);
    });
  }

  if (statUnit === '3m' || statUnit === '6m' || statUnit === '1y') {
    const months = monthsBetween(range.from, range.to);
    return months.map(({ y, m }) => buildBucketValues({
      label: bulanSingkat[m],
      dateLabel: `${bulanPanjang[m]} ${y}`,
      match: t => { const p = t.date.split('-'); return parseInt(p[0],10) === y && parseInt(p[1],10) - 1 === m; }
    }, periodTx));
  }

  if (statUnit === 'all') {
    const months = monthsBetween(range.from, range.to);
    if (months.length <= 24) {
      return months.map(({ y, m }) => buildBucketValues({
        label: bulanSingkat[m] + (months.length > 12 ? ` '${String(y).slice(2)}` : ''),
        dateLabel: `${bulanPanjang[m]} ${y}`,
        match: t => { const p = t.date.split('-'); return parseInt(p[0],10) === y && parseInt(p[1],10) - 1 === m; }
      }, periodTx));
    }
    const years = yearsBetween(range.from, range.to);
    return years.map(y => buildBucketValues({
      label: String(y),
      dateLabel: String(y),
      match: t => parseInt(t.date.split('-')[0], 10) === y
    }, periodTx));
  }

  // custom - rentang
  const fromD = new Date(range.from + 'T00:00:00'), toD = new Date(range.to + 'T00:00:00');
  const dayDiff = Math.round((toD - fromD) / 86400000) + 1;
  if (dayDiff <= 14) {
    return Array.from({ length: dayDiff }, (_, i) => {
      const d = new Date(fromD); d.setDate(fromD.getDate() + i);
      const iso = isoOf(d);
      return buildBucketValues({ label: d.getDate() + '/' + (d.getMonth() + 1), dateLabel: formatTxDate(iso), match: t => t.date === iso }, periodTx);
    });
  }
  const weekCount = Math.ceil(dayDiff / 7);
  return Array.from({ length: weekCount }, (_, i) => {
    const startD = new Date(fromD); startD.setDate(fromD.getDate() + i * 7);
    const endD = new Date(startD); endD.setDate(startD.getDate() + 6);
    const sISO = isoOf(startD), eISO = isoOf(endD > toD ? toD : endD);
    return buildBucketValues({ label: 'M' + (i + 1), dateLabel: `${formatTxDate(sISO)} – ${formatTxDate(eISO)}`, match: t => t.date >= sISO && t.date <= eISO }, periodTx);
  });
}

function buildBucketValues(b, periodTx) {
  const matched = periodTx.filter(b.match);
  const masuk = matched.filter(t => t.type === 'masuk').reduce((a, t) => a + t.amount, 0);
  const keluar = matched.filter(t => t.type === 'keluar').reduce((a, t) => a + t.amount, 0);
  return { label: b.label, dateLabel: b.dateLabel, masuk, keluar, selisih: masuk - keluar };
}

function monthsBetween(fromISO, toISO) {
  const [fy, fm] = fromISO.split('-').map(Number);
  const [ty, tm] = toISO.split('-').map(Number);
  const startIdx = fy * 12 + (fm - 1), endIdx = ty * 12 + (tm - 1);
  const out = [];
  for (let idx = startIdx; idx <= endIdx; idx++) out.push({ y: Math.floor(idx / 12), m: ((idx % 12) + 12) % 12 });
  return out;
}
function yearsBetween(fromISO, toISO) {
  const fy = parseInt(fromISO.split('-')[0], 10), ty = parseInt(toISO.split('-')[0], 10);
  const out = [];
  for (let y = fy; y <= ty; y++) out.push(y);
  return out;
}

function niceAxisStep(rawStep) {
  if (rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const base = Math.pow(10, exp);
  const frac = rawStep / base;
  let niceFrac;
  if (frac <= 1) niceFrac = 1;
  else if (frac <= 2) niceFrac = 2;
  else if (frac <= 5) niceFrac = 5;
  else niceFrac = 10;
  return niceFrac * base;
}
function formatStatAxisValue(v) {
  if (v === 0) return '0';
  const sign = v < 0 ? '-' : '';
  return sign + formatRupiahShort(Math.abs(v));
}

// ======================================================
// TREND CHART (LINE + AREA, INTERAKTIF)
// ======================================================
function renderTrendChart(periodTx, range) {
  const svg = document.getElementById('trendSvg');
  const labelsEl = document.getElementById('trendChartLabels');
  const wrap = document.getElementById('trendChartWrap');

  wrap.querySelector('.st-empty-chart')?.remove();

  if (!transactions.length) {
    svg.innerHTML = '';
    labelsEl.innerHTML = '';
    document.getElementById('trendYAxis').innerHTML = '';
    document.getElementById('trendTooltip').style.display = 'none';
    document.getElementById('trendCrosshair').style.display = 'none';
    const empty = document.createElement('div');
    empty.className = 'st-empty-chart';
    empty.textContent = 'Belum ada data untuk ditampilkan';
    wrap.appendChild(empty);
    return;
  }

  const buckets = getStatBuckets(periodTx, range);
  statLastBuckets = buckets;

  const activeLines = Object.keys(trendLineState).filter(k => trendLineState[k]);
  const allVals = [];
  buckets.forEach(b => activeLines.forEach(line => allVals.push(b[line])));
  const rawMax = Math.max(1, ...allVals);
  const rawMin = Math.min(0, ...allVals);
  const step = niceAxisStep((rawMax - rawMin) / 4 || 1);
  let vMax = Math.ceil(rawMax / step) * step;
  let vMin = Math.floor(rawMin / step) * step;
  if (vMin === vMax) vMax = vMin + step;

  const n = buckets.length;
  const padX = 4, topPad = 8, botPad = 8;
  const plotW = 320 - padX * 2, plotH = 160 - topPad - botPad;
  const xAt = i => n <= 1 ? 160 : padX + (i / (n - 1)) * plotW;
  const yAt = v => topPad + (1 - (v - vMin) / (vMax - vMin || 1)) * plotH;
  const zeroY = yAt(0);

  const yTicks = [];
  for (let v = vMin; v <= vMax + step * 0.001; v += step) yTicks.push(Math.round(v));

  const yAxisEl = document.getElementById('trendYAxis');
  yAxisEl.innerHTML = yTicks.map(v => `<span class="st-yaxis-label" style="top:${yAt(v).toFixed(1)}px;">${formatStatAxisValue(v)}</span>`).join('');

  const seriesDefs = [
    { key: 'masuk', color: COLOR_MASUK, fillOpacity: 0.12 },
    { key: 'keluar', color: COLOR_KELUAR, fillOpacity: 0.12 },
    { key: 'selisih', color: COLOR_SELISIH, fillOpacity: 0.10 }
  ];

  let svgInner = yTicks.map(v => {
    const y = yAt(v);
    return v === 0
      ? `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${320-padX}" y2="${y.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3,3"></line>`
      : `<line x1="${padX}" y1="${y.toFixed(1)}" x2="${320-padX}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="2,4"></line>`;
  }).join('');

  seriesDefs.forEach(def => {
    if (!trendLineState[def.key]) return;
    const pts = buckets.map((b, i) => [xAt(i), yAt(b[def.key])]);
    const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const areaPath = linePath + ` L${pts[pts.length-1][0].toFixed(1)},${zeroY.toFixed(1)} L${pts[0][0].toFixed(1)},${zeroY.toFixed(1)} Z`;
    svgInner += `<path d="${areaPath}" fill="${def.color}" fill-opacity="${def.fillOpacity}" stroke="none"></path>`;
    svgInner += `<path d="${linePath}" fill="none" stroke="${def.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"></path>`;
    pts.forEach(p => { svgInner += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" fill="${def.color}"></circle>`; });
  });

  svg.innerHTML = svgInner;
  labelsEl.innerHTML = buckets.map(b => `<span>${b.label}</span>`).join('');

  setupTrendInteraction(wrap, buckets, n, padX, plotW);
}

function setupTrendInteraction(wrap, buckets, n, padX, plotW) {
  const tooltip = document.getElementById('trendTooltip');
  const crosshair = document.getElementById('trendCrosshair');

  const showAt = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    let fracX = (clientX - rect.left) / rect.width;
    fracX = Math.max(0, Math.min(1, fracX));
    const svgX = fracX * 320;
    let idx = n <= 1 ? 0 : Math.round(((svgX - padX) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    const b = buckets[idx];
    if (!b) return;

    const xFracPos = n <= 1 ? 0.5 : idx / (n - 1);
    const pxLeft = xFracPos * rect.width;

    crosshair.style.display = 'block';
    crosshair.style.left = pxLeft + 'px';

    let rows = '';
    if (trendLineState.masuk) rows += `<div class="tt-row"><span class="tt-label"><span class="st-dot in"></span>Masuk</span><span class="tt-amt">${formatRupiah(b.masuk)}</span></div>`;
    if (trendLineState.keluar) rows += `<div class="tt-row"><span class="tt-label"><span class="st-dot out"></span>Keluar</span><span class="tt-amt">${formatRupiah(b.keluar)}</span></div>`;
    if (trendLineState.selisih) rows += `<div class="tt-row"><span class="tt-label"><span class="st-dot sel"></span>Selisih</span><span class="tt-amt">${formatRupiah(b.selisih)}</span></div>`;
    tooltip.innerHTML = `<div class="tt-date">${b.dateLabel}</div>${rows}`;
    tooltip.style.display = 'block';

    let ttLeft = pxLeft + 10;
    const ttWidthEst = 160;
    if (ttLeft + ttWidthEst > rect.width) ttLeft = pxLeft - ttWidthEst - 10;
    if (ttLeft < 0) ttLeft = 4;
    tooltip.style.left = ttLeft + 'px';
  };

  const hide = () => { tooltip.style.display = 'none'; crosshair.style.display = 'none'; };

  wrap.onpointerdown = (e) => { showAt(e.clientX); };
  wrap.onpointermove = (e) => { if (e.buttons === 1 || e.pointerType === 'touch') showAt(e.clientX); };
  wrap.onpointerup = () => {};
  wrap.onpointerleave = hide;
  wrap.ontouchstart = (e) => { if (e.touches[0]) showAt(e.touches[0].clientX); };
  wrap.ontouchmove = (e) => { if (e.touches[0]) { showAt(e.touches[0].clientX); e.preventDefault(); } };
  wrap.ontouchend = hide;
}

// ======================================================
// TREND SUMMARY CARDS (Total Masuk / Keluar / Selisih)
// ======================================================
function renderTrendSummary(periodTx, prevTx, range) {
  const el = document.getElementById('trendSummary');
  const totalMasuk = periodTx.filter(t => t.type === 'masuk').reduce((a,t)=>a+t.amount,0);
  const totalKeluar = periodTx.filter(t => t.type === 'keluar').reduce((a,t)=>a+t.amount,0);
  const selisih = totalMasuk - totalKeluar;

  const hasPrev = !!range.prevFrom && statUnit !== 'all';
  const prevMasuk = hasPrev ? prevTx.filter(t => t.type === 'masuk').reduce((a,t)=>a+t.amount,0) : 0;
  const prevKeluar = hasPrev ? prevTx.filter(t => t.type === 'keluar').reduce((a,t)=>a+t.amount,0) : 0;
  const prevSelisih = prevMasuk - prevKeluar;

  const compareText = hasPrev ? `Dibandingkan dengan periode sebelumnya: ${formatTxDate(range.prevFrom)} – ${formatTxDate(range.prevTo)}` : 'Tidak ada periode pembanding untuk rentang ini';

  function deltaHTML(curr, prev) {
    if (!hasPrev || prev === 0) return `<div class="ts-delta flat">— dari periode lalu</div>`;
    const pct = ((curr - prev) / Math.abs(prev)) * 100;
    const dir = pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat';
    const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '▬';
    return `<div class="ts-delta ${dir}">${arrow} ${Math.abs(pct).toFixed(0)}% dari periode lalu</div>`;
  }

  el.innerHTML = `
    <div class="st-trend-summary-card">
      <div class="ts-head"><span class="st-dot in"></span>Total Masuk <i class="bi bi-info-circle" onpointerdown="showStatCompareTooltip(event)" onpointerup="hideStatCompareTooltip()" onpointerleave="hideStatCompareTooltip()" ontouchend="hideStatCompareTooltip()"></i></div>
      <div class="ts-amt">${formatRupiah(totalMasuk)}</div>
      ${deltaHTML(totalMasuk, prevMasuk)}
    </div>
    <div class="st-trend-summary-card">
      <div class="ts-head"><span class="st-dot out"></span>Total Keluar <i class="bi bi-info-circle" onpointerdown="showStatCompareTooltip(event)" onpointerup="hideStatCompareTooltip()" onpointerleave="hideStatCompareTooltip()" ontouchend="hideStatCompareTooltip()"></i></div>
      <div class="ts-amt">${formatRupiah(totalKeluar)}</div>
      ${deltaHTML(totalKeluar, prevKeluar)}
    </div>
    <div class="st-trend-summary-card">
      <div class="ts-head"><span class="st-dot sel"></span>Selisih <i class="bi bi-info-circle" onpointerdown="showStatCompareTooltip(event)" onpointerup="hideStatCompareTooltip()" onpointerleave="hideStatCompareTooltip()" ontouchend="hideStatCompareTooltip()"></i></div>
      <div class="ts-amt">${formatRupiah(selisih)}</div>
      ${deltaHTML(selisih, prevSelisih)}
    </div>`;

  el.dataset.compareText = compareText;
}

function showStatCompareTooltip(e) {
  e.stopPropagation();
  const icon = e.currentTarget;
  let tip = document.getElementById('statFloatingTooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'statFloatingTooltip';
    tip.className = 'st-floating-tooltip';
    document.body.appendChild(tip);
  }
  tip.textContent = document.getElementById('trendSummary').dataset.compareText || 'Tidak ada periode pembanding';
  const rect = icon.getBoundingClientRect();
  const tipWidth = Math.min(210, window.innerWidth - 24);
  let left = rect.left + rect.width / 2 - tipWidth / 2;
  left = Math.max(10, Math.min(left, window.innerWidth - tipWidth - 10));
  tip.style.width = tipWidth + 'px';
  tip.style.left = left + 'px';
  tip.style.top = (rect.top - 10) + 'px';
  tip.style.display = 'block';
}
function hideStatCompareTooltip() {
  const tip = document.getElementById('statFloatingTooltip');
  if (tip) tip.style.display = 'none';
}

// ======================================================
// RINGKASAN TAMBAHAN (TAHAP 3) — Rasio Surplus, Pengeluaran
// Terbesar, Hari Aktif, Rata-rata per Hari
// ======================================================
let statExtraOpen = false;

function renderStatExtra(periodTx, range) {
  const grid = document.getElementById('statExtraGrid');
  const btn = document.getElementById('statExtraToggleBtn');
  statExtraOpen = false;
  grid.style.display = 'none';
  btn.textContent = 'Lihat selengkapnya';

  const masukTx = periodTx.filter(t => t.type === 'masuk');
  const keluarTx = periodTx.filter(t => t.type === 'keluar');
  const totalMasuk = masukTx.reduce((a,t)=>a+t.amount,0);
  const totalKeluar = keluarTx.reduce((a,t)=>a+t.amount,0);
  const selisih = totalMasuk - totalKeluar;

  // Rasio Surplus = Selisih / Total Masuk. Kalau Total Masuk 0, gak bisa dihitung (bukan 0%, tapi tidak terdefinisi).
  const rasioSurplus = totalMasuk > 0 ? Math.round((selisih / totalMasuk) * 100) : null;

  // Pengeluaran Terbesar = kategori dengan total nominal pengeluaran tertinggi di periode ini
  const byCategory = {};
  keluarTx.forEach(t => { byCategory[t.category] = (byCategory[t.category]||0) + t.amount; });
  const topCat = Object.entries(byCategory).sort((a,b) => b[1]-a[1])[0];

  // Hari Aktif = jumlah hari unik yang ada transaksi (apapun jenisnya) di periode ini
  const uniqueDays = new Set(periodTx.map(t => t.date)).size;
  const totalDaysInRange = dayDiffInclusive(range.from, range.to);

  // Rata-rata pengeluaran per hari = Total Keluar / jumlah hari kalender di periode (bukan cuma hari aktif, biar representatif sebagai rata-rata harian sebenarnya)
  const avgPerDay = totalDaysInRange > 0 ? totalKeluar / totalDaysInRange : 0;

  grid.innerHTML = `
    <div class="st-extra-card">
      <div class="ec-head"><i class="bi bi-piggy-bank"></i> Rasio Surplus</div>
      <div class="ec-val">${rasioSurplus === null ? '—' : rasioSurplus + '%'}</div>
      <div class="ec-sub">${rasioSurplus === null ? 'Belum ada pemasukan' : 'dari total pemasukan'}</div>
    </div>
    <div class="st-extra-card">
      <div class="ec-head"><i class="bi bi-graph-up-arrow"></i> Pengeluaran Terbesar</div>
      <div class="ec-val">${topCat ? topCat[0] : '—'}</div>
      <div class="ec-sub">${topCat ? formatRupiah(topCat[1]) : 'Belum ada pengeluaran'}</div>
    </div>
    <div class="st-extra-card">
      <div class="ec-head"><i class="bi bi-calendar-check"></i> Hari Aktif</div>
      <div class="ec-val">${uniqueDays} hari</div>
      <div class="ec-sub">dari ${totalDaysInRange} hari periode ini</div>
    </div>
    <div class="st-extra-card">
      <div class="ec-head"><i class="bi bi-bar-chart-line"></i> Rata-rata Keluar/Hari</div>
      <div class="ec-val">${formatRupiah(Math.round(avgPerDay))}</div>
      <div class="ec-sub">per hari kalender</div>
    </div>`;
}

function toggleStatExtra() {
  statExtraOpen = !statExtraOpen;
  const grid = document.getElementById('statExtraGrid');
  const btn = document.getElementById('statExtraToggleBtn');
  grid.style.display = statExtraOpen ? 'grid' : 'none';
  btn.textContent = statExtraOpen ? 'Sembunyikan' : 'Lihat selengkapnya';
}

// ======================================================
// PIE CHART + LIST KATEGORI (gabungan, top 4 + Lainnya, carousel Pengeluaran/Pemasukan)
// ======================================================
const PIE_TOP_N = 4;
const OVERFLOW_LABEL = 'Kategori Lain';
const PIE_VIEWS = ['keluar', 'masuk'];
const PIE_VIEW_LABEL = { keluar: 'Pengeluaran per Kategori', masuk: 'Pemasukan per Kategori' };
const PIE_VIEW_EMPTY = { keluar: 'Belum ada pengeluaran di periode ini', masuk: 'Belum ada pemasukan di periode ini' };
let statPieExpanded = false;
let pieView = 'keluar';
let pieLastPeriodTx = [];

function pieColorFor(cat, i) {
  return categoryColors[cat] || pieColors[i % pieColors.length];
}

function setPieView(view) {
  pieView = view;
  document.querySelectorAll('#pieDots .st-pie-dot-ind').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });
  renderPieChart(pieLastPeriodTx);
}

function navPieView(dir) {
  const idx = PIE_VIEWS.indexOf(pieView);
  const next = PIE_VIEWS[(idx + dir + PIE_VIEWS.length) % PIE_VIEWS.length];
  setPieView(next);
}

function attachPieSwipe() {
  const wrap = document.getElementById('pieWrap');
  if (!wrap || wrap._swipeAttached) return;
  wrap._swipeAttached = true;
  let startX = 0;
  wrap.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
  wrap.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) navPieView(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function renderPieChart(periodTx) {
  pieLastPeriodTx = periodTx;
  const wrap = document.getElementById('pieWrap');
  const fullListEl = document.getElementById('categoryFullList');
  document.getElementById('pieCardTitle').textContent = PIE_VIEW_LABEL[pieView];

  const txOfView = periodTx.filter(t => t.type === pieView);
  statPieExpanded = false;
  fullListEl.style.display = 'none';
  fullListEl.innerHTML = '';

  if (!txOfView.length) { wrap.innerHTML = `<div class="st-empty-chart">${PIE_VIEW_EMPTY[pieView]}</div>`; attachPieSwipe(); return; }

  const byCategory = {};
  txOfView.forEach(t => { byCategory[t.category] = (byCategory[t.category]||0) + t.amount; });
  const total = Object.values(byCategory).reduce((a,b)=>a+b,0);
  const sorted = Object.entries(byCategory).sort((a,b) => b[1]-a[1]);

  // Satu sumber data dipakai donut & list: top N + 1 baris gabungan sisanya (kalau ada),
  // dinamai "Kategori Lain" (bukan "Lainnya") biar gak bentrok kalau user punya kategori asli bernama "Lainnya"
  const top = sorted.slice(0, PIE_TOP_N);
  const rest = sorted.slice(PIE_TOP_N);
  const restTotal = rest.reduce((a,[,amt]) => a + amt, 0);
  const displayItems = rest.length ? [...top, [OVERFLOW_LABEL, restTotal]] : top;

  const R = 60, CX = 70, CY = 70;
  let angleStart = -90;
  let paths = '';
  displayItems.forEach(([cat, amt], i) => {
    const fraction = amt / total;
    const angleEnd = angleStart + fraction * 360;
    const largeArc = (angleEnd - angleStart) > 180 ? 1 : 0;
    const x1 = CX + R * Math.cos(angleStart * Math.PI/180);
    const y1 = CY + R * Math.sin(angleStart * Math.PI/180);
    const x2 = CX + R * Math.cos(angleEnd * Math.PI/180);
    const y2 = CY + R * Math.sin(angleEnd * Math.PI/180);
    const color = cat === OVERFLOW_LABEL ? pieColors[5 % pieColors.length] : pieColorFor(cat, i);
    if (displayItems.length === 1) {
      paths += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${color}"></circle>`;
    } else {
      paths += `<path d="M${CX},${CY} L${x1},${y1} A${R},${R} 0 ${largeArc} 1 ${x2},${y2} Z" fill="${color}"></path>`;
    }
    angleStart = angleEnd;
  });

  const catListHTML = displayItems.map(([cat, amt], i) => {
    const pct = total ? Math.round((amt/total)*100) : 0;
    const color = cat === OVERFLOW_LABEL ? pieColors[5 % pieColors.length] : pieColorFor(cat, i);
    const icon = cat === OVERFLOW_LABEL ? 'bi-three-dots' : (categoryIcons[cat] || 'bi-circle');
    return `
      <div class="st-pie-cat-row">
        <div class="st-pie-cat-icon" style="background:${color}"><i class="bi ${icon}"></i></div>
        <div class="st-pie-cat-name">${cat}</div>
        <div class="st-pie-cat-right">
          <span class="st-pie-cat-amt">${formatRupiah(amt)}</span>
          <span class="st-pie-cat-pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');

  wrap.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 140 140" style="flex-shrink:0;">
      ${paths}
      <circle cx="${CX}" cy="${CY}" r="32" fill="var(--surface)"></circle>
      <text x="${CX}" y="${CY-4}" text-anchor="middle" class="st-pie-center-label">Total</text>
      <text x="${CX}" y="${CY+12}" text-anchor="middle" class="st-pie-center-amt">${formatRupiahShort(total)}</text>
    </svg>
    <div class="st-pie-catlist">${catListHTML}</div>`;

  // List lengkap (semua kategori, dengan progress bar) buat tombol "Lihat semua"
  if (rest.length) {
    const fullRowsHTML = sorted.map(([cat, amt]) => {
      const pct = total ? Math.round((amt/total)*100) : 0;
      return `
        <div class="cat-row">
          <div class="cat-row-icon"><i class="bi ${categoryIcons[cat] || 'bi-circle'}"></i></div>
          <div class="cat-row-mid">
            <div class="cat-row-name">${cat}</div>
            <div class="cat-row-track"><div class="cat-row-fill" style="width:${pct}%"></div></div>
          </div>
          <div class="cat-row-right">
            <div class="cat-row-amt">${formatRupiah(amt)}</div>
            <div class="cat-row-pct">${pct}%</div>
          </div>
        </div>`;
    }).join('');
    fullListEl.innerHTML = `<div class="st-pie-fulllist-rows">${fullRowsHTML}</div>
      <button class="st-pie-seeall-btn" onclick="toggleCategoryFullList()" id="statPieSeeAllBtn">Lihat semua kategori</button>`;
    fullListEl.style.display = 'block';
    fullListEl.querySelector('.st-pie-fulllist-rows').style.display = 'none';
  }
  attachPieSwipe();
}

function toggleCategoryFullList() {
  statPieExpanded = !statPieExpanded;
  const rowsEl = document.querySelector('#categoryFullList .st-pie-fulllist-rows');
  const btn = document.getElementById('statPieSeeAllBtn');
  if (!rowsEl || !btn) return;
  rowsEl.style.display = statPieExpanded ? 'block' : 'none';
  btn.textContent = statPieExpanded ? 'Sembunyikan' : 'Lihat semua kategori';
}
