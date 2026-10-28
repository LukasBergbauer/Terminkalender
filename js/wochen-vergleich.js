// ======================================================================
// js/wochen-vergleich.js – Wochenansicht, Vergleichsansicht (zwei Tage) inkl. Drag-Resize darin
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Wochenansicht ----
  async function renderWoche() {
    // Wochenende komplett entfernt: nur noch Mo-Fr (5 Tage statt 7), siehe istWochenende/naechsterWerktag.
    const montag = montagDerWoche(ausgewaehltesDatum);
    const tage = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(montag);
      d.setDate(d.getDate() + i);
      tage.push(d);
    }
    const vonDatum = isoDatum(tage[0]);
    const bisDatum = isoDatum(tage[tage.length - 1]);

    const { data, error } = await db.from('termine').select('*').gte('datum', vonDatum).lte('datum', bisDatum);
    const grid = document.getElementById('woche-grid');
    grid.innerHTML = '';
    grid.classList.remove('akkordeon-aktiv');

    if (error) {
      grid.innerHTML = `<div style="padding:8px;color:#DC2626;font-size:12px;">Fehler beim Laden: ${error.message}</div>`;
      return;
    }

    const WOCHENTAG_KURZ = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const heute = new Date();

    tage.forEach(tag => {
      const datumStr = isoDatum(tag);
      const terminDesTages = (data || [])
        .filter(t => {
          if (t.datum !== datumStr) return false;
          if (ansichtsFilter === 'lukas') return t.therapeut === 'Lukas';
          if (ansichtsFilter === 'andy') return t.therapeut === 'Andy';
          return true;
        })
        .sort((a, b) => a.startzeit.localeCompare(b.startzeit));

      const spalte = document.createElement('div');
      spalte.className = 'woche-tag-spalte' + (istGleicherTag(tag, heute) ? ' heute' : '');

      // Klick auf die Spalte pinnt sie als "groß" (wie Hover) – wichtig für Touch-Geräte, die
      // kein echtes :hover kennen. Klicks auf einen Termin selbst sollen das nicht auslösen.
      spalte.addEventListener('click', (e) => {
        if (e.target.closest('.woche-termin')) return;
        const warSchonAktiv = spalte.classList.contains('aktiv');
        grid.querySelectorAll('.woche-tag-spalte.aktiv').forEach(el => el.classList.remove('aktiv'));
        if (warSchonAktiv) {
          grid.classList.remove('akkordeon-aktiv');
        } else {
          spalte.classList.add('aktiv');
          grid.classList.add('akkordeon-aktiv');
        }
      });

      // -- Minimierte Ansicht: Wochentag + Datum + Terminanzahl --
      const mini = document.createElement('div');
      mini.className = 'woche-tag-mini';
      mini.innerHTML = `
        <div class="mini-wochentag">${WOCHENTAG_KURZ[tag.getDay()]}</div>
        <div class="mini-datum">${tag.getDate()}.${tag.getMonth() + 1}.</div>
        ${terminDesTages.length ? `<div class="mini-anzahl">${terminDesTages.length}</div>` : ''}
      `;
      spalte.appendChild(mini);

      // -- Volle Ansicht: Kopf + komplette Terminliste des Tages --
      const voll = document.createElement('div');
      voll.className = 'woche-tag-voll';
      const kopf = document.createElement('div');
      kopf.className = 'woche-tag-kopf';
      kopf.innerHTML = `<span>${WOCHENTAG_KURZ[tag.getDay()]}</span><span class="tag-zahl">${tag.getDate()}.${tag.getMonth() + 1}.</span>`;
      voll.appendChild(kopf);

      if (!terminDesTages.length) {
        const leer = document.createElement('div');
        leer.className = 'woche-leer';
        leer.textContent = 'Keine Termine';
        voll.appendChild(leer);
      } else if (ansichtsFilter === 'beide') {
        // Seit 2026-10-27 (neunter Durchgang): pro Tag in zwei Spalten aufgeteilt (Andy links,
        // Lukas rechts, wie überall sonst in der App), statt einer gemischten chronologischen
        // Liste – nur sinnvoll, wenn der Filter wirklich beide Therapeuten zeigt.
        const split = document.createElement('div');
        split.className = 'woche-tag-spalten-split';
        [['Andy', terminDesTages.filter(t => t.therapeut === 'Andy')], ['Lukas', terminDesTages.filter(t => t.therapeut === 'Lukas')]].forEach(([name, liste]) => {
          const therapeutSpalte = document.createElement('div');
          therapeutSpalte.className = 'woche-tag-therapeut-spalte';
          const label = document.createElement('div');
          label.className = 'woche-tag-therapeut-label';
          label.textContent = name;
          therapeutSpalte.appendChild(label);
          if (!liste.length) {
            const leer = document.createElement('div');
            leer.className = 'woche-leer';
            leer.textContent = 'Keine Termine';
            therapeutSpalte.appendChild(leer);
          } else {
            liste.forEach(t => therapeutSpalte.appendChild(baueWocheTerminZeile(t, tag)));
          }
          split.appendChild(therapeutSpalte);
        });
        voll.appendChild(split);
      } else {
        terminDesTages.forEach(t => voll.appendChild(baueWocheTerminZeile(t, tag)));
      }
      spalte.appendChild(voll);

      grid.appendChild(spalte);
    });
  }

  // Baut eine einzelne Termin-Zeile für die Wochenansicht (Zeit + Name, Rest nur im nativen
  // Hover-Titel) – gemeinsam genutzt von der aufgeteilten Andy/Lukas-Ansicht und der einfachen
  // Liste bei aktivem Einzel-Filter.
  function baueWocheTerminZeile(t, tag) {
    const zeile = document.createElement('div');
    zeile.className = 'woche-termin';
    const kurz = kurzBehandlung(t.behandlungstyp);
    zeile.innerHTML = `<span class="zeit">${t.startzeit.slice(0, 5)}</span><span class="kuerzel">${kurz}</span><span class="wer">${t.patientenname}</span>`;
    zeile.title = `${t.therapeut} · ${t.ist_hausbesuch ? 'Hausbesuch' : 'Raum ' + t.raum} · ${t.behandlungstyp}`;
    zeile.onclick = () => {
      ausgewaehltesDatum = new Date(tag);
      miniKalenderDatum = new Date(tag);
      setzeAnsichtstyp('tag');
      setTimeout(() => oeffneBearbeitenModal(t), 60);
    };
    return zeile;
  }

  // ---- Vergleichsansicht: zwei Tage nebeneinander (links = normal navigierter Tag, fix;
  //      rechts = frei per Mini-Kalender wählbarer zweiter Tag). Zeigt pro Tag ein echtes,
  //      kompaktes Zeitraster – wie die normale Tagesansicht, nur schmaler/kürzer skaliert –
  //      inkl. Möglichkeit, direkt neue Termine anzulegen (vergleichNeuerTermin/-RasterKlick). ----
  let vergleichsDatum = null;
  let vergleichKalenderDatum = new Date();
  const VERGLEICH_PX_PRO_MINUTE = 1.0; // 60px/Stunde – seit 2026-10-27 (zwölfter Durchgang) von 0.8 auf 1.0 angehoben,
  // da nach der vertikalen Zentrierung (s.o.) in der Vergleichsansicht weiterhin spürbar mehr
  // Leerraum unter der Karte übrig blieb als in der Tagesansicht (von Lukas explizit gewünscht:
  // "etwas vergrößert"). Bleibt bewusst unter den 72px/Std. (1.2) der Tagesansicht, damit zwei
  // Tage weiterhin nebeneinander ohne horizontales Scrollen passen (betrifft nur die Höhen-
  // Skalierung, nicht die Breite).
  let vergleichRueckkehrSeite = null; // 'links' | 'rechts', solange ein Termin aus der Vergleichsansicht im Modal offen ist
  let vergleichModalDatum = null;     // überschreibt ausgewaehltesDatum nur für den jeweils offenen Speicher-/Löschvorgang

  function aktivesModalDatum() {
    return vergleichModalDatum || ausgewaehltesDatum;
  }

  function vergleichDatumFuerSeite(seite) {
    return seite === 'links' ? ausgewaehltesDatum : vergleichsDatum;
  }

  function vergleichOeffnungszeit(datum) {
    return oeffnungszeitenProTag[datum.getDay()] || { start: '07:00', ende: '20:00' };
  }

  async function renderVergleich() {
    await renderVergleichSpalte(ausgewaehltesDatum, 'links');
    const titelEl = document.getElementById('vergleich-rechts-titel');
    const tagEl = document.getElementById('vergleich-tag-rechts');
    const leerEl = document.getElementById('vergleich-rechts-leer');
    if (!vergleichsDatum) {
      titelEl.textContent = 'Vergleichstag wählen…';
      tagEl.classList.add('hidden');
      leerEl.classList.remove('hidden');
      return;
    }
    titelEl.textContent = formatierterTitel(vergleichsDatum);
    tagEl.classList.remove('hidden');
    leerEl.classList.add('hidden');
    await renderVergleichSpalte(vergleichsDatum, 'rechts');
  }

  async function renderVergleichSpalte(datum, seite) {
    const datumStr = isoDatum(datum);
    const { data, error } = await db.from('termine').select('*').eq('datum', datumStr).order('startzeit', { ascending: true });
    const oz = vergleichOeffnungszeit(datum);
    const startMin = zeitToMinuten(oz.start);
    const endeMin = zeitToMinuten(oz.ende);
    const hoeheGesamt = (endeMin - startMin) * VERGLEICH_PX_PRO_MINUTE;

    const achse = document.getElementById(`vergleich-zeitachse-${seite}`);
    achse.style.height = hoeheGesamt + 'px';
    achse.innerHTML = '';
    const ersteVolleStunde = Math.ceil(startMin / 60);
    const letzteVolleStunde = Math.floor(endeMin / 60);
    for (let std = ersteVolleStunde; std <= letzteVolleStunde; std++) {
      const label = document.createElement('div');
      label.className = 'stunde-label';
      label.style.top = ((std * 60 - startMin) * VERGLEICH_PX_PRO_MINUTE) + 'px';
      label.textContent = String(std).padStart(2, '0') + ':00';
      achse.appendChild(label);
    }

    const lanes = {
      Lukas: { normal: document.getElementById(`vergleich-raster-${seite}-lukas-normal`), fango: document.getElementById(`vergleich-raster-${seite}-lukas-fango`) },
      Andy:  { normal: document.getElementById(`vergleich-raster-${seite}-andy-normal`),  fango: document.getElementById(`vergleich-raster-${seite}-andy-fango`) }
    };
    Object.values(lanes).forEach(l => {
      l.normal.innerHTML = ''; l.fango.innerHTML = '';
      l.normal.style.height = hoeheGesamt + 'px'; l.fango.style.height = hoeheGesamt + 'px';
    });
    document.getElementById(`vergleich-raster-${seite}-lukas`).style.height = hoeheGesamt + 'px';
    document.getElementById(`vergleich-raster-${seite}-andy`).style.height = hoeheGesamt + 'px';

    if (error) return;
    let termine = data || [];
    if (ansichtsFilter === 'lukas') termine = termine.filter(t => t.therapeut === 'Lukas');
    if (ansichtsFilter === 'andy') termine = termine.filter(t => t.therapeut === 'Andy');

    termine.forEach(t => {
      const block = document.createElement('div');
      block.className = 'termin-block';
      block.dataset.terminId = t.id;
      block.style.setProperty('--termin-farbe', 'var(--' + farbeFuerTyp(t.behandlungstyp) + ')');
      if (t.status && t.status !== 'geplant') block.classList.add('status-' + t.status);
      const top = (zeitToMinuten(t.startzeit.slice(0, 5)) - startMin) * VERGLEICH_PX_PRO_MINUTE;
      const hoehe = Math.max(t.dauer_minuten * VERGLEICH_PX_PRO_MINUTE, 20);
      block.style.top = top + 'px';
      block.style.height = hoehe + 'px';
      // mitResizeGriff jetzt true (seit 2026-10-27, neunter Durchgang): volle Dauer-Resize-
      // Funktionalität wie in der Tagesansicht, siehe vergleichStarteResize unten.
      const { html, kompakt } = terminBlockInnerHtml(t, hoehe, true);
      if (kompakt) block.classList.add('kompakt');
      block.innerHTML = html;
      block.addEventListener('mousedown', (e) => vergleichStarteDrag(e, t, block, seite));
      block.addEventListener('mouseenter', (e) => zeigeTooltip(e, t));
      block.addEventListener('mouseleave', versteckeTooltip);
      const loeschBtn = block.querySelector('.block-loesch-btn');
      if (loeschBtn) {
        loeschBtn.addEventListener('mousedown', (e) => e.stopPropagation());
        loeschBtn.addEventListener('click', async (e) => {
          e.stopPropagation(); e.preventDefault();
          if (await terminWirklichLoeschen(t)) renderVergleich();
        });
      }
      const griffEl = block.querySelector('.resize-griff');
      if (griffEl) griffEl.addEventListener('mousedown', (e) => vergleichStarteResize(e, t, block, seite));
      const lane = terminNutztEigeneSpalte(t.behandlungstyp) ? 'fango' : 'normal';
      lanes[t.therapeut === 'Lukas' ? 'Lukas' : 'Andy'][lane].appendChild(block);
    });

    Object.values(lanes).forEach(l => l.fango.classList.toggle('leer', l.fango.children.length === 0));
    Object.values(lanes).forEach(l => { schrumpfeBlockSchriftInLane(l.normal); schrumpfeBlockSchriftInLane(l.fango); });
  }

  // Termin in der Vergleichsansicht per Ziehen verschieben – sowohl auf den ANDEREN Tag (Datum,
  // Zeit und ggf. Therapeut werden anhand der Ziel-Lane neu bestimmt) als auch frei INNERHALB
  // derselben Tagesseite (Therapeutenwechsel z.B. Andy -> Lukas und/oder neue Uhrzeit, genau wie
  // in der normalen Tagesansicht). Ein einfacher Klick ohne Ziehen öffnet weiterhin das
  // Bearbeiten-Modal.
  function vergleichStarteDrag(event, termin, block, seite) {
    if (event.button !== 0) return;
    if (statusModusAktiv) return;
    event.preventDefault();
    const startMausX = event.clientX, startMausY = event.clientY;
    const startTop = parseFloat(block.style.top);
    let hatSichBewegt = false;
    let zielLane = null;
    versteckeTooltip();

    function aufBewegen(ev) {
      if (!hatSichBewegt && Math.hypot(ev.clientX - startMausX, ev.clientY - startMausY) < 5) return;
      if (!hatSichBewegt) { hatSichBewegt = true; block.classList.add('vergleich-dragging'); vergleichVerschiebenAktiv = true; }
      // Der Block folgt der Maus vertikal 1:1 innerhalb seiner Ursprungs-Lane (seit 2026-10-27,
      // zehnter Durchgang) – genau dasselbe Prinzip wie starteDrag() in der Tagesansicht (dort
      // bleibt der Block beim Spaltenwechsel ja ebenfalls in seiner Ursprungsspalte, nur die
      // Uhrzeit/Höhe bewegt sich sichtbar mit). Vorher stand der Block während des gesamten Zugs
      // optisch unverändert an seiner Startposition (nur Opacity 0.4) – von Lukas gemeldet als
      // "der Textblock wird nicht mitgenommen", was dazu führte, dass ein zweiter, eigentlich
      // unnötiger Klick auf das Ziel-Raster folgte und dort fälschlich ein neues Anlegen-Modal
      // öffnete. Der schwebende Zeit-Indikator unten zeigt weiterhin das tatsächliche Ziel
      // (inkl. Spalten-/Tageswechsel), diese Bewegung ist nur das zusätzliche "es tut sich
      // wirklich etwas"-Feedback direkt am Block.
      const deltaY = ev.clientY - startMausY;
      const maxTop = block.parentElement.clientHeight - block.offsetHeight;
      block.style.top = Math.max(0, Math.min(startTop + deltaY, maxTop)) + 'px';
      // Da der Block jetzt unter dem Mauszeiger mitwandert, kann der Browser (wie schon beim
      // Dauer-Resize, siehe starteResize) ein eigenes mouseenter auslösen und den Hover-Tooltip
      // erneut einblenden – direkt über dem schwebenden Zeit-Indikator. Pro Bewegung einmal
      // explizit wieder verstecken, statt sich auf ein einziges versteckeTooltip() beim
      // Drag-Start zu verlassen.
      versteckeTooltip();
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const laneEl = el ? el.closest('.lane-normal, .lane-fango') : null;
      zielLane = (laneEl && laneEl.id.startsWith('vergleich-raster-')) ? laneEl : null;
      if (!zielLane) { versteckeZeitIndikator(); return; }
      // ID-Muster: vergleich-raster-<seite>-<therapeut>-<normal|fango>. Statt des vorherigen
      // flächigen Lane-Highlights (seit 2026-10-27, neunter Durchgang entfernt) zeigt jetzt die
      // exakte, auf 5 Minuten gerundete Ziel-Uhrzeit als schwebender Indikator – genau wie beim
      // Verschieben in der normalen Tagesansicht.
      const teile = zielLane.id.split('-');
      const bewegSeite = teile[2];
      const bewegTherapeut = teile[3] === 'lukas' ? 'Lukas' : 'Andy';
      const bewegDatum = vergleichDatumFuerSeite(bewegSeite);
      if (!bewegDatum) { versteckeZeitIndikator(); return; }
      const oz = vergleichOeffnungszeit(bewegDatum);
      const rect = zielLane.getBoundingClientRect();
      let minutenAbsolut = zeitToMinuten(oz.start) + (ev.clientY - rect.top) / VERGLEICH_PX_PRO_MINUTE;
      minutenAbsolut = Math.max(zeitToMinuten(oz.start), Math.min(Math.round(minutenAbsolut / 5) * 5, zeitToMinuten(oz.ende) - termin.dauer_minuten));
      zeigeVergleichZeitIndikator(minutenAbsolut, bewegSeite, bewegTherapeut, bewegSeite !== seite ? bewegDatum : null);
    }

    async function aufLoslassen(ev) {
      document.removeEventListener('mousemove', aufBewegen);
      document.removeEventListener('mouseup', aufLoslassen);
      block.classList.remove('vergleich-dragging');
      vergleichVerschiebenAktiv = false;
      versteckeZeitIndikator();

      if (!hatSichBewegt) {
        vergleichTerminOeffnen(seite, termin.id);
        return;
      }

      // Nach einem echten Zieh-Vorgang kann der Browser direkt im Anschluss trotzdem noch ein
      // natives "click"-Event auslösen, dessen Ziel das Element unter der Maus beim Loslassen
      // ist. Bei einem reinen Vertikal-Zug innerhalb derselben Lane landet der Block jetzt selbst
      // darunter (siehe aufBewegen oben) und vergleichRasterKlick() ignoriert ihn ohnehin über
      // `e.target !== e.currentTarget` – bei einem Spalten-/Tageswechsel bewegt sich der Block
      // aber (genau wie in der Tagesansicht) nur vertikal, nicht horizontal mit, wodurch der
      // Klick weiterhin auf dem leeren Ziel-Raster landen kann und sonst fälschlich ein zweites
      // Mal das Anlegen-Modal öffnen würde (gemeldeter Bug, 2026-10-27, zehnter Durchgang: "wird
      // ein neuer Termin angelegt"). Sperrt vergleichRasterKlick() dafür kurzzeitig über ein
      // Modul-Flag statt über einen document-weiten Klick-Listener: ein `once:true`-Listener
      // bliebe dauerhaft hängen und würde den nächstbesten, völlig unbeteiligten Klick irgendwo
      // in der App schlucken, falls (wie z.B. im Playwright-Testharness beobachtet) nach einem
      // synthetischen Drag gar kein natives click-Event feuert. Das Flag setzt sich dagegen im
      // nächsten Tick garantiert selbst zurück, egal ob der Klick tatsächlich kommt oder nicht.
      vergleichDragGeradeAbgeschlossen = true;
      setTimeout(() => { vergleichDragGeradeAbgeschlossen = false; }, 0);

      if (!zielLane) { renderVergleich(); return; } // außerhalb jedes gültigen Rasters losgelassen -> Block zurück an seine echte Position
      // ID-Muster: vergleich-raster-<seite>-<therapeut>-<normal|fango>
      const teile = zielLane.id.split('-');
      const zielSeite = teile[2];
      const zielDatum = vergleichDatumFuerSeite(zielSeite);
      if (!zielDatum) { renderVergleich(); return; }
      const zielTherapeut = teile[3] === 'lukas' ? 'Lukas' : 'Andy';
      const zielDatumStr = isoDatum(zielDatum);

      const rect = zielLane.getBoundingClientRect();
      const oz = vergleichOeffnungszeit(zielDatum);
      let minutenAbsolut = zeitToMinuten(oz.start) + (ev.clientY - rect.top) / VERGLEICH_PX_PRO_MINUTE;
      minutenAbsolut = Math.max(zeitToMinuten(oz.start), Math.min(Math.round(minutenAbsolut / 5) * 5, zeitToMinuten(oz.ende) - termin.dauer_minuten));
      let neueStartzeit = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');

      // Keine echte Änderung (gleicher Tag, gleicher Therapeut, gleiche Uhrzeit) -> nichts tun.
      if (zielDatumStr === termin.datum && zielTherapeut === termin.therapeut && neueStartzeit === termin.startzeit.slice(0, 5)) {
        renderVergleich();
        return;
      }

      // Konflikt am Zieltag prüfen (rein Therapeut, innerhalb derselben Lane – Fango/Massage läuft
      // parallel und hat einen eigenen, unabhängigen Belegungs-Topf; Lukas/Andy sind unabhängige
      // Spalten, kein Raum-Konflikt mehr über Therapeuten hinweg) und ggf. auf die nächste freie
      // Zeit springen.
      const { data: zielTermine } = await db.from('termine').select('*').eq('datum', zielDatumStr);
      const eigeneFahrzeit = termin.ist_hausbesuch ? (termin.fahrzeit_minuten || 0) : 0;
      const terminEigeneSpalte = terminNutztEigeneSpalte(termin.behandlungstyp);
      const belegung = (zielTermine || []).filter(t => t.id !== termin.id && (
        t.therapeut === zielTherapeut && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte
      ));
      if (findeKonflikt(belegung, neueStartzeit, termin.dauer_minuten, eigeneFahrzeit)) {
        const frei = naechsteFreieZeit(belegung, termin.dauer_minuten, neueStartzeit, oz, eigeneFahrzeit);
        if (frei) neueStartzeit = frei;
      }

      const { error } = await db.from('termine').update({ datum: zielDatumStr, startzeit: neueStartzeit, therapeut: zielTherapeut }).eq('id', termin.id);
      if (error) { alert('Fehler beim Verschieben: ' + error.message); renderVergleich(); return; }
      let details = `${termin.patientenname}: ${termin.datum} ${termin.startzeit.slice(0, 5)} → ${zielDatumStr} ${neueStartzeit}`;
      if (zielTherapeut !== termin.therapeut) details += ` (${zielTherapeut})`;
      protokolliere(termin.id, 'verschoben', details, zielDatumStr);
      renderVergleich();
    }

    document.addEventListener('mousemove', aufBewegen);
    document.addEventListener('mouseup', aufLoslassen);
  }

  // Schwebender Zeit-Indikator für die Vergleichsansicht (neu, 2026-10-27, neunter Durchgang) –
  // Pendant zu zeigeZeitIndikator() der Tagesansicht, nur pro Seite (links/rechts) statt für ein
  // einziges gemeinsames Raster. Positioniert sich wie dort links von Lukas' Raster bzw. an der
  // jeweiligen Zeitachse für Andy. Zeigt beim Ziehen auf die ANDERE Tagesseite zusätzlich das
  // Zieldatum an, damit beim Wechsel zwischen links/rechts klar bleibt, welcher Tag gemeint ist.
  function zeigeVergleichZeitIndikator(minutenAbsolut, seite, zielTherapeut, andererTagDatum) {
    const indikator = document.getElementById('zeit-indikator');
    const oz = vergleichOeffnungszeit(vergleichDatumFuerSeite(seite));
    const topPx = (minutenAbsolut - zeitToMinuten(oz.start)) * VERGLEICH_PX_PRO_MINUTE;
    let ankerRect;
    if (zielTherapeut === 'Lukas') {
      ankerRect = document.getElementById(`vergleich-raster-${seite}-lukas`).getBoundingClientRect();
      indikator.style.right = (window.innerWidth - ankerRect.left + 6) + 'px';
    } else {
      ankerRect = document.getElementById(`vergleich-zeitachse-${seite}`).getBoundingClientRect();
      indikator.style.right = (window.innerWidth - ankerRect.right + 2) + 'px';
    }
    indikator.style.top = (ankerRect.top + topPx) + 'px';
    let text = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');
    if (andererTagDatum) text += ' · ' + andererTagDatum.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' });
    indikator.textContent = text;
    indikator.classList.add('sichtbar');
  }

  // ---- Drag-Resize der Termin-Dauer in der Vergleichsansicht (neu, 2026-10-27, neunter
  // Durchgang) – volle Parität zur Tagesansicht (starteResize/aktualisiereDauer), nur mit der
  // kleineren VERGLEICH_PX_PRO_MINUTE-Skalierung und einer frischen DB-Abfrage für den jeweiligen
  // Tag statt des globalen aktuelleTagesTermine-Caches, der nur für die Tagesansicht gilt. ----
  function vergleichStarteResize(event, termin, block, seite) {
    if (event.button !== 0) return;
    if (statusModusAktiv) { event.preventDefault(); event.stopPropagation(); toggleStatusAuswahl(termin, block); return; }
    event.preventDefault();
    event.stopPropagation(); // nicht gleichzeitig vergleichStarteDrag (Verschieben) auslösen
    const startMausY = event.clientY;
    const startHoehe = block.offsetHeight;
    let hatSichBewegt = false;
    versteckeTooltip();

    function aufBewegen(ev) {
      const deltaY = ev.clientY - startMausY;
      if (!hatSichBewegt && Math.abs(deltaY) < 4) return;
      if (!hatSichBewegt) { hatSichBewegt = true; resizeAktiv = true; block.classList.add('resizing'); baueResizeLineal(block, VERGLEICH_PX_PRO_MINUTE); }
      versteckeTooltip();
      let neueHoeheRoh = Math.max(20, startHoehe + deltaY);
      const maxHoehe = block.parentElement.clientHeight - parseFloat(block.style.top);
      neueHoeheRoh = Math.min(neueHoeheRoh, maxHoehe);
      const roheDauer = neueHoeheRoh / VERGLEICH_PX_PRO_MINUTE;
      const gerasteteDauer = Math.max(5, Math.round(roheDauer / 5) * 5);
      block.style.height = (gerasteteDauer * VERGLEICH_PX_PRO_MINUTE) + 'px';
      zeigeResizeDauerIndikator(block, gerasteteDauer, termin, VERGLEICH_PX_PRO_MINUTE);
    }

    function aufLoslassen() {
      document.removeEventListener('mousemove', aufBewegen);
      document.removeEventListener('mouseup', aufLoslassen);
      versteckeResizeLineal();
      resizeAktiv = false;

      if (!hatSichBewegt) {
        vergleichTerminOeffnen(seite, termin.id);
        return;
      }

      block.classList.remove('resizing');
      const neueHoeheFinal = parseFloat(block.style.height);
      let neueDauer = Math.max(5, Math.round((neueHoeheFinal / VERGLEICH_PX_PRO_MINUTE) / 5) * 5);
      if (neueDauer === termin.dauer_minuten) { renderVergleich(); return; } // keine echte Änderung
      vergleichAktualisiereDauer(termin, neueDauer);
    }

    document.addEventListener('mousemove', aufBewegen);
    document.addEventListener('mouseup', aufLoslassen);
  }

  async function vergleichAktualisiereDauer(termin, neueDauer) {
    const oz = vergleichOeffnungszeit(new Date(termin.datum + 'T00:00:00'));
    const { data: tagesTermine } = await db.from('termine').select('*').eq('datum', termin.datum);
    const eigeneFahrzeit = termin.ist_hausbesuch ? (termin.fahrzeit_minuten || 0) : 0;
    const terminEigeneSpalte = terminNutztEigeneSpalte(termin.behandlungstyp);
    const belegung = (tagesTermine || []).filter(t => t.id !== termin.id && (
      t.therapeut === termin.therapeut && terminNutztEigeneSpalte(t.behandlungstyp) === terminEigeneSpalte
    ));
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
    if (error) { alert('Fehler beim Ändern der Dauer: ' + error.message); renderVergleich(); return; }
    protokolliere(termin.id, 'bearbeitet', `${termin.patientenname}: Dauer ${termin.dauer_minuten} → ${neueDauer} Min`, termin.datum);
    renderVergleich();
  }

  function vergleichNeuerTermin(seite, therapeut) {
    const datum = vergleichDatumFuerSeite(seite);
    if (!datum) return;
    vergleichRueckkehrSeite = seite;
    vergleichModalDatum = new Date(datum);
    oeffneModal(therapeut);
  }

  function vergleichRasterKlick(e, seite, therapeut) {
    if (vergleichDragGeradeAbgeschlossen) return; // direkt nach einem Verschiebe-Drag (s.o.) – kein neuer Termin
    if (e.target !== e.currentTarget) return; // Klick ging auf einen Termin-Block, nicht auf freie Fläche
    const datum = vergleichDatumFuerSeite(seite);
    if (!datum) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const oz = vergleichOeffnungszeit(datum);
    let minutenAbsolut = zeitToMinuten(oz.start) + (e.clientY - rect.top) / VERGLEICH_PX_PRO_MINUTE;
    minutenAbsolut = Math.max(zeitToMinuten(oz.start), Math.min(Math.round(minutenAbsolut / 5) * 5, zeitToMinuten(oz.ende) - 5));
    const zeitStr = String(Math.floor(minutenAbsolut / 60)).padStart(2, '0') + ':' + String(minutenAbsolut % 60).padStart(2, '0');
    vergleichRueckkehrSeite = seite;
    vergleichModalDatum = new Date(datum);
    oeffneModal(therapeut);
    document.getElementById('modal-startzeit').value = zeitStr;
  }

  async function vergleichTerminOeffnen(seite, terminId) {
    const { data } = await db.from('termine').select('*').eq('id', terminId).single();
    if (!data) return;
    vergleichRueckkehrSeite = seite;
    vergleichModalDatum = new Date(data.datum + 'T00:00:00');
    oeffneBearbeitenModal(data);
  }

  function toggleVergleichKalenderPopover(event) {
    if (event) event.stopPropagation();
    const pop = document.getElementById('vergleich-kalender-popover');
    if (!pop) return;
    const wirdGeoeffnet = pop.classList.contains('hidden');
    pop.classList.toggle('hidden');
    if (wirdGeoeffnet) {
      vergleichKalenderDatum = new Date(vergleichsDatum || ausgewaehltesDatum);
      renderVergleichKalender();
    }
  }

  function vergleichKalenderMonatWechseln(delta) {
    vergleichKalenderDatum.setMonth(vergleichKalenderDatum.getMonth() + delta);
    renderVergleichKalender();
  }

  // Tageweise vor/zurück für den rechten Vergleichstag (Alternative zum Kalender-Popover) – ist
  // noch kein Vergleichstag gewählt, startet die Navigation ausgehend vom linken Tag.
  function vergleichTagWechseln(delta) {
    const basis = vergleichsDatum || ausgewaehltesDatum;
    const neu = new Date(basis);
    neu.setDate(neu.getDate() + delta);
    vergleichsDatum = naechsterWerktag(neu, delta >= 0 ? 1 : -1);
    renderVergleich();
  }

  function renderVergleichKalender() {
    const titel = document.getElementById('vergleich-kalender-titel');
    titel.textContent = vergleichKalenderDatum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    const tageContainer = document.getElementById('vergleich-kalender-tage');
    tageContainer.innerHTML = '';
    const jahr = vergleichKalenderDatum.getFullYear();
    const monat = vergleichKalenderDatum.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    const wochentagRoh = (ersterTag.getDay() + 6) % 7; // Mo=0..So=6
    const startOffset = wochentagRoh <= 4 ? wochentagRoh : 0;
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();
    for (let i = 0; i < startOffset; i++) {
      const vorherigerTag = new Date(jahr, monat, i - startOffset + 1);
      tageContainer.appendChild(erstelleVergleichTagButton(vorherigerTag, true));
    }
    for (let tag = 1; tag <= tageImMonat; tag++) {
      const datum = new Date(jahr, monat, tag);
      if (istWochenende(datum)) continue;
      tageContainer.appendChild(erstelleVergleichTagButton(datum, false));
    }
  }

  function erstelleVergleichTagButton(datum, andererMonat) {
    const btn = document.createElement('button');
    btn.textContent = datum.getDate();
    if (andererMonat) btn.classList.add('andere-monat');
    if (istGleicherTag(datum, new Date())) btn.classList.add('heute');
    if (vergleichsDatum && istGleicherTag(datum, vergleichsDatum)) btn.classList.add('ausgewaehlt');
    btn.onclick = () => {
      vergleichsDatum = new Date(datum);
      document.getElementById('vergleich-kalender-popover').classList.add('hidden');
      renderVergleich();
    };
    return btn;
  }

  document.addEventListener('click', (e) => {
    const pop = document.getElementById('vergleich-kalender-popover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (!pop.contains(e.target) && e.target.id !== 'vergleich-rechts-titel') pop.classList.add('hidden');
  });
