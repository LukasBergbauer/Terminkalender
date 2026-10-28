// ======================================================================
// js/navigation.js – Vorschau, Mini-Kalender/Ansichtswechsel, Login/Auth, Datums-Navigation
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  // ---- Vorschau: "Wie sieht ein Tag aus?" (Fokus Zeit + Heilmittel, Default = morgen) ----
  let vorschauDatum = null;

  function oeffneVorschauModal() {
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    vorschauDatum = naechsterWerktag(morgen, 1); // Wochenende übersprungen
    renderVorschauInhalt();
    document.getElementById('vorschau-modal-overlay').classList.remove('hidden');
  }

  function schliesseVorschauModal() {
    document.getElementById('vorschau-modal-overlay').classList.add('hidden');
  }

  function vorschauTagWechseln(delta) {
    vorschauDatum.setDate(vorschauDatum.getDate() + delta);
    vorschauDatum = naechsterWerktag(vorschauDatum, delta >= 0 ? 1 : -1);
    renderVorschauInhalt();
  }

  async function renderVorschauInhalt() {
    document.getElementById('vorschau-modal-titel').textContent = 'Vorschau: ' + formatierterTitel(vorschauDatum);
    const datumStr = isoDatum(vorschauDatum);
    const { data, error } = await db.from('termine').select('*').eq('datum', datumStr).order('startzeit', { ascending: true });
    const listeLukas = document.getElementById('vorschau-liste-lukas');
    const listeAndy = document.getElementById('vorschau-liste-andy');
    const sumLukas = document.getElementById('vorschau-heilmittel-lukas');
    const sumAndy = document.getElementById('vorschau-heilmittel-andy');
    if (error) {
      listeLukas.innerHTML = listeAndy.innerHTML = `<div class="leer-zustand">Fehler: ${error.message}</div>`;
      sumLukas.innerHTML = sumAndy.innerHTML = '';
      return;
    }
    const alle = (data || []).filter(t => t.status !== 'abgesagt');

    const renderSpalte = (termine, listeEl, sumEl) => {
      if (!termine.length) {
        listeEl.innerHTML = '<div class="leer-zustand">Keine Termine.</div>';
        sumEl.innerHTML = '';
        return;
      }
      listeEl.innerHTML = termine.map(t => `
        <div class="vorschau-liste-zeile" onclick="vorschauTerminOeffnen('${datumStr}', '${t.id}')">
          <span class="zeit">${t.startzeit.slice(0, 5)}</span>
          <div>
            <div>${kurzBehandlung(t.behandlungstyp)} &middot; <b>${t.patientenname}</b></div>
            <div class="meta">${t.ist_hausbesuch ? 'Hausbesuch' : 'Raum ' + t.raum}</div>
          </div>
        </div>
      `).join('');
      const zaehler = {};
      termine.forEach(t => { zaehler[t.behandlungstyp] = (zaehler[t.behandlungstyp] || 0) + 1; });
      const eintraege = Object.entries(zaehler).sort((a, b) => b[1] - a[1]);
      sumEl.innerHTML = eintraege.map(([typ, anzahl]) => `
        <div class="vorschau-heilmittel-zeile"><span>${typ}</span><b>${anzahl}&times;</b></div>
      `).join('');
    };
    renderSpalte(alle.filter(t => t.therapeut === 'Lukas'), listeLukas, sumLukas);
    renderSpalte(alle.filter(t => t.therapeut === 'Andy'), listeAndy, sumAndy);
  }

  async function vorschauTerminOeffnen(datumStr, terminId) {
    const { data } = await db.from('termine').select('*').eq('id', terminId).single();
    if (!data) return;
    schliesseVorschauModal();
    ausgewaehltesDatum = new Date(datumStr + 'T00:00:00');
    miniKalenderDatum = new Date(ausgewaehltesDatum);
    setzeAnsichtstyp('tag');
    setTimeout(() => oeffneBearbeitenModal(data), 60);
  }

  // ---- Mini-Kalender ----
  function miniKalenderMonatWechseln(delta) {
    miniKalenderDatum.setMonth(miniKalenderDatum.getMonth() + delta);
    renderMiniKalender();
  }

  function istGleicherTag(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderMiniKalender() {
    const titel = document.getElementById('mini-kalender-titel');
    titel.textContent = miniKalenderDatum.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    const tageContainer = document.getElementById('mini-kalender-tage');
    tageContainer.innerHTML = '';

    const jahr = miniKalenderDatum.getFullYear();
    const monat = miniKalenderDatum.getMonth();
    const ersterTag = new Date(jahr, monat, 1);
    // Position des 1. im Mo-Fr-Raster (Mo=0..Fr=4) – fällt der 1. aufs Wochenende, gibt es keine
    // Vormonats-Platzhalter (der nächste Werktag beginnt die erste Zeile neu bei Spalte 1).
    const wochentagRoh = (ersterTag.getDay() + 6) % 7; // Mo=0..So=6
    const startOffset = wochentagRoh <= 4 ? wochentagRoh : 0;
    const tageImMonat = new Date(jahr, monat + 1, 0).getDate();

    for (let i = 0; i < startOffset; i++) {
      const vorherigerTag = new Date(jahr, monat, i - startOffset + 1);
      tageContainer.appendChild(erstelleTagButton(vorherigerTag, true));
    }
    for (let tag = 1; tag <= tageImMonat; tag++) {
      const datum = new Date(jahr, monat, tag);
      if (istWochenende(datum)) continue; // Sa/So werden im Mini-Kalender gar nicht erst gerendert
      tageContainer.appendChild(erstelleTagButton(datum, false));
    }
  }

  function erstelleTagButton(datum, andererMonat) {
    const btn = document.createElement('button');
    btn.textContent = datum.getDate();
    if (andererMonat) btn.classList.add('andere-monat');
    if (istGleicherTag(datum, new Date())) btn.classList.add('heute');
    if (istGleicherTag(datum, ausgewaehltesDatum)) btn.classList.add('ausgewaehlt');
    btn.onclick = () => {
      ausgewaehltesDatum = new Date(datum);
      miniKalenderDatum = new Date(datum);
      aktualisiereAnsicht();
      wechsleAnsicht('kalender');
      const pop = document.getElementById('mini-kalender-popover');
      if (pop) pop.classList.add('hidden');
    };
    return btn;
  }

  // Mini-Kalender erscheint jetzt als Popover unterm Datum im Header (statt fest in den Einstellungen)
  function toggleMiniKalenderPopover(event) {
    if (event) event.stopPropagation();
    const pop = document.getElementById('mini-kalender-popover');
    if (!pop) return;
    const wirdGeoeffnet = pop.classList.contains('hidden');
    pop.classList.toggle('hidden');
    if (wirdGeoeffnet) {
      miniKalenderDatum = new Date(ausgewaehltesDatum);
      renderMiniKalender();
    }
  }
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('mini-kalender-popover');
    if (!pop || pop.classList.contains('hidden')) return;
    if (!pop.contains(e.target) && e.target.id !== 'aktuelles-datum') pop.classList.add('hidden');
  });

  const ANSICHTEN = ['kalender', 'einstellungen', 'patienten', 'verordnungen', 'hausbesuche', 'statistik'];

  function wechsleAnsicht(name) {
    ANSICHTEN.forEach(n => {
      document.getElementById('ansicht-' + n).classList.toggle('hidden', n !== name);
    });
    document.querySelectorAll('.rail-item').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.ansicht === name);
    });
    const sichtbareAnsicht = document.getElementById('ansicht-' + name);
    sichtbareAnsicht.style.animation = 'none';
    void sichtbareAnsicht.offsetWidth; // Reflow erzwingen, damit die Animation neu startet
    sichtbareAnsicht.style.animation = 'ansicht-einblenden 0.22s ease';

    if (name === 'patienten') { ladePatientenAnsicht(); ladeWarteliste(); }
    if (name === 'verordnungen') { renderVerordnungenListe(); }
    if (name === 'hausbesuche') { renderHausbesucheListe(); }
    if (name === 'statistik') { renderStatistik(); }
    if (name === 'einstellungen') { ladeProtokoll(); pruefeBackupErinnerung(); }
  }

  function aktualisiereAnsicht() {
    renderDatum();
    renderMiniKalender();
    if (ansichtstyp === 'woche') {
      renderWoche();
    } else if (ansichtstyp === 'vergleich') {
      renderVergleich();
    } else {
      renderZeitachse();
      ladeTermine();
    }
  }

  // Während ein Termin per Dauer-Resize gezogen wird, darf der Hover-Tooltip gar nicht erst
  // erscheinen – ein reines "danach wieder verstecken" ist nicht zuverlässig genug, weil manche
  // Browser beim Wachsen des Blocks unter dem (unbewegten) Mauszeiger ein eigenes mouseenter
  // auslösen, das nach dem letzten versteckeTooltip()-Aufruf feuern kann (siehe starteResize).
  let resizeAktiv = false;
  // Kurzzeitige Sperre direkt nach einem echten Verschiebe-Drag in der Vergleichsansicht (seit
  // 2026-10-27, zehnter Durchgang) – siehe vergleichStarteDrag/vergleichRasterKlick unten.
  let vergleichDragGeradeAbgeschlossen = false;
  // Analog zu resizeAktiv oben, aber für das Verschieben eines Termins in der Vergleichsansicht
  // (seit 2026-10-27, zehnter Durchgang, als der Block dort begann, der Maus sichtbar zu
  // folgen statt optisch stillzustehen): dasselbe "mouseenter feuert während des Ziehens
  // trotzdem noch" -Problem tritt jetzt auch hier auf, sobald der Block unter den Mauszeiger
  // wandert. Ein reines wiederholtes versteckeTooltip() bei jeder Mausbewegung reicht
  // nachweislich nicht (siehe Kommentar oben) – blockt zeigeTooltip() daher ebenso direkt an
  // der Quelle für die gesamte Dauer des Zugs.
  let vergleichVerschiebenAktiv = false;
  function zeigeTooltip(event, t) {
    if (resizeAktiv || vergleichVerschiebenAktiv) return;
    const tip = document.getElementById('termin-tooltip');
    const start = t.startzeit.slice(0, 5);
    const ende = addMinuten(start, t.dauer_minuten);
    const ortLabelTip = t.ist_hausbesuch ? `Hausbesuch${t.fahrzeit_minuten ? ' (Fahrzeit ' + t.fahrzeit_minuten + ' Min)' : ''}` : `Raum ${t.raum}`;
    const { serieIcon, statusIcon } = terminBlockIcons(t);
    const statusLabels = { erschienen: 'Erschienen', abgesagt: 'Abgesagt', nicht_erschienen: 'Nicht erschienen' };
    tip.innerHTML = `
      <div class="zeit">${start} &ndash; ${ende} Uhr</div>
      <div class="meta"><b>${(t.patientenname || '').replace(/</g, '&lt;')}</b></div>
      <div class="meta">${ortLabelTip} &middot; ${t.behandlungstyp}</div>
      ${t.serie_id ? `<div class="meta">${serieIcon} Teil einer Serie</div>` : ''}
      ${(t.status && t.status !== 'geplant') ? `<div class="meta">${statusIcon} Status: ${statusLabels[t.status] || t.status}</div>` : ''}
      ${t.notiz ? `<div class="notiz-box"><div class="notiz-label">Notiz</div>${t.notiz.replace(/</g, '&lt;')}</div>` : ''}
    `;
    const rect = event.currentTarget.getBoundingClientRect();
    const breite = 300;
    let left = rect.right + 10;
    if (left + breite > window.innerWidth - 10) left = rect.left - breite - 10;
    let top = Math.min(rect.top, window.innerHeight - 160);
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
    tip.classList.add('sichtbar');
  }

  function versteckeTooltip() {
    document.getElementById('termin-tooltip').classList.remove('sichtbar');
  }

  function renderZeitachse() {
    const oz = aktuelleOeffnungszeit();
    const startMin = zeitToMinuten(oz.start);
    const endeMin = zeitToMinuten(oz.ende);
    const hoehe = tagHoehePx();
    const achse = document.getElementById('zeitachse');
    document.getElementById('raster-lukas').style.height = hoehe + 'px';
    document.getElementById('raster-andy').style.height = hoehe + 'px';
    achse.style.height = hoehe + 'px';
    achse.innerHTML = '';
    const ersteVolleStunde = Math.ceil(startMin / 60);
    const letzteVolleStunde = Math.floor(endeMin / 60);
    for (let std = ersteVolleStunde; std <= letzteVolleStunde; std++) {
      const label = document.createElement('div');
      label.className = 'stunde-label';
      label.style.top = ((std * 60 - startMin) * PX_PRO_MINUTE) + 'px';
      label.textContent = String(std).padStart(2, '0') + ':00';
      achse.appendChild(label);
    }
  }

  function isoDatum(d) {
    const jahr = d.getFullYear();
    const monat = String(d.getMonth() + 1).padStart(2, '0');
    const tag = String(d.getDate()).padStart(2, '0');
    return `${jahr}-${monat}-${tag}`;
  }

  function formatierterTitel(d) {
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ---- Auth ----
  async function login() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    document.getElementById('login-error').textContent = '';
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      document.getElementById('login-error').textContent = 'Anmeldung fehlgeschlagen: ' + error.message;
      return;
    }
    aktuellerNutzerEmail = email;
    zeigeApp();
  }

  async function logout() {
    await db.auth.signOut();
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
  }

  async function pruefeSession() {
    const { data } = await db.auth.getSession();
    if (data.session) {
      aktuellerNutzerEmail = (data.session.user && data.session.user.email) || '';
      zeigeApp();
    }
  }

  function zeigeApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    wendeFilterAn();
    ladeOeffnungszeiten().then(aktualisiereAnsicht);
    ladeHeilmittel().then(aktualisiereAnsicht);
    ladePatienten();
    ladeVerordnungen();
    ladeWarteliste();
    aktualisiereAnsicht();
  }

  // ---- Datum / Navigation ----
  function montagDerWoche(d) {
    const kopie = new Date(d);
    const versatz = (kopie.getDay() + 6) % 7; // Montag = 0
    kopie.setDate(kopie.getDate() - versatz);
    return kopie;
  }

  function renderDatum() {
    if (ansichtstyp === 'woche') {
      const montag = montagDerWoche(ausgewaehltesDatum);
      const sonntag = new Date(montag);
      sonntag.setDate(sonntag.getDate() + 6);
      const fmt = d => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
      document.getElementById('aktuelles-datum').textContent = `${fmt(montag)} – ${fmt(sonntag)} ${sonntag.getFullYear()}`;
    } else {
      document.getElementById('aktuelles-datum').textContent = formatierterTitel(ausgewaehltesDatum);
    }
  }

  function aenderDatum(deltaTage) {
    const schritt = ansichtstyp === 'woche' ? deltaTage * 7 : deltaTage;
    ausgewaehltesDatum.setDate(ausgewaehltesDatum.getDate() + schritt);
    ausgewaehltesDatum = naechsterWerktag(ausgewaehltesDatum, deltaTage >= 0 ? 1 : -1);
    miniKalenderDatum = new Date(ausgewaehltesDatum);
    aktualisiereAnsicht();
  }

  function setzeAnsichtstyp(typ) {
    ansichtstyp = typ;
    if (typ === 'vergleich' && !vergleichsDatum) {
      // Vorbelegung: Tag danach (Wochenende übersprungen), damit die Vergleichsansicht beim
      // ersten Öffnen nicht leer ist
      const danach = new Date(ausgewaehltesDatum);
      danach.setDate(danach.getDate() + 1);
      vergleichsDatum = naechsterWerktag(danach, 1);
    }
    document.querySelectorAll('#woche-umschalter .filter-btn').forEach(btn => {
      btn.classList.toggle('aktiv', btn.dataset.ansichtstyp === typ);
    });
    document.getElementById('tag-ansicht').classList.toggle('hidden', typ !== 'tag');
    document.getElementById('woche-grid').classList.toggle('hidden', typ !== 'woche');
    document.getElementById('vergleich-grid').classList.toggle('hidden', typ !== 'vergleich');
    document.getElementById('app').classList.toggle('vergleich-breit', typ === 'vergleich');
    aktualisiereAnsicht();
  }

  function gehZuHeute() {
    // Fällt der heutige Tag auf ein Wochenende, zum nächsten Werktag (Montag) springen –
    // Wochenenden sind in der App nirgends mehr auswählbar.
    ausgewaehltesDatum = naechsterWerktag(new Date(), 1);
    miniKalenderDatum = new Date(ausgewaehltesDatum);
    aktualisiereAnsicht();
  }
