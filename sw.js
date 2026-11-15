'use strict';

const CACHE_NAME = 'enjazi-static-v2';
const STATIC_FILES = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('enjazi-static-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: prefer the latest app shell, then fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Cache only known static files. Never turn arbitrary failed requests into HTML.
  const path = url.pathname.split('/').pop();
  if (!['manifest.json', 'icon-192.png', 'icon-512.png'].includes(path)) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => caches.match(request))
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const taskId = event.notification.data && event.notification.data.taskId;
  const target = new URL(
    taskId ? `?taskId=${encodeURIComponent(taskId)}` : './',
    self.registration.scope
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const client = list.find(item => item.url.startsWith(self.registration.scope));
      if (client) {
        return client.focus().then(() => {
          if (taskId && 'navigate' in client) return client.navigate(target);
        });
      }
      return self.clients.openWindow(target);
    })
  );
});
