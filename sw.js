// Service Worker für den Terminkalender.
// Zweck: macht die Seite auf Handy/Desktop installierbar (Voraussetzung dafür).
// Der Kalender braucht für echte Daten ohnehin eine Internetverbindung (Supabase),
// deshalb hier bewusst KEIN komplexes Offline-Caching von Daten – nur die
// Oberfläche (index.html, manifest, Icons) wird zwischengespeichert, damit die
// App auch bei kurzzeitig schlechter Verbindung sofort startet.

// Bei jeder Änderung an der Dateiliste unten die Versionsnummer hochzählen (v2 -> v3 ...).
const CACHE_NAME = 'terminkalender-shell-v3';
// Achtung: Jede hier genannte Datei MUSS im Repository existieren, sonst schlägt die
// Installation des Service Workers fehl. Neue JS-Datei -> auch hier eintragen.
const SHELL_DATEIEN = [
  './',
  './index.html',
  './style.css',
  './js/grundlagen.js',
  './js/stammdaten.js',
  './js/verordnungen.js',
  './js/navigation.js',
  './js/tagesansicht.js',
  './js/drag-drop.js',
  './js/termin-modal.js',
  './js/wochen-vergleich.js',
  './js/suche.js',
  './js/weitere-ansichten.js',
  './js/start.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_DATEIEN))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(
        namen.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// Nur eigene (same-origin) Anfragen für die Oberfläche behandeln – alles
// andere (v.a. Supabase-API-Aufrufe, Google Fonts) unangetastet durchreichen,
// damit Login/Daten nie vom Service Worker beeinflusst werden.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') {
    return;
  }

  // cache: 'no-cache' = beim Server nachfragen, ob es eine neuere Version gibt (sonst liefert der
  // Browser nach einem Update bis zu ~10 Minuten lang alte Dateien aus seinem HTTP-Zwischenspeicher).
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then((antwort) => {
        const kopie = antwort.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, kopie));
        return antwort;
      })
      .catch(() => caches.match(event.request, { ignoreSearch: true }).then((treffer) => treffer || caches.match('./index.html')))
  );
});
