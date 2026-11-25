const CACHE_NAME = 'liga-bt-store-v29'; // Mude a versão sempre que atualizar!
const CORE_FILES = ['./', './manifest.json', './icon-192.png', './icon-512.png'];

// Instalação: guarda os ficheiros base (um falhar não derruba os outros)
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(CORE_FILES.map((f) => cache.add(f).catch(() => null)))
        )
    );
});

// Ativação: apaga caches antigos
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// Comando do botão de versão
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Network First, apenas GET e apenas da mesma origem
// (Firebase, Auth e CDNs ficam fora: não passam pelo cache do SW)
self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    e.respondWith(
        fetch(req)
            .then((response) => {
                if (response && response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, clone)).catch(() => {});
                }
                return response;
            })
            .catch(() =>
                caches.match(req).then((cached) => cached || caches.match('./') || Response.error())
            )
    );
});
