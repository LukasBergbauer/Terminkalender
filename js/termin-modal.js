// ======================================================================
// js/termin-modal.js – Termin-Fenster: neuer Termin, Bearbeiten, Serien anlegen
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Neuer Termin / Bearbeiten ----
  function oeffneModal(therapeut) {
    document.getElementById('modal-id').value = '';
    document.getElementById('modal-serie-id').value = '';
    document.getElementById('modal-titel').textContent = 'Neuer Termin';
    document.getElementById('modal-delete-btn').classList.add('hidden');
    document.getElementById('modal-therapeut').value = therapeut;
    document.getElementById('modal-startzeit').value = '';
    document.getElementById('modal-behandlungstyp').selectedIndex = 0;
    document.getElementById('modal-dauer').value = 20;
    document.getElementById('modal-raum').selectedIndex = 0;
    document.getElementById('modal-hausbesuch').checked = false;
    document.getElementById('modal-fahrzeit').value = 15;
    hausbesuchUmschalten();
    modalErweiterteOptionenUmschalten(false);
    document.getElementById('modal-patient').value = '';
    document.getElementById('modal-notiz').value = '';
    document.getElementById('modal-verordnung').innerHTML = '<option value="">Keine</option>';
    document.getElementById('modal-verordnung-hinweis').classList.add('hidden');
    document.getElementById('modal-wiederholung').value = 'keine';
    document.getElementById('modal-wiederholung-anzahl').value = 6;
    document.querySelectorAll('.wochentag-checkbox').forEach(cb => cb.checked = false);
    wiederholungAuswahlGeaendert();
    document.getElementById('wiederholung-box').classList.remove('hidden');
    statusWaehlen('geplant');
    document.getElementById('serie-hinweis').classList.add('hidden');
    document.getElementById('modal-konflikt-hinweis').classList.remove('sichtbar');
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function oeffneBearbeitenModal(termin) {
    document.getElementById('modal-id').value = termin.id;
    document.getElementById('modal-serie-id').value = termin.serie_id || '';
    document.getElementById('modal-titel').textContent = 'Termin bearbeiten';
    document.getElementById('modal-delete-btn').classList.remove('hidden');
    document.getElementById('modal-therapeut').value = termin.therapeut;
    document.getElementById('modal-startzeit').value = termin.startzeit.slice(0, 5);
    const behandlungSel = document.getElementById('modal-behandlungstyp');
    behandlungSel.value = termin.behandlungstyp;
    if (behandlungSel.value !== termin.behandlungstyp) {
      // Heilmittel wurde seitdem umbenannt/deaktiviert/gelöscht – Original-Bezeichnung trotzdem anzeigen
      const option = document.createElement('option');
      option.value = termin.behandlungstyp;
      option.textContent = termin.behandlungstyp + ' (nicht mehr in der Liste)';
      behandlungSel.appendChild(option);
      behandlungSel.value = termin.behandlungstyp;
    }
    document.getElementById('modal-dauer').value = termin.dauer_minuten;
    document.getElementById('modal-hausbesuch').checked = !!termin.ist_hausbesuch;
    document.getElementById('modal-fahrzeit').value = termin.fahrzeit_minuten || 15;
    hausbesuchUmschalten();
    if (termin.raum) document.getElementById('modal-raum').value = termin.raum;
    document.getElementById('modal-patient').value = termin.patientenname;
    document.getElementById('modal-notiz').value = termin.notiz || '';
    verordnungenOptionenRendern(termin.patient_id);
    const verordnungSel = document.getElementById('modal-verordnung');
    if (termin.verordnung_id && !Array.from(verordnungSel.options).some(o => o.value === termin.verordnung_id)) {
      const vBekannt = verordnungenCache.find(v => v.id === termin.verordnung_id);
      const option = document.createElement('option');
      option.value = termin.verordnung_id;
      option.textContent = vBekannt ? `${vBekannt.heilmittel_name} (abgeschlossen)` : 'Verordnung (nicht mehr offen)';
      verordnungSel.appendChild(option);
    }
    verordnungSel.value = termin.verordnung_id || '';
    if (termin.verordnung_id) verordnungAuswahlGeaendert();
    else document.getElementById('modal-verordnung-hinweis').classList.add('hidden');
    modalErweiterteOptionenUmschalten(!!(termin.ist_hausbesuch || termin.verordnung_id));
    statusWaehlen(termin.status || 'geplant');
    document.getElementById('wiederholung-box').classList.add('hidden');
    document.getElementById('serie-hinweis').classList.toggle('hidden', !termin.serie_id);
    document.getElementById('modal-konflikt-hinweis').classList.remove('sichtbar');
    document.getElementById('modal-error').textContent = '';
    document.getElementById('modal-overlay').classList.remove('hidden');
  }

  function schliesseModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    if (markierterBlock) {
      markierterBlock.classList.remove('ausgewaehlt');
      markierterBlock = null;
    }
    // Wurde der Termin aus der Hausbesuch-Ansicht heraus geöffnet (z.B. um mehrere kommende
    // Hausbesuche nacheinander durchzuschauen), dorthin zurückspringen statt in der Tagesansicht
    // hängen zu bleiben – gilt sowohl nach Speichern als auch nach Abbrechen.
    if (terminRueckkehrNachHausbesuche) {
      terminRueckkehrNachHausbesuche = false;
      wechsleAnsicht('hausbesuche');
    } else if (vergleichRueckkehrSeite) {
      // Analog: ein Termin, der aus der Vergleichsansicht heraus angelegt/bearbeitet wurde,
      // bleibt dort (kein Sprung in die normale Tagesansicht) – nur neu rendern.
      vergleichRueckkehrSeite = null;
      vergleichModalDatum = null;
      if (ansichtstyp === 'vergleich') renderVergleich();
    }
  }

  function behandlungAuswahl() {
    const sel = document.getElementById('modal-behandlungstyp');
    const dauer = sel.selectedOptions[0].dataset.dauer;
    if (dauer) document.getElementById('modal-dauer').value = dauer;
  }

  function statusWaehlen(status) {
    document.getElementById('modal-status').value = status;
    document.querySelectorAll('#status-wahl button').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.status === status);
    });
  }

  async function termineSpeichern() {
    const id = document.getElementById('modal-id').value;
    const therapeut = document.getElementById('modal-therapeut').value;
    const startzeit = document.getElementById('modal-startzeit').value;
    const behandlungstyp = document.getElementById('modal-behandlungstyp').value;
    const dauer_minuten = parseInt(document.getElementById('modal-dauer').value, 10);
    const istHausbesuch = document.getElementById('modal-hausbesuch').checked;
    const raum = istHausbesuch ? null : parseInt(document.getElementById('modal-raum').value, 10);
    const fahrzeit_minuten = istHausbesuch ? (parseInt(document.getElementById('modal-fahrzeit').value, 10) || 0) : null;
    const eigeneFahrzeit = istHausbesuch ? fahrzeit_minuten : 0;
    const patientenname = document.getElementById('modal-patient').value.trim();
    const notiz = document.getElementById('modal-notiz').value.trim();
    const verordnung_id = document.getElementById('modal-verordnung').value || null;
    const status = id ? document.getElementById('modal-status').value : 'geplant';
    const vorherigerStatus = id ? (aktuelleTagesTermine.find(t => t.id === id) || {}).status : null;
    const fehlerEl = document.getElementById('modal-error');
    const konfliktEl = document.getElementById('modal-konflikt-hinweis');
    fehlerEl.textContent = '';
    konfliktEl.classList.remove('sichtbar');

    if (!startzeit || !patientenname || !dauer_minuten) {
      fehlerEl.textContent = 'Bitte Uhrzeit, Dauer und Patientenname ausfüllen.';
      return;
    }

    // Therapeuten-Konflikt prüfen (ein Therapeut darf nicht doppelt belegt sein; Magnetfunktion:
    // bei Konflikt nächste freie Zeit vorschlagen). Hausbesuche haben keinen Praxisraum
    // (raum = null) – dafür zählt die Fahrzeit beim Therapeuten mit. Seit 2026-10-27 (achter
    // Durchgang) bewusst OHNE Raum-Konflikt über Therapeuten hinweg: Lukas und Andy sind
    // unabhängige Spalten und dürfen zeitgleich Termine haben, auch bei gleicher Raumnummer.
    const oz = aktuelleOeffnungszeit();
    // Heilmittel mit "eigene Spalte" (z.B. Fango/Massage) laufen parallel zum Therapeuten in einer
    // eigenen Lane – Therapeuten-Konflikt wird deshalb nur INNERHALB derselben Lane geprüft.
    const terminEigeneSpalte = terminNutztEigeneSpalte(behandlungstyp);
    const therapeutBelegung = aktuelleTagesTermine.filter(t => t.therapeut === therapeut && t.id !== id && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte);
    const therapeutKonflikt = findeKonflikt(therapeutBelegung, startzeit, dauer_minuten, eigeneFahrzeit);
    if (therapeutKonflikt) {
      const frei = naechsteFreieZeit(therapeutBelegung, dauer_minuten, startzeit, oz, eigeneFahrzeit);
      const meldung = `${therapeut} ist um ${startzeit} schon bei ${therapeutKonflikt.patientenname} eingeplant${istHausbesuch ? ' (inkl. Fahrzeit)' : ''}.`;
      if (frei) {
        document.getElementById('modal-startzeit').value = frei;
        konfliktEl.textContent = `${meldung} Uhrzeit automatisch auf ${frei} angepasst – bitte prüfen und erneut auf Speichern klicken.`;
      } else {
        konfliktEl.textContent = `${meldung} Keine freie Zeit im Rahmen der Öffnungszeiten gefunden.`;
      }
      konfliktEl.classList.add('sichtbar');
      return;
    }

    const patientId = await findeOderErstellePatient(patientenname);
    const wiederholung = id ? 'keine' : document.getElementById('modal-wiederholung').value;

    if (!id && wiederholung !== 'keine') {
      // ---- Serie anlegen (fester Wochenrhythmus ODER feste Wochentage, z.B. "2x pro Woche") ----
      const anzahl = Math.max(2, Math.min(52, parseInt(document.getElementById('modal-wiederholung-anzahl').value, 10) || 2));
      let wochentageSet = null;
      if (wiederholung === 'wochentage') {
        wochentageSet = new Set(Array.from(document.querySelectorAll('.wochentag-checkbox:checked')).map(cb => parseInt(cb.value, 10)));
        if (!wochentageSet.size) { fehlerEl.textContent = 'Bitte mindestens einen Wochentag auswählen.'; return; }
      }
      const serieId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('serie-' + Date.now() + '-' + Math.random().toString(16).slice(2));
      const termDaten = serienDatenGenerieren(wiederholung, anzahl, aktivesModalDatum(), wochentageSet);
      const zeilen = [];
      let verschoben = 0;
      for (const datumObj of termDaten) {
        const datumStr = isoDatum(datumObj);
        const ozTag = oeffnungszeitenProTag[datumObj.getDay()] || oz;
        let zeitFuerTag = startzeit;
        const tagesBelegung = await holeTagesBelegung(datumStr, null);
        const kombiniertTag = tagesBelegung.filter(t => terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte && t.therapeut === therapeut);
        if (findeKonflikt(kombiniertTag, zeitFuerTag, dauer_minuten, eigeneFahrzeit)) {
          const freiTag = naechsteFreieZeit(kombiniertTag, dauer_minuten, zeitFuerTag, ozTag, eigeneFahrzeit);
          if (freiTag) { zeitFuerTag = freiTag; verschoben++; }
        }
        zeilen.push({
          datum: datumStr, startzeit: zeitFuerTag, dauer_minuten, raum, therapeut,
          patientenname, patient_id: patientId, behandlungstyp, notiz: notiz || null,
          status: 'geplant', serie_id: serieId, verordnung_id,
          ist_hausbesuch: istHausbesuch, fahrzeit_minuten
        });
      }
      const { error } = await db.from('termine').insert(zeilen);
      if (error) { fehlerEl.textContent = 'Fehler: ' + error.message; return; }
      protokolliere(null, 'angelegt', `Serie: ${patientenname}, ${termDaten.length} Termine ab ${isoDatum(aktivesModalDatum())} (${startzeit} Uhr, ${raum ? 'Raum ' + raum : 'Hausbesuch'}, ${therapeut})`, isoDatum(aktivesModalDatum()));
      schliesseModal();
      ladeTermine();
      if (verschoben > 0) {
        setTimeout(() => alert(`Serie angelegt. ${verschoben} von ${termDaten.length} Terminen mussten wegen Raum-/Therapeutenbelegung an diesem Tag leicht verschoben werden – bitte kurz prüfen.`), 200);
      }
      return;
    }

    const datensatz = {
      datum: isoDatum(aktivesModalDatum()),
      startzeit,
      dauer_minuten,
      raum,
      therapeut,
      patientenname,
      patient_id: patientId,
      behandlungstyp,
      notiz: notiz || null,
      status,
      verordnung_id,
      ist_hausbesuch: istHausbesuch,
      fahrzeit_minuten
    };

    const { data: neuerTermin, error } = id
      ? await db.from('termine').update(datensatz).eq('id', id).select().single()
      : await db.from('termine').insert(datensatz).select().single();

    if (error) {
      fehlerEl.textContent = 'Fehler: ' + error.message;
      return;
    }
    const details = `${patientenname}, ${startzeit} Uhr, ${raum ? 'Raum ' + raum : 'Hausbesuch'}, ${therapeut}, ${behandlungstyp}`;
    protokolliere((neuerTermin && neuerTermin.id) || id, id ? 'bearbeitet' : 'angelegt', details, datensatz.datum);
    // Wenn ein Termin gerade erst auf "Abgesagt" gesetzt wurde, dezent auf eine passende Warteliste hinweisen
    if (id && status === 'abgesagt' && vorherigerStatus !== 'abgesagt') {
      pruefeWartelisteHinweis(therapeut, datensatz.datum);
    }
    schliesseModal();
    ladeTermine();
  }

  // Übernimmt die aktuellen Modal-Werte (Uhrzeit, Dauer, Raum, Behandlung, Patient, Notiz) auf ALLE Termine der Serie.
  // Prüft bewusst keine Raum-/Therapeuten-Konflikte über alle Serientermine hinweg (einfache Basisversion).
  async function termineSeriendatenAktualisieren() {
    const serieId = document.getElementById('modal-serie-id').value;
    if (!serieId) return;
    if (!confirm('Diese Änderungen für ALLE Termine dieser Serie übernehmen (Uhrzeit, Dauer, Raum, Behandlung, Patient, Notiz)?')) return;

    const therapeut = document.getElementById('modal-therapeut').value;
    const startzeit = document.getElementById('modal-startzeit').value;
    const behandlungstyp = document.getElementById('modal-behandlungstyp').value;
    const dauer_minuten = parseInt(document.getElementById('modal-dauer').value, 10);
    const raum = parseInt(document.getElementById('modal-raum').value, 10);
    const patientenname = document.getElementById('modal-patient').value.trim();
    const notiz = document.getElementById('modal-notiz').value.trim();
    const fehlerEl = document.getElementById('modal-error');
    const patientId = await findeOderErstellePatient(patientenname);

    const { error } = await db.from('termine').update({
      startzeit, dauer_minuten, raum, therapeut, patientenname, patient_id: patientId, behandlungstyp, notiz: notiz || null
    }).eq('serie_id', serieId);

    if (error) { fehlerEl.textContent = 'Fehler: ' + error.message; return; }
    protokolliere(null, 'bearbeitet', `Serie (${serieId.slice(0, 8)}…): ${patientenname}, ${startzeit} Uhr, Raum ${raum}, ${therapeut} – für ganze Serie übernommen`, null);
    schliesseModal();
    ladeTermine();
  }

  // 1-Klick-Löschen direkt am Termin-Block (ohne das Bearbeiten-Modal zu öffnen) – in der normalen
  // Tagesansicht UND der Vergleichsansicht nutzbar. Gibt true zurück, wenn tatsächlich gelöscht wurde.
  async function terminWirklichLoeschen(t) {
    if (!confirm(`Termin "${t.patientenname}" (${t.startzeit.slice(0, 5)} Uhr) wirklich löschen?`)) return false;
    if (t.serie_id) {
      const ganzeSerie = confirm('Dieser Termin gehört zu einer Serie.\n\nOK = ALLE Termine dieser Serie löschen.\nAbbrechen = nur diesen einen Termin löschen.');
      const { error } = ganzeSerie
        ? await db.from('termine').delete().eq('serie_id', t.serie_id)
        : await db.from('termine').delete().eq('id', t.id);
      if (error) { alert('Fehler beim Löschen: ' + error.message); return false; }
      if (ganzeSerie) protokolliere(null, 'gelöscht', `Ganze Serie gelöscht: ${t.patientenname}`, null);
      else { protokolliere(t.id, 'gelöscht', `${t.patientenname}, ${t.datum} ${t.startzeit.slice(0, 5)} Uhr`, t.datum); pruefeWartelisteHinweis(t.therapeut, t.datum); }
      return true;
    }
    const { error } = await db.from('termine').delete().eq('id', t.id);
    if (error) { alert('Fehler beim Löschen: ' + error.message); return false; }
    protokolliere(t.id, 'gelöscht', `${t.patientenname}, ${t.datum} ${t.startzeit.slice(0, 5)} Uhr`, t.datum);
    pruefeWartelisteHinweis(t.therapeut, t.datum);
    return true;
  }

  async function termineLoeschen() {
    const id = document.getElementById('modal-id').value;
    const serieId = document.getElementById('modal-serie-id').value;
    if (!id) return;
    if (!confirm('Diesen Termin wirklich löschen?')) return;

    let ganzeSerie = false;
    if (serieId) {
      ganzeSerie = confirm('Dieser Termin gehört zu einer Serie.\n\nOK = ALLE Termine dieser Serie löschen.\nAbbrechen = nur diesen einen Termin löschen.');
    }

    const patientenname = document.getElementById('modal-patient').value.trim();
    const startzeit = document.getElementById('modal-startzeit').value;
    const datum = isoDatum(aktivesModalDatum());

    const fehlerEl = document.getElementById('modal-error');
    const { error } = ganzeSerie
      ? await db.from('termine').delete().eq('serie_id', serieId)
      : await db.from('termine').delete().eq('id', id);

    if (error) {
      fehlerEl.textContent = 'Fehler: ' + error.message;
      return;
    }
    if (ganzeSerie) {
      protokolliere(null, 'gelöscht', `Ganze Serie gelöscht: ${patientenname}`, null);
    } else {
      protokolliere(id, 'gelöscht', `${patientenname}, ${datum} ${startzeit} Uhr`, datum);
      pruefeWartelisteHinweis(document.getElementById('modal-therapeut').value, datum);
    }
    schliesseModal();
    ladeTermine();
  }
