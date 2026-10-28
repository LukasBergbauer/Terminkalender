// ======================================================================
// js/drag-drop.js – Drag & Drop und Drag-Resize der Termindauer (Tagesansicht)
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Drag & Drop ----
  let markierterBlock = null;

  function ermittleZielTherapeut(mausX, standardTherapeut) {
    let ziel = standardTherapeut;
    [['raster-lukas', 'Lukas'], ['raster-andy', 'Andy']].forEach(([id, name]) => {
      const rect = document.getElementById(id).getBoundingClientRect();
      if (mausX >= rect.left && mausX <= rect.right) ziel = name;
    });
    return ziel;
  }

  function zeigeZeitIndikator(minutenAbsolut, zielTherapeut) {
    const indikator = document.getElementById('zeit-indikator');
    const oz = aktuelleOeffnungszeit();
    const topPx = (minutenAbsolut - zeitToMinuten(oz.start)) * PX_PRO_MINUTE;

    // Zeitleiste soll immer li. der jeweils gezogenen Spalte stehen: bei Andy (links, seit
    // 2026-10-27 achter Durchgang) an der normalen Zeitachse, bei Lukas (rechts) direkt
    // li. von Lukas' Spalte (im Zwischenraum zu Andy).
    let ankerRect;
    if (zielTherapeut === 'Lukas') {
      ankerRect = document.getElementById('raster-lukas').getBoundingClientRect();
      indikator.style.right = (window.innerWidth - ankerRect.left + 6) + 'px';
    } else {
      ankerRect = document.getElementById('zeitachse').getBoundingClientRect();
      indikator.style.right = (window.innerWidth - ankerRect.right + 2) + 'px';
    }
    indikator.style.top = (ankerRect.top + topPx) + 'px';
    indikator.textContent = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');
    indikator.classList.add('sichtbar');
  }

  function versteckeZeitIndikator() {
    document.getElementById('zeit-indikator').classList.remove('sichtbar');
  }

  function gerundeteMinuten(top, termin, oz) {
    let minutenAbsolut = zeitToMinuten(oz.start) + top / PX_PRO_MINUTE;
    minutenAbsolut = Math.round(minutenAbsolut / 5) * 5;
    const maxStart = zeitToMinuten(oz.ende) - termin.dauer_minuten;
    return Math.max(zeitToMinuten(oz.start), Math.min(minutenAbsolut, maxStart));
  }

  function starteDrag(event, termin, block) {
    if (event.button !== 0) return; // nur linke Maustaste
    if (statusModusAktiv) { event.preventDefault(); toggleStatusAuswahl(termin, block); return; }
    event.preventDefault();
    const startMausY = event.clientY;
    const startTop = parseFloat(block.style.top);
    const spalteUrsprung = block.parentElement;
    let hatSichBewegt = false;
    versteckeTooltip();

    function aufBewegen(ev) {
      const deltaY = ev.clientY - startMausY;
      if (!hatSichBewegt && Math.abs(deltaY) < 4) return;
      if (!hatSichBewegt) {
        hatSichBewegt = true;
        block.classList.add('dragging');
      }
      let neuerTop = startTop + deltaY;
      const maxTop = spalteUrsprung.clientHeight - block.offsetHeight;
      neuerTop = Math.max(0, Math.min(neuerTop, maxTop));
      block.style.top = neuerTop + 'px';

      const oz = aktuelleOeffnungszeit();
      const zielTherapeut = ermittleZielTherapeut(ev.clientX, termin.therapeut);
      zeigeZeitIndikator(gerundeteMinuten(neuerTop, termin, oz), zielTherapeut);
    }

    function aufLoslassen(ev) {
      document.removeEventListener('mousemove', aufBewegen);
      document.removeEventListener('mouseup', aufLoslassen);

      if (!hatSichBewegt) {
        // war nur ein Klick, kein Ziehen -> Bearbeiten-Modal öffnen
        markierterBlock = block;
        block.classList.add('ausgewaehlt');
        oeffneBearbeitenModal(termin);
        return;
      }

      block.classList.remove('dragging');
      versteckeZeitIndikator();

      // Ziel-Therapeut anhand der Maus-X-Position bestimmen (Spaltenwechsel möglich)
      const neuerTherapeut = ermittleZielTherapeut(ev.clientX, termin.therapeut);

      // Neue Uhrzeit aus der Top-Position berechnen, auf 5 Minuten gerundet
      const top = parseFloat(block.style.top);
      const oz = aktuelleOeffnungszeit();
      const minutenAbsolut = gerundeteMinuten(top, termin, oz);
      let neueStartzeit = zuZeitString(minutenAbsolut);

      // Magnetfunktion: bei Therapeuten-Konflikt (inkl. Spaltenwechsel) automatisch zur nächsten
      // freien Zeit springen. Hausbesuche haben keinen Raum (raum = null) – die Fahrzeit zählt
      // beim Therapeuten mit. Seit 2026-10-27 (achter Durchgang) rein therapeutenbezogen (+ Lane) –
      // kein Raum-Konflikt mehr über Therapeuten hinweg (Lukas/Andy sind unabhängige Spalten).
      const eigeneFahrzeit = termin.ist_hausbesuch ? (termin.fahrzeit_minuten || 0) : 0;
      const terminEigeneSpalte = terminNutztEigeneSpalte(termin.behandlungstyp);
      const belegung = aktuelleTagesTermine.filter(t => t.id !== termin.id && (
        t.therapeut === neuerTherapeut && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte
      ));
      if (findeKonflikt(belegung, neueStartzeit, termin.dauer_minuten, eigeneFahrzeit)) {
        const frei = naechsteFreieZeit(belegung, termin.dauer_minuten, neueStartzeit, oz, eigeneFahrzeit);
        if (frei) neueStartzeit = frei;
      }

      verschiebeTermin(termin, neueStartzeit, neuerTherapeut);
    }

    document.addEventListener('mousemove', aufBewegen);
    document.addEventListener('mouseup', aufLoslassen);
  }

  async function verschiebeTermin(alterTermin, startzeit, therapeut) {
    const { error } = await db.from('termine').update({ startzeit, therapeut }).eq('id', alterTermin.id);
    if (error) {
      alert('Fehler beim Verschieben: ' + error.message);
      ladeTermine();
      return;
    }
    const altStart = alterTermin.startzeit.slice(0, 5);
    let details = `${alterTermin.patientenname}: ${altStart}`;
    if (therapeut !== alterTermin.therapeut) details += ` (${alterTermin.therapeut})`;
    details += ` → ${startzeit}`;
    if (therapeut !== alterTermin.therapeut) details += ` (${therapeut})`;
    protokolliere(alterTermin.id, 'verschoben', details, alterTermin.datum);
    ladeTermine();
  }

  // ---- Drag-Resize: Dauer eines Termins per Ziehen am unteren Blockrand verändern ----
  // Lineal mit 5-Minuten-Strichen (alle 15 Min etwas länger) rechts neben dem Block, damit beim
  // Ziehen sichtbar ist, in welchen Schritten sich die Dauer ändert.
  // pxProMinute optional (Default: Tagesansicht-Skala) – die Vergleichsansicht übergibt seit
  // 2026-10-27 (neunter Durchgang) ihre eigene, kleinere VERGLEICH_PX_PRO_MINUTE, damit dasselbe
  // Lineal/derselbe Dauer-Indikator unverändert auch dort funktioniert.
  function baueResizeLineal(block, pxProMinute = PX_PRO_MINUTE) {
    const lineal = document.getElementById('resize-lineal');
    lineal.innerHTML = '';
    const rect = block.getBoundingClientRect();
    const maxHoehePx = block.parentElement.clientHeight - parseFloat(block.style.top);
    const maxMinuten = Math.max(5, Math.floor(maxHoehePx / pxProMinute / 5) * 5);
    lineal.style.left = (rect.right + 6) + 'px';
    lineal.style.top = rect.top + 'px';
    lineal.style.height = (maxMinuten * pxProMinute) + 'px';
    for (let m = 5; m <= maxMinuten; m += 5) {
      const tick = document.createElement('div');
      tick.className = 'tick' + (m % 15 === 0 ? ' gross' : '');
      tick.style.top = (m * pxProMinute) + 'px';
      lineal.appendChild(tick);
    }
    lineal.classList.remove('hidden');
  }

  function zeigeResizeDauerIndikator(block, dauer, termin, pxProMinute = PX_PRO_MINUTE) {
    const indikator = document.getElementById('resize-dauer-indikator');
    const rect = block.getBoundingClientRect();
    const startMin = zeitToMinuten(termin.startzeit.slice(0, 5));
    indikator.textContent = dauer + ' Min (bis ' + zuZeitString(startMin + dauer) + ')';
    indikator.style.left = (rect.right + 20) + 'px';
    indikator.style.top = (rect.top + dauer * pxProMinute) + 'px';
    indikator.classList.remove('hidden');
  }

  function versteckeResizeLineal() {
    document.getElementById('resize-lineal').classList.add('hidden');
    document.getElementById('resize-dauer-indikator').classList.add('hidden');
  }

  function starteResize(event, termin, block) {
    if (event.button !== 0) return;
    if (statusModusAktiv) { event.preventDefault(); event.stopPropagation(); toggleStatusAuswahl(termin, block); return; }
    event.preventDefault();
    event.stopPropagation(); // nicht gleichzeitig starteDrag (Verschieben) auslösen
    const startMausY = event.clientY;
    const startHoehe = block.offsetHeight;
    let hatSichBewegt = false;
    versteckeTooltip();

    function aufBewegen(ev) {
      const deltaY = ev.clientY - startMausY;
      if (!hatSichBewegt && Math.abs(deltaY) < 4) return;
      if (!hatSichBewegt) { hatSichBewegt = true; resizeAktiv = true; block.classList.add('resizing'); baueResizeLineal(block); }
      // Während des Ziehens kann der wachsende Block unter dem Mauszeiger ein erneutes
      // mouseenter auslösen und den Hover-Tooltip wieder einblenden – der würde dann genau
      // über dem neuen 5-Minuten-Lineal liegen. resizeAktiv blockt zeigeTooltip() direkt an der
      // Quelle; das erneute Verstecken hier ist ein zusätzliches Sicherheitsnetz.
      versteckeTooltip();
      let neueHoeheRoh = Math.max(20, startHoehe + deltaY);
      const maxHoehe = block.parentElement.clientHeight - parseFloat(block.style.top);
      neueHoeheRoh = Math.min(neueHoeheRoh, maxHoehe);
      // Schon beim Ziehen auf 5-Minuten-Schritte einrasten (nicht erst beim Loslassen),
      // damit direkt sichtbar ist, auf welche Dauer der Termin tatsächlich gesetzt wird.
      const roheDauer = neueHoeheRoh / PX_PRO_MINUTE;
      const gerasteteDauer = Math.max(5, Math.round(roheDauer / 5) * 5);
      block.style.height = (gerasteteDauer * PX_PRO_MINUTE) + 'px';
      zeigeResizeDauerIndikator(block, gerasteteDauer, termin);
    }

    function aufLoslassen() {
      document.removeEventListener('mousemove', aufBewegen);
      document.removeEventListener('mouseup', aufLoslassen);
      versteckeResizeLineal();
      resizeAktiv = false;

      if (!hatSichBewegt) {
        // war nur ein Klick auf den Griff, kein Ziehen -> genau wie ein normaler Klick das
        // Bearbeiten-Modal öffnen, statt stillschweigend nichts zu tun (das wirkte vorher wie ein Hänger)
        markierterBlock = block;
        block.classList.add('ausgewaehlt');
        oeffneBearbeitenModal(termin);
        return;
      }

      block.classList.remove('resizing');
      const neueHoeheFinal = parseFloat(block.style.height);
      let neueDauer = Math.max(5, Math.round((neueHoeheFinal / PX_PRO_MINUTE) / 5) * 5);
      if (neueDauer === termin.dauer_minuten) { ladeTermine(); return; } // keine echte Änderung
      aktualisiereDauer(termin, neueDauer);
    }

    document.addEventListener('mousemove', aufBewegen);
    document.addEventListener('mouseup', aufLoslassen);
  }

  async function aktualisiereDauer(termin, neueDauer) {
    const oz = aktuelleOeffnungszeit();
    const eigeneFahrzeit = termin.ist_hausbesuch ? (termin.fahrzeit_minuten || 0) : 0;
    const terminEigeneSpalte = terminNutztEigeneSpalte(termin.behandlungstyp);
    // Rein therapeutenbezogen (+ Lane), siehe Hinweis bei starteDrag/aufLoslassen oben.
    const belegung = aktuelleTagesTermine.filter(t => t.id !== termin.id && (
      t.therapeut === termin.therapeut && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte
    ));
    // Bei Konflikt mit der gewünschten neuen Dauer: auf die maximal mögliche Dauer begrenzen,
    // bis zum nächsten belegten Fenster bzw. bis zum Ende der Öffnungszeit.
    if (findeKonflikt(belegung, termin.startzeit.slice(0, 5), neueDauer, eigeneFahrzeit)) {
      const startMin = zeitToMinuten(termin.startzeit.slice(0, 5));
      let grenze = zeitToMinuten(oz.ende) - eigeneFahrzeit;
      belegung.forEach(t => {
        const fenster = belegtesFenster(t);
        if (fenster.start > startMin && fenster.start < grenze) grenze = fenster.start;
      });
      neueDauer = Math.max(5, grenze - startMin - eigeneFahrzeit);
    }
    const { error } = await db.from('termine').update({ dauer_minuten: neueDauer }).eq('id', termin.id);
    if (error) { alert('Fehler beim Ändern der Dauer: ' + error.message); ladeTermine(); return; }
    protokolliere(termin.id, 'bearbeitet', `${termin.patientenname}: Dauer ${termin.dauer_minuten} → ${neueDauer} Min`, termin.datum);
    ladeTermine();
  }

  // Klick auf eine freie Stelle im normalen Zeitraster (nicht auf einen Termin-Block) öffnet das
  // Anlegen-Modal mit der angeklickten Uhrzeit vorausgefüllt – ersetzt den alten "+"-Button,
  // analog zum bereits bestehenden Verhalten in der Vergleichsansicht (vergleichRasterKlick).
  function rasterKlick(e, therapeut) {
    if (e.target !== e.currentTarget) return; // Klick ging auf einen Termin-Block, nicht auf freie Fläche
    const rect = e.currentTarget.getBoundingClientRect();
    const oz = aktuelleOeffnungszeit();
    let minutenAbsolut = zeitToMinuten(oz.start) + (e.clientY - rect.top) / PX_PRO_MINUTE;
    minutenAbsolut = Math.max(zeitToMinuten(oz.start), Math.min(Math.round(minutenAbsolut / 5) * 5, zeitToMinuten(oz.ende) - 5));
    const zeitStr = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');
    oeffneModal(therapeut);
    document.getElementById('modal-startzeit').value = zeitStr;
  }
