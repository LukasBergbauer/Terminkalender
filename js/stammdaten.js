// ======================================================================
// js/stammdaten.js – Heilmittel (Behandlungstypen), Patientendatei, Änderungsprotokoll, Backup-Export
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
  }
  async function backupExportieren() {
    const statusEl = document.getElementById('backup-status');
    const typ = document.getElementById('backup-zeitraum-typ').value;
    let von = null, bis = null, zeitraumLabel = 'gesamt';
    if (typ === 'monat') {
      const wert = document.getElementById('backup-monat-wert').value; // Format "YYYY-MM"
      if (!wert) { statusEl.textContent = 'Bitte einen Monat auswählen.'; return; }
      const [jahr, monat] = wert.split('-').map(Number);
      von = `${jahr}-${String(monat).padStart(2, '0')}-01`;
      const letzterTag = new Date(jahr, monat, 0).getDate();
      bis = `${jahr}-${String(monat).padStart(2, '0')}-${String(letzterTag).padStart(2, '0')}`;
      zeitraumLabel = wert;
    } else if (typ === 'jahr') {
      const jahr = Number(document.getElementById('backup-jahr-wert').value);
      if (!jahr) { statusEl.textContent = 'Bitte ein Jahr angeben.'; return; }
      von = `${jahr}-01-01`;
      bis = `${jahr}-12-31`;
      zeitraumLabel = String(jahr);
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
      const backup = {
        erstellt_am: new Date().toISOString(),
        zeitraum: typ === 'alles' ? 'gesamt' : { typ, von, bis },
        termine: termineRes.data || [],
        patienten: patientenRes.data || [],
        heilmittel: heilmittelRes.data || [],
        oeffnungszeiten: oeffnungszeitenRes.data || []
      };
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const datumStr = isoDatum(new Date());
      a.href = url;
      a.download = `terminkalender-backup-${zeitraumLabel}-${datumStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      statusEl.textContent = `Backup heruntergeladen (${backup.termine.length} Termine, ${backup.patienten.length} Patienten).`;
      try { localStorage.setItem('letztesBackup', datumStr); } catch (e) { /* egal */ }
    } catch (e) {
      statusEl.textContent = 'Fehler beim Export: ' + e.message;
    }
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
