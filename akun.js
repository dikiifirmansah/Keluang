// ======================================================
// MODULE: Akun
// STATUS: Aktif
// ======================================================

// ======================================================
// SOURCE CONSTANTS
// ======================================================
const sourceIcons = {
  rekening: 'fi-sr-bank',
  ewallet: 'fi-sc-wallet',
  tunai: 'fi-ss-money-bill-wave',
  invest: 'fi fi-br-growth-chart-invest'
};

const sourceTypeColors = {
  rekening: '#499AFD',
  ewallet: '#775EED',
  tunai: '#06A876',
  invest: '#F98F00'
};

const sourceTypeLabel = {
  rekening: 'Bank',
  ewallet: 'E-Wallet',
  tunai: 'Cash',
  invest: 'Investasi'
};

// ======================================================
// STATE
// ======================================================
let accFilter = 'semua';
let accSortMode = false;

// ======================================================
// RENDER AKUN
// ======================================================
function renderKantong() {
  renderAccSummary();
  renderAccPie();

  const filtered = accFilter === 'semua' ? sources : sources.filter(s => s.jenis === accFilter);
  const listEl = document.getElementById('accList');
  const emptyEl = document.getElementById('accEmptyState');

  if (!filtered.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';
  listEl.innerHTML = filtered.map(s => sourceItemHTML(s)).join('');
  attachSourceLongPress();
  if (accSortMode) attachAccSortDrag();
}

function sourceItemHTML(s) {
  const icon = sourceIcons[s.jenis] || 'fi-sc-wallet';
  const color = sourceTypeColors[s.jenis] || 'var(--ink-300)';
  const iconInner = s.customIcon ? `<img src="${s.customIcon}">` : `<i class="${icon}"></i>`;
  const sub = `${sourceTypeLabel[s.jenis] || s.jenis}${s.subLabel ? ' · ' + s.subLabel : ''}`;
  return `
    <div class="acc-item" data-source="${s.id}" onclick="openSourceDetail('${s.id}')">
      <div class="acc-item-icon-wrap" style="background:${s.customIcon ? 'var(--surface-sunken)' : color};">${iconInner}</div>
      <div class="acc-item-mid">
        <div class="acc-item-name">${escapeHtml(s.name)}</div>
        <div class="acc-item-sub">${sub}</div>
      </div>
      <div class="acc-item-right">
        <div class="acc-item-amt">${formatRupiah(s.saldo)}</div>
        <button class="acc-more-btn" onclick="event.stopPropagation(); openSourceActionFor('${s.id}')"><i class="bi bi-three-dots-vertical"></i></button>
      </div>
      ${accSortMode ? '<i class="bi bi-grip-vertical acc-drag-handle"></i>' : ''}
    </div>`;
}

// ======================================================
// FILTER
// ======================================================
function setAccFilter(f) {
  accFilter = f;
  document.querySelectorAll('.acc-tab').forEach(el => el.classList.toggle('active', el.dataset.filter === f));
  renderKantong();
}

// ======================================================
// SUMMARY
// ======================================================
function renderAccSummary() {
  const filtered = accFilter === 'semua' ? sources : sources.filter(s => s.jenis === accFilter);
  const total = filtered.reduce((a,s) => a + s.saldo, 0);

  const labelMap = { semua: 'Total di Semua Akun', tunai: 'Total Cash', rekening: 'Total Bank', ewallet: 'Total E-Wallet', invest: 'Total Investasi' };
  const labelEl = document.getElementById('accSummaryLabel');
  if (labelEl) labelEl.textContent = labelMap[accFilter] || 'Total di Semua Akun';
  document.getElementById('accSummaryTotal').textContent = formatRupiah(total);

  const trendEl = document.getElementById('accSummaryTrend');
  if (accFilter !== 'semua') { trendEl.innerHTML = ''; return; }

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const lastDay = new Date(y, m+1, 0).getDate();
  const fromISO = `${y}-${(m+1).toString().padStart(2,'0')}-01`;
  const toISO = `${y}-${(m+1).toString().padStart(2,'0')}-${lastDay.toString().padStart(2,'0')}`;
  const thisMonthTx = transactions.filter(t => t.date >= fromISO && t.date <= toISO);
  const netThisMonth = thisMonthTx.reduce((a,t) => {
    if (t.type === 'masuk') return a + t.amount;
    if (t.type === 'keluar') return a - t.amount;
    return a;
  }, 0);
  const totalLastMonth = total - netThisMonth;

  if (totalLastMonth > 0) {
    const pct = Math.round(((total - totalLastMonth) / totalLastMonth) * 100);
    if (pct === 0) { trendEl.innerHTML = ''; }
    else {
      trendEl.className = 'acc-summary-trend ' + (pct >= 0 ? 'up' : 'down');
      trendEl.innerHTML = `<i class="bi bi-arrow-${pct >= 0 ? 'up' : 'down'}-short"></i> ${Math.abs(pct)}% dari bulan lalu`;
    }
  } else { trendEl.innerHTML = ''; }
}

// ======================================================
// PIE
// ======================================================
function renderAccPie() {
  const wrap = document.getElementById('accPieWrap');
  const legendEl = document.getElementById('accLegend');
  const total = sources.reduce((a,s) => a + s.saldo, 0);

  if (!sources.length || total <= 0) {
    wrap.innerHTML = `<svg width="90" height="90" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="33" fill="none" stroke="var(--border)" stroke-width="14"/>
    </svg>`;
    legendEl.innerHTML = '<div style="color:var(--ink-300);font-size:11px;font-weight:600;">Belum ada data</div>';
    return;
  }

  if (accFilter !== 'semua') {
    const filteredSources = sources.filter(s => s.jenis === accFilter);
    const filteredTotal = filteredSources.reduce((a,s) => a+s.saldo, 0);
    const R = 33, CX = 45, CY = 45, STROKE = 14;
    const circ = 2 * Math.PI * R;

    if (filteredTotal <= 0) {
      wrap.innerHTML = `<svg width="90" height="90" viewBox="0 0 90 90">
        <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${STROKE}"/>
      </svg>`;
      legendEl.innerHTML = '<div style="color:var(--ink-300);font-size:11px;font-weight:600;">Saldo 0</div>';
      return;
    }

    const baseColor = sourceTypeColors[accFilter] || 'var(--primary)';
    const GAP = filteredSources.length > 1 ? 3 : 0;
    const totalGap = GAP * filteredSources.length;
    const usable = circ - totalGap;

    const paletteByType = {
      ewallet: ['#775EED','#9B6FEB','#C4A8F5','#DDD0FA'],
      rekening: ['#499AFD','#5E83E8','#96B2F5','#C4D3FB'],
      tunai: ['#06A876','#3DB382','#7ECFB0','#B5E6D4'],
      invest: ['#F98F00','#D4A855','#E8C98A','#F5E4C0'],
    };
    const palette = paletteByType[accFilter] || [baseColor];

    let angleOffset = 0;
    let circles = '';
    const sorted = [...filteredSources].sort((a,b) => b.saldo - a.saldo);

    sorted.forEach((s, i) => {
      const fraction = s.saldo / filteredTotal;
      const dash = fraction * usable;
      const color = palette[i % palette.length];
      circles += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
        stroke="${color}" stroke-width="${STROKE}"
        stroke-dasharray="${dash} ${circ - dash}"
        stroke-dashoffset="${-(angleOffset)}"
        transform="rotate(-90 ${CX} ${CY})"
        stroke-linecap="butt"/>`;
      angleOffset += dash + GAP;
    });

    wrap.innerHTML = `<svg width="90" height="90" viewBox="0 0 90 90">
      ${circles}
    </svg>`;

    legendEl.innerHTML = sorted.slice(0,3).map((s, i) => {
      const pct = Math.round((s.saldo/filteredTotal)*100);
      const color = palette[i % palette.length];
      return `<div class="acc-legend-item">
        <span class="acc-legend-dot" style="background:${color}"></span>
        <span class="acc-legend-name" style="max-width:60px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(s.name)}</span>
        <span class="acc-legend-pct">${pct}%</span>
      </div>`;
    }).join('');
    return;
  }

  // Filter "Semua"
  const byType = {};
  sources.forEach(s => { byType[s.jenis] = (byType[s.jenis]||0) + s.saldo; });
  const sorted = Object.entries(byType).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1]);

  const R = 33, CX = 45, CY = 45, STROKE = 14;
  const circ = 2 * Math.PI * R;
  const GAP = sorted.length > 1 ? 3 : 0;
  const totalGap = GAP * sorted.length;
  const usable = circ - totalGap;

  let angleOffset = 0;
  let circles = '';
  sorted.forEach(([type, amt]) => {
    const fraction = amt / total;
    const dash = fraction * usable;
    circles += `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
      stroke="${sourceTypeColors[type]}" stroke-width="${STROKE}"
      stroke-dasharray="${dash} ${circ - dash}"
      stroke-dashoffset="${-(angleOffset)}"
      transform="rotate(-90 ${CX} ${CY})"
      stroke-linecap="butt"/>`;
    angleOffset += dash + GAP;
  });

  wrap.innerHTML = `<svg width="90" height="90" viewBox="0 0 90 90">
    <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${STROKE}"/>
    ${circles}
  </svg>`;

  legendEl.innerHTML = sorted.map(([type, amt]) => {
    const pct = Math.round((amt/total)*100);
    return `<div class="acc-legend-item">
      <span class="acc-legend-dot" style="background:${sourceTypeColors[type]}"></span>
      <span class="acc-legend-name">${sourceTypeLabel[type]}</span>
      <span class="acc-legend-pct">${pct}%</span>
    </div>`;
  }).join('');
}

// ======================================================
// SORT MODE
// ======================================================
function toggleAccSortMode() {
  accSortMode = !accSortMode;
  const btn = document.getElementById('accSortBtn');
  const section = document.getElementById('accListSection');
  btn.innerHTML = accSortMode
    ? '<i class="bi bi-check-lg"></i> Selesai'
    : '<i class="bi bi-list-ul"></i> Urutkan';
  btn.style.background = accSortMode ? 'var(--primary)' : '';
  btn.style.color = accSortMode ? '#fff' : '';
  section.classList.toggle('acc-sort-mode', accSortMode);
  renderKantong();
  if (accSortMode) showToast('Tahan dan geser untuk mengubah urutan');
}

function attachAccSortDrag() {
  const items = document.querySelectorAll('#accList .acc-item');
  let dragId = null, overId = null;
  items.forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', () => { dragId = item.dataset.source; item.style.opacity='0.5'; });
    item.addEventListener('dragend', () => {
      item.style.opacity='';
      document.querySelectorAll('#accList .acc-item').forEach(i => i.classList.remove('drag-over-acc'));
      if (dragId && overId && dragId !== overId) {
        const fromIdx = sources.findIndex(s => s.id === dragId);
        const toIdx = sources.findIndex(s => s.id === overId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [removed] = sources.splice(fromIdx, 1);
          sources.splice(toIdx, 0, removed);
          saveSources(sources);
          renderKantong();
          showToast('Urutan akun disimpan');
        }
      }
      dragId = null; overId = null;
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      overId = item.dataset.source;
      document.querySelectorAll('#accList .acc-item').forEach(i => i.classList.remove('drag-over-acc'));
      item.classList.add('drag-over-acc');
    });

    // Touch support
    let touchStartId = null, touchOverId = null;
    item.addEventListener('touchstart', () => { touchStartId = item.dataset.source; }, { passive: true });
    item.addEventListener('touchmove', e => {
      const t = e.touches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const candidate = el?.closest('.acc-item');
      if (candidate) {
        touchOverId = candidate.dataset.source;
        document.querySelectorAll('#accList .acc-item').forEach(i => i.classList.remove('drag-over-acc'));
        candidate.classList.add('drag-over-acc');
      }
    }, { passive: true });
    item.addEventListener('touchend', () => {
      document.querySelectorAll('#accList .acc-item').forEach(i => i.classList.remove('drag-over-acc'));
      if (touchStartId && touchOverId && touchStartId !== touchOverId) {
        const fromIdx = sources.findIndex(s => s.id === touchStartId);
        const toIdx = sources.findIndex(s => s.id === touchOverId);
        if (fromIdx !== -1 && toIdx !== -1) {
          const [removed] = sources.splice(fromIdx, 1);
          sources.splice(toIdx, 0, removed);
          saveSources(sources);
          renderKantong();
          showToast('Urutan akun disimpan');
        }
      }
      touchStartId = null; touchOverId = null;
    }, { passive: true });
  });
}

// ======================================================
// LONG PRESS
// ======================================================
function attachSourceLongPress() {
  document.querySelectorAll('.kt-item').forEach(item => {
    let pressTimer = null;
    let longPressed = false;
    const start = () => {
      longPressed = false;
      item.classList.add('pressed');
      pressTimer = setTimeout(() => {
        longPressed = true;
        item.classList.remove('pressed');
        const id = item.dataset.source;
        const s = sources.find(x => x.id === id);
        if (s) openSourceAction(s);
      }, 480);
    };
    const cancel = () => { clearTimeout(pressTimer); item.classList.remove('pressed'); };
    item.addEventListener('pointerdown', start);
    item.addEventListener('pointerup', cancel);
    item.addEventListener('pointerleave', cancel);
    item.addEventListener('pointermove', cancel);
  });
}

// ======================================================
// ACCOUNT TYPE CHOOSER
// ======================================================
function openAccountTypeChooser() {
  document.getElementById('accTypeOverlay').classList.add('open');
}

function closeAccType() {
  document.getElementById('accTypeOverlay').classList.remove('open');
}

function closeAccTypeOutside(e) {
  if (e.target.id === 'accTypeOverlay') closeAccType();
}

function selectAccType(jenis) {
  closeAccType();
  openSourceForm(jenis === 'invest' ? 'invest' : 'liquid', null, jenis);
}

// ======================================================
// SOURCE FORM
// ======================================================
let sourceFormMode = 'liquid';
let sourceFormEditId = null;
let sourceFormCustomIcon = null;

function openSourceForm(mode, editId, presetJenis) {
  sourceFormMode = mode;
  sourceFormEditId = editId || null;
  sourceFormCustomIcon = null;
  document.getElementById('sourceFormIconLinkField').style.display = 'none';
  document.getElementById('sourceFormIconLink').value = '';
  const isInvest = mode === 'invest';

  const jenisLabel = { tunai: 'Cash', rekening: 'Bank', ewallet: 'E-Wallet', invest: 'Investasi' };
  const jenisKey = isInvest ? 'invest' : (presetJenis || 'rekening');
  document.getElementById('sourceFormTitle').textContent = editId
    ? `Edit Akun ${jenisLabel[jenisKey] || ''}`
    : `Tambah Akun ${jenisLabel[jenisKey] || ''}`;

  document.getElementById('sourceFormJenisField').style.display = 'block';
  document.getElementById('sourceFormSaldoLabel').textContent = editId
    ? (jenisKey === 'invest' ? 'Saldo (otomatis)' : 'Saldo')
    : 'Saldo Awal';

  const nameInput = document.getElementById('sourceFormName');
  const placeholders = { tunai: 'cth. Dompet, Laci', rekening: 'cth. BCA Tabungan, BRI', ewallet: 'cth. GoPay, OVO, Dana', invest: 'cth. RDN Stockbit, Wallet Indodax' };
  nameInput.placeholder = placeholders[jenisKey] || 'Nama akun';

  const saldoInput = document.getElementById('sourceFormSaldo');
  const lockNote = document.getElementById('sourceFormSaldoLockNote');
  const lockSaldo = (jenisKey === 'invest') && !!editId;
  saldoInput.disabled = lockSaldo;
  if (lockNote) lockNote.style.display = lockSaldo ? 'flex' : 'none';

  let jenisForIcon = jenisKey;
  if (editId) {
    const s = sources.find(x => x.id === editId);
    if (s) {
      document.getElementById('sourceFormName').value = s.name;
      document.getElementById('sourceFormSaldo').value = s.saldo.toLocaleString('id-ID');
      document.querySelectorAll('#sourceFormJenis .type-seg-item').forEach(el => {
        el.classList.toggle('active', el.dataset.jenis === s.jenis);
      });
      jenisForIcon = s.jenis;
      sourceFormCustomIcon = s.customIcon || null;
    }
  } else {
    document.getElementById('sourceFormName').value = '';
    document.getElementById('sourceFormSaldo').value = '';
    document.querySelectorAll('#sourceFormJenis .type-seg-item').forEach(el => {
      el.classList.toggle('active', el.dataset.jenis === (presetJenis || 'rekening'));
    });
    jenisForIcon = jenisKey;
  }
  refreshSourceFormIconPreview(jenisForIcon);
  document.getElementById('sourceFormOverlay').classList.add('open');
}

function refreshSourceFormIconPreview(jenis) {
  const preview = document.getElementById('sourceFormIconPreview');
  if (sourceFormCustomIcon) {
    preview.style.background = 'var(--surface-sunken)';
    preview.innerHTML = `<img src="${sourceFormCustomIcon}">`;
  } else {
    preview.style.background = sourceTypeColors[jenis] || 'var(--primary)';
    preview.innerHTML = `<i class="bi ${sourceIcons[jenis] || 'bi-wallet2'}" style="font-size:22px; color:#fff;"></i>`;
  }
}

function getCurrentFormJenis() {
  if (sourceFormMode === 'invest') return 'invest';
  const jenisEl = document.querySelector('#sourceFormJenis .type-seg-item.active');
  return jenisEl ? jenisEl.dataset.jenis : 'rekening';
}

function toggleIconLinkInput() {
  const field = document.getElementById('sourceFormIconLinkField');
  field.style.display = field.style.display === 'none' ? 'block' : 'none';
}

function handleSourceIconLink(url) {
  if (!url.trim()) return;
  sourceFormCustomIcon = url.trim();
  refreshSourceFormIconPreview(getCurrentFormJenis());
}

function handleSourceIconUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToast('Ukuran gambar maksimal 2MB'); return; }
  const reader = new FileReader();
  reader.onload = function(ev) {
    sourceFormCustomIcon = ev.target.result;
    refreshSourceFormIconPreview(getCurrentFormJenis());
  };
  reader.readAsDataURL(file);
}

function resetSourceFormIcon() {
  sourceFormCustomIcon = null;
  document.getElementById('sourceFormIconLink').value = '';
  document.getElementById('sourceFormIconLinkField').style.display = 'none';
  refreshSourceFormIconPreview(getCurrentFormJenis());
}

function closeSourceForm() {
  document.getElementById('sourceFormOverlay').classList.remove('open');
}

function closeSourceFormOutside(e) {
  if (e.target.id === 'sourceFormOverlay') closeSourceForm();
}

document.querySelectorAll('#sourceFormJenis .type-seg-item').forEach(el => {
  el.addEventListener('click', () => {
    document.querySelectorAll('#sourceFormJenis .type-seg-item').forEach(x => x.classList.remove('active'));
    el.classList.add('active');
    const jenis = el.dataset.jenis;
    const lockSaldo = (jenis === 'invest') && !!sourceFormEditId;
    const saldoInput = document.getElementById('sourceFormSaldo');
    const lockNote = document.getElementById('sourceFormSaldoLockNote');
    saldoInput.disabled = lockSaldo;
    if (lockNote) lockNote.style.display = lockSaldo ? 'flex' : 'none';
    const saldoLabel = document.getElementById('sourceFormSaldoLabel');
    if (saldoLabel) saldoLabel.textContent = sourceFormEditId ? (jenis === 'invest' ? 'Saldo (otomatis)' : 'Saldo') : 'Saldo Awal';
    const placeholders = { tunai: 'cth. Dompet, Laci', rekening: 'cth. BCA Tabungan, BRI', ewallet: 'cth. GoPay, OVO, Dana', invest: 'cth. RDN Stockbit, Wallet Indodax' };
    document.getElementById('sourceFormName').placeholder = placeholders[jenis] || 'Nama akun';
    if (!sourceFormCustomIcon) refreshSourceFormIconPreview(jenis);
  });
});

function saveSourceForm() {
  if (!allowSubmit('saveSourceForm')) return;
  const name = document.getElementById('sourceFormName').value.trim();
  const saldoRaw = document.getElementById('sourceFormSaldo').value.replace(/[^\d]/g, '');
  const saldo = parseInt(saldoRaw || '0', 10);
  if (!name) { showToast('Nama sumber dana wajib diisi'); return; }

  const isInvest = sourceFormMode === 'invest';
  const jenisEl = document.querySelector('#sourceFormJenis .type-seg-item.active');
  const jenis = jenisEl ? jenisEl.dataset.jenis : 'rekening';
  const isInvestFinal = jenis === 'invest';
  const saldoLocked = isInvestFinal && !!sourceFormEditId;

  if (sourceFormEditId) {
    const s = sources.find(x => x.id === sourceFormEditId);
    if (s) {
      s.name = name;
      s.jenis = jenis;
      s.customIcon = sourceFormCustomIcon;
      if (!saldoLocked) {
        const delta = saldo - s.saldo;
        s.saldo = saldo;
        // Catat penyesuaian ke Riwayat kalau saldo benar-benar berubah,
        // supaya konsisten dengan Total Saldo dan tidak "menghilang" dari laporan.
        if (delta !== 0) {
          transactions.unshift({
            id: 'tx' + uniqueTick(),
            type: delta > 0 ? 'masuk' : 'keluar',
            amount: Math.abs(delta),
            category: 'Lainnya',
            sourceId: s.id,
            note: `Penyesuaian: Edit saldo ${s.name}`,
            date: todayISO(),
            time: nowTime(),
            isAdjustment: true
          });
          saveTransactions(transactions);
        }
      }
    }
    showToast('Sumber dana diperbarui');
  } else {
    const srcId = 's' + uniqueTick();
    sources.push({
      id: srcId,
      name, jenis, saldo,
      kategori: isInvestFinal ? 'invest' : 'liquid',
      customIcon: sourceFormCustomIcon
    });
    // Catat saldo awal sebagai transaksi, sama seperti alur onboarding,
    // supaya benar-benar muncul di Riwayat/Statistik, bukan cuma janji di toast.
    if (saldo > 0) {
      transactions.unshift({
        id: 'tx' + uniqueTick(),
        type: 'masuk',
        amount: saldo,
        category: 'Saldo Awal',
        sourceId: srcId,
        note: 'Saldo awal ' + name,
        date: todayISO(),
        time: nowTime(),
        isSaldoAwal: true
      });
      saveTransactions(transactions);
    }
    showToast('Sumber dana ditambahkan · Saldo awal tercatat');
  }
  saveSources(sources);
  renderAll();
  closeSourceForm();
}

// ======================================================
// SOURCE ACTION SHEET
// ======================================================
let sourceActionId = null;

function openSourceActionFor(id) {
  const s = sources.find(x => x.id === id);
  if (s) openSourceAction(s);
}

function openSourceAction(s) {
  sourceActionId = s.id;
  document.getElementById('sourceActionTitle').textContent = s.name;
  document.getElementById('sourceActionOverlay').classList.add('open');
}

function closeSourceAction() {
  document.getElementById('sourceActionOverlay').classList.remove('open');
}

function closeSourceActionOutside(e) {
  if (e.target.id === 'sourceActionOverlay') closeSourceAction();
}

function editSourceFromAction() {
  const s = sources.find(x => x.id === sourceActionId);
  closeSourceAction();
  if (s) openSourceForm(s.kategori === 'invest' ? 'invest' : 'liquid', s.id, s.jenis);
}

async function deleteSourceFromAction() {
  const s = sources.find(x => x.id === sourceActionId);
  closeSourceAction();
  if (!s) return;
  await confirmAndDeleteSource(s, () => renderAll());
}