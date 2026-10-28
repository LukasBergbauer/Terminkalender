// ======================================================================
// js/stammdaten.js – Heilmittel (Behandlungstypen), Patientendatei, Änderungsprotokoll, Backup-Export (PDF + JSON)
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Heilmittelverordnungen (Behandlungstypen) ----
  // Erweiterte, nach Farbton sortierte Palette (deutlich mehr als die ursprünglichen 7 Farben,
  // kräftigere Töne). Alte Werte (blau/violett/pink/gruen/orange/tuerkis/gelb) bleiben gültig,
  // damit bereits gespeicherte Heilmittel ihre Farbe behalten – es kommen nur neue Töne dazu.
  const HEILMITTEL_FARBEN = ['rot', 'orange', 'gelb', 'limette', 'gruen', 'tuerkis', 'cyan', 'blau', 'indigo', 'violett', 'magenta', 'pink', 'braun', 'grau'];

  async function ladeHeilmittel() {
    const { data, error } = await db.from('heilmittel').select('*').order('reihenfolge', { ascending: true });
    heilmittelCache = error ? [] : (data || []);
    renderHeilmittelListe();
    renderBehandlungstypOptionen();
  }

  function renderHeilmittelListe() {
    const container = document.getElementById('heilmittel-liste');
    if (!container) return;
    if (!heilmittelCache.length) {
      container.innerHTML = '<div class="leer-zustand">Noch keine Heilmittel angelegt (oder die Tabelle wurde noch nicht per SQL angelegt).</div>';
      return;
    }
    container.innerHTML = heilmittelCache.map(h => `
      <div class="heilmittel-zeile" data-id="${h.id}" ondragover="heilmittelDragOver(event)" ondragleave="heilmittelDragLeave(event)" ondrop="heilmittelDrop(event,'${h.id}')">
        <span class="heilmittel-drag-griff" draggable="true" title="Ziehen, um die Reihenfolge zu ändern" ondragstart="heilmittelDragStart(event,'${h.id}')" ondragend="heilmittelDragEnd(event)">${ICON_GRIFF}</span>
        <div class="heilmittel-name-zelle">
          <input type="text" value="${(h.name || '').replace(/"/g, '&quot;')}" onchange="heilmittelFeldAktualisieren('${h.id}', 'name', this.value)">
          <label class="heilmittel-spalte-label" title="Läuft parallel zum Therapeuten in einer eigenen schmalen Spur (z.B. Fango/Massage)">
            <input type="checkbox" ${h.eigene_spalte ? 'checked' : ''} onchange="heilmittelFeldAktualisieren('${h.id}', 'eigene_spalte', this.checked)"> eigene Spalte (parallel)
          </label>
        </div>
        <input type="text" value="${(h.kurzform || '').replace(/"/g, '&quot;')}" placeholder="Kurz" onchange="heilmittelFeldAktualisieren('${h.id}', 'kurzform', this.value)">
        <input type="number" min="5" step="5" value="${h.dauer_minuten}" onchange="heilmittelFeldAktualisieren('${h.id}', 'dauer_minuten', this.value)">
        <button type="button" class="farbe-schwatch" style="--termin-farbe:var(--${h.farbe || 'violett'})" title="Farbe wählen" onclick="farbPickerOeffnen(event, '${h.id}', '${h.farbe || 'violett'}')"></button>
        <label class="heilmittel-aktiv-label"><input type="checkbox" ${h.aktiv ? 'checked' : ''} onchange="heilmittelFeldAktualisieren('${h.id}', 'aktiv', this.checked)"> aktiv</label>
        <button type="button" class="heilmittel-loesch-btn" title="Löschen" onclick="heilmittelLoeschen('${h.id}')">${ICON_TRASH}</button>
      </div>
    `).join('');
  }

  // Heilmittel-Liste per Drag neu anordnen – bestimmt die Reihenfolge im Behandlungstyp-Dropdown
  // beim Termin-Anlegen (Feld `reihenfolge`). Nutzt die native HTML5-Drag&Drop-API über den
  // kleinen Griff-Icon links, damit Text in den Eingabefeldern weiterhin normal markierbar bleibt.
  let heilmittelDragId = null;

  function heilmittelDragStart(event, id) {
    heilmittelDragId = id;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id); // von Firefox benötigt, damit der Drag startet
    const zeile = event.target.closest('.heilmittel-zeile');
    if (zeile) zeile.classList.add('dragging');
  }

  function heilmittelDragOver(event) {
    if (!heilmittelDragId) return;
    event.preventDefault(); // nötig, damit "drop" überhaupt feuert
    const zeile = event.currentTarget;
    if (zeile.dataset.id !== heilmittelDragId) zeile.classList.add('drop-vor');
  }

  function heilmittelDragLeave(event) {
    event.currentTarget.classList.remove('drop-vor');
  }

  async function heilmittelDrop(event, zielId) {
    event.preventDefault();
    event.currentTarget.classList.remove('drop-vor');
    const quelleId = heilmittelDragId;
    heilmittelDragId = null;
    if (!quelleId || quelleId === zielId) return;

    const neueReihenfolge = heilmittelCache.map(h => h.id).filter(id => id !== quelleId);
    const zielIndex = neueReihenfolge.indexOf(zielId);
    neueReihenfolge.splice(zielIndex, 0, quelleId);

    // Sofort optisch umsortieren (optimistisch), dann die reihenfolge-Werte in der DB speichern.
    heilmittelCache.sort((a, b) => neueReihenfolge.indexOf(a.id) - neueReihenfolge.indexOf(b.id));
    renderHeilmittelListe();
    renderBehandlungstypOptionen();

    await Promise.all(neueReihenfolge.map((id, index) => db.from('heilmittel').update({ reihenfolge: index }).eq('id', id)));
    await ladeHeilmittel();
  }

  function heilmittelDragEnd() {
    document.querySelectorAll('.heilmittel-zeile.dragging, .heilmittel-zeile.drop-vor').forEach(el => el.classList.remove('dragging', 'drop-vor'));
    heilmittelDragId = null;
  }

  // Farbauswahl-Popover (normale + pastellfarbene Kacheln) statt eines langen Punkt-Rasters –
  // öffnet sich neben dem angeklickten Farb-Schwatch.
  let farbPickerHeilmittelId = null;
  function farbPickerOeffnen(event, heilmittelId, aktuelleFarbe) {
    event.stopPropagation();
    farbPickerHeilmittelId = heilmittelId;
    const pop = document.getElementById('farbe-popover');
    const normalEl = document.getElementById('farbe-popover-normal');
    const pastellEl = document.getElementById('farbe-popover-pastell');
    normalEl.innerHTML = HEILMITTEL_FARBEN.map(f => `<button type="button" class="farbe-kachel ${f === aktuelleFarbe ? 'ausgewaehlt' : ''}" style="background:var(--${f})" title="${f}" onclick="farbeWaehlen('${f}')"></button>`).join('');
    pastellEl.innerHTML = HEILMITTEL_FARBEN.map(f => `<button type="button" class="farbe-kachel ${f === aktuelleFarbe ? 'ausgewaehlt' : ''}" style="background:color-mix(in srgb, var(--${f}) 40%, white)" title="${f} (pastell)" onclick="farbeWaehlen('${f}')"></button>`).join('');
    const rect = event.currentTarget.getBoundingClientRect();
    pop.classList.remove('hidden');
    let left = rect.left;
    if (left + 232 > window.innerWidth - 10) left = window.innerWidth - 242;
    let top = rect.bottom + 6;
    if (top + 180 > window.innerHeight - 10) top = rect.top - 186;
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
  }

  function farbeWaehlen(farbe) {
    if (farbPickerHeilmittelId) heilmittelFeldAktualisieren(farbPickerHeilmittelId, 'farbe', farbe);
    document.getElementById('farbe-popover').classList.add('hidden');
    farbPickerHeilmittelId = null;
  }

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('farbe-popover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (!pop.contains(e.target) && !e.target.closest('.farbe-schwatch')) pop.classList.add('hidden');
  });

  function renderBehandlungstypOptionen() {
    const sel = document.getElementById('modal-behandlungstyp');
    if (!sel) return;
    const bisherigerWert = sel.value;
    let aktive = heilmittelCache.filter(h => h.aktiv);
    if (!aktive.length) {
      // Fallback, falls die Heilmittel-Tabelle noch nicht angelegt/befüllt ist
      aktive = [
        { name: '20 Min KG', dauer_minuten: 20 },
        { name: '45 Min Lymphdrainage', dauer_minuten: 45 },
        { name: '60 Min Lymphdrainage', dauer_minuten: 60 },
        { name: 'Sonstige', dauer_minuten: 20 }
      ];
    }
    sel.innerHTML = aktive.map(h =>
      `<option value="${h.name.replace(/"/g, '&quot;')}" data-dauer="${h.dauer_minuten}">${h.name}</option>`
    ).join('');
    if (aktive.some(h => h.name === bisherigerWert)) sel.value = bisherigerWert;
  }

  async function heilmittelFeldAktualisieren(id, feld, wert) {
    const patch = {};
    if (feld === 'dauer_minuten') patch[feld] = parseInt(wert, 10) || 20;
    else if (feld === 'frist_beginn_tage' || feld === 'frist_unterbrechung_tage') patch[feld] = (wert === '' || wert === null) ? null : (parseInt(wert, 10) || null);
    else if (feld === 'eigene_spalte') patch[feld] = !!wert;
    else patch[feld] = wert;
    const { error } = await db.from('heilmittel').update(patch).eq('id', id);
    if (error) { alert('Fehler beim Speichern: ' + error.message); }
    await ladeHeilmittel();
  }

  async function heilmittelLoeschen(id) {
    if (!confirm('Dieses Heilmittel wirklich löschen? Bereits gespeicherte Termine behalten ihre Bezeichnung, es ist nur für neue Termine nicht mehr wählbar.')) return;
    const { error } = await db.from('heilmittel').delete().eq('id', id);
    if (error) { alert('Fehler beim Löschen: ' + error.message); return; }
    await ladeHeilmittel();
  }

  async function heilmittelNeu() {
    const { error } = await db.from('heilmittel').insert({
      name: 'Neues Heilmittel', kurzform: '', dauer_minuten: 20, farbe: 'violett', aktiv: true, reihenfolge: heilmittelCache.length
    });
    if (error) { alert('Fehler beim Anlegen: ' + error.message); return; }
    await ladeHeilmittel();
  }

  // ---- Patientendatei (Suche/Auswahl im Termin-Modal + eigenes Anlegen) ----
  async function ladePatienten() {
    const { data, error } = await db.from('patienten').select('*').order('name', { ascending: true });
    patientenCache = error ? [] : (data || []);
  }

  function patientSucheEingabe() {
    const input = document.getElementById('modal-patient');
    const box = document.getElementById('patient-vorschlaege');
    const query = input.value.trim().toLowerCase();
    if (!query) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const treffer = patientenCache
      .filter(p => p.name.toLowerCase().includes(query))
      .slice(0, 8);
    if (!treffer.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.innerHTML = treffer.map(p => `
      <div class="patient-vorschlag" onmousedown="patientAuswaehlen('${p.id}')">
        <span>${(p.name || '').replace(/</g, '&lt;')}</span>
        ${p.telefon ? `<span class="vorschlag-info">${p.telefon.replace(/</g, '&lt;')}</span>` : ''}
      </div>
    `).join('');
    box.classList.remove('hidden');
  }

  function patientAuswaehlen(id) {
    const p = patientenCache.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modal-patient').value = p.name;
    document.getElementById('patient-vorschlaege').classList.add('hidden');
    verordnungenOptionenRendern(id);
  }

  function patientSucheAusblenden() {
    // kleine Verzögerung, damit der onmousedown-Klick auf einen Vorschlag vor dem Ausblenden feuert
    setTimeout(() => {
      const box = document.getElementById('patient-vorschlaege');
      if (box) box.classList.add('hidden');
    }, 150);
  }

  // Findet einen Patienten per case-insensitivem Namensabgleich, legt bei Bedarf einen neuen an.
  // Wird beim Speichern jedes Termins aufgerufen, damit "Patient auswählen statt neu eintippen" auch
  // dann funktioniert, wenn einfach ein neuer Name eingetippt wurde (dann wird er automatisch angelegt).
  async function findeOderErstellePatient(name) {
    const n = (name || '').trim();
    if (!n) return null;
    const imCache = patientenCache.find(p => p.name.trim().toLowerCase() === n.toLowerCase());
    if (imCache) return imCache.id;
    const { data: vorhandene } = await db.from('patienten').select('*').ilike('name', n).limit(1);
    if (vorhandene && vorhandene.length) {
      patientenCache.push(vorhandene[0]);
      return vorhandene[0].id;
    }
    const { data: neu, error } = await db.from('patienten').insert({ name: n }).select().single();
    if (error || !neu) { console.error('Patient konnte nicht angelegt werden:', error); return null; }
    patientenCache.push(neu);
    return neu.id;
  }

  function oeffnePatientModal(patient) {
    document.getElementById('patient-modal-id').value = patient ? patient.id : '';
    document.getElementById('patient-modal-titel').textContent = patient ? 'Patient bearbeiten' : 'Neuer Patient';
    document.getElementById('patient-modal-delete-btn').classList.toggle('hidden', !patient);
    document.getElementById('patient-modal-name').value = patient ? patient.name : '';
    document.getElementById('patient-modal-telefon').value = (patient && patient.telefon) || '';
    document.getElementById('patient-modal-notiz').value = (patient && patient.notiz) || '';
    document.getElementById('patient-modal-error').textContent = '';
    document.getElementById('patient-modal-overlay').classList.remove('hidden');
  }

  function patientBearbeiten(id) {
    const patient = patientenCache.find(p => p.id === id);
    if (patient) oeffnePatientModal(patient);
  }

  function schliessePatientModal() {
    document.getElementById('patient-modal-overlay').classList.add('hidden');
  }

  async function patientSpeichern() {
    const id = document.getElementById('patient-modal-id').value;
    const name = document.getElementById('patient-modal-name').value.trim();
    const telefon = document.getElementById('patient-modal-telefon').value.trim();
    const notiz = document.getElementById('patient-modal-notiz').value.trim();
    const fehlerEl = document.getElementById('patient-modal-error');
    if (!name) { fehlerEl.textContent = 'Bitte einen Namen eingeben.'; return; }
    const kollision = patientenCache.find(p => p.name.trim().toLowerCase() === name.toLowerCase() && p.id !== id);
    if (kollision) {
      fehlerEl.textContent = 'Ein Patient mit diesem Namen existiert bereits.';
      return;
    }

    if (id) {
      // Alten Namen VOR dem Update als reinen Wert sichern (nicht als Objekt-Referenz) – sonst
      // wäre er nach dem Update schon mitgeändert und der Vergleich unten liefe immer leer.
      const alterPatient = patientenCache.find(p => p.id === id);
      const alterName = alterPatient ? alterPatient.name : null;
      const { error } = await db.from('patienten').update({ name, telefon: telefon || null, notiz: notiz || null }).eq('id', id);
      if (error) { fehlerEl.textContent = 'Fehler beim Speichern: ' + error.message; return; }
      // Name hat sich geändert -> auch den Freitext-Snapshot auf allen zugeordneten Terminen
      // nachziehen, sonst taucht der Patient in Terminliste/Patientenliste doppelt auf.
      if (alterName !== null && alterName !== name) {
        await db.from('termine').update({ patientenname: name }).eq('patient_id', id);
      }
    } else {
      const { error } = await db.from('patienten').insert({
        name, telefon: telefon || null, notiz: notiz || null
      });
      if (error) { fehlerEl.textContent = 'Fehler beim Speichern: ' + error.message; return; }
    }
    await ladePatienten();
    schliessePatientModal();
    await ladePatientenAnsicht();
  }

  async function patientLoeschen() {
    const id = document.getElementById('patient-modal-id').value;
    if (!id) return;
    if (!confirm('Diesen Patienten wirklich löschen? Bereits gespeicherte Termine behalten den Namen, verlieren aber die Verknüpfung zur Patientendatei.')) return;
    const { error } = await db.from('patienten').delete().eq('id', id);
    if (error) { document.getElementById('patient-modal-error').textContent = 'Fehler beim Löschen: ' + error.message; return; }
    await ladePatienten();
    schliessePatientModal();
    await ladePatientenAnsicht();
  }

  // ---- Änderungsprotokoll (Audit-Log: wer hat wann welchen Termin angelegt/verschoben/bearbeitet/gelöscht) ----
  async function protokolliere(terminId, aktion, details, datumTermin) {
    try {
      await db.from('aenderungsprotokoll').insert({
        termin_id: terminId || null,
        aktion,
        wer: aktuellerNutzerEmail || 'unbekannt',
        details: details || null,
        datum_termin: datumTermin || null
      });
    } catch (e) {
      // Protokoll ist "nice to have" – darf den eigentlichen Speichervorgang nie blockieren
      console.error('Änderungsprotokoll konnte nicht gespeichert werden:', e);
    }
  }

  const PROTOKOLL_AKTION_LABEL = { angelegt: 'Angelegt', bearbeitet: 'Bearbeitet', verschoben: 'Verschoben', gelöscht: 'Gelöscht' };

  async function ladeProtokoll() {
    const container = document.getElementById('protokoll-liste');
    if (!container) return;
    const { data, error } = await db.from('aenderungsprotokoll').select('*').order('erstellt_am', { ascending: false }).limit(50);
    if (error) {
      container.innerHTML = '<div class="leer-zustand">Protokoll noch nicht verfügbar (Tabelle evtl. noch nicht per SQL angelegt).</div>';
      return;
    }
    if (!data || !data.length) {
      container.innerHTML = '<div class="leer-zustand">Noch keine Einträge.</div>';
      return;
    }
    container.innerHTML = data.map(e => {
      const zeit = new Date(e.erstellt_am).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const aktionLabel = PROTOKOLL_AKTION_LABEL[e.aktion] || e.aktion;
      const details = (e.details || '').replace(/</g, '&lt;');
      const wer = (e.wer || '').replace(/</g, '&lt;');
      return `<div class="protokoll-zeile">
        <span class="zeitpunkt">${zeit}</span>
        <span><b>${aktionLabel}</b> &middot; ${details}</span>
        <span class="wer">${wer}</span>
      </div>`;
    }).join('');
  }

  // ---- Backup-Export (manuell, lokal – kein automatisierter Cloud-Export nötig) ----
  // Seit 2026-10-27 (zwölfter Durchgang) auf Lukas' Wunsch um einen Zeitraum-Filter erweitert:
  // "Gesamter Zeitraum" (wie bisher), "Ein bestimmter Monat" oder "Ein bestimmtes Jahr" – jeweils
  // weiterhin als eine einzige Datei, die sich jederzeit wieder öffnen lässt. Patienten und
  // Heilmittel sind Stammdaten ohne eigenes Datum und bleiben darum in jeder Backup-Art komplett
  // enthalten (sonst würden z.B. Monats-Backups auf Patienten verweisen, die nicht mit drin sind) –
  // nur die Termine selbst werden auf den gewählten Zeitraum eingeschränkt.
  //
  // Seit 2026-10-28: Ein Backup besteht aus ZWEI Dateien, die Lukas jeweils selbst an einen Ort
  // seiner Wahl speichert (kein automatischer Download in einen festen Ordner):
  //   1. PDF  – Termine und Patienten in Schriftform zum Lesen/Ausdrucken (backupPdfBauen),
  //   2. JSON – wie bisher; lässt sich über "Backup öffnen" in der Kalenderansicht anzeigen
  //            (siehe backupDateiGewaehlt in weitere-ansichten.js).
  // Ablauf: "Backup jetzt exportieren" lädt die Daten einmal (beide Dateien also garantiert mit
  // identischem Inhalt), danach erscheinen zwei Knöpfe "PDF speichern…" / "JSON speichern…".
  // Zwei getrennte Klicks sind nötig, weil der Browser das "Speichern unter"-Fenster nur direkt
  // nach einem Klick öffnen darf – zwei Fenster nacheinander aus einem Klick blockiert er.
  let backupVorbereitet = null; // { daten, zeitraumLabel, zeitraumText, datumStr }

  function backupZeitraumTypGeaendert() {
    const typ = document.getElementById('backup-zeitraum-typ').value;
    document.getElementById('backup-monat-wert').classList.toggle('hidden', typ !== 'monat');
    document.getElementById('backup-jahr-wert').classList.toggle('hidden', typ !== 'jahr');
    if (typ === 'monat' && !document.getElementById('backup-monat-wert').value) {
      const heute = new Date();
      document.getElementById('backup-monat-wert').value = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0');
    }
    if (typ === 'jahr' && !document.getElementById('backup-jahr-wert').value) {
      document.getElementById('backup-jahr-wert').value = new Date().getFullYear();
    }
    backupVorbereitungVerwerfen();
  }

  // Zeitraum wurde geändert -> bereits geladene Daten passen nicht mehr, Speichern-Knöpfe weg.
  function backupVorbereitungVerwerfen() {
    if (!backupVorbereitet) return;
    backupVorbereitet = null;
    document.getElementById('backup-speichern-leiste').classList.add('hidden');
    document.getElementById('backup-status').textContent = 'Zeitraum geändert – bitte erneut „Backup jetzt exportieren“.';
  }

  async function backupExportieren() {
    const statusEl = document.getElementById('backup-status');
    const leiste = document.getElementById('backup-speichern-leiste');
    leiste.classList.add('hidden');
    backupVorbereitet = null;
    const typ = document.getElementById('backup-zeitraum-typ').value;
    let von = null, bis = null, zeitraumLabel = 'gesamt', zeitraumText = 'Gesamter Zeitraum';
    if (typ === 'monat') {
      const wert = document.getElementById('backup-monat-wert').value; // Format "YYYY-MM"
      if (!wert) { statusEl.textContent = 'Bitte einen Monat auswählen.'; return; }
      const [jahr, monat] = wert.split('-').map(Number);
      von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
      const letzterTag = new Date(jahr, monat, 0).getDate();
      bis = `${jahr}-${String(monat).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`;
      zeitraumLabel = wert;
      zeitraumText = new Date(jahr, monat - 1, 1).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    } else if (typ === 'jahr') {
      const jahr = Number(document.getElementById('backup-jahr-wert').value);
      if (!jahr) { statusEl.textContent = 'Bitte ein Jahr angeben.'; return; }
      von = `${jahr}-01-01`;
      bis = `${jahr}-12-31`;
      zeitraumLabel = String(jahr);
      zeitraumText = 'Jahr ' + jahr;
    }
    statusEl.textContent = 'Exportiere...';
    try {
      let termineQuery = db.from('termine').select('*').order('datum', { ascending: true });
      if (von) termineQuery = termineQuery.gte('datum', von).lte('datum', bis);
      const [termineRes, patientenRes, heilmittelRes, oeffnungszeitenRes] = await Promise.all([
        termineQuery,
        db.from('patienten').select('*'),
        db.from('heilmittel').select('*'),
        db.from('oeffnungszeiten').select('*')
      ]);
      if (termineRes.error) throw new Error(termineRes.error.message);
      const backup = {
        erstellt_am: new Date().toISOString(),
        zeitraum: typ === 'alles' ? 'gesamt' : { typ, von, bis },
        termine: termineRes.data || [],
        patienten: patientenRes.data || [],
        heilmittel: heilmittelRes.data || [],
        oeffnungszeiten: oeffnungszeitenRes.data || []
      };
      backupVorbereitet = { daten: backup, zeitraumLabel, zeitraumText, datumStr: isoDatum(new Date()) };
      document.getElementById('backup-pdf-btn').textContent = 'PDF speichern…';
      document.getElementById('backup-json-btn').textContent = 'JSON speichern…';
      leiste.classList.remove('hidden');
      statusEl.textContent = `Bereit (${backup.termine.length} Termine, ${backup.patienten.length} Patienten) – jetzt beide Dateien speichern.`;
    } catch (e) {
      statusEl.textContent = 'Fehler beim Export: ' + e.message;
    }
  }

  async function backupPdfSpeichern() {
    if (!backupVorbereitet) return;
    const v = backupVorbereitet;
    const blob = backupPdfBauen(v.daten, v.zeitraumText);
    const ergebnis = await backupDateiSpeichern(blob, `terminkalender-backup-${v.zeitraumLabel}-${v.datumStr}.pdf`, 'PDF-Dokument', 'application/pdf', '.pdf');
    backupSpeicherErgebnisAnzeigen(ergebnis, 'PDF', 'backup-pdf-btn');
  }

  async function backupJsonSpeichern() {
    if (!backupVorbereitet) return;
    const v = backupVorbereitet;
    const blob = new Blob([JSON.stringify(v.daten, null, 2)], { type: 'application/json' });
    const ergebnis = await backupDateiSpeichern(blob, `terminkalender-backup-${v.zeitraumLabel}-${v.datumStr}.json`, 'Backup (JSON)', 'application/json', '.json');
    backupSpeicherErgebnisAnzeigen(ergebnis, 'JSON', 'backup-json-btn');
  }

  function backupSpeicherErgebnisAnzeigen(ergebnis, art, btnId) {
    const statusEl = document.getElementById('backup-status');
    if (ergebnis === 'abgebrochen') { statusEl.textContent = `${art}: Speichern abgebrochen.`; return; }
    if (ergebnis === 'fehler') { statusEl.textContent = `${art}: Datei konnte nicht gespeichert werden.`; return; }
    document.getElementById(btnId).textContent = `${art} gespeichert ✓`;
    statusEl.textContent = ergebnis === 'gespeichert'
      ? `${art} gespeichert.`
      : `${art} heruntergeladen (dieser Browser lässt keinen Speicherort wählen).`;
    try { localStorage.setItem('letztesBackup', backupVorbereitet.datumStr); } catch (e) { /* egal */ }
  }

  // Öffnet – wo der Browser es kann (Chrome, Edge) – das "Speichern unter"-Fenster, in dem Ort und
  // Dateiname frei wählbar sind. Andere Browser (Safari, Firefox) kennen das nicht; dort bleibt nur
  // der normale Download, der je nach Browser-Einstellung ebenfalls nachfragt.
  // Rückgabe: 'gespeichert' | 'heruntergeladen' | 'abgebrochen' | 'fehler'
  async function backupDateiSpeichern(blob, dateiname, beschreibung, mimeTyp, endung) {
    if (window.showSaveFilePicker) {
      let handle;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: dateiname,
          types: [{ description: beschreibung, accept: { [mimeTyp]: [endung] } }]
        });
      } catch (e) {
        if (e && e.name === 'AbortError') return 'abgebrochen';
        handle = null; // z.B. Sicherheitsfehler -> unten auf normalen Download ausweichen
      }
      if (handle) {
        try {
          const schreiber = await handle.createWritable();
          await schreiber.write(blob);
          await schreiber.close();
          return 'gespeichert';
        } catch (e) {
          console.error('Backup konnte nicht geschrieben werden:', e);
          return 'fehler';
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = dateiname;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'heruntergeladen';
  }

  // Baut das Backup-PDF (A4 hoch) komplett selbst – ohne externe Bibliothek, damit keine
  // Patientendaten an fremden Code gehen und nichts nachgeladen werden muss. Genutzt werden die
  // in jedem PDF-Programm eingebauten Schriften Helvetica/Helvetica-Bold (WinAnsi-Zeichensatz:
  // Umlaute, ß, €, Gedankenstrich gehen; seltene andere Zeichen werden zu "?").
  // Alle Hilfsfunktionen sind bewusst lokal, damit keine weiteren globalen Namen entstehen.
  function backupPdfBauen(backup, zeitraumText) {
    // Zeichenbreiten (1/1000 der Schriftgröße) für die Zeichen 32–255, aus den Adobe-Metriken.
    const BREITEN = {
      normal: '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'.split(',').map(Number),
      fett: '278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556'.split(',').map(Number)
    };
    // Unicode-Zeichen, die im WinAnsi-Zeichensatz auf 128–159 liegen
    const WINANSI = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };

    // Text -> Liste von Zeichencodes (0–255), unbekannte Zeichen werden zu "?"
    function kodieren(text) {
      const codes = [];
      for (const z of String(text == null ? '' : text).replace(/→/g, '->').replace(/[\r\n\t]+/g, ' ')) {
        const c = z.codePointAt(0);
        if (WINANSI[z]) codes.push(WINANSI[z]);
        else if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) codes.push(c);
        else codes.push(63);
      }
      return codes;
    }
    function breite(text, groesse, fett) {
      const tabelle = fett ? BREITEN.fett : BREITEN.normal;
      return kodieren(text).reduce((s, c) => s + (tabelle[c - 32] || 556), 0) * groesse / 1000;
    }
    // Bricht Text an Leerzeichen um (zu lange Einzelwörter werden hart geteilt)
    function umbrechen(text, maxBreite, groesse, fett) {
      const woerter = String(text == null ? '' : text).replace(/\s+/g, ' ').trim().split(' ');
      const zeilen = [];
      let zeile = '';
      woerter.forEach(wort => {
        while (breite(wort, groesse, fett) > maxBreite && wort.length > 1) {
          let n = wort.length - 1;
          while (n > 1 && breite(wort.slice(0, n), groesse, fett) > maxBreite) n--;
          if (zeile) { zeilen.push(zeile); zeile = ''; }
          zeilen.push(wort.slice(0, n));
          wort = wort.slice(n);
        }
        const probe = zeile ? zeile + ' ' + wort : wort;
        if (breite(probe, groesse, fett) <= maxBreite) zeile = probe;
        else { if (zeile) zeilen.push(zeile); zeile = wort; }
      });
      if (zeile || !zeilen.length) zeilen.push(zeile);
      return zeilen;
    }
    function pdfString(text) {
      return '(' + kodieren(text).map(c => {
        if (c === 40 || c === 41 || c === 92) return '\\' + String.fromCharCode(c);
        return String.fromCharCode(c);
      }).join('') + ')';
    }

    const SEITE_B = 595.28, SEITE_H = 841.89, RAND_L = 40, RAND_R = 40, OBEN = 800, UNTEN = 60;
    const FARBE = { text: '0.122 0.161 0.216', grau: '0.420 0.447 0.502', violett: '0.576 0.200 0.918', linie: '0.898 0.906 0.922' };
    const seiten = [];
    let ops = null, y = OBEN;

    function neueSeite() { ops = []; seiten.push(ops); y = OBEN; }
    function text(x, yPos, inhalt, { groesse = 9, fett = false, farbe = 'text' } = {}) {
      ops.push(`BT /${fett ? 'F2' : 'F1'} ${groesse} Tf ${FARBE[farbe]} rg ${x.toFixed(2)} ${yPos.toFixed(2)} Td ${pdfString(inhalt)} Tj ET`);
    }
    function linie(yPos) {
      ops.push(`${FARBE.linie} RG 0.6 w ${RAND_L} ${yPos.toFixed(2)} m ${(SEITE_B - RAND_R).toFixed(2)} ${yPos.toFixed(2)} l S`);
    }
    function platzPruefen(hoehe) { if (y - hoehe < UNTEN) { neueSeite(); return true; } return false; }

    const STATUS_LABEL = { geplant: 'Geplant', erschienen: 'Erledigt', abgesagt: 'Abgesagt', nicht_erschienen: 'Nicht da' };
    const erstellt = new Date(backup.erstellt_am);
    const erstelltText = erstellt.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
      erstellt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    const zuZeit = m => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

    // ---- Kopf ----
    neueSeite();
    text(RAND_L, y, 'Bergbauer Physiotherapie – Terminkalender-Backup', { groesse: 16, fett: true });
    y -= 20;
    text(RAND_L, y, `Zeitraum: ${zeitraumText}   ·   Erstellt am: ${erstelltText}`, { groesse: 10, farbe: 'grau' });
    y -= 14;
    text(RAND_L, y, `Inhalt: ${backup.termine.length} Termine, ${backup.patienten.length} Patienten`, { groesse: 10, farbe: 'grau' });
    y -= 14;
    text(RAND_L, y, 'Vertraulich: enthält Patientendaten. Sicher ablegen, nicht unverschlüsselt verschicken.', { groesse: 9, farbe: 'grau' });
    y -= 26;

    // ---- Termine, nach Tag gruppiert ----
    const SPALTEN = [
      { titel: 'Zeit', x: 40, b: 58 }, { titel: 'Therapeut', x: 100, b: 44 }, { titel: 'Patient', x: 146, b: 118 },
      { titel: 'Behandlung', x: 266, b: 118 }, { titel: 'Ort', x: 386, b: 84 }, { titel: 'Status', x: 472, b: 83 }
    ];
    const ZEILE = 11;
    text(RAND_L, y, 'Termine', { groesse: 13, fett: true, farbe: 'violett' });
    y -= 18;

    const termine = [...backup.termine].sort((a, b) =>
      (a.datum || '').localeCompare(b.datum || '') || (a.startzeit || '').localeCompare(b.startzeit || '') || (a.therapeut || '').localeCompare(b.therapeut || ''));
    if (!termine.length) { text(RAND_L, y, 'Keine Termine in diesem Zeitraum.', { farbe: 'grau' }); y -= 16; }

    const nachTag = new Map();
    termine.forEach(t => { if (!nachTag.has(t.datum)) nachTag.set(t.datum, []); nachTag.get(t.datum).push(t); });

    function tagKopf(datum, anzahl, fortsetzung) {
      const d = new Date(datum + 'T00:00:00');
      const titel = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
      text(RAND_L, y, `${titel}  (${anzahl} ${anzahl === 1 ? 'Termin' : 'Termine'})${fortsetzung ? ' – Fortsetzung' : ''}`, { groesse: 11, fett: true });
      y -= 13;
      SPALTEN.forEach(s => text(s.x, y, s.titel, { groesse: 8, fett: true, farbe: 'grau' }));
      y -= 4;
      linie(y);
      y -= 10;
    }

    nachTag.forEach((liste, datum) => {
      platzPruefen(60);
      tagKopf(datum, liste.length, false);
      liste.forEach(t => {
        const startMin = zeitToMinuten((t.startzeit || '00:00').slice(0, 5));
        const zellen = [
          `${zuZeit(startMin)}–${zuZeit(startMin + (Number(t.dauer_minuten) || 0))}`,
          t.therapeut || '',
          t.patientenname || '',
          t.behandlungstyp || '',
          t.ist_hausbesuch ? 'Hausbesuch' + (t.fahrzeit_minuten ? ` (${t.fahrzeit_minuten} Min Fahrt)` : '') : (t.raum ? 'Raum ' + t.raum : ''),
          STATUS_LABEL[t.status || 'geplant'] || t.status
        ].map((inhalt, i) => umbrechen(inhalt, SPALTEN[i].b, 9, false));
        const notizZeilen = t.notiz ? umbrechen('Notiz: ' + t.notiz, SEITE_B - RAND_R - SPALTEN[2].x, 8.5, false) : [];
        const hoehe = Math.max(...zellen.map(z => z.length)) * ZEILE + notizZeilen.length * 10 + 4;
        if (platzPruefen(hoehe)) tagKopf(datum, liste.length, true);
        zellen.forEach((zeilen, i) => zeilen.forEach((z, n) => text(SPALTEN[i].x, y - n * ZEILE, z, { groesse: 9, fett: i === 0 })));
        let yNotiz = y - Math.max(...zellen.map(z => z.length)) * ZEILE;
        notizZeilen.forEach(z => { text(SPALTEN[2].x, yNotiz + 1, z, { groesse: 8.5, farbe: 'grau' }); yNotiz -= 10; });
        y -= hoehe;
      });
      y -= 10;
    });

    // ---- Patienten ----
    const P_SPALTEN = [{ titel: 'Name', x: 40, b: 180 }, { titel: 'Telefon', x: 224, b: 110 }, { titel: 'Notiz', x: 338, b: 217 }];
    function patientenKopf(fortsetzung) {
      text(RAND_L, y, 'Patienten' + (fortsetzung ? ' – Fortsetzung' : ''), { groesse: 13, fett: true, farbe: 'violett' });
      y -= 16;
      P_SPALTEN.forEach(s => text(s.x, y, s.titel, { groesse: 8, fett: true, farbe: 'grau' }));
      y -= 4;
      linie(y);
      y -= 10;
    }
    y -= 6;
    platzPruefen(70);
    patientenKopf(false);
    const patienten = [...backup.patienten].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'de'));
    if (!patienten.length) { text(RAND_L, y, 'Keine Patienten gespeichert.', { farbe: 'grau' }); y -= 16; }
    patienten.forEach(p => {
      const zellen = [p.name || '', p.telefon || '', p.notiz || ''].map((inhalt, i) => umbrechen(inhalt, P_SPALTEN[i].b, 9, i === 0));
      const hoehe = Math.max(...zellen.map(z => z.length)) * ZEILE + 4;
      if (platzPruefen(hoehe)) patientenKopf(true);
      zellen.forEach((zeilen, i) => zeilen.forEach((z, n) => text(P_SPALTEN[i].x, y - n * ZEILE, z, { groesse: 9, fett: i === 0 })));
      y -= hoehe;
    });

    // ---- Fußzeile auf jeder Seite ----
    seiten.forEach((seitenOps, i) => {
      ops = seitenOps;
      const rechts = `Seite ${i + 1} von ${seiten.length}`;
      text(RAND_L, 30, `Bergbauer Physiotherapie – Backup vom ${erstellt.toLocaleDateString('de-DE')} – vertraulich`, { groesse: 8, farbe: 'grau' });
      text(SEITE_B - RAND_R - breite(rechts, 8, false), 30, rechts, { groesse: 8, farbe: 'grau' });
    });

    // ---- PDF-Datei zusammensetzen (Objekte, Querverweis-Tabelle, Trailer) ----
    // Alle Inhalte bestehen nur aus Zeichen 0–255, daher entspricht die String-Länge exakt der
    // Byte-Länge – nötig für die Byte-Positionen in der xref-Tabelle.
    const objekte = [];
    objekte[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objekte[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objekte[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objekte[5] = '<< /Title ' + pdfString('Terminkalender-Backup ' + zeitraumText) + ' /Producer (Terminkalender Bergbauer Physiotherapie) >>';
    const seitenRefs = [];
    seiten.forEach((seitenOps, i) => {
      const seiteNr = 6 + i * 2, inhaltNr = seiteNr + 1;
      const inhalt = seitenOps.join('\n');
      objekte[seiteNr] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${SEITE_B} ${SEITE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${inhaltNr} 0 R >>`;
      objekte[inhaltNr] = `<< /Length ${inhalt.length} >>\nstream\n${inhalt}\nendstream`;
      seitenRefs.push(seiteNr + ' 0 R');
    });
    objekte[2] = `<< /Type /Pages /Kids [${seitenRefs.join(' ')}] /Count ${seiten.length} >>`;

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const positionen = [];
    for (let nr = 1; nr < objekte.length; nr++) {
      positionen[nr] = pdf.length;
      pdf += `${nr} 0 obj\n${objekte[nr]}\nendobj\n`;
    }
    const xrefPos = pdf.length;
    pdf += `xref\n0 ${objekte.length}\n0000000000 65535 f \n`;
    for (let nr = 1; nr < objekte.length; nr++) pdf += String(positionen[nr]).padStart(10, '0') + ' 00000 n \n';
    pdf += `trailer\n<< /Size ${objekte.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xFF;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  // Erinnert beim Öffnen der Einstellungen dezent, falls länger kein Backup mehr exportiert wurde
  function pruefeBackupErinnerung() {
    try {
      const letztes = localStorage.getItem('letztesBackup');
      const statusEl = document.getElementById('backup-status');
      if (!statusEl || statusEl.textContent) return; // nicht überschreiben, falls gerade ein Export-Ergebnis angezeigt wird
      if (!letztes) { statusEl.textContent = 'Noch kein Backup exportiert.'; return; }
      const tageHer = Math.floor((Date.now() - new Date(letztes).getTime()) / 86400000);
      if (tageHer >= 30) statusEl.textContent = `Letztes Backup vor ${tageHer} Tagen – evtl. Zeit für ein neues.`;
    } catch (e) { /* egal */ }
  }
