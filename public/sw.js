// Service Worker de Atendia — maneja notificaciones push y habilita instalación PWA del panel

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

// Passthrough mínimo: no cacheamos, pero el handler es necesario para que el browser
// considere la app instalable.
self.addEventListener('fetch', () => { });

self.addEventListener('push', (event) => {
    const data = event.data?.json() ?? {};
    const title = data.title ?? 'Atendia';
    const options = {
        body: data.body ?? 'Tienes una nueva notificación',
        icon: '/favicon.png',
        badge: '/favicon.png',
        data: { url: data.url ?? '/panel' },
        vibrate: [200, 100, 200],
        tag: data.tag ?? 'atendia',
        renotify: true,
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url ?? '/panel';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            // Si ya hay una pestaña abierta, enfocarla
            for (const client of clientList) {
                if ('focus' in client) {
                    client.navigate(url);
                    client.focus();
                    return;
                }
            }
            // Si no hay pestaña abierta, abrir una nueva
            return clients.openWindow(url);
        })
    );
});
