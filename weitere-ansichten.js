// ======================================================================
// js/weitere-ansichten.js – Hausbesuch-Ansicht, Statistik, druckbarer Tagesplan, Notiz-Fenster, Backup-Ansicht
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Hausbesuch-Ansicht: alle kommenden Hausbesuche gesammelt, nach Tag gruppiert ----
  async function renderHausbesucheListe() {
    const container = document.getElementById('hausbesuche-liste');
    if (!container) return;
    const heuteStr = isoDatum(new Date());
    const { data, error } = await db.from('termine').select('*')
      .eq('ist_hausbesuch', true)
      .gte('datum', heuteStr)
      .order('datum', { ascending: true })
      .order('startzeit', { ascending: true });
    if (error) { container.innerHTML = `<div class="leer-zustand">Fehler: ${error.message}</div>`; return; }
    const termine = (data || []).filter(t => t.status !== 'abgesagt');
    if (!termine.length) { container.innerHTML = '<div class="leer-zustand">Keine kommenden Hausbesuche geplant.</div>'; return; }

    const nachTag = new Map();
    termine.forEach(t => {
      if (!nachTag.has(t.datum)) nachTag.set(t.datum, []);
      nachTag.get(t.datum).push(t);
    });

    container.innerHTML = Array.from(nachTag.entries()).map(([datum, terminDesTages]) => `
      <div class="hausbesuch-tag-gruppe">
        <h4>${formatierterTitel(new Date(datum + 'T00:00:00'))}</h4>
        ${terminDesTages.map(t => `
          <div class="hausbesuch-karte" onclick="hausbesuchTerminOeffnen('${datum}', '${t.id}')">
            <div>
              <div class="zeit">${t.startzeit.slice(0, 5)} &middot; ${t.behandlungstyp}</div>
              <div class="meta">${t.patientenname} &middot; ${t.therapeut}${t.fahrzeit_minuten ? ' &middot; Fahrzeit ' + t.fahrzeit_minuten + ' Min' : ''}</div>
              ${t.notiz ? `<div class="adresse">${t.notiz.replace(/</g, '&lt;')}</div>` : ''}
            </div>
            <span>${ICON_HAUS}</span>
          </div>
        `).join('')}
      </div>
    `).join('');
  }

  let terminRueckkehrNachHausbesuche = false;

  async function hausbesuchTerminOeffnen(datumStr, terminId) {
    const { data } = await db.from('termine').select('*').eq('id', terminId).single();
    if (!data) return;
    ausgewaehltesDatum = new Date(datumStr + 'T00:00:00');
    miniKalenderDatum = new Date(ausgewaehltesDatum);
    terminRueckkehrNachHausbesuche = true;
    wechsleAnsicht('kalender');
    setzeAnsichtstyp('tag');
    setTimeout(() => oeffneBearbeitenModal(data), 60);
  }

  // ---- Statistik Heilmittel-Auslastung ----
  let statistikZeitraum = 'monat';

  function setzeStatistikZeitraum(zeitraum) {
    statistikZeitraum = zeitraum;
    document.querySelectorAll('#zeitraum-pille .filter-btn').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.zeitraum === zeitraum);
    });
    renderStatistik();
  }

  async function renderStatistik() {
    await ladeAlleTermine();
    const heute = new Date();
    const monatStr = String(heute.getFullYear()) + '-' + String(heute.getMonth() + 1).padStart(2, '0');

    const gefiltert = (alleTermineCache || []).filter(t => {
      if (statistikZeitraum === 'monat') return t.datum.startsWith(monatStr);
      return true;
    });

    // Kleine Zusammenfassung: wie oft sind Termine erschienen/abgesagt/nicht erschienen (hilft bei der Abrechnungsvorbereitung)
    const statusKarte = document.getElementById('statistik-status-karte');
    if (statusKarte) {
      const vergangen = gefiltert.filter(t => t.datum <= isoDatum(new Date()));
      if (!vergangen.length) {
        statusKarte.innerHTML = '';
      } else {
        const statusZaehler = { geplant: 0, erschienen: 0, abgesagt: 0, nicht_erschienen: 0 };
        vergangen.forEach(t => { statusZaehler[t.status || 'geplant'] = (statusZaehler[t.status || 'geplant'] || 0) + 1; });
        const gesamt = vergangen.length;
        const STATUS_LABEL = { erschienen: 'Erschienen', abgesagt: 'Abgesagt', nicht_erschienen: 'Nicht erschienen', geplant: 'Ohne Status (noch offen)' };
        statusKarte.innerHTML = `<div class="statistik-label" style="margin-bottom:10px;"><span>Terminstatus (${gesamt} vergangene Termine im Zeitraum)</span></div>` +
          Object.entries(statusZaehler).filter(([, n]) => n > 0).map(([status, n]) => `
            <div class="statistik-zeile">
              <div class="statistik-label"><span>${STATUS_LABEL[status] || status}</span><b>${n}&times; (${Math.round(n / gesamt * 100)}%)</b></div>
              <div class="statistik-track"><div class="statistik-balken" style="width:${Math.round(n / gesamt * 100)}%"></div></div>
            </div>
          `).join('');
      }
    }

    const zaehler = {};
    gefiltert.forEach(t => { zaehler[t.behandlungstyp] = (zaehler[t.behandlungstyp] || 0) + 1; });

    const eintraege = Object.entries(zaehler).sort((a, b) => b[1] - a[1]);
    const karte = document.getElementById('statistik-karte');

    if (!eintraege.length) {
      karte.innerHTML = '<div class="leer-zustand">Keine Daten für diesen Zeitraum.</div>';
      return;
    }

    const maxWert = Math.max(...eintraege.map(e => e[1]));
    karte.innerHTML = eintraege.map(([typ, anzahl]) => `
      <div class="statistik-zeile">
        <div class="statistik-label"><span>${typ}</span><b>${anzahl}&times;</b></div>
        <div class="statistik-track"><div class="statistik-balken" style="width:${Math.round(anzahl / maxWert * 100)}%"></div></div>
      </div>
    `).join('');
  }

  // ---- Druckbarer Tagesplan ----
  // Druckt den Tagesplan jetzt als farbiges Abbild des echten Kalenderrasters (siehe
  // @media print oben), nicht mehr als separate Text-Tabelle. Die Vorschau/Woche/Vergleichs-
  // Ansicht kann nicht gedruckt werden – deshalb wird vorher immer auf die Tagesansicht
  // gewechselt, falls gerade eine andere Ansicht aktiv ist.
  async function druckeTagesplan() {
    if (ansichtstyp !== 'tag') {
      setzeAnsichtstyp('tag');
      await new Promise(r => setTimeout(r, 150)); // kurz warten, bis ladeTermine() fertig gerendert hat
    }
    document.getElementById('druck-kopf-datum').textContent = formatierterTitel(ausgewaehltesDatum);

    // Skalierung berechnen, damit der Tagesplan immer auf eine Druckseite passt (seit 2026-10-27,
    // zwölfter Durchgang, auf Lukas' Wunsch). Statt die Höhe aus Öffnungszeiten etc. mühsam
    // nachzurechnen, wird einfach die tatsächlich gerenderte Größe von .tag-ansicht gemessen (die
    // bereits Zeitachse, Spalten-Padding, Überschriften und Zeitraster enthält) – das ist robuster
    // als eine Formel, die bei jeder CSS-Änderung an diesen Elementen wieder anpassen müsste.
    // Nur die Höhe wird skaliert: die Breite passt sich über die flexiblen Grid-Spalten (1fr)
    // der Druckseite ohnehin automatisch an, eine zusätzliche Breiten-Skalierung würde (gemessen
    // am breiteren Bildschirm-Viewport statt an der schmaleren Druckseite) nur unnötig verkleinern.
    const tagAnsichtEl = document.querySelector('.tag-ansicht');
    const DRUCK_KOPF_HOEHE_GESCHAETZT = 64; // h1 + Datum + Abstand, grob mit Sicherheitspuffer
    const MM_ZU_PX = 96 / 25.4;
    const VERFUEGBARE_HOEHE_PX = (210 - 2 * 10) * MM_ZU_PX;  // A4 quer, @page-Rand 10mm
    let skalierung = 1;
    if (tagAnsichtEl) {
      const benoetigteHoehe = tagAnsichtEl.offsetHeight + DRUCK_KOPF_HOEHE_GESCHAETZT;
      skalierung = Math.min(1, VERFUEGBARE_HOEHE_PX / benoetigteHoehe);
    }
    document.documentElement.style.setProperty('--druck-zoom', skalierung);

    window.print();

    // window.print() blockiert i.d.R. bis der Druckdialog geschlossen wird – danach wieder
    // zurücksetzen, damit die Variable nicht versehentlich irgendwo anders wirkt.
    document.documentElement.style.removeProperty('--druck-zoom');
  }

  // ---- Notiz-Fenster (seit 2026-10-27, zwölfter Durchgang) ----
  // Bewusst KEINE Variable, die den Text dauerhaft hält: das Textarea-Element selbst ist die
  // einzige "Speicherung" (DOM-Zustand), und die ist weg, sobald die Seite neu geladen oder das
  // Fenster über "Schließen" geleert wird. Es gibt also nichts, was in localStorage, die
  // Datenbank oder sonst irgendwohin geschrieben werden könnte – exakt wie von Lukas gewünscht.
  function toggleNotiz() {
    const fenster = document.getElementById('notiz-fenster');
    fenster.classList.toggle('hidden');
    if (!fenster.classList.contains('hidden')) {
      document.getElementById('notiz-text').focus();
    }
  }
  function schliesseNotiz() {
    const fenster = document.getElementById('notiz-fenster');
    fenster.classList.add('hidden');
    document.getElementById('notiz-text').value = ''; // Inhalt verwerfen, nichts bleibt zurück
  }
  (function initNotizDrag() {
    const fenster = document.getElementById('notiz-fenster');
    const kopf = document.getElementById('notiz-kopf');
    let ziehend = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
    kopf.addEventListener('mousedown', (e) => {
      if (e.target.closest('.notiz-schliessen')) return;
      ziehend = true;
      const rect = fenster.getBoundingClientRect();
      // Beim ersten Ziehen von right/bottom-Positionierung auf feste left/top umstellen, damit
      // sich das Fenster frei an jede Stelle des Bildschirms bewegen lässt.
      fenster.style.left = rect.left + 'px';
      fenster.style.top = rect.top + 'px';
      fenster.style.right = 'auto';
      fenster.style.bottom = 'auto';
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!ziehend) return;
      const neuLeft = startLeft + (e.clientX - startX);
      const neuTop = startTop + (e.clientY - startY);
      // Komplett auf dem Bildschirm halten (inkl. Schließen-Button rechts im Kopf), damit das
      // Fenster nie "verloren" werden kann – "überall auf dem Bildschirm verschieben" heißt frei
      // innerhalb des sichtbaren Bereichs, nicht darüber hinaus.
      const breite = fenster.offsetWidth, hoehe = fenster.offsetHeight;
      const maxLeft = Math.max(0, window.innerWidth - breite);
      const maxTop = Math.max(0, window.innerHeight - hoehe);
      fenster.style.left = Math.max(0, Math.min(maxLeft, neuLeft)) + 'px';
      fenster.style.top = Math.max(0, Math.min(maxTop, neuTop)) + 'px';
    });
    window.addEventListener('mouseup', () => { ziehend = false; });
  })();

  // ---- Backup-Ansicht (seit 2026-10-28) ----
  // Zeigt eine zuvor gespeicherte JSON-Backup-Datei (siehe backupJsonSpeichern in stammdaten.js)
  // tageweise als Kalender – Andy links, Lukas rechts, im selben Raster wie die Vergleichsansicht.
  // Rein lesend: Die Daten kommen nur aus der gewählten Datei und leben nur, solange das Fenster
  // offen ist; es wird nichts in die Datenbank geschrieben und nichts dauerhaft gespeichert.
  let backupAnsichtDaten = null;   // { termine, erstellt_am, zeitraum }
  let backupAnsichtTage = [];      // sortierte Liste aller Tage (YYYY-MM-DD), an denen es Termine gibt
  let backupAnsichtDatum = null;   // aktuell angezeigter Tag (Date)

  function backupOeffnenKlick() {
    document.getElementById('backup-datei-input').click();
  }

  async function backupDateiGewaehlt(input) {
    const datei = input.files && input.files[0];
    const statusEl = document.getElementById('backup-status');
    input.value = ''; // dieselbe Datei soll später erneut auswählbar sein
    if (!datei) return;
    let daten;
    try {
      daten = JSON.parse(await datei.text());
    } catch (e) {
      statusEl.textContent = 'Die Datei konnte nicht gelesen werden (keine gültige JSON-Datei).';
      return;
    }
    if (!daten || !Array.isArray(daten.termine)) {
      statusEl.textContent = 'Das ist keine Backup-Datei des Terminkalenders.';
      return;
    }
    // Spitze Klammern aus allen Textfeldern entfernen: Die Inhalte landen im HTML der Blöcke, eine
    // fremde oder veränderte Datei darf dort keinen Code einschleusen.
    const ohneHtml = wert => typeof wert === 'string' ? wert.replace(/[<>]/g, '') : wert;
    const termine = daten.termine
      .filter(t => t && typeof t.datum === 'string' && typeof t.startzeit === 'string')
      .map(t => {
        const kopie = {};
        Object.keys(t).forEach(k => { kopie[k] = ohneHtml(t[k]); });
        kopie.dauer_minuten = Number(kopie.dauer_minuten) || 20;
        return kopie;
      });
    backupAnsichtDaten = { termine, erstellt_am: daten.erstellt_am, zeitraum: daten.zeitraum };
    backupAnsichtTage = [...new Set(termine.map(t => t.datum))].sort();

    const erstellt = daten.erstellt_am ? new Date(daten.erstellt_am) : null;
    const zeitraum = daten.zeitraum && daten.zeitraum.von
      ? `${new Date(daten.zeitraum.von + 'T00:00:00').toLocaleDateString('de-DE')} bis ${new Date(daten.zeitraum.bis + 'T00:00:00').toLocaleDateString('de-DE')}`
      : 'gesamter Zeitraum';
    document.getElementById('backup-ansicht-quelle').textContent =
      `${datei.name.replace(/[<>]/g, '')} · ${zeitraum}` +
      (erstellt && !isNaN(erstellt) ? ` · erstellt am ${erstellt.toLocaleDateString('de-DE')}` : '') +
      ` · ${termine.length} Termine · nur zum Ansehen, Änderungen sind hier nicht möglich`;

    const datumFeld = document.getElementById('backup-ansicht-datum');
    datumFeld.min = backupAnsichtTage[0] || '';
    datumFeld.max = backupAnsichtTage[backupAnsichtTage.length - 1] || '';

    const ersterTag = backupAnsichtTage[0] || (daten.zeitraum && daten.zeitraum.von) || isoDatum(new Date());
    backupAnsichtDatum = naechsterWerktag(new Date(ersterTag + 'T00:00:00'), 1);
    document.getElementById('backup-ansicht-overlay').classList.remove('hidden');
    renderBackupAnsicht();
  }

  function schliesseBackupAnsicht() {
    document.getElementById('backup-ansicht-overlay').classList.add('hidden');
    versteckeTooltip();
    backupAnsichtDaten = null;
    backupAnsichtTage = [];
    ['andy', 'lukas'].forEach(name => {
      document.getElementById(`backup-raster-${name}-normal`).innerHTML = '';
      document.getElementById(`backup-raster-${name}-fango`).innerHTML = '';
    });
  }

  // Springt zum vorherigen/nächsten Tag, an dem es im Backup Termine gibt (leere Tage werden
  // übersprungen – bei einem Jahres-Backup sonst sehr viel Klicken).
  function backupAnsichtTagWechseln(richtung) {
    if (!backupAnsichtDaten) return;
    const aktuell = isoDatum(backupAnsichtDatum);
    const ziel = richtung > 0
      ? backupAnsichtTage.find(d => d > aktuell)
      : [...backupAnsichtTage].reverse().find(d => d < aktuell);
    if (!ziel) return;
    backupAnsichtDatum = new Date(ziel + 'T00:00:00');
    renderBackupAnsicht();
  }

  function backupAnsichtDatumGewaehlt(wert) {
    if (!backupAnsichtDaten || !wert) return;
    backupAnsichtDatum = naechsterWerktag(new Date(wert + 'T00:00:00'), 1);
    renderBackupAnsicht();
  }

  function renderBackupAnsicht() {
    if (!backupAnsichtDaten) return;
    const datum = backupAnsichtDatum;
    const datumStr = isoDatum(datum);
    const termine = backupAnsichtDaten.termine
      .filter(t => t.datum === datumStr)
      .sort((a, b) => a.startzeit.localeCompare(b.startzeit));

    document.getElementById('backup-ansicht-titel').textContent =
      `${formatierterTitel(datum)} · ${termine.length} ${termine.length === 1 ? 'Termin' : 'Termine'}`;
    document.getElementById('backup-ansicht-datum').value = datumStr;
    document.getElementById('backup-ansicht-zurueck').disabled = !backupAnsichtTage.some(d => d < datumStr);
    document.getElementById('backup-ansicht-vor').disabled = !backupAnsichtTage.some(d => d > datumStr);

    // Zeitraum des Rasters: heutige Öffnungszeiten des Wochentags, aber erweitert, falls ein
    // gesicherter Termin (z.B. aus Zeiten mit anderen Öffnungszeiten) davor oder danach liegt.
    const oz = vergleichOeffnungszeit(datum);
    let startMin = zeitToMinuten(oz.start);
    let endeMin = zeitToMinuten(oz.ende);
    termine.forEach(t => {
      const s = zeitToMinuten(t.startzeit.slice(0, 5));
      startMin = Math.min(startMin, Math.floor(s / 60) * 60);
      endeMin = Math.max(endeMin, Math.ceil((s + t.dauer_minuten) / 60) * 60);
    });
    const pxProMinute = VERGLEICH_PX_PRO_MINUTE;
    const hoeheGesamt = (endeMin - startMin) * pxProMinute;

    const achse = document.getElementById('backup-ansicht-zeitachse');
    achse.style.height = hoeheGesamt + 'px';
    achse.innerHTML = '';
    for (let std = Math.ceil(startMin / 60); std <= Math.floor(endeMin / 60); std++) {
      const label = document.createElement('div');
      label.className = 'stunde-label';
      label.style.top = ((std * 60 - startMin) * pxProMinute) + 'px';
      label.textContent = String(std).padStart(2, '0') + ':00';
      achse.appendChild(label);
    }

    const lanes = {
      Andy:  { normal: document.getElementById('backup-raster-andy-normal'),  fango: document.getElementById('backup-raster-andy-fango') },
      Lukas: { normal: document.getElementById('backup-raster-lukas-normal'), fango: document.getElementById('backup-raster-lukas-fango') }
    };
    // Rasterlinien auf jeder vollen Stunde (gleiches Prinzip wie renderVergleichSpalte)
    const linienVersatzPx = ((60 - (startMin % 60)) % 60) * pxProMinute;
    ['andy', 'lukas'].forEach(name => {
      const raster = document.getElementById(`backup-raster-${name}`);
      raster.style.height = hoeheGesamt + 'px';
      raster.style.backgroundImage = 'linear-gradient(to bottom, var(--border) 0, var(--border) 1px, transparent 1px)';
      raster.style.backgroundSize = `100% ${60 * pxProMinute}px`;
      raster.style.backgroundRepeat = 'repeat-y';
      raster.style.backgroundPosition = `0 ${linienVersatzPx}px`;
    });
    Object.values(lanes).forEach(l => {
      l.normal.innerHTML = ''; l.fango.innerHTML = '';
      l.normal.style.height = hoeheGesamt + 'px'; l.fango.style.height = hoeheGesamt + 'px';
    });

    termine.forEach(t => {
      const block = document.createElement('div');
      block.className = 'termin-block';
      block.style.setProperty('--termin-farbe', 'var(--' + farbeFuerTyp(t.behandlungstyp) + ')');
      if (t.status && t.status !== 'geplant') block.classList.add('status-' + t.status);
      const hoehe = Math.max(t.dauer_minuten * pxProMinute, 20);
      block.style.top = ((zeitToMinuten(t.startzeit.slice(0, 5)) - startMin) * pxProMinute) + 'px';
      block.style.height = hoehe + 'px';
      const { html, kompakt } = terminBlockInnerHtml(t, hoehe, false);
      if (kompakt) block.classList.add('kompakt');
      block.innerHTML = html;
      block.addEventListener('mouseenter', (e) => zeigeTooltip(e, t));
      block.addEventListener('mouseleave', versteckeTooltip);
      const lane = terminNutztEigeneSpalte(t.behandlungstyp) ? 'fango' : 'normal';
      lanes[t.therapeut === 'Lukas' ? 'Lukas' : 'Andy'][lane].appendChild(block);
    });

    Object.values(lanes).forEach(l => l.fango.classList.toggle('leer', l.fango.children.length === 0));
    Object.values(lanes).forEach(l => { schrumpfeBlockSchriftInLane(l.normal); schrumpfeBlockSchriftInLane(l.fango); });
  }
