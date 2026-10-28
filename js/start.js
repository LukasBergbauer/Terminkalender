// ======================================================================
// js/start.js – Start: Sitzung prüfen (muss als Letztes laufen) und Service Worker registrieren
// Teil des Terminkalenders; wird von index.html als normales Skript geladen
// (Reihenfolge siehe index.html und PROJEKT.md). Alle Funktionen sind global.
// ======================================================================

  pruefeSession();

  // ---- PWA: Installierbarkeit (Service Worker registrieren) ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        // Kein Fehler für den Nutzer sichtbar machen – App funktioniert auch ohne.
      });
    });
  }
