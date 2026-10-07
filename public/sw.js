// Apenas a tela pública de indisponibilidade fica no cache.
// As páginas do aluno e as respostas autenticadas sempre vêm da rede.
const CACHE = 'super-treino-offline-v17';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('super-treino-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || (url.pathname !== '/app' && !url.pathname.startsWith('/app/'))) return;
  event.respondWith(fetch(request).catch(async () => (await caches.match(OFFLINE)) || Response.error()));
});
