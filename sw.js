self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
            const visibleClient = clients.find(client => 'focus' in client);
            if (visibleClient) return visibleClient.focus();
            return self.clients.openWindow('./');
        })
    );
});
