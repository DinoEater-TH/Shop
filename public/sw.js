const APP_CACHE = 'dinoeater-app-v3'
const IMAGE_CACHE = 'dinoeater-images-v1'
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg']

function trim(cache, max) {
  cache.keys().then(keys => { if (keys.length > max) cache.delete(keys[0]).then(() => trim(cache, max)) })
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(APP_CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== APP_CACHE && key !== IMAGE_CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  const isDrive = url.hostname.indexOf('google.com') >= 0 && url.pathname.indexOf('thumbnail') >= 0

  if (isDrive) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          const refresh = fetch(event.request).then(response => {
            if (response) cache.put(event.request, response.clone()).then(() => trim(cache, 100))
            return response
          }).catch(() => null)
          return cached || refresh
        })
      )
    )
    return
  }

  if (url.origin !== self.location.origin) return

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        caches.open(APP_CACHE).then(cache => cache.put('./index.html', response.clone()))
        return response
      }).catch(() => caches.match('./index.html'))
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      const refresh = fetch(event.request).then(response => {
        if (response) caches.open(APP_CACHE).then(cache => cache.put(event.request, response.clone()))
        return response
      }).catch(() => null)
      return cached || refresh
    })
  )
})