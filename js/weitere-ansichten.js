// ======================================================================
// js/weitere-ansichten.js – Hausbesuch-Ansicht, Statistik, druckbarer Tagesplan, Notiz-Fenster
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
