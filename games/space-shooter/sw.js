const CACHE_NAME = 'pwa-game-space-shooter-v6';
const ASSETS = ['./', './index.html', './styles.css', './game.js', './manifest.webmanifest', '../shared/arcade.css', '../shared/fullscreen-shell.js', '../shared/retro.js', '../../icons/apple-touch-icon.png', '../../icons/icon-192.png', '../../icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('pwa-game-space-shooter-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
