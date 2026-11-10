const CACHE_NAME = 'liga-bt-store-v6'; // Mude para v3, v4, etc., sempre que fizer uma grande atualização!

// Instalação: guarda os ficheiros base e força o novo service worker a assumir o controlo
self.addEventListener('install', (e) => {
    self.skipWaiting(); 
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['./']);
        })
    );
});

// Ativação: apaga os caches antigos do telemóvel (a magia da atualização!)
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
    return self.clients.claim(); // Força o controlo imediato sobre a página aberta
});

// Fetch: Estratégia "Network First" (Tenta a internet primeiro, se falhar usa o cache)
self.addEventListener('fetch', (e) => {
    e.respondWith(
        fetch(e.request)
            .then((response) => {
                // Se a internet funcionar, atualiza o cache invisivelmente com a versão mais recente
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                // Se o utilizador estiver offline, puxa a versão guardada no telemóvel
                return caches.match(e.request);
            })
    );
});
