// ======================================================================
// js/verordnungen.js – Serientermine (Datumslisten), Hausbesuche (Termintyp), Verordnungs-Zähler, Warteliste
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Erweiterte Serientermine: Datumsliste je nach Wiederholungs-Modus erzeugen ----
  // 'wochentage': wochentageSet (Set von JS-getDay()-Werten) bestimmt die Tage, unabhängig vom Starttag;
  // es wird Tag für Tag ab startDatum weitergezählt, bis genug Termine gefunden wurden.
  function serienDatenGenerieren(wiederholung, anzahl, startDatum, wochentageSet) {
    const daten = [];
    if (wiederholung === 'wochentage') {
      const d = new Date(startDatum);
      let sicherheit = 0;
      while (daten.length < anzahl && sicherheit < 500) {
        if (wochentageSet && wochentageSet.has(d.getDay())) daten.push(new Date(d));
        d.setDate(d.getDate() + 1);
        sicherheit++;
      }
    } else {
      const schrittTage = wiederholung === 'woechentlich' ? 7 : wiederholung === 'alle2wochen' ? 14 : 28;
      for (let i = 0; i < anzahl; i++) {
        const datumObj = new Date(startDatum);
        datumObj.setDate(datumObj.getDate() + i * schrittTage);
        daten.push(datumObj);
      }
    }
    return daten;
  }

  function wiederholungAuswahlGeaendert() {
    const modus = document.getElementById('modal-wiederholung').value;
    const box = document.getElementById('wochentage-wahl');
    box.classList.toggle('hidden', modus !== 'wochentage');
    if (modus === 'wochentage') {
      const container = document.getElementById('wochentage-checkboxen');
      if (!container.children.length) {
        container.innerHTML = WOCHENTAG_REIHENFOLGE.map(tag => `
          <label><input type="checkbox" class="wochentag-checkbox" value="${tag}">${WOCHENTAG_LABELS[tag]}</label>
        `).join('');
      }
      // Aktuellen Wochentag vorauswählen, falls noch gar keiner angehakt ist
      const angehakt = container.querySelectorAll('.wochentag-checkbox:checked');
      if (!angehakt.length) {
        const heutigerTag = ausgewaehltesDatum.getDay();
        const cb = container.querySelector(`.wochentag-checkbox[value="${heutigerTag}"]`);
        if (cb) cb.checked = true;
      }
    }
  }

  // "+ Mehr Optionen" im Termin-Modal: hält Hausbesuch & Verordnung standardmäßig eingeklappt.
  function modalErweiterteOptionenUmschalten(forceShow) {
    const box = document.getElementById('modal-erweitert');
    const link = document.getElementById('modal-erweitert-link');
    const zeigen = (forceShow !== undefined) ? forceShow : box.classList.contains('hidden');
    box.classList.toggle('hidden', !zeigen);
    link.textContent = zeigen ? '− Weniger anzeigen' : '+ Mehr Optionen (Hausbesuch, Verordnung)';
  }

  // ---- Hausbesuche (eigener Termintyp mit Fahrzeit statt Praxisraum) ----
  function hausbesuchUmschalten() {
    const ist = document.getElementById('modal-hausbesuch').checked;
    document.getElementById('raum-feld-wrapper').classList.toggle('hidden', ist);
    document.getElementById('fahrzeit-feld-wrapper').classList.toggle('hidden', !ist);
  }

  // ---- Verordnungs-Zähler (Phase 2) ----
  async function ladeVerordnungen() {
    const { data, error } = await db.from('verordnungen').select('*').order('erstellt_am', { ascending: false });
    verordnungenCache = error ? [] : (data || []);
  }

  // Prüft Behandlungsbeginn- und Unterbrechungs-Fristen gegen die beim jeweiligen Heilmittel
  // hinterlegten Werte (frist_beginn_tage / frist_unterbrechung_tage). Beide sind optional –
  // ohne hinterlegte Frist wird nichts geprüft (keine fest codierten Werte, siehe Projekt-Doku).
  function pruefeVerordnungFristen(verordnung, termineDerVerordnung) {
    const warnungen = [];
    const heilmittel = heilmittelCache.find(h => h.id === verordnung.heilmittel_id);
    const fristBeginn = heilmittel ? heilmittel.frist_beginn_tage : null;
    const fristUnterbrechung = heilmittel ? heilmittel.frist_unterbrechung_tage : null;
    const sortiert = (termineDerVerordnung || [])
      .filter(t => t.status !== 'abgesagt')
      .slice()
      .sort((a, b) => a.datum.localeCompare(b.datum));
    if (fristBeginn && sortiert.length) {
      const tageBisBeginn = Math.round((new Date(sortiert[0].datum) - new Date(verordnung.ausstellungsdatum)) / 86400000);
      if (tageBisBeginn > fristBeginn) warnungen.push(`Behandlungsbeginn erst ${tageBisBeginn} Tage nach Ausstellung (Frist: ${fristBeginn} Tage).`);
    }
    if (fristUnterbrechung && sortiert.length > 1) {
      for (let i = 1; i < sortiert.length; i++) {
        const luecke = Math.round((new Date(sortiert[i].datum) - new Date(sortiert[i - 1].datum)) / 86400000);
        if (luecke > fristUnterbrechung) warnungen.push(`Unterbrechung von ${luecke} Tagen zwischen zwei Terminen (Frist: ${fristUnterbrechung} Tage).`);
      }
    }
    return warnungen;
  }

  // Füllt die Verordnungs-Auswahl im Termin-Modal: nur OFFENE Verordnungen des aktuell gewählten Patienten.
  function verordnungenOptionenRendern(patientId) {
    const sel = document.getElementById('modal-verordnung');
    const bisheriger = sel.value;
    const passende = patientId ? verordnungenCache.filter(v => !v.abgeschlossen && v.patient_id === patientId) : [];
    sel.innerHTML = '<option value="">Keine</option>' + passende.map(v =>
      `<option value="${v.id}">${(v.heilmittel_name || '').replace(/</g, '&lt;')} – ausgestellt ${new Date(v.ausstellungsdatum).toLocaleDateString('de-DE')}</option>`
    ).join('');
    if (passende.some(v => v.id === bisheriger)) sel.value = bisheriger;
  }

  async function verordnungAuswahlGeaendert() {
    const id = document.getElementById('modal-verordnung').value;
    const hinweisEl = document.getElementById('modal-verordnung-hinweis');
    if (!id) { hinweisEl.classList.add('hidden'); hinweisEl.classList.remove('warnung'); return; }
    const v = verordnungenCache.find(x => x.id === id);
    if (!v) { hinweisEl.classList.add('hidden'); return; }
    const { data } = await db.from('termine').select('id,datum,status').eq('verordnung_id', id);
    const termineDerVerordnung = data || [];
    const benutzt = termineDerVerordnung.filter(t => t.status !== 'abgesagt').length;
    const warnungen = pruefeVerordnungFristen(v, termineDerVerordnung);
    let html = `${benutzt} von ${v.anzahl_gesamt} Terminen dieser Verordnung belegt.`;
    if (warnungen.length) html += '<br>' + ICON_WARNUNG + ' ' + warnungen.join('<br>' + ICON_WARNUNG + ' ');
    hinweisEl.innerHTML = html;
    hinweisEl.classList.remove('hidden');
    hinweisEl.classList.toggle('warnung', warnungen.length > 0);
  }

  function verordnungHeilmittelOptionenRendern() {
    const sel = document.getElementById('verordnung-modal-heilmittel');
    sel.innerHTML = heilmittelCache.map(h => `<option value="${h.id}">${(h.name || '').replace(/</g, '&lt;')}</option>`).join('');
  }

  function verordnungPatientSucheEingabe() {
    const input = document.getElementById('verordnung-modal-patient');
    const box = document.getElementById('verordnung-patient-vorschlaege');
    const query = input.value.trim().toLowerCase();
    verordnungPatientAuswahlId = null;
    if (!query) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const treffer = patientenCache.filter(p => p.name.toLowerCase().includes(query)).slice(0, 8);
    if (!treffer.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = treffer.map(p => `
      <div class="patient-vorschlag" onmousedown="verordnungPatientAuswaehlen('${p.id}')">
        <span>${(p.name || '').replace(/</g, '&lt;')}</span>
        ${p.telefon ? `<span class="vorschlag-info">${p.telefon.replace(/</g, '&lt;')}</span>` : ''}
      </div>
    `).join('');
    box.classList.remove('hidden');
  }

  function verordnungPatientAuswaehlen(id) {
    const p = patientenCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('verordnung-modal-patient').value = p.name;
    verordnungPatientAuswahlId = id;
    document.getElementById('verordnung-patient-vorschlaege').classList.add('hidden');
  }

  function verordnungPatientSucheAusblenden() {
    setTimeout(() => {
      const box = document.getElementById('verordnung-patient-vorschlaege');
      if (box) box.classList.add('hidden');
    }, 150);
  }

  function oeffneVerordnungModal(vorausgewaehlterPatientName, rueckkehrZuTermin) {
    document.getElementById('verordnung-modal-id').value = '';
    document.getElementById('verordnung-modal-titel').textContent = 'Neue Verordnung';
    document.getElementById('verordnung-modal-delete-btn').classList.add('hidden');
    document.getElementById('verordnung-abschluss-wahl').style.display = 'none';
    document.getElementById('verordnung-modal-abgeschlossen').checked = false;
    document.getElementById('verordnung-modal-patient').value = vorausgewaehlterPatientName || '';
    verordnungPatientAuswahlId = null;
    if (vorausgewaehlterPatientName) {
      const treffer = patientenCache.find(p => p.name.trim().toLowerCase() === vorausgewaehlterPatientName.trim().toLowerCase());
      if (treffer) verordnungPatientAuswahlId = treffer.id;
    }
    verordnungHeilmittelOptionenRendern();
    document.getElementById('verordnung-modal-anzahl').value = 6;
    document.getElementById('verordnung-modal-ausstellungsdatum').value = isoDatum(new Date());
    document.getElementById('verordnung-modal-error').textContent = '';
    document.getElementById('verordnung-modal-rueckkehr').value = rueckkehrZuTermin ? 'termin' : '';
    document.getElementById('verordnung-modal-overlay').classList.remove('hidden');
  }

  function oeffneVerordnungModalAusTermin() {
    const name = document.getElementById('modal-patient').value.trim();
    oeffneVerordnungModal(name, true);
  }

  function oeffneVerordnungBearbeitenModal(v) {
    document.getElementById('verordnung-modal-id').value = v.id;
    document.getElementById('verordnung-modal-titel').textContent = 'Verordnung bearbeiten';
    document.getElementById('verordnung-modal-delete-btn').classList.remove('hidden');
    document.getElementById('verordnung-abschluss-wahl').style.display = 'block';
    document.getElementById('verordnung-modal-abgeschlossen').checked = !!v.abgeschlossen;
    document.getElementById('verordnung-modal-patient').value = v.patientenname;
    verordnungPatientAuswahlId = v.patient_id;
    verordnungHeilmittelOptionenRendern();
    document.getElementById('verordnung-modal-heilmittel').value = v.heilmittel_id || '';
    document.getElementById('verordnung-modal-anzahl').value = v.anzahl_gesamt;
    document.getElementById('verordnung-modal-ausstellungsdatum').value = v.ausstellungsdatum;
    document.getElementById('verordnung-modal-error').textContent = '';
    document.getElementById('verordnung-modal-rueckkehr').value = '';
    document.getElementById('verordnung-modal-overlay').classList.remove('hidden');
  }

  function oeffneVerordnungBearbeitenModalById(id) {
    const v = verordnungenCache.find(x => x.id === id);
    if (v) oeffneVerordnungBearbeitenModal(v);
  }

  function schliesseVerordnungModal() {
    document.getElementById('verordnung-modal-overlay').classList.add('hidden');
  }

  async function verordnungSpeichern() {
    const id = document.getElementById('verordnung-modal-id').value;
    const patientenname = document.getElementById('verordnung-modal-patient').value.trim();
    const heilmittelSel = document.getElementById('verordnung-modal-heilmittel');
    const heilmittel_id = heilmittelSel.value || null;
    const heilmittel_name = heilmittelSel.selectedOptions[0] ? heilmittelSel.selectedOptions[0].textContent : '';
    const anzahl_gesamt = parseInt(document.getElementById('verordnung-modal-anzahl').value, 10) || 1;
    const ausstellungsdatum = document.getElementById('verordnung-modal-ausstellungsdatum').value;
    const abgeschlossen = document.getElementById('verordnung-modal-abgeschlossen').checked;
    const fehlerEl = document.getElementById('verordnung-modal-error');
    if (!patientenname || !heilmittel_id || !ausstellungsdatum) {
      fehlerEl.textContent = 'Bitte Patient, Heilmittel und Ausstellungsdatum ausfüllen.';
      return;
    }
    const patient_id = verordnungPatientAuswahlId || await findeOderErstellePatient(patientenname);
    const datensatz = { patient_id, patientenname, heilmittel_id, heilmittel_name, anzahl_gesamt, ausstellungsdatum, abgeschlossen };
    const { data: neu, error } = id
      ? await db.from('verordnungen').update(datensatz).eq('id', id).select().single()
      : await db.from('verordnungen').insert(datensatz).select().single();
    if (error) { fehlerEl.textContent = 'Fehler: ' + error.message; return; }
    await ladeVerordnungen();
    const rueckkehr = document.getElementById('verordnung-modal-rueckkehr').value;
    schliesseVerordnungModal();
    if (rueckkehr === 'termin') {
      verordnungenOptionenRendern(patient_id);
      document.getElementById('modal-verordnung').value = (neu && neu.id) || '';
      verordnungAuswahlGeaendert();
    } else {
      renderVerordnungenListe();
    }
  }

  async function verordnungLoeschen() {
    const id = document.getElementById('verordnung-modal-id').value;
    if (!id) return;
    if (!confirm('Diese Verordnung wirklich löschen? Bereits verknüpfte Termine bleiben erhalten, verlieren aber die Verknüpfung.')) return;
    const { error } = await db.from('verordnungen').delete().eq('id', id);
    if (error) { document.getElementById('verordnung-modal-error').textContent = 'Fehler: ' + error.message; return; }
    await ladeVerordnungen();
    schliesseVerordnungModal();
    renderVerordnungenListe();
  }

  async function verordnungAlsAbgeschlossenMarkieren(id) {
    const { error } = await db.from('verordnungen').update({ abgeschlossen: true }).eq('id', id);
    if (error) { alert('Fehler: ' + error.message); return; }
    await ladeVerordnungen();
    renderVerordnungenListe();
  }

  function setzeVerordnungenFilter(name) {
    verordnungenFilterStatus = name;
    document.querySelectorAll('#verordnungen-filter-pille .filter-btn').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.verordnungfilter === name);
    });
    renderVerordnungenListe();
  }

  // Zeigt Verordnungen gesammelt an – mit Filter "Abgeschlossen" ist das zugleich die
  // gewünschte Abrechnungsvorbereitung (abgeschlossene Verordnungen gesammelt sichtbar).
  async function renderVerordnungenListe() {
    const container = document.getElementById('verordnungen-liste');
    if (!container) return;
    await ladeVerordnungen();
    const { data: termineMitVerordnung } = await db.from('termine').select('verordnung_id,datum,status').not('verordnung_id', 'is', null);
    const nachVerordnung = new Map();
    (termineMitVerordnung || []).forEach(t => {
      if (!nachVerordnung.has(t.verordnung_id)) nachVerordnung.set(t.verordnung_id, []);
      nachVerordnung.get(t.verordnung_id).push(t);
    });
    let liste = verordnungenCache.filter(v => verordnungenFilterStatus === 'abgeschlossen' ? v.abgeschlossen : !v.abgeschlossen);
    liste = liste.sort((a, b) => (b.ausstellungsdatum || '').localeCompare(a.ausstellungsdatum || ''));
    if (!liste.length) {
      container.innerHTML = `<div class="leer-zustand">${verordnungenFilterStatus === 'abgeschlossen' ? 'Noch keine abgeschlossenen Verordnungen.' : 'Keine offenen Verordnungen.'}</div>`;
      return;
    }
    container.innerHTML = liste.map(v => {
      const termineDerV = nachVerordnung.get(v.id) || [];
      const benutzt = termineDerV.filter(t => t.status !== 'abgesagt').length;
      const warnungen = pruefeVerordnungFristen(v, termineDerV);
      const prozent = Math.min(100, Math.round(benutzt / v.anzahl_gesamt * 100));
      const sortiertDaten = termineDerV.map(t => t.datum).sort();
      const zeitraum = sortiertDaten.length
        ? `${sortiertDaten[0].split('-').reverse().join('.')} – ${sortiertDaten[sortiertDaten.length - 1].split('-').reverse().join('.')}`
        : '–';
      const abschlussHinweis = (!v.abgeschlossen && benutzt >= v.anzahl_gesamt)
        ? `<div class="verordnung-abschluss-hinweis"><button onclick="verordnungAlsAbgeschlossenMarkieren('${v.id}')">Alle Termine erreicht – als abgeschlossen markieren</button></div>`
        : '';
      return `
        <div class="verordnung-karte" data-id="${v.id}">
          <div class="verordnung-kopf">
            <div><b>${(v.patientenname || '').replace(/</g, '&lt;')}</b> &middot; ${(v.heilmittel_name || '').replace(/</g, '&lt;')}</div>
            <div class="verordnung-aktionen">
              <button class="heilmittel-loesch-btn" title="Bearbeiten" onclick="oeffneVerordnungBearbeitenModalById('${v.id}')">${ICON_STIFT}</button>
            </div>
          </div>
          <div class="statistik-track"><div class="statistik-balken" style="width:${prozent}%"></div></div>
          <div class="verordnung-meta">${benutzt} von ${v.anzahl_gesamt} &middot; ausgestellt ${new Date(v.ausstellungsdatum).toLocaleDateString('de-DE')} &middot; Zeitraum: ${zeitraum}</div>
          ${warnungen.length ? `<div class="verordnung-warnung">${ICON_WARNUNG} ${warnungen.join('<br>' + ICON_WARNUNG + ' ')}</div>` : ''}
          ${abschlussHinweis}
        </div>
      `;
    }).join('');
  }

  // ---- Warteliste ----
  async function ladeWarteliste() {
    const { data, error } = await db.from('warteliste').select('*').order('erstellt_am', { ascending: true });
    wartelisteCache = error ? [] : (data || []);
    renderWartelisteListe();
  }

  function renderWartelisteListe() {
    const container = document.getElementById('warteliste-liste');
    if (!container) return;
    if (!wartelisteCache.length) { container.innerHTML = '<div class="leer-zustand">Niemand auf der Warteliste.</div>'; return; }
    container.innerHTML = wartelisteCache.map(w => `
      <div class="warteliste-zeile">
        <div>
          <div><b>${(w.patientenname || '').replace(/</g, '&lt;')}</b> &middot; ${w.therapeut ? w.therapeut : 'egal wer'}${w.wunsch_ab ? ' &middot; ab ' + new Date(w.wunsch_ab).toLocaleDateString('de-DE') : ''}${w.telefon ? ' &middot; ' + w.telefon.replace(/</g, '&lt;') : ''}</div>
          ${w.notiz ? `<div class="warteliste-notiz">${w.notiz.replace(/</g, '&lt;')}</div>` : ''}
        </div>
        <button class="heilmittel-loesch-btn" title="Entfernen" onclick="wartelisteEintragLoeschen('${w.id}')">${ICON_TRASH}</button>
      </div>
    `).join('');
  }

  async function wartelisteEintragLoeschen(id) {
    if (!confirm('Diesen Warteliste-Eintrag entfernen?')) return;
    const { error } = await db.from('warteliste').delete().eq('id', id);
    if (error) { alert('Fehler: ' + error.message); return; }
    await ladeWarteliste();
  }

  function wartelistePatientSucheEingabe() {
    const input = document.getElementById('warteliste-modal-patient');
    const box = document.getElementById('warteliste-patient-vorschlaege');
    const query = input.value.trim().toLowerCase();
    wartelistePatientAuswahlId = null;
    if (!query) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const treffer = patientenCache.filter(p => p.name.toLowerCase().includes(query)).slice(0, 8);
    if (!treffer.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = treffer.map(p => `
      <div class="patient-vorschlag" onmousedown="wartelistePatientAuswaehlen('${p.id}')">
        <span>${(p.name || '').replace(/</g, '&lt;')}</span>
        ${p.telefon ? `<span class="vorschlag-info">${p.telefon.replace(/</g, '&lt;')}</span>` : ''}
      </div>
    `).join('');
    box.classList.remove('hidden');
  }

  function wartelistePatientAuswaehlen(id) {
    const p = patientenCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('warteliste-modal-patient').value = p.name;
    wartelistePatientAuswahlId = id;
    if (p.telefon && !document.getElementById('warteliste-modal-telefon').value) {
      document.getElementById('warteliste-modal-telefon').value = p.telefon;
    }
    document.getElementById('warteliste-patient-vorschlaege').classList.add('hidden');
  }

  function wartelistePatientSucheAusblenden() {
    setTimeout(() => {
      const box = document.getElementById('warteliste-patient-vorschlaege');
      if (box) box.classList.add('hidden');
    }, 150);
  }

  function oeffneWartelisteModal() {
    document.getElementById('warteliste-modal-patient').value = '';
    wartelistePatientAuswahlId = null;
    document.getElementById('warteliste-modal-therapeut').value = '';
    document.getElementById('warteliste-modal-ab').value = '';
    document.getElementById('warteliste-modal-telefon').value = '';
    document.getElementById('warteliste-modal-notiz').value = '';
    document.getElementById('warteliste-modal-error').textContent = '';
    document.getElementById('warteliste-modal-overlay').classList.remove('hidden');
  }

  function schliesseWartelisteModal() {
    document.getElementById('warteliste-modal-overlay').classList.add('hidden');
  }

  async function wartelisteSpeichern() {
    const patientenname = document.getElementById('warteliste-modal-patient').value.trim();
    const fehlerEl = document.getElementById('warteliste-modal-error');
    if (!patientenname) { fehlerEl.textContent = 'Bitte einen Namen eingeben.'; return; }
    const therapeut = document.getElementById('warteliste-modal-therapeut').value || null;
    const wunsch_ab = document.getElementById('warteliste-modal-ab').value || null;
    const telefon = document.getElementById('warteliste-modal-telefon').value.trim() || null;
    const notiz = document.getElementById('warteliste-modal-notiz').value.trim() || null;
    const patient_id = wartelistePatientAuswahlId || await findeOderErstellePatient(patientenname);
    const { error } = await db.from('warteliste').insert({ patient_id, patientenname, therapeut, wunsch_ab, telefon, notiz });
    if (error) { fehlerEl.textContent = 'Fehler: ' + error.message; return; }
    await ladeWarteliste();
    schliesseWartelisteModal();
  }

  // Dezenter Hinweis, wenn durch eine Absage/Löschung ein Termin frei wird und die Warteliste
  // passende Kandidat:innen enthält (passender Therapeut oder "egal wer", und wunsch_ab erfüllt).
  function pruefeWartelisteHinweis(therapeut, datum) {
    if (!wartelisteCache.length) return;
    const passende = wartelisteCache.filter(w => (!w.therapeut || w.therapeut === therapeut) && (!w.wunsch_ab || w.wunsch_ab <= datum));
    if (!passende.length) return;
    const text = passende.slice(0, 5).map(w => `${w.patientenname}${w.telefon ? ' (' + w.telefon + ')' : ''}`).join('\n');
    setTimeout(() => alert(`Hinweis: ${passende.length} Person(en) auf der Warteliste könnten diesen frei gewordenen Termin nutzen:\n\n${text}`), 250);
  }
