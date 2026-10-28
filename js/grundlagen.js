// ======================================================================
// js/grundlagen.js – Supabase-Verbindung, Grundzustand, Werktag-Logik, Filter, Timeline, Konflikte/Magnet, Öffnungszeiten
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  const SUPABASE_URL = 'https://wcshsfxsrahufatxisxy.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_GnYu_dMxZNdyzm1AyNbW-Q_ar0-TO1y';
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  // ---- Wochenende komplett entfernt (2026-10-27, achter Durchgang): die Praxis hat samstags und
  // sonntags nie geöffnet, daher springt jede Tages-Navigation (Pfeile, "Heute", Vorschau-Default,
  // Vergleichstag-Pfeile) automatisch über Sa/So hinweg – diese Tage lassen sich nirgends mehr
  // auswählen. ----
  function istWochenende(d) {
    const tag = d.getDay(); // 0 = So, 6 = Sa
    return tag === 0 || tag === 6;
  }
  // Springt (falls nötig) auf den nächsten Werktag in Richtung `richtung` (+1 vorwärts, -1 rückwärts).
  function naechsterWerktag(d, richtung) {
    const ergebnis = new Date(d);
    while (istWochenende(ergebnis)) ergebnis.setDate(ergebnis.getDate() + richtung);
    return ergebnis;
  }

  let ausgewaehltesDatum = naechsterWerktag(new Date(), 1); // reallife "heute" als Start, Wochenende übersprungen
  let miniKalenderDatum = new Date(ausgewaehltesDatum);  // welcher Monat im Mini-Kalender angezeigt wird
  let aktuelleTagesTermine = []; // zuletzt geladene Termine des angezeigten Tages (für Magnet/Konflikt-Prüfung, Druck)
  let ansichtstyp = 'tag'; // 'tag' oder 'woche'
  let heilmittelCache = []; // aus Supabase geladene Heilmittelverordnungen (Behandlungstypen)
  let patientenCache = []; // aus Supabase geladene Patientendatei (für Suche/Auswahl im Modal)
  let verordnungenCache = []; // aus Supabase geladene Verordnungen (für Verordnungs-Zähler & Abrechnungsvorbereitung)
  let wartelisteCache = []; // aus Supabase geladene Warteliste
  let aktuellerNutzerEmail = ''; // E-Mail der eingeloggten Person, für das Änderungsprotokoll
  let verordnungenFilterStatus = 'offen'; // 'offen' oder 'abgeschlossen' (= Abrechnungsvorbereitung) in der Verordnungen-Ansicht
  let verordnungPatientAuswahlId = null; // per Suche ausgewählter Patient im Verordnungs-Modal
  let wartelistePatientAuswahlId = null; // per Suche ausgewählter Patient im Warteliste-Modal

  // ---- Filter: Beide / nur Lukas / nur Andy ----
  let ansichtsFilter = 'beide';
  try {
    const gespeicherterFilter = localStorage.getItem('kalenderFilter');
    if (gespeicherterFilter) ansichtsFilter = gespeicherterFilter;
  } catch (e) { /* localStorage evtl. nicht verfügbar, egal */ }

  function setzeFilter(name) {
    ansichtsFilter = name;
    try { localStorage.setItem('kalenderFilter', name); } catch (e) {}
    wendeFilterAn();
    if (ansichtstyp === 'woche') renderWoche();
  }

  function wendeFilterAn() {
    document.getElementById('spalte-lukas').classList.toggle('hidden', ansichtsFilter === 'andy');
    document.getElementById('spalte-andy').classList.toggle('hidden', ansichtsFilter === 'lukas');
    document.getElementById('tag-ansicht').style.gridTemplateColumns =
      ansichtsFilter === 'beide' ? '46px 1fr 1fr' : '46px 1fr';
    document.querySelectorAll('#filter-pille .filter-btn').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.filter === ansichtsFilter);
    });
  }

  // ---- Timeline-Konfiguration ----
  const PX_PRO_MINUTE = 1.2;    // 72px pro Stunde – passt komplett auf einen Laptop-Bildschirm (Schrift bleibt groß, siehe .zeile-haupt)
  // Standardzeiten, falls noch nichts aus der Datenbank geladen wurde. Schlüssel = JS getDay() (0=So..6=Sa)
  let oeffnungszeitenProTag = {
    0: { start: '07:00', ende: '20:00' }, 1: { start: '07:00', ende: '20:00' },
    2: { start: '07:00', ende: '20:00' }, 3: { start: '07:00', ende: '20:00' },
    4: { start: '07:00', ende: '20:00' }, 5: { start: '07:00', ende: '20:00' },
    6: { start: '07:00', ende: '20:00' }
  };

  function aktuelleOeffnungszeit() {
    return oeffnungszeitenProTag[ausgewaehltesDatum.getDay()] || { start: '07:00', ende: '20:00' };
  }

  function zeitToMinuten(zeitStr) {
    const [h, m] = zeitStr.split(':').map(Number);
    return h * 60 + m;
  }

  function minutenSeitTagesstart(zeitStr) {
    return zeitToMinuten(zeitStr) - zeitToMinuten(aktuelleOeffnungszeit().start);
  }

  function tagHoehePx() {
    const oz = aktuelleOeffnungszeit();
    return (zeitToMinuten(oz.ende) - zeitToMinuten(oz.start)) * PX_PRO_MINUTE;
  }

  function kurzBehandlung(typ) {
    const eintrag = heilmittelCache.find(h => h.name === typ);
    if (eintrag && eintrag.kurzform) return eintrag.kurzform;
    if (typ.includes('KG')) return 'KG';
    if (typ.includes('Lymphdrainage')) return 'Lymphe';
    return typ.length > 12 ? typ.slice(0, 12) + '…' : typ;
  }

  function farbeFuerTyp(typ) {
    const eintrag = heilmittelCache.find(h => h.name === typ);
    return (eintrag && eintrag.farbe) ? eintrag.farbe : 'violett';
  }

  // Heilmittel mit "eigene Spalte" (z.B. Fango/Massage) laufen parallel zum Therapeuten in einer
  // eigenen schmalen Lane im Tageskalender und werden beim Therapeuten-Konflikt NICHT gegen die
  // normale Lane geprüft (siehe findeKonflikt-Aufrufe in termineSpeichern/aufLoslassen).
  function terminNutztEigeneSpalte(typ) {
    const eintrag = heilmittelCache.find(h => h.name === typ);
    return !!(eintrag && eintrag.eigene_spalte);
  }

  function addMinuten(zeitStr, minuten) {
    const [h, m] = zeitStr.split(':').map(Number);
    const gesamt = h * 60 + m + minuten;
    const hh = Math.floor(gesamt / 60) % 24;
    const mm = gesamt % 60;
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }

  // ---- Raum-/Zeit-Konflikte & Magnetfunktion ----
  function zuZeitString(minuten) {
    return String(Math.floor(minuten / 60)).padStart(2, '0') + ':' + String(minuten % 60).padStart(2, '0');
  }

  // Liefert das tatsächlich belegte Zeitfenster eines Termins – bei Hausbesuchen inkl. Fahrzeit
  // davor UND danach (einfache Strecke je Richtung), damit der Therapeut nicht direkt im Anschluss
  // an einen Hausbesuch wieder in der Praxis eingeplant wird, ohne die Fahrt zu berücksichtigen.
  function belegtesFenster(t) {
    const start = zeitToMinuten((t.startzeit || '').slice(0, 5));
    const fahrzeit = t.ist_hausbesuch ? (t.fahrzeit_minuten || 0) : 0;
    return { start: start - fahrzeit, ende: start + t.dauer_minuten + fahrzeit };
  }

  function findeKonflikt(belegung, startzeit, dauer_minuten, eigeneFahrzeit) {
    const puffer = eigeneFahrzeit || 0;
    const neuStart = zeitToMinuten(startzeit) - puffer;
    const neuEnde = zeitToMinuten(startzeit) + dauer_minuten + puffer;
    return belegung.find(t => {
      const fenster = belegtesFenster(t);
      return neuStart < fenster.ende && fenster.start < neuEnde;
    }) || null;
  }

  // Sucht ausgehend vom Wunschtermin die nächstgelegene freie Zeit (vorwärts/rückwärts abwechselnd).
  // eigeneFahrzeit: bei Hausbesuchen die Fahrzeit des NEUEN Termins (wird bei der Suche mitberücksichtigt).
  function naechsteFreieZeit(belegung, dauer_minuten, wunschStartzeit, oz, eigeneFahrzeit) {
    const startMin = zeitToMinuten(oz.start);
    const endeMin = zeitToMinuten(oz.ende);
    const wunsch = zeitToMinuten(wunschStartzeit);
    const maxVersatz = endeMin - startMin;
    for (let versatz = 0; versatz <= maxVersatz; versatz += 5) {
      for (const richtung of versatz === 0 ? [1] : [1, -1]) {
        const kandidat = wunsch + richtung * versatz;
        if (kandidat < startMin || kandidat + dauer_minuten > endeMin) continue;
        const kandidatZeit = zuZeitString(kandidat);
        if (!findeKonflikt(belegung, kandidatZeit, dauer_minuten, eigeneFahrzeit)) return kandidatZeit;
      }
    }
    return null; // kein freier Platz im Öffnungsfenster gefunden
  }

  // Holt alle Termine eines bestimmten Tages (für Serientermine / Tage außerhalb des aktuell geladenen),
  // damit sowohl Raum- als auch Therapeuten-Konflikte geprüft werden können.
  async function holeTagesBelegung(datum, ausschlussId) {
    const { data } = await db.from('termine').select('*').eq('datum', datum);
    return (data || []).filter(t => t.id !== ausschlussId);
  }

  // ---- Öffnungszeiten laden/speichern ----
  async function ladeOeffnungszeiten() {
    const { data, error } = await db.from('oeffnungszeiten').select('*');
    if (!error && data && data.length) {
      data.forEach(row => {
        oeffnungszeitenProTag[row.wochentag] = {
          start: row.start_zeit.slice(0, 5),
          ende: row.end_zeit.slice(0, 5)
        };
      });
    }
    renderOeffnungszeitenFormular();
  }

  const WOCHENTAG_LABELS = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 0: 'So' };
  // Wochenende komplett entfernt (2026-10-27, achter Durchgang): Öffnungszeiten-Formular und die
  // "Feste Wochentage"-Checkboxen bei wiederkehrenden Terminen zeigen nur noch Mo-Fr.
  const WOCHENTAG_REIHENFOLGE = [1, 2, 3, 4, 5];

  function renderOeffnungszeitenFormular() {
    const container = document.getElementById('oeffnungszeiten-formular');
    container.innerHTML = WOCHENTAG_REIHENFOLGE.map(tag => `
      <div class="oz-zeile">
        <label>${WOCHENTAG_LABELS[tag]}</label>
        <input type="time" id="oz-start-${tag}" value="${oeffnungszeitenProTag[tag].start}">
        <input type="time" id="oz-ende-${tag}" value="${oeffnungszeitenProTag[tag].ende}">
      </div>
    `).join('');
  }

  async function oeffnungszeitenSpeichern() {
    const statusEl = document.getElementById('oeffnungszeiten-status');
    statusEl.textContent = 'Speichere...';
    const zeilen = WOCHENTAG_REIHENFOLGE.map(tag => ({
      wochentag: tag,
      start_zeit: document.getElementById(`oz-start-${tag}`).value,
      end_zeit: document.getElementById(`oz-ende-${tag}`).value
    }));
    const { error } = await db.from('oeffnungszeiten').upsert(zeilen, { onConflict: 'wochentag' });
    if (error) {
      statusEl.textContent = 'Fehler: ' + error.message;
      return;
    }
    zeilen.forEach(z => { oeffnungszeitenProTag[z.wochentag] = { start: z.start_zeit, ende: z.end_zeit }; });
    statusEl.textContent = 'Gespeichert.';
    aktualisiereAnsicht();
    setTimeout(() => { statusEl.textContent = ''; }, 2500);
  }
