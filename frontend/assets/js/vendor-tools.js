/* ======================================================
   SELL4LIFE — VENDOR TOOLS  (Image Converter)
====================================================== */

const HEIC_CDN = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';

let _fmt     = 'image/jpeg';
let _quality = 0.85;

/* ── HEIC loader (lazy) ────────────────────────────── */

async function loadHeic2Any() {
  if (window.heic2any) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = HEIC_CDN;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load HEIC library'));
    document.head.appendChild(s);
  });
}

/* ── Helpers ─────────────────────────────────────── */

function fmtExt(mime) {
  return { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[mime] || 'jpg';
}

function fmtSize(bytes) {
  if (bytes < 1024)         return bytes + ' B';
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function baseName(file) {
  return file.name.replace(/\.[^.]+$/, '');
}

function isHeic(file) {
  return (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.heic$|\.heif$/i.test(file.name)
  );
}

/* ── Convert single file ─────────────────────────── */

async function convertFile(file) {
  let blob = file;

  if (isHeic(file)) {
    await loadHeic2Any();
    const result = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 1 });
    blob = Array.isArray(result) ? result[0] : result;
  }

  const blobUrl = URL.createObjectURL(blob);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = blobUrl; });

  const canvas = document.createElement('canvas');
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');

  if (_fmt !== 'image/png') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(blobUrl);

  return new Promise((res) => canvas.toBlob(res, _fmt, _quality));
}

/* ── Process a batch of files ────────────────────── */

async function processFiles(files) {
  const results = document.getElementById('tool-results');
  const clearBtn = document.getElementById('tool-clear-all');
  if (!results) return;

  if (clearBtn) clearBtn.style.display = '';

  for (const file of files) {
    const card = document.createElement('div');
    card.className = 'tool-rc';
    card.innerHTML = `
      <div class="tool-rc-pending">
        <span class="vp-bulk-spinner"></span>
        <span class="tool-rc-fname">${file.name}</span>
      </div>`;
    results.prepend(card);

    try {
      const outBlob  = await convertFile(file);
      const outUrl   = URL.createObjectURL(outBlob);
      const outName  = `${baseName(file)}.${fmtExt(_fmt)}`;
      const saved    = file.size - outBlob.size;
      const savedPct = Math.round((saved / file.size) * 100);

      card.innerHTML = `
        <img src="${outUrl}" class="tool-rc-img" alt="" />
        <div class="tool-rc-info">
          <div class="tool-rc-fname">${outName}</div>
          <div class="tool-rc-meta">
            <span class="tool-rc-orig">${fmtSize(file.size)}</span>
            <span class="tool-rc-arrow">→</span>
            <span class="tool-rc-new">${fmtSize(outBlob.size)}</span>
            ${saved > 0 ? `<span class="tool-rc-saved">−${savedPct}%</span>` : ''}
          </div>
          <a href="${outUrl}" download="${outName}" class="tool-rc-dl">↓ Download</a>
        </div>`;
    } catch (err) {
      console.error('Conversion error:', err);
      card.innerHTML = `
        <div class="tool-rc-pending">
          <span class="tool-rc-fname">${file.name}</span>
          <span class="tool-rc-err">Could not convert — format may not be supported</span>
        </div>`;
    }
  }
}

/* ── Drop zone ───────────────────────────────────── */

function bindDropZone() {
  const zone  = document.getElementById('tool-drop-zone');
  const input = document.getElementById('tool-file-input');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const files = [...e.dataTransfer.files].filter(
      (f) => f.type.startsWith('image/') || /\.heic$|\.heif$/i.test(f.name)
    );
    if (files.length) processFiles(files);
  });

  input.addEventListener('change', () => {
    const files = [...input.files];
    if (files.length) { processFiles(files); input.value = ''; }
  });
}

/* ── Format + quality controls ───────────────────── */

function bindOptions() {
  document.querySelectorAll('.tool-fmt-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-fmt-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      _fmt = btn.dataset.fmt;
      const qWrap = document.getElementById('tool-quality-wrap');
      if (qWrap) qWrap.style.display = _fmt === 'image/png' ? 'none' : '';
    });
  });

  const slider = document.getElementById('tool-quality');
  const label  = document.getElementById('tool-quality-val');
  slider?.addEventListener('input', () => {
    _quality = parseInt(slider.value, 10) / 100;
    if (label) label.textContent = slider.value;
  });
}

/* ── Clear all ───────────────────────────────────── */

function bindClear() {
  document.getElementById('tool-clear-all')?.addEventListener('click', () => {
    const results = document.getElementById('tool-results');
    if (results) results.innerHTML = '';
    document.getElementById('tool-clear-all').style.display = 'none';
  });
}

/* ── Init ────────────────────────────────────────── */

bindDropZone();
bindOptions();
bindClear();

/* ══════════════════════════════════════════════════
   SPREADSHEET → CSV CONVERTER
══════════════════════════════════════════════════ */

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

async function loadXLSX() {
  if (window.XLSX) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = XLSX_CDN;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Failed to load XLSX library'));
    document.head.appendChild(s);
  });
}

/* ── Field definitions ───────────────────────────── */

const S4L_FIELDS = [
  { key: 'name',         label: 'Product Name',        required: true  },
  { key: 'variant',      label: 'Variant (Color/Size)', required: false },
  { key: 'price',        label: 'Price (£)',            required: true  },
  { key: 'comparePrice', label: 'Compare Price',        required: false },
  { key: 'shippingCost', label: 'Shipping Cost',        required: false },
  { key: 'stock',        label: 'Stock / Qty',          required: false },
  { key: 'category',     label: 'Category',             required: false },
  { key: 'subcategory',  label: 'Subcategory',          required: false },
  { key: 'sku',          label: 'SKU',                  required: false },
  { key: 'description',  label: 'Description',          required: false },
  { key: 'image1',       label: 'Image 1 URL',          required: false },
  { key: 'image2',       label: 'Image 2 URL',          required: false },
];

const AUTO_HINTS = {
  name:         ['name','product name','title','product title','item name','item','product'],
  price:        ['price','sale price','unit price','selling price','retail'],
  comparePrice: ['compare price','compare at price','original price','was','rrp','msrp','was price'],
  shippingCost: ['shipping','shipping cost','delivery','postage','freight','ship cost'],
  stock:        ['stock','quantity','qty','inventory','available','units'],
  category:     ['category','cat','type','product type','department'],
  subcategory:  ['subcategory','sub category','sub-category','subtype','subcategory'],
  sku:          ['sku','product code','item code','barcode','upc','isbn','ref','product id'],
  description:  ['description','desc','details','product description','body','notes','overview','long description'],
  image1:       ['image','image1','image 1','image url','photo','picture','img','main image','thumbnail'],
  variant:      ['variant','variation','option','color','colour','size','style'],
  image2:       ['image2','image 2','photo2','picture2','secondary image','image url 2'],
};

/* ── State ───────────────────────────────────────── */

let _wb       = null;  // workbook
let _headers  = [];    // column headers from selected sheet
let _rows     = [];    // data rows (array of objects)
let _mapping  = {};    // { s4l_key: 'ExcelColumnHeader' }

/* ── Auto-detect column mapping ──────────────────── */

function autoDetect(headers) {
  const lower = headers.map(h => String(h).toLowerCase().trim());
  const map = {};
  S4L_FIELDS.forEach(({ key }) => {
    for (const hint of (AUTO_HINTS[key] || [])) {
      const i = lower.indexOf(hint);
      if (i !== -1) { map[key] = headers[i]; break; }
    }
  });
  return map;
}

/* ── Price calculator ────────────────────────────── */

function getCurrencyRate() {
  const sel = document.getElementById('csv-currency');
  if (!sel) return 1;
  if (sel.value === 'custom') {
    return parseFloat(document.getElementById('csv-custom-rate')?.value) || 1;
  }
  return parseFloat(sel.value) || 1;
}

function getMarkup() {
  return parseFloat(document.getElementById('csv-markup')?.value) || 0;
}

function applyPriceCalc(rawVal) {
  const num = parseFloat(String(rawVal).replace(/[^0-9.-]/g, ''));
  if (isNaN(num) || num === 0) return '';
  const rate   = getCurrencyRate();
  const markup = getMarkup();
  return (num * rate * (1 + markup / 100)).toFixed(2);
}

function updateCalcExample() {
  const el = document.getElementById('csv-calc-example');
  if (!el) return;
  const col = _mapping['price'];
  if (!col || !_rows.length) { el.textContent = ''; return; }
  const sample = _rows[0][col];
  const raw = parseFloat(String(sample).replace(/[^0-9.-]/g, ''));
  if (isNaN(raw)) { el.textContent = ''; return; }
  const result = applyPriceCalc(sample);
  const rate   = getCurrencyRate();
  const markup = getMarkup();
  const parts  = [];
  if (rate !== 1) parts.push(`× ${rate} (rate)`);
  if (markup)     parts.push(`× ${(1 + markup / 100).toFixed(2)} (markup)`);
  el.innerHTML = `e.g. <span class="csv-calc-from">${raw}</span> → <span class="csv-calc-to">£${result}</span>${parts.length ? ` <span class="csv-calc-steps">(${parts.join(' ')})</span>` : ''}`;
}

function bindPriceCalc() {
  document.getElementById('csv-currency')?.addEventListener('change', (e) => {
    const wrap = document.getElementById('csv-custom-rate-wrap');
    if (wrap) wrap.style.display = e.target.value === 'custom' ? '' : 'none';
    updateCalcExample();
    renderPreview();
  });
  document.getElementById('csv-custom-rate')?.addEventListener('input', () => { updateCalcExample(); renderPreview(); });
  document.getElementById('csv-markup')?.addEventListener('input', () => { updateCalcExample(); renderPreview(); });
}

function togglePriceCalc() {
  const wrap = document.getElementById('csv-price-calc');
  if (wrap) wrap.style.display = _mapping['price'] ? '' : 'none';
  updateCalcExample();
}

/* ── Load sheet from workbook ────────────────────── */

function loadSheet(sheetName) {
  if (!_wb) return;
  const ws = _wb.Sheets[sheetName];
  const raw = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Find first non-empty row as headers
  let headerRow = 0;
  while (headerRow < raw.length && raw[headerRow].every(c => c === '')) headerRow++;
  if (headerRow >= raw.length) { _headers = []; _rows = []; return; }

  _headers = raw[headerRow].map(h => String(h).trim()).filter(Boolean);

  // Data rows: skip empty rows
  _rows = raw.slice(headerRow + 1)
    .filter(r => r.some(c => c !== ''))
    .map(r => {
      const obj = {};
      _headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? r[i] : ''; });
      return obj;
    });

  _mapping = autoDetect(_headers);
  renderMapper();
  renderPreview();
  showActions();
}

/* ── Parse uploaded file ─────────────────────────── */

async function parseFile(file) {
  await loadXLSX();
  const buf = await file.arrayBuffer();
  _wb = window.XLSX.read(buf, { type: 'array' });

  const sheetNames = _wb.SheetNames;

  // Info bar
  document.getElementById('csv-info-bar').style.display = '';
  document.getElementById('csv-file-name').textContent = file.name;

  // Sheet selector
  const sheetLabel  = document.getElementById('csv-sheet-label');
  const sheetSelect = document.getElementById('csv-sheet-select');
  if (sheetNames.length > 1) {
    sheetLabel.style.display = '';
    sheetSelect.innerHTML = sheetNames.map(n => `<option value="${n}">${n}</option>`).join('');
    sheetSelect.onchange = () => loadSheet(sheetSelect.value);
  } else {
    sheetLabel.style.display = 'none';
  }

  loadSheet(sheetNames[0]);
}

/* ── Render column mapper ────────────────────────── */

function renderMapper() {
  const grid = document.getElementById('csv-mapper');
  const inner = document.getElementById('csv-mapper-grid');
  if (!grid || !inner) return;

  const opts = ['', ..._headers].map(h =>
    `<option value="${h}">${h || '— Skip —'}</option>`
  ).join('');

  inner.innerHTML = S4L_FIELDS.map(({ key, label, required }) => `
    <div class="csv-map-row">
      <label class="csv-map-label">
        ${label}${required ? '<span class="csv-required-mark"> *</span>' : ''}
      </label>
      <select class="csv-map-select" data-key="${key}">
        ${opts}
      </select>
      <span class="csv-map-preview" id="csv-mp-${key}"></span>
    </div>
  `).join('');

  // Apply auto-detected values
  inner.querySelectorAll('.csv-map-select').forEach(sel => {
    const key = sel.dataset.key;
    if (_mapping[key]) sel.value = _mapping[key];
    sel.addEventListener('change', () => {
      _mapping[key] = sel.value;
      updateMapPreview(key);
      if (key === 'price') togglePriceCalc();
      renderPreview();
    });
    updateMapPreview(key);
  });

  grid.style.display = '';
  togglePriceCalc();
}

function updateMapPreview(key) {
  const el = document.getElementById(`csv-mp-${key}`);
  if (!el) return;
  const col = _mapping[key];
  const sample = col && _rows.length ? String(_rows[0][col] || '').slice(0, 40) : '';
  el.textContent = sample ? `e.g. ${sample}` : '';
}

/* ── Render preview table ────────────────────────── */

function renderPreview() {
  const wrap  = document.getElementById('csv-preview-wrap');
  const table = document.getElementById('csv-preview-table');
  const label = document.getElementById('csv-preview-label');
  if (!wrap || !table) return;

  const mapped = S4L_FIELDS.filter(f => _mapping[f.key]);
  if (!mapped.length) { wrap.style.display = 'none'; return; }

  const preview = _rows.slice(0, 5);
  const thead = `<thead><tr>${mapped.map(f => `<th>${f.label}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${preview.map(row =>
    `<tr>${mapped.map(f => {
      const raw = String(row[_mapping[f.key]] ?? '');
      const val = f.key === 'price' ? (applyPriceCalc(raw) || raw) : raw;
      return `<td>${escCsv(val)}</td>`;
    }).join('')}</tr>`
  ).join('')}</tbody>`;

  table.innerHTML = thead + tbody;
  if (label) label.textContent = `(first ${preview.length} of ${_rows.length} rows)`;
  wrap.style.display = '';
}

/* ── Show actions + row count ────────────────────── */

function showActions() {
  document.getElementById('csv-row-count').textContent = `${_rows.length} rows`;
  document.getElementById('csv-actions').style.display = '';
}

/* ── Generate + download CSV ─────────────────────── */

function escCsv(val) {
  const s = String(val).replace(/"/g, '""');
  return /[,"\n\r]/.test(s) ? `"${s}"` : s;
}

function generateCSV() {
  const fields = S4L_FIELDS.map(f => f.key);
  const header = fields.join(',');
  const dataRows = _rows.map(row =>
    fields.map(key => {
      const col = _mapping[key];
      if (!col) return '';
      const raw = String(row[col] ?? '');
      return escCsv(key === 'price' ? (applyPriceCalc(raw) || raw) : raw);
    }).join(',')
  );
  return [header, ...dataRows].join('\n');
}

function downloadCSV() {
  // Validate required fields
  const missing = S4L_FIELDS.filter(f => f.required && !_mapping[f.key]).map(f => f.label);
  if (missing.length) {
    window.showToast?.(`Map required fields first: ${missing.join(', ')}`, 'error');
    return;
  }
  const csv  = generateCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'sell4life-import.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Reset ───────────────────────────────────────── */

function resetCsv() {
  _wb = null; _headers = []; _rows = []; _mapping = {};
  document.getElementById('csv-info-bar').style.display    = 'none';
  document.getElementById('csv-mapper').style.display      = 'none';
  document.getElementById('csv-price-calc').style.display  = 'none';
  document.getElementById('csv-preview-wrap').style.display = 'none';
  document.getElementById('csv-actions').style.display     = 'none';
  document.getElementById('csv-mapper-grid').innerHTML     = '';
  document.getElementById('csv-preview-table').innerHTML   = '';
  document.getElementById('csv-file-input').value          = '';
}

/* ── Bind CSV drop zone ──────────────────────────── */

function bindCsvDropZone() {
  const zone  = document.getElementById('csv-drop-zone');
  const input = document.getElementById('csv-file-input');
  if (!zone || !input) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file).catch(err => window.showToast?.(err.message, 'error'));
  });
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) parseFile(file).catch(err => window.showToast?.(err.message, 'error'));
  });

  document.getElementById('csv-download-btn')?.addEventListener('click', downloadCSV);
  document.getElementById('csv-reset-btn')?.addEventListener('click', resetCsv);

  document.querySelector('.csv-go-import')?.addEventListener('click', (e) => {
    e.preventDefault();
    const missing = S4L_FIELDS.filter(f => f.required && !_mapping[f.key]).map(f => f.label);
    if (missing.length) {
      window.showToast?.(`Map required fields first: ${missing.join(', ')}`, 'error');
      return;
    }
    sessionStorage.setItem('s4l_pending_csv', generateCSV());
    window.location.href = '/account/vendor/products.html';
  });
}

bindCsvDropZone();
bindPriceCalc();
