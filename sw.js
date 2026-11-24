const CACHE = 'cfa-mocks-v2';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'css/fonts.css', 'css/app.css', 'css/exam.css',
  'js/icons.js', 'js/store.js', 'js/sync.js', 'js/exam.js', 'js/app.js', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/open-sans-latin-400-normal.woff2', 'fonts/open-sans-latin-400-italic.woff2', 'fonts/open-sans-latin-500-normal.woff2',
  'fonts/open-sans-latin-600-normal.woff2', 'fonts/open-sans-latin-600-italic.woff2', 'fonts/open-sans-latin-700-normal.woff2', 'fonts/open-sans-latin-700-italic.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// network first (so updates pushed to GitHub show up), cache as fallback when offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
