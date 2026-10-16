const CACHE='paper-party-8223b0f97d94';
const FILES=["./","./index.html","./style.css?v=8223b0f97d94","./career.js?v=8223b0f97d94","./app.js?v=8223b0f97d94","./online-core.js?v=8223b0f97d94","./online.js?v=8223b0f97d94","./peerjs.min.js","./bank.js?v=8223b0f97d94","./icon.svg","./manifest.webmanifest","./happy.ttf"];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('paper-party-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;event.respondWith(fetch(event.request,{cache:'no-cache'}).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)))}return response}).catch(async()=>await caches.match(event.request)||(event.request.mode==='navigate'?await caches.match('./index.html'):Response.error())))});



