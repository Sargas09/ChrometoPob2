(() => {
  if (document.documentElement.dataset.pobInjected === '1') return;
  document.documentElement.dataset.pobInjected = '1';

  let itemByDataId = {};
  let enabled = document.currentScript.getAttribute('enabled') == 'true';

  function textContent(el) { return el ? el.textContent.trim() : ''; }
  function propLine(propNode) {
    if (!propNode) return null;
    const label = textContent(propNode.querySelector(':scope > span:first-child'));
    const val   = textContent(propNode.querySelector(':scope > span:nth-child(2)'));
    if (!label) return null;
    const isAug = !!propNode.querySelector('.colourAugmented');
    const aug = isAug ? ' (augmented)' : '';
    return val ? `${label} ${val}${aug}` : label;
  }

  // --- Item typing helpers (strict mapping from user) ---
  const IC = {
    HELMET: 'helmet', BOOTS: 'boots', GLOVES: 'gloves', BODY: 'body armour',
    WEAPON: 'weapon', CASTER: 'caster', BOW: 'bow', SCEPTRE: 'sceptre',
    ARMOUR: 'armour', FOCUS: 'focus', SHIELD: 'shield', CROSSBOW: 'crossbow'
  };
  // Which Item Class names imply which rune buckets
  function runeBucketsForItemClass(itemClassSingle) {
    const s = (itemClassSingle || '').toLowerCase();
    const buckets = new Set();

    // armour subtags
    if (s === 'helmet') buckets.add(IC.HELMET), buckets.add(IC.ARMOUR);
    if (s === 'boots')  buckets.add(IC.BOOTS),  buckets.add(IC.ARMOUR);
    if (s === 'gloves') buckets.add(IC.GLOVES), buckets.add(IC.ARMOUR);
    if (s === 'body armour' || s === 'body armor' || s === 'chest') buckets.add(IC.BODY), buckets.add(IC.ARMOUR);
    if (s === 'shield') buckets.add(IC.SHIELD), buckets.add(IC.ARMOUR);
    if (s === 'focus')  buckets.add(IC.FOCUS),  buckets.add(IC.ARMOUR);

    // weapon & specialisations
    if (s === 'bow')       { buckets.add(IC.BOW); buckets.add(IC.WEAPON); }
    if (s === 'crossbow')  { buckets.add(IC.CROSSBOW); buckets.add(IC.WEAPON); }
    if (s === 'wand')      { buckets.add(IC.CASTER); }              // caster group
    if (s === 'staff')     { buckets.add(IC.CASTER); }              // caster group
    if (s === 'sceptre')   { buckets.add(IC.SCEPTRE); }             // sceptre-only group
    if (s === 'one hand mace' || s === 'two hand mace' || s === 'quarterstaff' || s === 'spear') {
      buckets.add(IC.WEAPON);
    }

    return Array.from(buckets).sort().join(',');
  }

  function deriveMaxSocketsFromItemClass(itemClassSingle, typeLine) {
    const s = (itemClassSingle || '').toLowerCase();
    const t = (typeLine || '').toLowerCase();

    // Armour
    if (s === 'body armour' || s === 'body armor' || /body armour|body armor|chest/.test(t)) return 2;
    if (s === 'helmet' || /helm/.test(t)) return 1;
    if (s === 'gloves' || /glove/.test(t)) return 1;
    if (s === 'boots'  || /boot/.test(t))  return 1;

    // Weapons / Off-hands
    if (s === 'bow') return 2;
    if (s === 'crossbow') return 2;
    if (s === 'staff' || s === 'quarterstaff') return 2;
    if (s === 'spear') return 2;
    if (s === 'two hand mace') return 2;

    if (s === 'wand') return 1;
    if (s === 'one hand mace') return 1;
    if (s === 'shield') return 1;
    if (s === 'focus') return 1;

    // Jewellery / others
    if (s === 'amulet' || s === 'ring' || s === 'belt' || s === 'quiver') return 0;

    // Fallbacks by typeline keywords
    if (/\bbow\b/.test(t)) return 2;
    if (/\bcrossbow\b/.test(t)) return 2;
    if (/\bstaff|stave|staves\b/.test(t)) return 2;
    if (/\bwand\b/.test(t)) return 1;
    if (/\bshield\b/.test(t)) return 1;
    if (/\bfocus\b/.test(t)) return 1;
    return 0;
  }

  function getItemTextFromDOM(node) {
    const box = node.querySelector('.itemPopupContainer .itemBoxContent');
    if (!box) return null;
    const lines = [], sep = '--------';

    // rarity
    let rarity = 'Normal';
    const popup = node.querySelector('.itemPopupContainer .poe2Popup, .itemPopupContainer .itemPopup');
    const cls = popup ? popup.className : '';
    if (/\brarePopup\b/.test(cls)) rarity = 'Rare';
    else if (/\bmagicPopup\b/.test(cls)) rarity = 'Magic';
    else if (/\buniquePopup\b/.test(cls)) rarity = 'Unique';

    const name = textContent(box.querySelector('.itemHeader .itemName .lc'));
    const typeLine = textContent(box.querySelector('.itemHeader .itemName.typeLine .lc'));
    const base = textContent(box.querySelector('.content .property .lc:not(.s)')); // e.g., "Bow", "Crossbow", "Helmet", etc.

    // Use site "base" text as Item Class exactly (no pluralization)
    const itemClass = base || '';

    const q   = propLine(box.querySelector('.content .property .lc.s[data-field="quality"]'));
    const pd  = propLine(box.querySelector('.content .property .lc.s[data-field="pdamage"]'));
    const chc = propLine(box.querySelector('.content .property .lc.s[data-field="crit"]'));
    const aps = propLine(box.querySelector('.content .property .lc.s[data-field="aps"]'));
    const rlt = propLine(box.querySelector('.content .property .lc.s[data-field="reload_time"]'));

    const ilvl = textContent(box.querySelector('.itemLevel .lc.s'));
    const reqRaw = textContent(box.querySelector('.requirements .lc'));
    const reqClean = reqRaw.replace(/^\s*Requires\s*:?\s*[\u00A0\s]*/i, '');
    const req = reqRaw ? `Requires: ${reqClean}` : null;

    const socketCount = node.querySelectorAll('.sockets .socket').length;
    const sockets = socketCount ? `Sockets: ${Array(socketCount).fill('S').join(' ')}` : null;

    // Collect all mod types
    const enchantMods     = [...box.querySelectorAll('.enchantMod .lc.s')].map(s => textContent(s));
    const implicitMods    = [...box.querySelectorAll('.implicitMod .lc.s')].map(s => textContent(s));
    const fracturedMods   = [...box.querySelectorAll('.fracturedMod .lc.s')].map(s => textContent(s));
    const runeMods        = [...box.querySelectorAll('.runeMod .lc.s')].map(s => `${textContent(s)} (rune)`);
    const explicitMods    = [...box.querySelectorAll('.explicitMod .lc.s')].map(s => textContent(s));
    const desecratedMods  = [...box.querySelectorAll('.desecratedMods .desecratedMod .lc.s')].map(s => `${textContent(s)} (desecrated)`);

    const note = textContent(box.querySelector('.textCurrency.itemNote'));
    const noteLine = note ? `Note: ${note}` : null;

    if (itemClass) lines.push(`Item Class: ${itemClass}`);
    lines.push(`Rarity: ${rarity}`);
    if (name) lines.push(name);
    if (typeLine) lines.push(typeLine);

    if (q || pd || chc || aps || rlt) {
      lines.push(sep);
      ;[q, pd, chc, aps, rlt].forEach(v => v && lines.push(v));
    }

    if (req || sockets || ilvl) {
      lines.push(sep);
      if (req) lines.push(req);
      if (sockets) { lines.push(sep); lines.push(sockets); }
      if (ilvl) { lines.push(sep); lines.push(ilvl); }
    }

    if (enchantMods.length)   { lines.push(sep); enchantMods.forEach(m => lines.push(m)); }
    if (implicitMods.length)  { lines.push(sep); implicitMods.forEach(m => lines.push(m)); }
    if (fracturedMods.length) { lines.push(sep); fracturedMods.forEach(m => lines.push(m)); }
    if (explicitMods.length)  { lines.push(sep); explicitMods.forEach(m => lines.push(m)); }
    if (desecratedMods.length){ lines.push(sep); desecratedMods.forEach(m => lines.push(m)); }
    if (runeMods.length)      { lines.push(sep); runeMods.forEach(m => lines.push(m)); }

    if (noteLine) { lines.push(sep); lines.push(noteLine); }

    const runeSlots = runeBucketsForItemClass(itemClass);
    const maxSockets = deriveMaxSocketsFromItemClass(itemClass, typeLine);
    let label = itemClass || 'Item';
    if (maxSockets === 0) label += ' (no sockets)';

    return { text: lines.join('\n'), sockets: socketCount, maxSockets, runeSlots, itemTypeLabel: label };
  }

  function getItemMetaAndText(node) {
    const copyBtn = node.querySelector('button.copy');
    if (copyBtn && copyBtn._v_clipboard && typeof copyBtn._v_clipboard.text === 'function') {
      try {
        const t = copyBtn._v_clipboard.text();
        if (typeof t === 'string' && t.trim()) {
          const meta = getItemTextFromDOM(node);
          if (meta && typeof meta === 'object') return { ...meta, text: t };
          return { text: t, sockets: 0, maxSockets: 0, runeSlots: '', itemTypeLabel: 'Item' };
        }
      } catch (e) {}
    }
    return getItemTextFromDOM(node);
  }

  function ensureContainers(node) {
    const right = node.querySelector('.right');
    if (!right) return {};
    let preview = right.querySelector('.rune_preview');
    if (!preview) {
      preview = document.createElement('div');
      preview.className = 'rune_preview';
      right.appendChild(preview);
    }
    let impact = right.querySelector('.item_impact');
    if (!impact) {
      impact = document.createElement('div');
      impact.className = 'item_impact';
      right.appendChild(impact);
    }
    if (preview.nextSibling !== impact) right.insertBefore(preview, impact);
    return { preview, impact };
  }

  function askItemImpact(node) {
    const dataId = node.getAttribute('data-id');
    const { preview, impact } = ensureContainers(node);
    itemByDataId[dataId] = [node, impact, preview];

    if (!enabled) return;

    const meta = getItemMetaAndText(node);
    if (!meta || !meta.text || typeof meta.text !== 'string' || !meta.text.trim() || meta.text.trim().toLowerCase() === 'null') {
      if (impact) impact.innerHTML = '<span style="color:#f55">No item text</span>';
      return;
    }
    window.top.postMessage({
      message: 'get_item_impact',
      item: meta.text,
      dataId,
      sockets: meta.sockets,
      maxSockets: meta.maxSockets,
      runeSlots: meta.runeSlots,
      itemTypeLabel: meta.itemTypeLabel
    }, '*');
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches && node.matches('div.row[data-id]')) askItemImpact(node);
        for (const card of node.querySelectorAll ? node.querySelectorAll('div.row[data-id]') : []) askItemImpact(card);
      }
    }
  });

  window.addEventListener('message', e => {
    if (e.data.message == 'set_item_impact') {
      const impact = itemByDataId[e.data.dataId]?.[1];
      if (impact) impact.innerHTML = e.data.itemImpact;
    } else if (e.data.message == 'set_rune_preview') {
      const preview = itemByDataId[e.data.dataId]?.[2];
      if (preview) preview.innerHTML = e.data.html || '';
    } else if (e.data.message == 'toggle') {
      enabled = e.data.enabled;
    }
  }, false);

  observer.observe(document.body, { attributes: false, childList: true, subtree: true });
})();