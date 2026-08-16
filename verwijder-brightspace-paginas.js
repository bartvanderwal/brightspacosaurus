/**
 * Brightspace: verwijder pagina's vanaf de huidige selectie naar beneden.
 *
 * Gebruik:
 * 1. Selecteer in Brightspace Inhoud het item waar je wilt BEGINNEN
 * 2. Open DevTools (F12) → Console
 * 3. Plak dit script en druk Enter
 * 4. Voer het aantal in (of leeg voor alles)
 *
 * Het script:
 * - Pollt snel (50ms) op UI-reacties i.p.v. passieve waits
 * - Wacht tot dialogen DICHT zijn voordat het verdergaat
 * - Skipt items zonder verwijderoptie (quizzen, assignments)
 * - Klikt radio "ook bestanden verwijderen" als die er is
 *
 * LET OP: Destructief. Alleen in sandbox/testcursussen.
 */

(async function () {
  'use strict';

  const POLL = 50; // ms tussen polls

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function wachtOp(zoekFn, maxMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const el = zoekFn();
      if (el) return el;
      await sleep(POLL);
    }
    return null;
  }

  async function wachtTot(conditieFn, maxMs = 12000) {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      if (conditieFn()) return true;
      await sleep(POLL);
    }
    return false;
  }

  function alleDocs() {
    const docs = [document];
    for (const iframe of document.querySelectorAll('iframe')) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) docs.push(doc);
      } catch (_e) { /* cross-origin */ }
    }
    return docs;
  }

  function zoekOveral(selector) {
    for (const doc of alleDocs()) {
      const el = doc.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function alleItems() {
    for (const doc of alleDocs()) {
      const items = doc.querySelectorAll('.navigation-item[data-objectid]');
      if (items.length > 0) return Array.from(items);
    }
    return [];
  }

  function getNaam(item) {
    return item.querySelector('.title-text span')?.textContent?.trim() || '(onbekend)';
  }

  function vindHuidigIndex(items) {
    for (let i = 0; i < items.length; i++) {
      const box = items[i].querySelector('.unit-box');
      if (box && (box.classList.contains('selected') || box.getAttribute('tabindex') === '0')) {
        return i;
      }
    }
    return 0;
  }

  // Check of er open dialogen zijn
  function heeftOpenDialoog() {
    for (const doc of alleDocs()) {
      if (doc.querySelector('d2l-dialog[opened], d2l-dialog-confirm[opened]')) return true;
      // Fallback: role="dialog" die zichtbaar is
      for (const dlg of doc.querySelectorAll('[role="dialog"]')) {
        if (dlg.offsetParent !== null || dlg.style.display !== 'none') return true;
      }
    }
    return false;
  }

  // Wacht tot alle dialogen dicht zijn
  async function wachtTotDialogenDicht(maxMs = 15000) {
    return wachtTot(() => !heeftOpenDialoog(), maxMs);
  }

  // Sluit toasts
  function sluitToasts() {
    for (const doc of alleDocs()) {
      for (const toast of doc.querySelectorAll('d2l-alert-toast')) {
        const btn = toast.querySelector('button[aria-label="Close"], button[aria-label="Sluiten"]');
        if (btn) btn.click();
      }
    }
  }

  // Zoek bevestigingsknop in een open dialoog
  function vindBevestigingsknop() {
    for (const doc of alleDocs()) {
      const dialogen = doc.querySelectorAll(
        'd2l-dialog[opened], d2l-dialog-confirm[opened], [role="dialog"]'
      );
      for (const dlg of dialogen) {
        for (const b of dlg.querySelectorAll('button, d2l-button')) {
          const tekst = (b.textContent || b.getAttribute('text') || '').trim().toLowerCase();
          if (tekst === 'verwijderen' || tekst === 'remove' || tekst === 'delete') {
            return b;
          }
        }
      }
    }
    return null;
  }

  // --- Start ---
  const items = alleItems();
  const aantal = items.length;
  const startIndex = vindHuidigIndex(items);
  const startNaam = getNaam(items[startIndex]);

  if (aantal === 0) {
    alert('Geen items gevonden. Zorg dat je in de Content-navigatie zit.');
    return;
  }

  const invoer = prompt(
    `${aantal} items totaal. Start bij: "${startNaam}" (positie ${startIndex + 1}).\n\n` +
    `Hoeveel items verwijderen vanaf hier?\n` +
    `Leeg = alles vanaf hier (${aantal - startIndex} items).`,
    ''
  );

  if (invoer === null) { console.log('[opschoning] Geannuleerd.'); return; }

  const beschikbaar = aantal - startIndex;
  const max = invoer.trim() === '' ? beschikbaar : Math.min(parseInt(invoer, 10) || 0, beschikbaar);
  if (max <= 0) { alert('Ongeldig getal.'); return; }

  if (!confirm(`${max} items verwijderen vanaf "${startNaam}". Doorgaan?`)) {
    console.log('[opschoning] Geannuleerd.');
    return;
  }

  console.log(`[opschoning] Start: ${max} items vanaf positie ${startIndex + 1}`);

  let verwijderd = 0;
  let overgeslagen = 0;
  const mislukt = new Set();

  for (let poging = 0; poging < max * 3 && verwijderd < max; poging++) {
    // CRUCIAAL: wacht tot vorige dialoog dicht is voordat we verdergaan
    await wachtTotDialogenDicht();

    const huidigeItems = alleItems();
    if (huidigeItems.length === 0) {
      console.log('[opschoning] Geen items meer.');
      break;
    }

    // Zoek eerste niet-mislukt item vanaf startIndex
    let item = null;
    for (let i = startIndex; i < huidigeItems.length; i++) {
      const oid = huidigeItems[i].getAttribute('data-objectid');
      if (!mislukt.has(oid)) { item = huidigeItems[i]; break; }
    }
    if (!item) {
      console.log('[opschoning] Geen verwijderbare items meer.');
      break;
    }

    const naam = getNaam(item);
    const objectId = item.getAttribute('data-objectid');
    console.log(`[opschoning] [${verwijderd + 1}/${max}] "${naam}" (id=${objectId})`);

    sluitToasts();

    // Stap 1: Klik context-menu knop (⋮) direct in het item
    let optieKnop = item.querySelector(
      'button[aria-label="Opties"], button[aria-label="Options"], ' +
      'button[aria-label="More actions"], d2l-button-icon[aria-label="Opties"], ' +
      'd2l-button-icon[aria-label="Options"], .d2l-dropdown-opener'
    );

    if (!optieKnop) {
      // Fallback: selecteer item, wacht op Opties-knop
      const treeItem = item.querySelector('[role="treeitem"]');
      if (treeItem) treeItem.click(); else item.click();
      optieKnop = await wachtOp(
        () => zoekOveral(
          '[aria-label="Opties"], [aria-label="Options"], [aria-label="More actions"]'
        ),
        5000
      );
    }

    if (!optieKnop) {
      console.warn(`  ⏭️ "${naam}": geen Opties-knop. Skip.`);
      mislukt.add(objectId);
      overgeslagen++;
      continue;
    }
    optieKnop.click();

    // Stap 2: Wacht op "Verwijderen"/"Remove" in dropdown
    const del = await wachtOp(
      () => zoekOveral('#optDelete') ||
            zoekOveral('[data-key="optDelete"]') ||
            zoekOveral('d2l-menu-item[text="Verwijderen"]') ||
            zoekOveral('d2l-menu-item[text="Remove"]'),
      4000
    );
    if (!del) {
      console.warn(`  ⏭️ "${naam}": geen verwijderoptie. Skip.`);
      document.body.click(); // sluit menu
      mislukt.add(objectId);
      overgeslagen++;
      continue;
    }
    del.click();

    // Stap 3: Wacht tot dialoog opent
    const dialoogOpen = await wachtTot(heeftOpenDialoog, 5000);
    if (!dialoogOpen) {
      console.warn(`  ⏭️ "${naam}": dialoog niet geopend. Skip.`);
      mislukt.add(objectId);
      overgeslagen++;
      continue;
    }

    // Stap 3b: Klik radio "ook bestanden verwijderen" als aanwezig (niet wachten)
    for (const doc of alleDocs()) {
      const radio = doc.querySelector('input[type="radio"][value="true"]');
      if (radio) {
        radio.click();
        radio.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }

    // Stap 4: Klik bevestigingsknop
    const btn = await wachtOp(vindBevestigingsknop, 4000);
    if (!btn) {
      console.warn(`  ⏭️ "${naam}": bevestigingsknop niet gevonden. Skip.`);
      // Forceer dialoog dicht
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wachtTotDialogenDicht(3000);
      mislukt.add(objectId);
      overgeslagen++;
      continue;
    }
    btn.click();

    // Stap 5: Wacht tot dialoog dicht is EN item uit DOM verdwijnt
    const aantalVoor = huidigeItems.length;
    const klaar = await wachtTot(
      () => !heeftOpenDialoog() && alleItems().length < aantalVoor,
      15000
    );

    if (klaar) {
      verwijderd++;
      sluitToasts(); // "het is gelukt" toast direct wegklikken
      console.log(`  ✅ Verwijderd (${verwijderd}/${max})`);
    } else if (!heeftOpenDialoog()) {
      // Dialoog is dicht maar item is er nog — mislukt
      console.warn(`  ⚠️ "${naam}": dialoog dicht maar item nog aanwezig. Skip.`);
      mislukt.add(objectId);
      overgeslagen++;
    } else {
      // Dialoog nog open na 15s — iets is vastgelopen
      console.warn(`  ⚠️ "${naam}": dialoog bleef open. Forceer sluiten.`);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await wachtTotDialogenDicht(3000);
      mislukt.add(objectId);
      overgeslagen++;
    }
  }

  console.log(
    `\n[opschoning] Klaar!\n` +
    `  ✅ Verwijderd: ${verwijderd}\n` +
    `  ⏭️ Overgeslagen: ${overgeslagen}\n` +
    `  Druk F5 om te verifiëren.`
  );
})();
