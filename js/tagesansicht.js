// ======================================================================
// js/tagesansicht.js – Termine laden & anzeigen, Status-Mehrfachauswahl, Kopieren & Einfügen
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Termine laden & anzeigen ----
  // Icons statt Emojis – klar erkennbar, farblich codiert (siehe .icon-mini/.icon-* CSS). Als
  // Konstanten, damit dasselbe Symbol überall (Termin-Block, Modals, Listen) identisch aussieht.
  const ICON_TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
  const ICON_STIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>';
  const ICON_WARNUNG = '<svg class="icon-mini" style="color:#D97706;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const ICON_HAUS = '<svg class="icon-mini icon-haus" title="Hausbesuch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7"/><path d="M9 22V12h6v10"/><path d="M5 10v10a1 1 0 0 0 1 1h3m10-11v10a1 1 0 0 1-1 1h-3"/></svg>';
  const ICON_GRIFF = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>';
  const ICON_LUPE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
  function terminBlockIcons(t) {
    const serieIcon = t.serie_id
      ? '<svg class="icon-mini icon-serie" title="Teil einer Serie" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>'
      : '';
    const hausbesuchIcon = t.ist_hausbesuch
      ? '<svg class="icon-mini icon-haus" title="Hausbesuch" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7"/><path d="M9 22V12h6v10"/><path d="M5 10v10a1 1 0 0 0 1 1h3m10-11v10a1 1 0 0 1-1 1h-3"/></svg>'
      : '';
    const statusIconsHtml = {
      erschienen: '<svg class="icon-mini icon-erschienen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      abgesagt: '<svg class="icon-mini icon-abgesagt" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      nicht_erschienen: '<svg class="icon-mini icon-nicht-erschienen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
    };
    const statusLabels = { erschienen: 'Erschienen', abgesagt: 'Abgesagt', nicht_erschienen: 'Nicht erschienen' };
    const statusIcon = (t.status && statusIconsHtml[t.status])
      ? `<span class="status-icon" title="${statusLabels[t.status]}">${statusIconsHtml[t.status]}</span>`
      : '';
    return { serieIcon, hausbesuchIcon, statusIcon };
  }

  // Baut den Innen-Inhalt eines Termin-Blocks nach derselben 3-stufigen Lesbarkeits-Logik
  // (voll/mittel/kompakt je nach Blockhöhe) – von der normalen Tagesansicht UND der
  // Vergleichsansicht genutzt, damit beide optisch identisch bleiben.
  function terminBlockInnerHtml(t, hoehe, mitResizeGriff) {
    const { serieIcon, hausbesuchIcon, statusIcon } = terminBlockIcons(t);
    const start = t.startzeit.slice(0, 5);
    const kurz = kurzBehandlung(t.behandlungstyp);
    const name = (t.patientenname || '').replace(/</g, '&lt;');
    const ortLabel = t.ist_hausbesuch ? `Hausbesuch${t.fahrzeit_minuten ? ' (Fahrzeit ' + t.fahrzeit_minuten + ' Min)' : ''}` : `Raum ${t.raum}`;
    const resizeGriff = mitResizeGriff ? '<div class="resize-griff" title="Ziehen, um die Dauer zu ändern"></div>' : '';
    const loeschGriff = `<button type="button" class="block-loesch-btn" title="Termin löschen" tabindex="-1">${ICON_TRASH}</button>`;
    // Haupt-Zeile Zeit · Kürzel · Name – immer in voller Größe, egal wie kurz der Termin ist.
    const hauptzeile = `<div class="zeile-haupt"><span class="zeit">${start}</span><span class="kuerzel">${kurz}</span><b class="name">${name}</b>${serieIcon}${hausbesuchIcon}${statusIcon}</div>`;

    if (hoehe >= 50) {
      return { kompakt: false, html: `
        ${hauptzeile}
        <div class="meta">${ortLabel} &middot; ${t.behandlungstyp} &middot; ${t.dauer_minuten} Min</div>
        ${resizeGriff}${loeschGriff}
      ` };
    }
    if (hoehe >= 36) {
      return { kompakt: false, html: `
        ${hauptzeile}
        <div class="meta">${ortLabel}</div>
        ${resizeGriff}${loeschGriff}
      ` };
    }
    return { kompakt: true, html: `
      ${hauptzeile}
      ${resizeGriff}${loeschGriff}
    ` };
  }

  // Verkleinert bei Bedarf die Schrift der Haupt-Zeile (Zeit/Kürzel/Name) einzelner Termin-
  // Blöcke, damit diese drei Angaben IMMER vollständig sichtbar sind, OHNE optisch über den
  // eigenen Zeitslot hinauszuwachsen (Lukas' Wunsch: "sobald es größer ist als das Terminfeld,
  // muss die Schrift kleiner werden") – vorher wurde nur gegen den Abstand zum nächsten Termin
  // geprüft, wodurch kurze Termine mit viel Platz danach trotzdem unschön umbrachen/Wörter
  // mitten im Wort trennten, statt einfach kleiner zu werden. Ablauf je Lane: erst alle Blöcke
  // auf die Standardschrift zurücksetzen, dann für jeden Block den verfügbaren Platz ermitteln
  // (die EIGENE Blockhöhe, zusätzlich gedeckelt durch den Abstand zum nächsten Termin derselben
  // Lane als zweite Sicherheitsgrenze) und die Schrift stufenweise verkleinern, bis der Inhalt
  // hineinpasst oder die Mindestgröße erreicht ist.
  // Seit 2026-10-28 größere Schrift und feste Mindestgröße (Lukas: Zeit, Heilmittel und Name
  // müssen bei jeder Termindauer gut lesbar sein). Ablauf: erst mehrzeilig (umbrechend) mit
  // 16/15/14px versuchen; passt das nicht, alle drei Angaben in EINE Zeile nebeneinander setzen
  // (Klasse .einzeiler) und dort höchstens bis 13px verkleinern – nie kleiner.
  const SCHRUMPF_SCHRITTE = [16, 15, 14];
  const SCHRUMPF_SCHRITTE_EINZEILIG = [16, 15, 14, 13];
  function blockInhaltHoehe(block) {
    const blockRect = block.getBoundingClientRect();
    let unten = blockRect.top;
    Array.from(block.children).forEach(el => {
      if (el.classList.contains('resize-griff') || el.classList.contains('block-loesch-btn')) return;
      const r = el.getBoundingClientRect();
      // Ausgeblendete Elemente (z.B. .meta mit display:none) liefern ein leeres Rechteck bei 0/0 –
      // nicht mitzählen, sonst wird bei heruntergescrollter Seite eine falsche Höhe gemessen.
      if (r.width === 0 && r.height === 0) return;
      if (r.bottom > unten) unten = r.bottom;
    });
    const paddingUnten = parseFloat(getComputedStyle(block).paddingBottom) || 0;
    return (unten - blockRect.top) + paddingUnten;
  }
  function schrumpfeBlockSchriftInLane(laneEl) {
    if (!laneEl) return;
    const bloecke = Array.from(laneEl.children)
      .filter(el => el.classList && el.classList.contains('termin-block'))
      .map(el => ({ el, top: parseFloat(el.style.top) || 0, hoehe: parseFloat(el.style.height) || 0 }))
      .sort((a, b) => a.top - b.top);
    if (!bloecke.length) return;
    bloecke.forEach(b => { b.el.style.removeProperty('--block-schrift'); b.el.classList.remove('einzeiler', 'ohne-zeit'); });
    const laneHoehe = laneEl.scrollHeight || laneEl.clientHeight || 0;
    bloecke.forEach((eintrag, i) => {
      const naechsterTop = (i + 1 < bloecke.length) ? bloecke[i + 1].top : laneHoehe;
      const lueckeZumNaechsten = naechsterTop - eintrag.top - 2; // 2px Sicherheitsabstand
      // Maßgeblich ist primär die EIGENE Blockhöhe (der Zeitslot des Termins selbst) – zusätzlich
      // nie größer als die Lücke zum nächsten Termin, damit ein Hineinlaufen in den Nachbarn
      // weiterhin ausgeschlossen bleibt (beide Grenzen gelten gleichzeitig).
      const verfuegbar = Math.min(eintrag.hoehe, lueckeZumNaechsten);
      let passt = false;
      for (const schrift of SCHRUMPF_SCHRITTE) {
        eintrag.el.style.setProperty('--block-schrift', schrift + 'px');
        if (blockInhaltHoehe(eintrag.el) <= verfuegbar) { passt = true; break; }
      }
      // Kurzer Termin: Zeit · Kürzel · Name in eine Zeile nebeneinander (Zeit und Kürzel immer
      // vollständig, nur ein sehr langer Name wird bei zu schmaler Spalte mit "…" gekürzt – voller
      // Name über Hover/Klick). Schrift so groß wie möglich, mindestens 13px (letzter Schritt bleibt
      // stehen, auch wenn selbst der nicht ganz passt).
      // Seit 2026-10-29 zusätzlich auch nach der Breite: gewählt wird die größte Schrift, bei der
      // die Zeile in die Höhe passt UND Heilmittel-Kürzel und Name nicht mit "…" gekürzt werden.
      // Reicht die Breite selbst mit 13px nicht, wird (auf Lukas' Wunsch) zuerst die UHRZEIT
      // weggelassen (Klasse .ohne-zeit) – sie ist über die Position im Raster ablesbar und steht im
      // Hover-Fenster –, damit Heilmittel und Name sichtbar bleiben. Erst danach wird gekürzt.
      if (!passt) {
        eintrag.el.classList.add('einzeiler');
        const nameEl = eintrag.el.querySelector('.zeile-haupt .name');
        const kuerzelEl = eintrag.el.querySelector('.zeile-haupt .kuerzel');
        const ganz = el => !el || el.scrollWidth <= el.clientWidth + 1;
        let groessteHoehePasst = null;
        const versuche = () => {
          for (const schrift of SCHRUMPF_SCHRITTE_EINZEILIG) {
            eintrag.el.style.setProperty('--block-schrift', schrift + 'px');
            const hoehePasst = blockInhaltHoehe(eintrag.el) <= verfuegbar;
            if (hoehePasst && groessteHoehePasst === null) groessteHoehePasst = schrift;
            if (hoehePasst && ganz(nameEl) && ganz(kuerzelEl)) return true;
          }
          return false;
        };
        if (!versuche()) {
          eintrag.el.classList.add('ohne-zeit');
          groessteHoehePasst = null;
          if (!versuche()) {
            const letzte = SCHRUMPF_SCHRITTE_EINZEILIG[SCHRUMPF_SCHRITTE_EINZEILIG.length - 1];
            eintrag.el.style.setProperty('--block-schrift', (groessteHoehePasst || letzte) + 'px');
          }
        }
      }
    });
  }

  async function ladeTermine() {
    const datum = isoDatum(ausgewaehltesDatum);
    const { data, error } = await db
      .from('termine')
      .select('*')
      .eq('datum', datum)
      .order('startzeit', { ascending: true });

    const lanes = {
      Lukas: { normal: document.getElementById('raster-lukas-normal'), fango: document.getElementById('raster-lukas-fango') },
      Andy: { normal: document.getElementById('raster-andy-normal'), fango: document.getElementById('raster-andy-fango') }
    };
    Object.values(lanes).forEach(l => { l.normal.innerHTML = ''; l.fango.innerHTML = ''; });

    if (error) {
      const fehlerHtml = `<div style="padding:8px;color:#DC2626;font-size:12px;">Fehler beim Laden: ${error.message}</div>`;
      lanes.Lukas.normal.innerHTML = fehlerHtml;
      return;
    }
    if (!data) return;

    aktuelleTagesTermine = data;

    data.forEach(t => {
      const block = document.createElement('div');
      block.className = 'termin-block';
      block.dataset.terminId = t.id;
      block.style.setProperty('--termin-farbe', 'var(--' + farbeFuerTyp(t.behandlungstyp) + ')');
      if (t.status && t.status !== 'geplant') block.classList.add('status-' + t.status);
      if (statusAuswahlIds.has(t.id)) block.classList.add('status-ausgewaehlt');
      block.addEventListener('mousedown', (e) => starteDrag(e, t, block));
      block.addEventListener('mouseenter', (e) => zeigeTooltip(e, t));
      block.addEventListener('mouseleave', versteckeTooltip);
      const top = minutenSeitTagesstart(t.startzeit) * PX_PRO_MINUTE;
      const hoehe = Math.max(t.dauer_minuten * PX_PRO_MINUTE, 20);
      block.style.top = top + 'px';
      block.style.height = hoehe + 'px';

      const { html, kompakt } = terminBlockInnerHtml(t, hoehe, true);
      if (kompakt) block.classList.add('kompakt');
      block.innerHTML = html;

      const lane = terminNutztEigeneSpalte(t.behandlungstyp) ? 'fango' : 'normal';
      const ziel = (t.therapeut === 'Lukas') ? lanes.Lukas : lanes.Andy;
      ziel[lane].appendChild(block);
      const griffEl = block.querySelector('.resize-griff');
      if (griffEl) griffEl.addEventListener('mousedown', (e) => starteResize(e, t, block));
      const loeschBtn = block.querySelector('.block-loesch-btn');
      if (loeschBtn) {
        loeschBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        loeschBtn.addEventListener('click', async (e) => {
          e.stopPropagation(); e.preventDefault();
          if (statusModusAktiv) return;
          if (await terminWirklichLoeschen(t)) ladeTermine();
        });
      }
    });

    if (!lanes.Lukas.normal.children.length) lanes.Lukas.normal.innerHTML = '<div class="leer-hinweis">Keine Termine</div>';
    if (!lanes.Andy.normal.children.length) lanes.Andy.normal.innerHTML = '<div class="leer-hinweis">Keine Termine</div>';
    // Fango/Massage-Lane nur anzeigen, wenn an diesem Tag tatsächlich etwas drin steht – an den
    // meisten Tagen bleibt sie leer, dann bekommt die normale Lane die volle Spaltenbreite.
    lanes.Lukas.fango.classList.toggle('leer', lanes.Lukas.fango.children.length === 0);
    lanes.Andy.fango.classList.toggle('leer', lanes.Andy.fango.children.length === 0);
    schrumpfeBlockSchriftInLane(lanes.Lukas.normal);
    schrumpfeBlockSchriftInLane(lanes.Lukas.fango);
    schrumpfeBlockSchriftInLane(lanes.Andy.normal);
    schrumpfeBlockSchriftInLane(lanes.Andy.fango);
    // Grünen Terminsuche-Balken (falls vorhanden und für diesen Tag relevant) wieder einblenden –
    // die Lanes wurden oben geleert und neu befüllt, siehe zeigeTerminsucheMarkierung.
    zeigeTerminsucheMarkierung();
  }

  // ---- Status-Mehrfachauswahl-Modus: Termine im Kalender anklicken (Mehrfachauswahl) statt den
  // Status jedes Termins einzeln im Bearbeiten-Modal zu setzen – gedacht für den Tagesabschluss
  // ("wer ist erschienen/abgesagt/nicht da gewesen"), ohne jeden Termin einzeln öffnen zu müssen. ----
  let statusModusAktiv = false;
  let statusAuswahlIds = new Set();

  function statusModusUmschalten() {
    statusModusAktiv = !statusModusAktiv;
    document.getElementById('status-modus-btn').classList.toggle('aktiv', statusModusAktiv);
    document.getElementById('tag-ansicht').classList.toggle('status-modus', statusModusAktiv);
    if (!statusModusAktiv) {
      statusAuswahlIds.clear();
      document.querySelectorAll('.termin-block.status-ausgewaehlt').forEach(b => b.classList.remove('status-ausgewaehlt'));
    }
    statusAuswahlAktualisierenLeiste();
  }

  function toggleStatusAuswahl(termin, block) {
    if (statusAuswahlIds.has(termin.id)) {
      statusAuswahlIds.delete(termin.id);
      block.classList.remove('status-ausgewaehlt');
    } else {
      statusAuswahlIds.add(termin.id);
      block.classList.add('status-ausgewaehlt');
    }
    statusAuswahlAktualisierenLeiste();
  }

  function statusAuswahlAktualisierenLeiste() {
    const leiste = document.getElementById('status-leiste');
    const anzahl = statusAuswahlIds.size;
    leiste.classList.toggle('hidden', !statusModusAktiv);
    document.getElementById('status-anzahl').textContent = anzahl + (anzahl === 1 ? ' Termin ausgewählt' : ' Termine ausgewählt');
  }

  async function statusAuswahlAnwenden(status) {
    const ids = Array.from(statusAuswahlIds);
    if (!ids.length) return;
    const labels = { erschienen: 'Erledigt', abgesagt: 'Abgesagt', nicht_erschienen: 'Nicht da', geplant: 'Zurückgesetzt (Geplant)' };
    for (const id of ids) {
      const { error } = await db.from('termine').update({ status }).eq('id', id);
      if (!error) {
        const t = (aktuelleTagesTermine || []).find(x => x.id === id);
        protokolliere(id, 'bearbeitet', `${t ? t.patientenname : id}: Status → ${labels[status] || status}`, t ? t.datum : null);
      }
    }
    statusAuswahlIds.clear();
    statusModusAktiv = false;
    document.getElementById('status-modus-btn').classList.remove('aktiv');
    document.getElementById('tag-ansicht').classList.remove('status-modus');
    statusAuswahlAktualisierenLeiste();
    ladeTermine();
  }

  // ---- Kopieren & Einfügen (Strg+C / Strg+V) ----
  // Kopiert den Termin unter der Maus; Strg+V legt an der aktuellen Mausposition (Spalte + Zeit)
  // einen neuen Termin mit denselben Daten an. Nur in der normalen Tagesansicht nutzbar, und nicht
  // während in einem Textfeld getippt wird (dort soll das normale Kopieren/Einfügen funktionieren).
  let terminKlemmbrett = null;
  let letzteMausPosition = { x: 0, y: 0 };
  document.addEventListener('mousemove', (e) => { letzteMausPosition = { x: e.clientX, y: e.clientY }; });

  function terminUnterMaus() {
    const el = document.elementFromPoint(letzteMausPosition.x, letzteMausPosition.y);
    const block = el ? el.closest('.termin-block') : null;
    if (!block || !block.dataset.terminId) return null;
    return (aktuelleTagesTermine || []).find(t => t.id === block.dataset.terminId) || null;
  }

  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const taste = e.key.toLowerCase();
    if (taste !== 'c' && taste !== 'v') return;
    const aktiv = document.activeElement;
    if (aktiv && (aktiv.tagName === 'INPUT' || aktiv.tagName === 'TEXTAREA' || aktiv.isContentEditable)) return;
    const modalOffen = document.getElementById('modal-overlay') && !document.getElementById('modal-overlay').classList.contains('hidden');
    if (modalOffen || ansichtstyp !== 'tag') return;

    if (taste === 'c') {
      const t = terminUnterMaus();
      if (t) {
        terminKlemmbrett = { ...t };
        zeigeKurzHinweis(`"${t.patientenname}" kopiert – mit Strg+V an der Mausposition einfügen.`);
      }
    } else if (terminKlemmbrett) {
      e.preventDefault();
      terminEinfuegen();
    }
  });

  async function terminEinfuegen() {
    const quelle = terminKlemmbrett;
    if (!quelle) return;
    const el = document.elementFromPoint(letzteMausPosition.x, letzteMausPosition.y);
    const laneEl = el ? el.closest('.lane-normal, .lane-fango') : null;
    let therapeut = quelle.therapeut;
    let startzeit = quelle.startzeit.slice(0, 5);
    const oz = aktuelleOeffnungszeit();
    if (laneEl && laneEl.id.startsWith('raster-')) {
      const teile = laneEl.id.split('-'); // ID-Muster: raster-<therapeut>-<normal|fango>
      therapeut = teile[1] === 'lukas' ? 'Lukas' : 'Andy';
      const rect = laneEl.getBoundingClientRect();
      let minutenAbsolut = zeitToMinuten(oz.start) + (letzteMausPosition.y - rect.top) / PX_PRO_MINUTE;
      minutenAbsolut = Math.max(zeitToMinuten(oz.start), Math.min(Math.round(minutenAbsolut / 5) * 5, zeitToMinuten(oz.ende) - quelle.dauer_minuten));
      startzeit = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');
    }

    const terminEigeneSpalte = terminNutztEigeneSpalte(quelle.behandlungstyp);
    const eigeneFahrzeit = quelle.ist_hausbesuch ? (quelle.fahrzeit_minuten || 0) : 0;
    // Konfliktprüfung läuft seit 2026-10-27 (achter Durchgang) rein über den Therapeuten (+ Lane) –
    // Lukas und Andy sind jeweils eigene, unabhängige Spalten und dürfen sich zeitgleich Termine
    // legen, auch wenn zufällig dieselbe Raumnummer gewählt ist (siehe Spec/Code-Map).
    const belegung = (aktuelleTagesTermine || []).filter(t => (
      t.therapeut === therapeut && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte
    ));
    if (findeKonflikt(belegung, startzeit, quelle.dauer_minuten, eigeneFahrzeit)) {
      const frei = naechsteFreieZeit(belegung, quelle.dauer_minuten, startzeit, oz, eigeneFahrzeit);
      if (frei) startzeit = frei;
    }

    const datensatz = {
      datum: isoDatum(ausgewaehltesDatum), startzeit, dauer_minuten: quelle.dauer_minuten,
      raum: quelle.raum, therapeut, patientenname: quelle.patientenname, patient_id: quelle.patient_id || null,
      behandlungstyp: quelle.behandlungstyp, notiz: quelle.notiz || null, status: 'geplant',
      verordnung_id: quelle.verordnung_id || null, ist_hausbesuch: quelle.ist_hausbesuch || false,
      fahrzeit_minuten: quelle.fahrzeit_minuten || null
    };
    const { data, error } = await db.from('termine').insert(datensatz).select().single();
    if (error) { alert('Fehler beim Einfügen: ' + error.message); return; }
    protokolliere(data.id, 'angelegt', `${data.patientenname} (kopiert): ${isoDatum(ausgewaehltesDatum)} ${startzeit} Uhr`, isoDatum(ausgewaehltesDatum));
    zeigeKurzHinweis(`"${data.patientenname}" eingefügt um ${startzeit} Uhr.`);
    ladeTermine();
  }

  let kurzhinweisTimer = null;
  function zeigeKurzHinweis(text) {
    const el = document.getElementById('kurzhinweis-toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('sichtbar');
    clearTimeout(kurzhinweisTimer);
    kurzhinweisTimer = setTimeout(() => el.classList.remove('sichtbar'), 2400);
  }
