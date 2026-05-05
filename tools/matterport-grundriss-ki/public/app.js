const $ = (id) => document.getElementById(id);

let selectedId = null;
let selectedName = null;
let lastResult = null;
let pendingCorrections = {};

const KATEGORIE_OPTIONS = [
  { key: 'wohnen', label: 'Wohnen' },
  { key: 'essen', label: 'Essen' },
  { key: 'kueche', label: 'Küche' },
  { key: 'wohnen_essen_kueche', label: 'Wohnen-Essen-Küche' },
  { key: 'schlafen', label: 'Schlafzimmer' },
  { key: 'kind', label: 'Kinderzimmer' },
  { key: 'buero', label: 'Büro / Arbeiten' },
  { key: 'bad', label: 'Bad' },
  { key: 'wc', label: 'WC' },
  { key: 'reduit', label: 'Reduit' },
  { key: 'wic', label: 'Ankleide / WIC' },
  { key: 'gang', label: 'Gang / Korridor' },
  { key: 'eingang', label: 'Eingang / Garderobe' },
  { key: 'terrasse', label: 'Terrasse' },
  { key: 'balkon', label: 'Balkon' },
  { key: 'patio', label: 'Patio' },
  { key: 'unbekannt', label: 'Unbekannt' },
];

async function loadHealth() {
  try {
    const r = await fetch('/api/health');
    const j = await r.json();
    const parts = [];
    parts.push(j.matterport ? 'Matterport: OK' : 'Matterport: Credentials fehlen');
    parts.push(j.anthropic ? 'Anthropic: OK' : 'Anthropic: KEY fehlt');
    $('health').textContent = parts.join(' · ');
  } catch {
    $('health').textContent = 'Server nicht erreichbar.';
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

function renderModels(models) {
  const ul = $('modelList');
  ul.innerHTML = '';
  for (const m of models) {
    const li = document.createElement('li');
    li.dataset.id = m.id;
    li.dataset.name = m.name || '';
    li.innerHTML = `<span>${escapeHtml(m.name || '(ohne Name)')}</span><span class="id">${escapeHtml(m.id)}</span>`;
    li.addEventListener('click', () => selectModel(m.id, m.name, li));
    ul.appendChild(li);
  }
}

function selectModel(id, name, liEl) {
  selectedId = id;
  selectedName = name || id;
  document.querySelectorAll('.model-list li').forEach((el) => el.classList.remove('active'));
  if (liEl) liEl.classList.add('active');
  $('selectedInfo').innerHTML = `Gewählt: <strong>${escapeHtml(name || id)}</strong> <span class="muted">(${escapeHtml(id)})</span>`;
  $('btnGenerate').disabled = false;
}

async function reloadList() {
  $('listStatus').textContent = 'Lade…';
  $('btnReload').disabled = true;
  try {
    const r = await fetch('/api/models');
    const j = await r.json();
    if (!j.ok) {
      $('listStatus').textContent = j.error || 'Fehler';
      return;
    }
    $('listStatus').textContent = `${j.models.length} Modelle.`;
    renderModels(j.models);
  } catch (e) {
    $('listStatus').textContent = e.message || String(e);
  } finally {
    $('btnReload').disabled = false;
  }
}

async function generate() {
  if (!selectedId) return;
  $('genStatus').textContent = 'KI arbeitet (Klassifikation + Validator-Agent, ~10–30 s)…';
  $('btnGenerate').disabled = true;
  $('output').innerHTML = '';
  try {
    const r = await fetch(`/api/models/${encodeURIComponent(selectedId)}/floorplans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const j = await r.json();
    if (!j.ok) {
      $('genStatus').textContent = j.error || 'Fehler';
      return;
    }
    $('genStatus').textContent = 'Fertig. Klicke auf einen Raum, um Name oder Typ zu korrigieren.';
    lastResult = j;
    pendingCorrections = {};
    renderResult(j);
  } catch (e) {
    $('genStatus').textContent = e.message || String(e);
  } finally {
    $('btnGenerate').disabled = false;
  }
}

function safeFilename(s) {
  return String(s || 'grundriss')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function svgToPng(svgString, scale = 2) {
  return new Promise((resolve, reject) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgEl = doc.documentElement;
    if (!svgEl.getAttribute('xmlns')) {
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }
    const vb = (svgEl.getAttribute('viewBox') || '0 0 1190 842').split(/\s+/).map(Number);
    const baseW = parseFloat(svgEl.getAttribute('width')) || vb[2] || 1190;
    const baseH = parseFloat(svgEl.getAttribute('height')) || vb[3] || 842;

    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(baseW * scale);
        canvas.height = Math.round(baseH * scale);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve({ dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function getCurrentSvgString(svgEl) {
  return new XMLSerializer().serializeToString(svgEl);
}

async function downloadJpeg(svgEl, baseName) {
  const xml = getCurrentSvgString(svgEl);
  const { dataUrl } = await svgToPng(xml, 2);
  const img = new Image();
  await new Promise((res, rej) => {
    img.onload = res;
    img.onerror = rej;
    img.src = dataUrl;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const jpeg = canvas.toDataURL('image/jpeg', 0.92);
  const a = document.createElement('a');
  a.href = jpeg;
  a.download = `${safeFilename(baseName)}.jpg`;
  a.click();
}

async function downloadPdf(svgEl, baseName) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('jsPDF konnte nicht geladen werden.');
    return;
  }
  const xml = getCurrentSvgString(svgEl);
  const { dataUrl, width, height } = await svgToPng(xml, 2);
  const isLandscape = width >= height;
  const pdf = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageW / width, pageH / height);
  const w = width * ratio;
  const h = height * ratio;
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
  pdf.save(`${safeFilename(baseName)}.pdf`);
}

async function downloadAllPdf(floorEls, baseName) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('jsPDF konnte nicht geladen werden.');
    return;
  }
  let pdf = null;
  for (const fEl of floorEls) {
    const svgEl = fEl.querySelector('svg');
    if (!svgEl) continue;
    const xml = getCurrentSvgString(svgEl);
    const { dataUrl, width, height } = await svgToPng(xml, 2);
    const isLandscape = width >= height;
    if (!pdf) {
      pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
      });
    } else {
      pdf.addPage('a4', isLandscape ? 'landscape' : 'portrait');
    }
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / width, pageH / height);
    const w = width * ratio;
    const h = height * ratio;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;
    pdf.addImage(dataUrl, 'PNG', x, y, w, h, undefined, 'FAST');
  }
  if (pdf) pdf.save(`${safeFilename(baseName)} - alle Etagen.pdf`);
}

function patchRoomLabel(svgEl, roomId, name) {
  const g = svgEl.querySelector(`g.room[data-room-id="${CSS.escape(roomId)}"]`);
  if (!g) return;
  const texts = g.querySelectorAll('text');
  if (texts[0]) texts[0].textContent = (name || 'RAUM').toUpperCase();
  g.dataset.roomName = (name || '').toUpperCase();
}

function buildKategorieSelect(current) {
  const sel = document.createElement('select');
  sel.id = 'editKategorie';
  for (const opt of KATEGORIE_OPTIONS) {
    const o = document.createElement('option');
    o.value = opt.key;
    o.textContent = opt.label;
    if (opt.key === current) o.selected = true;
    sel.appendChild(o);
  }
  return sel;
}

function openEditModal({ svgEl, roomId, currentName, currentKategorie }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Raum korrigieren</h3>
      <p class="muted">Diese Korrektur wird pro Modell gespeichert und beim nächsten Erzeugen automatisch angewandt.</p>
      <label>Name<br><input type="text" id="editName" value="${escapeHtml(currentName || '')}" maxlength="60" /></label>
      <label>Kategorie<br><span id="editKategorieWrap"></span></label>
      <div class="modal-actions">
        <button type="button" id="btnEditCancel">Abbrechen</button>
        <button type="button" id="btnEditReset" class="ghost">Korrektur löschen</button>
        <button type="button" id="btnEditSave" class="primary">Speichern</button>
      </div>
      <p id="editStatus" class="status"></p>
    </div>`;
  document.body.appendChild(overlay);
  const sel = buildKategorieSelect(currentKategorie || 'unbekannt');
  $('editKategorieWrap').appendChild(sel);
  $('editName').focus();
  $('editName').select();

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  $('btnEditCancel').addEventListener('click', close);

  $('btnEditReset').addEventListener('click', async () => {
    delete pendingCorrections[roomId];
    $('editStatus').textContent = 'Speichere…';
    try {
      await persistCorrections();
      $('editStatus').textContent = 'Korrektur gelöscht. Generiere zur Sicherheit neu, um die KI-Original-Klassifikation zu sehen.';
      setTimeout(close, 700);
    } catch (e) {
      $('editStatus').textContent = e.message || String(e);
    }
  });

  $('btnEditSave').addEventListener('click', async () => {
    const name = $('editName').value.trim().toUpperCase();
    const kategorie = sel.value;
    if (!name) {
      $('editStatus').textContent = 'Name darf nicht leer sein.';
      return;
    }
    pendingCorrections[roomId] = { name, kategorie };
    patchRoomLabel(svgEl, roomId, name);
    $('editStatus').textContent = 'Speichere…';
    try {
      await persistCorrections();
      $('editStatus').textContent = 'Gespeichert.';
      setTimeout(close, 400);
    } catch (e) {
      $('editStatus').textContent = e.message || String(e);
    }
  });
}

async function persistCorrections() {
  if (!selectedId) return;
  const existingResp = await fetch(`/api/models/${encodeURIComponent(selectedId)}/corrections`);
  const existingJson = await existingResp.json();
  const existing = (existingJson?.corrections?.rooms) || {};
  const merged = { ...existing, ...pendingCorrections };
  for (const id of Object.keys(pendingCorrections)) {
    if (pendingCorrections[id] === undefined) delete merged[id];
  }
  for (const [id, val] of Object.entries(pendingCorrections)) {
    if (!val) delete merged[id];
  }
  const r = await fetch(`/api/models/${encodeURIComponent(selectedId)}/corrections`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rooms: merged }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || 'Speichern fehlgeschlagen');
  pendingCorrections = {};
}

function attachRoomClickHandlers(svgEl) {
  const groups = svgEl.querySelectorAll('g.room[data-room-id]');
  groups.forEach((g) => {
    g.addEventListener('mouseenter', () => g.classList.add('hover'));
    g.addEventListener('mouseleave', () => g.classList.remove('hover'));
    g.addEventListener('click', () => {
      const roomId = g.getAttribute('data-room-id');
      const currentName = g.getAttribute('data-room-name') || '';
      const currentKategorie = g.getAttribute('data-room-kategorie') || 'unbekannt';
      openEditModal({ svgEl, roomId, currentName, currentKategorie });
    });
  });
}

function renderResult(j) {
  const out = $('output');
  const res = j.result;
  if (!res) {
    out.innerHTML = `<p class="muted">Keine Antwort.</p>`;
    return;
  }

  out.innerHTML = '';

  if (res.disclaimer) {
    const d = document.createElement('div');
    d.className = 'disclaimer';
    d.textContent = `${res.disclaimer}${j.quelle ? ` · Quelle: ${j.quelle}` : ''}`;
    out.appendChild(d);
  }

  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.textContent = 'Tipp: Klicke auf einen Raum im Plan, um Name oder Kategorie zu korrigieren. Die Korrekturen werden pro Modell gespeichert.';
  out.appendChild(hint);

  const allFloors = res.floors || [];
  const floorsWithErrors = allFloors.filter((f) => !f.svg);
  for (const fe of floorsWithErrors) {
    const block = document.createElement('div');
    block.className = 'floor-block';
    block.innerHTML = `<h3>${escapeHtml(fe.floorLabel || 'Etage')}</h3>
      <p class="muted">${escapeHtml(fe.notes || 'Fehler')}</p>
      ${fe.raw ? `<pre class="raw">${escapeHtml(fe.raw)}</pre>` : ''}`;
    out.appendChild(block);
  }

  const floors = allFloors.filter((f) => f && f.svg);
  const floorEls = [];

  if (floors.length > 1) {
    const bar = document.createElement('div');
    bar.className = 'actions';
    const baseAll = `${selectedName || 'Grundriss'}`;
    const btnAll = document.createElement('button');
    btnAll.type = 'button';
    btnAll.className = 'primary';
    btnAll.textContent = 'Alle Etagen als PDF';
    btnAll.addEventListener('click', () => downloadAllPdf(floorEls, baseAll));
    bar.appendChild(btnAll);
    out.appendChild(bar);
  }

  for (const f of floors) {
    const block = document.createElement('div');
    block.className = 'floor-block';

    const h = document.createElement('h3');
    h.textContent = f.floorLabel || 'Etage';
    block.appendChild(h);

    if (f.notes) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = f.notes;
      block.appendChild(p);
    }

    const wrap = document.createElement('div');
    wrap.className = 'svg-wrap';
    wrap.innerHTML = f.svg;
    block.appendChild(wrap);
    floorEls.push(wrap);

    const svgEl = wrap.querySelector('svg');
    if (svgEl) attachRoomClickHandlers(svgEl);

    const actions = document.createElement('div');
    actions.className = 'actions download-row';
    const base = `${selectedName || 'Grundriss'} - ${f.floorLabel || 'Etage'}`;

    const btnPdf = document.createElement('button');
    btnPdf.type = 'button';
    btnPdf.className = 'primary';
    btnPdf.textContent = 'PDF herunterladen';
    btnPdf.addEventListener('click', () => downloadPdf(svgEl, base));
    actions.appendChild(btnPdf);

    const btnJpg = document.createElement('button');
    btnJpg.type = 'button';
    btnJpg.textContent = 'JPEG herunterladen';
    btnJpg.addEventListener('click', () => downloadJpeg(svgEl, base));
    actions.appendChild(btnJpg);

    const btnRegen = document.createElement('button');
    btnRegen.type = 'button';
    btnRegen.className = 'ghost';
    btnRegen.textContent = 'Mit Korrekturen neu generieren';
    btnRegen.addEventListener('click', () => generate());
    actions.appendChild(btnRegen);

    block.appendChild(actions);
    out.appendChild(block);
  }

  if (!floors.length) {
    const pre = document.createElement('pre');
    pre.className = 'raw';
    pre.textContent = JSON.stringify(res, null, 2);
    out.appendChild(pre);
  }
}

$('btnReload').addEventListener('click', reloadList);
$('btnGenerate').addEventListener('click', generate);

loadHealth();
reloadList();
