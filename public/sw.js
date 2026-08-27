// Service Worker: 缓存静态资源，支持离线打开
var CACHE_NAME = 'chatroom-pwa-v3';
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js?v=20260826b',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k) { return k !== CACHE_NAME; }).map(function(k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);
  // WebSocket 和 /ws 接口不拦截
  if (event.request.method !== 'GET') return;
  if (url.pathname === '/ws') return;
  // 导航请求：网络优先，失败回退缓存
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(function() {
        return caches.match('/index.html');
      })
    );
    return;
  }
  // 静态资源：缓存优先，未命中则走网络并缓存
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      if (cached) return cached;
      return fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, clone); });
        }
        return response;
      });
    })
  );
});
