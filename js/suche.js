// ======================================================================
// js/suche.js – Patientenübersicht, Patientensuche (alle Termine), Terminsuche (freie Zeiten)
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Patientenübersicht (aktuell anwesend, Historie, Suche) ----
  let alleTermineCache = null;

  async function ladeAlleTermine(erzwingen) {
    if (alleTermineCache && !erzwingen) return alleTermineCache;
    const { data, error } = await db.from('termine').select('*').order('datum', { ascending: false });
    alleTermineCache = error ? [] : (data || []);
    return alleTermineCache;
  }

  async function ladePatientenAnsicht() {
    await ladeAlleTermine(true);
    renderPatientenliste();
  }

  // Baut eine Zeile für einen Patienten (gemeinsam für alle drei Patienten-Bereiche genutzt).
  function patientZeileHtml(p, heuteStr, heuteDatumObj) {
    const letzterBesuchDatum = p.letzterBesuch ? new Date(p.letzterBesuch) : null;
    const tageSeitBesuch = letzterBesuchDatum ? Math.round((heuteDatumObj - letzterBesuchDatum) / 86400000) : null;
    let status = 'aktiv', statusText = 'Aktiv';
    if (p.anzahl === 0) { status = 'neu'; statusText = 'Noch kein Termin'; }
    else if (p.letzterBesuch === heuteStr) { status = 'heute'; statusText = 'Heute da'; }
    else if (tageSeitBesuch !== null && tageSeitBesuch > 60) { status = 'inaktiv'; statusText = 'Länger nicht da'; }

    const letzterBesuchAnzeige = letzterBesuchDatum ? letzterBesuchDatum.toLocaleDateString('de-DE') : '–';
    const namenEscaped = p.name.replace(/'/g, "\\'");
    const bearbeitenAktionen = p.id ? `
        <button type="button" onclick="patientBearbeiten('${p.id}')" title="Bearbeiten">${ICON_STIFT}</button>
        <button type="button" class="loeschen" onclick="patientLoeschenSchnell('${p.id}', '${namenEscaped}')" title="Löschen">${ICON_TRASH}</button>
      ` : '';
    // "Alle Termine"-Button (seit 2026-10-27, zwölfter Durchgang): zeigt ALLE Termine dieses
    // Patienten (vergangene + zukünftige) auf einen Blick, unabhängig davon, ob er eine eigene
    // Patientenakte hat oder nur per Freitext-Name in Terminen vorkommt.
    const aktionen = `
        <button type="button" onclick="oeffnePatientenSuche('${namenEscaped}')" title="Alle Termine anzeigen">${ICON_LUPE}</button>
        ${bearbeitenAktionen}
      `;
    return `
      <div class="patient-zeile">
        <span class="patient-name">${p.name}</span>
        <span>${p.anzahl}&times; da</span>
        <span>Letzter: ${letzterBesuchAnzeige}</span>
        <span><span class="status-badge ${status}">${statusText}</span></span>
        <span class="patient-aktionen">${aktionen}</span>
      </div>
    `;
  }

  function fuelleSektion(containerId, anzahlId, patienten, heuteStr, heuteDatumObj) {
    const container = document.getElementById(containerId);
    document.getElementById(anzahlId).textContent = patienten.length;
    if (!patienten.length) {
      container.innerHTML = '<div class="leer-zustand">Keine Patienten gefunden.</div>';
      return;
    }
    const zeilen = patienten.map(p => patientZeileHtml(p, heuteStr, heuteDatumObj)).join('');
    container.innerHTML = `
      <div class="patient-zeile kopf"><span>Patient</span><span>Besuche</span><span>Letzter Besuch</span><span>Status</span><span></span></div>
      ${zeilen}
    `;
  }

  // Patienten-Ansicht in drei Bereiche aufgeteilt: Patientenakte (angelegte Patienten, im
  // Kalender auswählbar, hier bearbeitbar/löschbar), Ehemalige Patienten (länger nicht mehr
  // da) und Patienten im Terminkalender (alle Namen, die aktuell in Terminen vorkommen, auch
  // ohne eigene Akte).
  function renderPatientenliste() {
    const suchbegriff = (document.getElementById('patienten-suche').value || '').trim().toLowerCase();
    const heuteStr = isoDatum(new Date());
    const heuteDatumObj = new Date();

    const map = new Map();
    (alleTermineCache || []).forEach(t => {
      const key = t.patientenname.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { id: t.patient_id || null, name: t.patientenname, anzahl: 0, letzterBesuch: null });
      const eintrag = map.get(key);
      if (!eintrag.id && t.patient_id) eintrag.id = t.patient_id;
      eintrag.anzahl++;
      if (t.datum <= heuteStr && (!eintrag.letzterBesuch || t.datum > eintrag.letzterBesuch)) {
        eintrag.letzterBesuch = t.datum;
      }
    });

    // Patientenakte: alle Patienten aus der Patientendatei (Tabelle `patienten`) – auch solche
    // ohne jemals einen Termin gehabt zu haben.
    let akte = (patientenCache || []).map(p => {
      const eintrag = map.get(p.name.trim().toLowerCase());
      return { id: p.id, name: p.name, anzahl: eintrag ? eintrag.anzahl : 0, letzterBesuch: eintrag ? eintrag.letzterBesuch : null };
    });

    // Patienten im Terminkalender: ALLE Namen, die in Terminen vorkommen – inkl. Patienten ohne
    // eigene Akte (nur per Freitext-Name im Termin angelegt).
    let kalender = Array.from(map.values());

    // Ehemalige Patienten: länger als 60 Tage nicht mehr da gewesen (und schon mindestens einmal da).
    let ehemalige = kalender.filter(p => {
      if (!p.letzterBesuch || p.anzahl === 0) return false;
      const tage = Math.round((heuteDatumObj - new Date(p.letzterBesuch)) / 86400000);
      return tage > 60;
    });

    if (suchbegriff) {
      const passt = p => p.name.toLowerCase().includes(suchbegriff);
      akte = akte.filter(passt);
      kalender = kalender.filter(passt);
      ehemalige = ehemalige.filter(passt);
    }
    const sortiere = arr => arr.sort((a, b) => (b.letzterBesuch || '').localeCompare(a.letzterBesuch || '') || a.name.localeCompare(b.name));
    sortiere(akte); sortiere(kalender); sortiere(ehemalige);

    fuelleSektion('patienten-liste-akte', 'anzahl-patientenakte', akte, heuteStr, heuteDatumObj);
    fuelleSektion('patienten-liste-ehemalige', 'anzahl-ehemalige', ehemalige, heuteStr, heuteDatumObj);
    fuelleSektion('patienten-liste-kalender', 'anzahl-kalender', kalender, heuteStr, heuteDatumObj);
  }

  async function patientLoeschenSchnell(id, name) {
    if (!confirm(`"${name}" wirklich aus der Patientendatei löschen? Bereits gespeicherte Termine behalten den Namen, verlieren aber die Verknüpfung dorthin.`)) return;
    const { error } = await db.from('patienten').delete().eq('id', id);
    if (error) { alert('Fehler beim Löschen: ' + error.message); return; }
    await ladePatienten();
    await ladePatientenAnsicht();
  }

  // ---- Patientensuche: ALLE Termine eines Patienten auf einen Blick (seit 2026-10-27,
  // zwölfter Durchgang) ----
  function oeffnePatientenSuche(name) {
    document.getElementById('patientensuche-overlay').classList.remove('hidden');
    const feld = document.getElementById('patientensuche-feld');
    if (name) {
      feld.value = name;
      zeigePatientenSucheErgebnis(name);
    } else {
      feld.value = '';
      document.getElementById('patientensuche-ergebnis').innerHTML = '';
      feld.focus();
    }
    document.getElementById('patientensuche-vorschlaege').classList.add('hidden');
  }
  function schliessePatientenSuche() {
    document.getElementById('patientensuche-overlay').classList.add('hidden');
  }
  function patientenSucheInput() {
    const query = document.getElementById('patientensuche-feld').value.trim().toLowerCase();
    const box = document.getElementById('patientensuche-vorschlaege');
    document.getElementById('patientensuche-ergebnis').innerHTML = '';
    if (!query) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    // Namen sowohl aus der Patientendatei als auch aus allen Terminen sammeln (dedupliziert),
    // damit auch Patienten ohne eigene Akte gefunden werden.
    const namenSet = new Map();
    (patientenCache || []).forEach(p => namenSet.set(p.name.trim().toLowerCase(), p.name));
    (alleTermineCache || []).forEach(t => namenSet.set(t.patientenname.trim().toLowerCase(), t.patientenname));
    const treffer = Array.from(namenSet.values()).filter(n => n.toLowerCase().includes(query)).slice(0, 8);
    if (!treffer.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = treffer.map(n => `
      <div class="patient-vorschlag" onmousedown="patientenSucheNameWaehlen('${n.replace(/'/g, "\\'")}')">
        <span>${n.replace(/</g, '&lt;')}</span>
      </div>
    `).join('');
    box.classList.remove('hidden');
  }
  function patientenSucheNameWaehlen(name) {
    document.getElementById('patientensuche-feld').value = name;
    document.getElementById('patientensuche-vorschlaege').classList.add('hidden');
    zeigePatientenSucheErgebnis(name);
  }
  function zeigePatientenSucheErgebnis(name) {
    const ergebnisEl = document.getElementById('patientensuche-ergebnis');
    const heuteStr = isoDatum(new Date());
    const gesucht = name.trim().toLowerCase();
    const termine = (alleTermineCache || [])
      .filter(t => t.patientenname.trim().toLowerCase() === gesucht)
      .slice()
      .sort((a, b) => (b.datum + b.startzeit).localeCompare(a.datum + a.startzeit)); // neueste zuerst
    if (!termine.length) {
      ergebnisEl.innerHTML = '<div class="leer-zustand">Keine Termine für diesen Namen gefunden.</div>';
      return;
    }
    const zukuenftige = termine.filter(t => t.datum >= heuteStr && t.status !== 'abgesagt').length;
    ergebnisEl.innerHTML = `
      <div class="patientensuche-zusammenfassung">${termine.length} Termin(e) insgesamt, davon ${zukuenftige} noch anstehend.</div>
      <div class="patientensuche-liste-kopf"><span>Datum</span><span>Uhrzeit</span><span>Heilmittel · Therapeut</span><span>Status</span></div>
      ${termine.map(t => {
        const vergangen = t.datum < heuteStr;
        return `
        <div class="patientensuche-eintrag" onclick="patientensucheTerminOeffnen('${t.datum}', '${t.id}')" title="Zum Termin springen">
          <span class="ps-datum ${vergangen ? 'ps-vergangen' : ''}">${new Date(t.datum + 'T00:00:00').toLocaleDateString('de-DE')}</span>
          <span class="${vergangen ? 'ps-vergangen' : ''}">${t.startzeit.slice(0, 5)}</span>
          <span class="${vergangen ? 'ps-vergangen' : ''}">${t.behandlungstyp} · ${t.therapeut}</span>
          <span><span class="status-badge ${t.status === 'abgesagt' ? 'inaktiv' : (vergangen ? '' : 'aktiv')}">${t.status === 'abgesagt' ? 'Abgesagt' : (vergangen ? 'War da' : 'Geplant')}</span></span>
        </div>
      `; }).join('')}
    `;
  }
  function patientensucheTerminOeffnen(datum, terminId) {
    const t = (alleTermineCache || []).find(x => x.id === terminId);
    if (!t) return;
    schliessePatientenSuche();
    ausgewaehltesDatum = new Date(datum + 'T00:00:00');
    miniKalenderDatum = new Date(datum + 'T00:00:00');
    wechsleAnsicht('kalender');
    setzeAnsichtstyp('tag');
    setTimeout(() => oeffneBearbeitenModal(t), 120);
  }

  // ---- Terminsuche: freie Zeiten für ein Heilmittel finden (seit 2026-10-27, dreizehnter
  // Durchgang – Punkt 9 aus dem zwölften Batch; im vierzehnten Durchgang komplett neu geordnet:
  // (1) erst Heilmittel wählen, (2) dann Monatskalender mit rot/grün markierten Tagen, (3) Klick
  // auf einen grünen Tag öffnet ein Auswahlfenster mit den konkret freien Uhrzeiten, von dort
  // geht es zum Kalendertag, wo die gefundene Zeit als grüner Balken im Raster erscheint) ----
  const TERMINSUCHE_THERAPEUTEN = ['Andy', 'Lukas'];
  let terminsucheGewaehltesHeilmittel = null; // { name, dauer, eigeneSpalte }
  let terminsucheKalenderDatum = new Date();
  // Die von der Terminsuche gefundene, aber noch nicht in einen echten Termin umgewandelte freie
  // Zeit – wird als grüner Balken im Tagesraster angezeigt, solange der Tag passt (siehe
  // zeigeTerminsucheMarkierung, aufgerufen am Ende von ladeTermine()).
  let terminsucheMarkierung = null; // { datum, therapeut, zeit, dauer_minuten, eigeneSpalte, heilmittel }

  function aktiveHeilmittelMitFallback() {
    let aktive = heilmittelCache.filter(h => h.aktiv);
    if (!aktive.length) {
      aktive = [
        { name: '20 Min KG', dauer_minuten: 20 },
        { name: '45 Min Lymphdrainage', dauer_minuten: 45 },
        { name: '60 Min Lymphdrainage', dauer_minuten: 60 },
        { name: 'Sonstige', dauer_minuten: 20 }
      ];
    }
    return aktive;
  }

  // Liefert ALLE freien Start-Uhrzeiten (nicht nur die nächstgelegene wie naechsteFreieZeit) im
  // 15-Minuten-Raster – reicht für eine gut lesbare Zeitauswahl, ohne auf die 5-Minuten-Feinheit
  // der echten Konfliktprüfung (findeKonflikt) zu verzichten.
  function alleFreienSlots(belegung, dauer_minuten, oz) {
    const startMin = zeitToMinuten(oz.start);
    const endeMin = zeitToMinuten(oz.ende);
    const ergebnis = [];
    for (let kandidat = startMin; kandidat + dauer_minuten <= endeMin; kandidat += 15) {
      const zeit = zuZeitString(kandidat);
      if (!findeKonflikt(belegung, zeit, dauer_minuten, 0)) ergebnis.push(zeit);
    }
    return ergebnis;
  }

  function terminsucheBelegungFuerTag(datumStr, therapeut, eigeneSpalte) {
    return (alleTermineCache || []).filter(t =>
      t.datum === datumStr && t.therapeut === therapeut && t.status !== 'abgesagt' &&
      terminNutztEigeneSpalte(t.behandlungstyp) === eigeneSpalte);
  }

  function terminsucheTagHatFreieZeit(datumStr) {
    const h = terminsucheGewaehltesHeilmittel;
    if (!h) return false;
    const tag = new Date(datumStr + 'T00:00:00');
    const oz = oeffnungszeitenProTag[tag.getDay()] || { start: '07:00', ende: '20:00' };
    return TERMINSUCHE_THERAPEUTEN.some(therapeut => {
      const belegung = terminsucheBelegungFuerTag(datumStr, therapeut, h.eigeneSpalte);
      return alleFreienSlots(belegung, h.dauer, oz).length > 0;
    });
  }

  async function oeffneTerminsuche() {
    document.getElementById('terminsuche-overlay').classList.remove('hidden');
    document.getElementById('terminsuche-schritt-kalender').classList.add('hidden');
    document.getElementById('terminsuche-schritt-auswahl').classList.add('hidden');
    document.getElementById('terminsuche-schritt-heilmittel').classList.remove('hidden');
    document.getElementById('terminsuche-titel').textContent = 'Terminsuche: Heilmittel wählen';
    const liste = document.getElementById('terminsuche-heilmittel-liste');
    liste.innerHTML = '<div class="leer-zustand">Lade…</div>';
    await ladeAlleTermine(true);
    const aktive = aktiveHeilmittelMitFallback();
    liste.innerHTML = aktive.map(h => `
      <div class="terminsuche-tag-zeile" onclick="terminsucheHeilmittelGewaehlt('${h.name.replace(/'/g, "\\'")}', ${h.dauer_minuten})">
        <span class="tt-wochentag">${h.name}</span>
        <span class="tt-frei">${h.dauer_minuten} Min</span>
      </div>
    `).join('');
  }

  function schliesseTerminsuche() {
    document.getElementById('terminsuche-overlay').classList.add('hidden');
  }

  function terminsucheHeilmittelGewaehlt(name, dauer) {
    terminsucheGewaehltesHeilmittel = { name, dauer, eigeneSpalte: terminNutztEigeneSpalte(name) };
    terminsucheKalenderDatum = new Date();
    document.getElementById('terminsuche-schritt-heilmittel').classList.add('hidden');
    document.getElementById('terminsuche-schritt-auswahl').classList.add('hidden');
    document.getElementById('terminsuche-schritt-kalender').classList.remove('hidden');
    document.getElementById('terminsuche-titel').textContent = 'Terminsuche: Tag wählen';
    document.getElementById('terminsuche-gewaehltes-heilmittel').textContent = `${name} (${dauer} Min)`;
    renderTerminsucheKalender();
  }

  function terminsucheZurueckZuHeilmittel() {
    document.getElementById('terminsuche-schritt-kalender').classList.add('hidden');
    document.getElementById('terminsuche-schritt-auswahl').classList.add('hidden');
    document.getElementById('terminsuche-schritt-heilmittel').classList.remove('hidden');
    document.getElementById('terminsuche-titel').textContent = 'Terminsuche: Heilmittel wählen';
  }

  function terminsucheKalenderMonatWechseln(delta) {
    terminsucheKalenderDatum.setMonth(terminsucheKalenderDatum.getMonth() + delta);
    renderTerminsucheKalender();
  }

  // Monatsgitter im selben 5-Spalten-Mo-Fr-Raster wie der Mini-Kalender oben im Header – pro Tag
  // wird geprüft, ob es für das gewählte Heilmittel bei mind. einem Therapeuten noch eine freie
  // Zeit gibt (grün) oder nicht (rot, nicht klickbar). Vergangene Tage werden nicht geprüft und
  // sind ebenfalls nicht klickbar.
  function renderTerminsucheKalender() {
    document.getElementById('terminsuche-kalender-titel').textContent =
      terminsucheKalenderDatum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const container = document.getElementById('terminsuche-kalender-tage');
    container.innerHTML = '';
    const heuteStr = isoDatum(new Date());
    const jahr = terminsucheKalenderDatum.getFullYear();
    const monat = terminsucheKalenderDatum.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    const wochentagRoh = (ersterTag.getDay() + 6) % 7; // Mo=0..So=6
    const startOffset = wochentagRoh <= 4 ? wochentagRoh : 0;
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) container.appendChild(document.createElement('span'));
    for (let tag = 1; tag <= tageImMonat; tag++) {
      const datum = new Date(jahr, monat, tag);
      if (istWochenende(datum)) continue;
      const datumStr = isoDatum(datum);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = tag;
      if (istGleicherTag(datum, new Date())) btn.classList.add('heute');
      if (datumStr < heuteStr) {
        btn.classList.add('ts-vergangen');
        btn.disabled = true;
      } else if (terminsucheTagHatFreieZeit(datumStr)) {
        btn.classList.add('ts-frei');
        btn.onclick = () => terminsucheTagGewaehlt(datumStr, datum);
      } else {
        btn.classList.add('ts-belegt');
        btn.disabled = true;
      }
      container.appendChild(btn);
    }
  }

  // Schritt 3, das "Auswahlfenster": zeigt für den angeklickten grünen Tag die konkret freien
  // Uhrzeiten je Therapeut (wiederverwendet dieselbe Karten-Optik wie zuvor). Von hier aus leitet
  // die Auswahl einer Zeit direkt zum Kalendertag (terminsucheSlotGewaehlt).
  function terminsucheTagGewaehlt(datumStr, datumObj) {
    const h = terminsucheGewaehltesHeilmittel;
    document.getElementById('terminsuche-schritt-kalender').classList.add('hidden');
    document.getElementById('terminsuche-schritt-auswahl').classList.remove('hidden');
    document.getElementById('terminsuche-titel').textContent = 'Terminsuche: freie Zeit wählen';
    const oz = oeffnungszeitenProTag[datumObj.getDay()] || { start: '07:00', ende: '20:00' };
    const tagLabel = datumObj.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const bloecke = TERMINSUCHE_THERAPEUTEN.map(therapeut => {
      const belegung = terminsucheBelegungFuerTag(datumStr, therapeut, h.eigeneSpalte);
      const slots = alleFreienSlots(belegung, h.dauer, oz);
      const slotsHtml = slots.length
        ? `<div class="terminsuche-slot-grid">${slots.map(zeit => `
            <button type="button" class="terminsuche-slot-btn" onclick="terminsucheSlotGewaehlt('${datumStr}', '${therapeut}', '${zeit}')">${zeit}</button>
          `).join('')}</div>`
        : `<div class="leer-zustand" style="padding:6px 0;">Keine freie Zeit.</div>`;
      return `<div class="terminsuche-therapeut-block"><h4>${therapeut}</h4>${slotsHtml}</div>`;
    }).join('');
    document.getElementById('terminsuche-auswahl-inhalt').innerHTML = `
      <button type="button" class="terminsuche-zurueck" onclick="terminsucheZurueckZuKalender()">&#8592; anderer Tag</button>
      <p class="terminsuche-hinweis">${tagLabel} &middot; ${h.name} (${h.dauer} Min)</p>
      ${bloecke}
    `;
  }

  function terminsucheZurueckZuKalender() {
    document.getElementById('terminsuche-schritt-auswahl').classList.add('hidden');
    document.getElementById('terminsuche-schritt-kalender').classList.remove('hidden');
    document.getElementById('terminsuche-titel').textContent = 'Terminsuche: Tag wählen';
  }

  // Leitet zum gewählten Kalendertag – statt wie vorher sofort das Anlegen-Modal zu öffnen, wird
  // die gefundene Zeit jetzt als grüner Balken im Zeitraster markiert (zeigeTerminsucheMarkierung,
  // aufgerufen am Ende von ladeTermine()); ein Klick auf den Balken öffnet dann das Anlegen-Modal.
  function terminsucheSlotGewaehlt(datumStr, therapeut, zeit) {
    const h = terminsucheGewaehltesHeilmittel;
    schliesseTerminsuche();
    terminsucheMarkierung = { datum: datumStr, therapeut, zeit, dauer_minuten: h.dauer, eigeneSpalte: h.eigeneSpalte, heilmittel: h.name };
    ausgewaehltesDatum = new Date(datumStr + 'T00:00:00');
    miniKalenderDatum = new Date(datumStr + 'T00:00:00');
    wechsleAnsicht('kalender');
    setzeAnsichtstyp('tag');
  }

  function terminsucheMarkierungSchliessen() {
    terminsucheMarkierung = null;
    document.querySelectorAll('.terminsuche-balken').forEach(el => el.remove());
  }

  function zeigeTerminsucheMarkierung() {
    document.querySelectorAll('.terminsuche-balken').forEach(el => el.remove());
    const m = terminsucheMarkierung;
    if (!m || ansichtstyp !== 'tag' || isoDatum(ausgewaehltesDatum) !== m.datum) return;
    const lane = document.getElementById('raster-' + m.therapeut.toLowerCase() + (m.eigeneSpalte ? '-fango' : '-normal'));
    if (!lane) return;
    const balken = document.createElement('div');
    balken.className = 'terminsuche-balken';
    balken.style.top = (minutenSeitTagesstart(m.zeit) * PX_PRO_MINUTE) + 'px';
    balken.style.height = Math.max(m.dauer_minuten * PX_PRO_MINUTE, 20) + 'px';
    balken.innerHTML = `<span>${m.zeit} &middot; frei (${m.heilmittel})</span><button type="button" class="terminsuche-balken-schliessen" title="Ausblenden">&times;</button>`;
    balken.querySelector('.terminsuche-balken-schliessen').addEventListener('click', (e) => {
      e.stopPropagation();
      terminsucheMarkierungSchliessen();
    });
    balken.addEventListener('click', () => {
      oeffneModal(m.therapeut);
      document.getElementById('modal-startzeit').value = m.zeit;
      const behandlungSel = document.getElementById('modal-behandlungstyp');
      behandlungSel.value = m.heilmittel;
      behandlungAuswahl();
      document.getElementById('modal-dauer').value = m.dauer_minuten;
      document.getElementById('modal-patient').focus();
      terminsucheMarkierungSchliessen();
    });
    lane.appendChild(balken);
  }
