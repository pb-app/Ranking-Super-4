const CACHE_NAME = 'liga-bt-store-v8'; // Mude para v5, v6, etc., sempre que atualizar!

// Instalação: guarda os ficheiros base e força o novo service worker a assumir o controlo
self.addEventListener('install', (e) => {
    self.skipWaiting(); 
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['./']);
        })
    );
});

// Ativação: apaga os caches antigos do telemóvel
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] A apagar cache antigo:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    return self.clients.claim();
});

// NOVO: Ouve o comando enviado pelo botão do rodapé para atualizar imediatamente
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Fetch: Estratégia "Network First"
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                return caches.match(e.request);
            })
    );
});
