(() => {
// ---- single-instance + top-window guard ----
if (window !== window.top) return;           // don't run in iframes
if (window.__POB_HTTP_CS__) return;          // already installed
window.__POB_HTTP_CS__ = true;

// ---------- API ----------
const API = {
  base: 'http://127.0.0.1:5000',
  async loadPoB(buildPath) {
    const res = await fetch(`${this.base}/load_pob`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: buildPath || null }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async itemImpact(itemText) {
    const res = await fetch(`${this.base}/item-impact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item: itemText }),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async listRunes(slotsCsv='') {
    if (!slotsCsv || !slotsCsv.trim()) return []; // no runes for this type
    const res = await fetch(`${this.base}/runes?slot=${encodeURIComponent(slotsCsv)}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  async listAmuletEnchants(q='') {
    const qp = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}&limit=25` : '?limit=25';
    const res = await fetch(`${this.base}/amulet-enchants${qp}`);
    if (!res.ok) throw new Error(await res.text());
    return res.json(); // [{id,text}]
  }
};

// ---------- Config ----------
const CFG_KEY = 'pobRuneCfg';
const DEFAULT_CFG = {
  enabled: false,
  perSocketEnabled: false,
  runeLine: '',
  perSocket: ['', '', '', '', '', ''],
  addMissingSockets: false,
  lastSlotsCsv: '',
  uiCollapsed: false,
  enchantEnabled: false,
  enchantText: '',
  enchantId: '',
  enchantRecent: []
};
let cfg = { ...DEFAULT_CFG };

function loadCfg() {
  return new Promise(resolve => {
    if (!chrome?.storage?.local) return resolve(cfg);
    chrome.storage.local.get([CFG_KEY], out => {
      if (out && out[CFG_KEY]) Object.assign(cfg, out[CFG_KEY]);
      resolve(cfg);
    });
  });
}
function saveCfg() { chrome?.storage?.local?.set({ [CFG_KEY]: cfg }); }

// ---------- Rune helpers ----------
const RUNE_CACHE = new Map();
function normSlotsCsv(slotsCsv) {
  return (slotsCsv || '').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean).sort().join(',');
}
async function ensureRunesFor(slotsCsv) {
  const key = normSlotsCsv(slotsCsv || '');
  if (!key) { RUNE_CACHE.set('', []); return []; }
  if (RUNE_CACHE.has(key)) return RUNE_CACHE.get(key);
  const list = await API.listRunes(key);
  const out = Array.isArray(list) ? list : Object.values(list || {}).flat();
  RUNE_CACHE.set(key, out);
  return out;
}
function normRuneText(s){ return (s || '').replace(/\s*\(rune\)\s*$/i,'').trim().toLowerCase(); }
function endsWithRune(s){ return /\(rune\)\s*$/i.test(s); }
function toRuneLine(s){ return endsWithRune(s) ? s : `${s} (rune)`; }
// ---------- Enchant helpers ----------
const ENCHANT_CACHE = new Map(); // key: query -> [{id,text}]
function debounce(fn, ms=200) { let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
async function ensureEnchants(q='') {
  const key = (q || '').trim().toLowerCase();
  if (ENCHANT_CACHE.has(key)) return ENCHANT_CACHE.get(key);
  const list = await API.listAmuletEnchants(key);
  ENCHANT_CACHE.set(key, list);
  return list;
}
function isAmuletItemText(itemText) {
  if (/^Item Class:\s*Amulet/m.test(itemText)) return true;
  const lines = (itemText || '').split('\n');
  const typeLine = (lines.find(l => l && !/^Rarity:|^Item Level:|^Requirements:|^Sockets:|^-{2,}$|^Implicits?:|^Influences?:/i.test(l)) || '').trim();
  if (/amulet/i.test(typeLine)) return true;
  return false;
}
function extractExistingEnchantLines(lines) {
  const out = [];
  for (let i=0;i<lines.length;i++){ if (/^Allocates\s+/i.test(lines[i])) out.push([lines[i], i]); }
  return out;
}
function setEnchantLine(lines, enchantText) {
  const sep = '--------';
  let iItem = lines.findIndex(l => /^Item Level:/i.test(l));
  let iReq  = lines.findIndex(l => /^Requires:/i.test(l));
  let insertAt = -1;
  if (iItem >= 0) insertAt = Math.max(0, iItem - 1);
  else if (iReq >= 0) insertAt = Math.max(0, iReq - 1);
  else insertAt = Math.max(0, lines.findIndex(l => l === sep));
  if (insertAt < 0) insertAt = Math.max(0, lines.length - 1);
  if (insertAt > 0 && lines[insertAt-1] !== sep) { lines.splice(insertAt, 0, sep); insertAt++; }
  lines.splice(insertAt, 0, enchantText); insertAt++;
  if (insertAt >= lines.length || lines[insertAt] !== sep) lines.splice(insertAt, 0, sep);
  return lines;
}
/** Apply global enchant selection. Returns { text, appliedText, mode } */
function applyEnchantOverride(itemText) {
  if (!cfg.enchantEnabled || !cfg.enchantText || !isAmuletItemText(itemText)) {
    return { text: itemText, appliedText: '', mode: '' };
  }
  const lines = itemText.split('\n');
  const existing = extractExistingEnchantLines(lines);
  for (const [, idx] of existing.reverse()) lines.splice(idx, 1);
  setEnchantLine(lines, (cfg.enchantText || '').trim());
  const mode = existing.length ? 'overridden' : 'added';
  return { text: lines.join('\n'), appliedText: (cfg.enchantText || '').trim(), mode };
}

function extractSockets(itemText) {
  const m = itemText.split('\n').find(l => l.startsWith('Sockets: '));
  if (!m) return 0;
  const parts = m.replace(/^Sockets:\s*/,'').trim().split(/\s+/).filter(Boolean);
  return parts.length;
}
function extractExistingRuneLines(lines) { return lines.filter(endsWithRune); }

function setSocketsLine(lines, targetCount) {
  const sep = '--------';
  const socketsLine = `Sockets: ${Array(targetCount).fill('S').join(' ')}`;
  let idx = lines.findIndex(l => l.startsWith('Sockets: '));
  if (idx >= 0) { lines[idx] = socketsLine; return lines; }
  let iItem = lines.findIndex(l => /^Item Level:/i.test(l));
  let iReq  = lines.findIndex(l => /^Requires:/i.test(l));
  let insertAt = -1;
  if (iItem >= 0) insertAt = Math.max(0, iItem - 1);
  else if (iReq >= 0) insertAt = iReq + 1;
  else insertAt = lines.length;
  if (insertAt <= 0 || lines[insertAt-1] !== sep) lines.splice(insertAt, 0, sep), insertAt++;
  lines.splice(insertAt, 0, socketsLine); insertAt++;
  if (insertAt >= lines.length || lines[insertAt] !== sep) lines.splice(insertAt, 0, sep);
  return lines;
}

// Apply overrides; returns { text, used: string[], targetSockets }
function applyRuneOverride(itemText, { sockets=0, maxSockets=0 } = {}) {
  const lines = itemText.split('\n');
  const existingRunes = extractExistingRuneLines(lines);
  const realSockets = sockets || extractSockets(itemText);
  const targetSockets = (cfg.addMissingSockets && maxSockets && maxSockets > realSockets) ? maxSockets : realSockets;
  if (targetSockets <= 0) { return { text: itemText, used: [], targetSockets: 0 }; }

  let replacements = [];
  if (cfg.perSocketEnabled) {
    for (let i = 0; i < targetSockets; i++) {
      let pick = (cfg.perSocket[i] || '').trim();
      if (!pick && cfg.enabled && cfg.runeLine) pick = cfg.runeLine.trim();
      if (!pick && existingRunes[i]) pick = existingRunes[i].replace(/\s*\(rune\)\s*$/,'');
      if (pick) replacements.push(toRuneLine(pick)); else replacements.push(null);
    }
  } else if (cfg.enabled) {
    const base = cfg.runeLine ? toRuneLine(cfg.runeLine.trim()) : null;
    for (let i = 0; i < targetSockets; i++) {
      let pick = base || existingRunes[i] || '';
      if (!endsWithRune(pick) && pick) pick = toRuneLine(pick);
      replacements.push(pick || null);
    }
  } else {
    return { text: itemText, used: [], targetSockets: realSockets };
  }

  if (targetSockets > realSockets) setSocketsLine(lines, targetSockets);
  replacements = replacements.slice(0, targetSockets);

  const sep = '--------';
  const runeIdxs = []; for (let i = 0; i < lines.length; i++) if (endsWithRune(lines[i])) runeIdxs.push(i);
  const used = replacements.filter(x => !!x);

  if (runeIdxs.length) {
    const first = runeIdxs[0], last = runeIdxs[runeIdxs.length - 1];
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      if (i === first) { if (used.length) out.push(...used); i = last; }
      else out.push(lines[i]);
    }
    return { text: out.join('\n'), used, targetSockets };
  } else {
    const out = [...lines];
    let insertAt = out.findIndex(l => /^Item Level:/i.test(l));
    if (insertAt < 0) insertAt = out.findIndex(l => /^Requires:/i.test(l));
    if (insertAt < 0) insertAt = out.findIndex(l => l === sep);
    if (insertAt < 0) insertAt = out.length - 1;
    if (used.length) out.splice(insertAt + 1, 0, sep, ...used);
    return { text: out.join('\n'), used, targetSockets };
  }
}

// ---------- UI + injection ----------
let script = null;
let autoEnabled = true;
let currentRuneList = [];
let typeLbl = null;

function injectCode() {
  if (document.documentElement.dataset.pobInjected === '1') {
    // already injected
  } else {
    script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/trade-injected.js');
    script.setAttribute('enabled', String(autoEnabled));
    document.documentElement.appendChild(script);
  }
}

function darkerSelect(el) {
  el.style.cssText = 'max-width:460px;background:#0b0b0b;border:1px solid #333;border-radius:8px;padding:6px 8px;color:#fff;';
}

function makeControl() {
  for (const old of document.querySelectorAll('#pob-http-bar')) old.remove();

  const bar = document.createElement('div');
  bar.id = 'pob-http-bar';
  bar.style.cssText = `position:fixed;z-index:99999;top:8px;left:8px;right:auto;background:#111a;
    backdrop-filter: blur(4px);padding:10px 12px;border-radius:12px;font:13px/1.3 system-ui;
    color:#eee;display:flex;gap:12px;align-items:flex-start;`;

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-items:flex-start;min-width:32px;';
  const toggleBtn = document.createElement('button');
  toggleBtn.title = 'Minimize / Expand';
  toggleBtn.textContent = cfg.uiCollapsed ? '▸' : '▾';
  toggleBtn.style.cssText = 'width:28px;height:28px;border-radius:8px;border:1px solid #333;background:#1c1c1c;color:#ddd;cursor:pointer;';
  head.append(toggleBtn);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;gap:12px;align-items:flex-start;';
  body.style.display = cfg.uiCollapsed ? 'none' : '';

  toggleBtn.onclick = () => {
    cfg.uiCollapsed = !cfg.uiCollapsed;
    body.style.display = cfg.uiCollapsed ? 'none' : '';
    toggleBtn.textContent = cfg.uiCollapsed ? '▸' : '▾';
    saveCfg();
  };

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'PoB build path or share code';
  input.style.cssText = 'min-width:320px;background:#000;border:1px solid #333;border-radius:8px;padding:6px 8px;color:#fff;';
  input.id = 'pob-build-input';

  const btn = document.createElement('button');
  btn.textContent = 'Load PoB';
  btn.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid #333;background:#1c1c1c;color:#fff;cursor:pointer;';
  btn.onclick = async () => {
    try {
      btn.disabled = true; btn.textContent = 'Loading…';
      await API.loadPoB(input.value || null);
      btn.textContent = 'Loaded ✓';
      setTimeout(() => (btn.textContent = 'Load PoB', btn.disabled = false), 1000);
      injectCode();
    } catch (e) {
      console.error(e);
      alert('PoB load failed:\n' + (''+e).slice(0, 500));
      btn.textContent = 'Load PoB'; btn.disabled = false;
    }
  };

  const toggleAuto = document.createElement('input');
  toggleAuto.type = 'checkbox';
  toggleAuto.checked = autoEnabled;
  toggleAuto.onchange = () => {
    autoEnabled = toggleAuto.checked;
    window.top.postMessage({ message: 'toggle', enabled: autoEnabled }, '*');
  };
  const tlab = document.createElement('label');
  tlab.textContent = 'Auto Impact';
  tlab.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer;color:#ddd;';
  tlab.prepend(toggleAuto);

  const box = document.createElement('div');
  box.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:6px 8px;border-left:1px dashed #333;min-width:520px;';

  const m1 = document.createElement('label');
  m1.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const m1Check = document.createElement('input');
  m1Check.type = 'checkbox';
  m1Check.checked = cfg.enabled;
  m1Check.onchange = () => {
    cfg.enabled = m1Check.checked;
    if (cfg.enabled) { cfg.perSocketEnabled = false; psCheck.checked = false; }
    saveCfg();
  };
  m1.append(m1Check, document.createTextNode('Override/fill all sockets with chosen rune'));

  const row2 = document.createElement('div');
  row2.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';

  const typeLbl = document.createElement('div');
  typeLbl.id = 'pob-type-label';
  typeLbl.textContent = 'Current item type: —';
  typeLbl.style.cssText = 'opacity:.8;margin:2px 0 2px 2px;';
  row2.append(typeLbl);

  const ddl = document.createElement('select');
  darkerSelect(ddl);
  const opt0 = document.createElement('option'); opt0.value = ''; opt0.textContent = '— pick a rune from PoB —';
  ddl.append(opt0);
  ddl.onchange = () => {
    if (ddl.value) { cfg.runeLine = ddl.value; saveCfg(); lineInp.value = cfg.runeLine; }
  };
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Reload runes';
  refreshBtn.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid #333;background:#1c1c1c;color:#fff;cursor:pointer;';
  refreshBtn.onclick = async () => {
    refreshBtn.disabled = true; refreshBtn.textContent = 'Loading…';
    try {
      currentRuneList = await ensureRunesFor(cfg.lastSlotsCsv || '');
      ddl.length = 0; ddl.append(opt0);
      for (const m of currentRuneList) {
        const o = document.createElement('option'); o.value = m; o.textContent = m;
        ddl.append(o);
      }
      updatePerSocketOptions(currentRuneList);
    } finally {
      refreshBtn.textContent = 'Reload runes'; refreshBtn.disabled = false;
    }
  };

  const lineRow = document.createElement('div');
  lineRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
  const lineInp = document.createElement('input');
  lineInp.type = 'text';
  lineInp.placeholder = `e.g. 20% increased Attack Speed (rune)`;
  lineInp.value = cfg.runeLine;
  lineInp.style.cssText = 'min-width:420px;background:#000;border:1px solid #333;border-radius:8px;padding:6px 8px;color:#fff;';
  lineInp.oninput = () => { cfg.runeLine = lineInp.value; saveCfg(); };

  const psRow0 = document.createElement('label');
  psRow0.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const psCheck = document.createElement('input');
  psCheck.type = 'checkbox';
  psCheck.checked = cfg.perSocketEnabled;
  psCheck.onchange = () => {
    cfg.perSocketEnabled = psCheck.checked;
    if (cfg.perSocketEnabled) { cfg.enabled = false; m1Check.checked = false; }
    psPanel.style.display = cfg.perSocketEnabled ? '' : 'none';
    saveCfg();
  };
  psRow0.append(psCheck, document.createTextNode('Override/fill sockets with per-socket choices'));

  const psPanel = document.createElement('div');
  psPanel.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
  psPanel.style.display = cfg.perSocketEnabled ? '' : 'none';
  const socketSelects = [];
  function addSocketRow(idx){
    const r = document.createElement('div');
    r.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
    const label = document.createElement('div');
    label.textContent = `Socket ${idx+1}:`;
    label.style.minWidth = '80px';
    const sel = document.createElement('select');
    darkerSelect(sel);
    const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— none —';
    sel.append(blank);
    sel.onchange = () => { cfg.perSocket[idx] = sel.value; saveCfg(); };
    sel.value = cfg.perSocket[idx] || '';
    const free = document.createElement('input');
    free.type = 'text';
    free.placeholder = 'custom rune text';
    free.value = cfg.perSocket[idx] || '';
    free.style.cssText = 'min-width:320px;background:#000;border:1px solid #333;border-radius:8px;padding:6px 8px;color:#fff;';
    free.oninput = () => { cfg.perSocket[idx] = free.value; saveCfg(); sel.value = ''; };
    r.append(label, sel, free);
    psPanel.append(r);
    socketSelects.push(sel);
  }
  for (let i=0;i<6;i++) addSocketRow(i);

  function updatePerSocketOptions(list){
    for (const sel of socketSelects) {
      const keep = sel.value;
      sel.length = 0;
      const blank = document.createElement('option'); blank.value = ''; blank.textContent = '— none —';
      sel.append(blank);
      for (const m of list) {
        const o = document.createElement('option'); o.value = m; o.textContent = m;
        sel.append(o);
      }
      sel.value = keep && list.includes(keep) ? keep : '';
    }
  }

  const addRow = document.createElement('label');
  addRow.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const addCheck = document.createElement('input');
  addCheck.type = 'checkbox';
  addCheck.checked = cfg.addMissingSockets;
  addCheck.onchange = () => { cfg.addMissingSockets = addCheck.checked; saveCfg(); };
  addRow.append(addCheck, document.createTextNode('Add missing sockets up to standard max'));

  row2.append(ddl, refreshBtn);
  lineRow.append(document.createTextNode('Rune line:'), lineInp);
  
  // --- Enchant row (global) ---
  const enchRow = document.createElement('div');
  enchRow.style.cssText = 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
  const enchLbl = document.createElement('label');
  enchLbl.style.cssText = 'display:flex;gap:6px;align-items:center;';
  const enchCheck = document.createElement('input');
  enchCheck.type = 'checkbox';
  enchCheck.checked = cfg.enchantEnabled;
  enchCheck.onchange = () => { cfg.enchantEnabled = enchCheck.checked; saveCfg(); };
  const enchTextNode = document.createTextNode('Override/Add enchant to Amulet');
  enchLbl.append(enchCheck, enchTextNode);
  const enchInp = document.createElement('input');
  enchInp.type = 'search';
  enchInp.placeholder = 'Type to search amulet enchant…';
  enchInp.style.cssText = 'min-width:260px;max-width:460px;background:#000;border:1px solid #333;border-radius:8px;padding:6px 8px;color:#fff;';
  enchInp.value = cfg.enchantText || '';
  const enchList = document.createElement('datalist');
  const enchListId = 'pob-amulet-enchants';
  enchList.id = enchListId;
  enchInp.setAttribute('list', enchListId);
  let lastSearchMap = new Map(); // text -> id
  const updateEnchOptions = debounce(async () => {
    const q = enchInp.value || '';
    let list = [];
    try { list = await ensureEnchants(q); } catch (e) {}
    enchList.innerHTML = '';
    lastSearchMap = new Map();
    for (const it of list) {
      const opt = document.createElement('option');
      opt.value = it.text;
      enchList.append(opt);
      lastSearchMap.set(it.text, it.id);
    }
  }, 200);
  enchInp.addEventListener('input', () => {
    updateEnchOptions();
    const txt = (enchInp.value || '').trim();
    if (lastSearchMap.has(txt)) {
      cfg.enchantText = txt;
      cfg.enchantId = lastSearchMap.get(txt) || '';
      cfg.enchantRecent = [txt, ...(cfg.enchantRecent || [])].filter((v,i,a)=>a.indexOf(v)===i).slice(0,5);
      saveCfg();
    }
  });
  updateEnchOptions();
  enchRow.append(enchLbl, enchInp, enchList);
box.append(m1, row2, lineRow, psRow0, psPanel, addRow, enchRow);

  const leftCol = document.createElement('div');
  leftCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
  leftCol.append(input, btn, tlab);

  body.append(leftCol, box);
  bar.append(head, body);
  document.body.appendChild(bar);
}

// Listen for messages; apply overrides per item, preview + send
window.addEventListener('message', async e => {
  if (!e || !e.data || e.source !== window) return;
  if (e.data.message === 'get_item_impact') {
    if (!autoEnabled) return;
    try {
      const sockets = Number(e.data.sockets || 0) || 0;
      const maxSockets = Number(e.data.maxSockets || 0) || 0;
      const runeslots = (e.data.runeSlots || '');
      const typeLabel = e.data.itemTypeLabel || (runeslots || '—');
      cfg.lastSlotsCsv = runeslots;

      const t = document.getElementById('pob-type-label');
      if (t) t.textContent = 'Current item type: ' + typeLabel;

      try { currentRuneList = await ensureRunesFor(runeslots); } catch { currentRuneList = []; }

      let { text: itemTextAfter, used, targetSockets } = applyRuneOverride(e.data.item, { sockets, maxSockets });

      let __enchRes = applyEnchantOverride(itemTextAfter);
itemTextAfter = __enchRes.text;

let __enchantPreviewHtml = '';
if (__enchRes && __enchRes.appliedText) {
  const __modeLabel = __enchRes.mode === 'overridden' ? '(replaced existing)' : '(added)';
  __enchantPreviewHtml = `<div class="rune_preview_box" style="margin-top:6px;padding:8px;border:1px solid #333;background:#121212;border-radius:8px;">
    <div style="opacity:.8;margin-bottom:4px;">Amulet enchant ${__modeLabel}</div>
    <div style="white-space:pre-wrap">${__enchRes.appliedText}</div>
  </div>`;
}
let incompatible = false;
      if (used && used.length) {
        if (!Array.isArray(currentRuneList) || currentRuneList.length === 0) {
          incompatible = true;
        } else {
          const allowed = new Set(currentRuneList.map(normRuneText));
          for (const u of used) { if (!allowed.has(normRuneText(u))) { incompatible = true; break; } }
        }
      }

      const previewMeta = [];
      if (cfg.addMissingSockets && maxSockets > sockets) previewMeta.push(`(+${maxSockets - sockets} sockets)`);
      const metaStr = previewMeta.length ? ` <span style="opacity:.7">${previewMeta.join(' ')}</span>` : '';

      let warn = '';
      if (incompatible) {
        warn = `<div style="color:#ff6666;margin:0 0 6px 0;font-weight:600;">wrong item type — please click “Reload runes” and search again</div>`;
      }

      if (used && used.length) {
        const html = `<div class="rune_preview_box" style="margin-bottom:6px;padding:6px 8px;border:1px solid #333;background:#121212;border-radius:8px;">
          ${warn}
          <div style="opacity:.8;margin-bottom:4px;">Runes applied (${used.length}/${targetSockets})${metaStr}</div>
          <div>${used.map(s => `<div style="white-space:pre-wrap">${s}</div>`).join('')}</div>
        </div>`;
        window.top.postMessage({ message: 'set_rune_preview', dataId: e.data.dataId, html: (html + __enchantPreviewHtml) }, '*');
      } else {
        window.top.postMessage({ message: 'set_rune_preview', dataId: e.data.dataId, html: incompatible ? `<div class="rune_preview_box" style="margin-bottom:6px;padding:6px 8px;border:1px solid #333;background:#121212;border-radius:8px;">${warn}</div>` : '' }, '*');
        if (__enchantPreviewHtml) { window.top.postMessage({ message: 'set_rune_preview', dataId: e.data.dataId, html: __enchantPreviewHtml }, '*'); }

      }

      const res = await API.itemImpact(itemTextAfter);
      window.top.postMessage({ message: 'set_item_impact', dataId: e.data.dataId, itemImpact: res.html }, '*');
    } catch (err) {
      window.top.postMessage({ message: 'set_item_impact', dataId: e.data.dataId, itemImpact: '<span style="color:#f55">HTTP error</span>' }, '*');
    }
  }
}, false);

// init
loadCfg().then(async () => {
  try { await ensureRunesFor(cfg.lastSlotsCsv || ''); } catch {}
  makeControl();
  injectCode();
});
})();