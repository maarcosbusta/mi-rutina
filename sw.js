// Service worker de Mi Rutina: solo muestra el aviso de «Descanso terminado».
// No guarda nada en caché, así la app siempre se carga en su última versión.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));

// Llega un aviso del servidor: {"title":"...","body":"..."}
self.addEventListener('push',e=>{
  let d={};
  try{d=e.data?e.data.json():{}}catch(x){d={body:e.data?e.data.text():''}}
  const title=d.title||'Descanso terminado';
  e.waitUntil(self.registration.showNotification(title,{body:d.body||'',tag:'descanso',renotify:true,icon:'apple-touch-icon.png'}));
});

// Al tocar el aviso: se cierra y se abre la app (o se trae al frente si ya estaba abierta)
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{
    for(const w of ws)if('focus' in w)return w.focus();
    return self.clients.openWindow('./');
  }));
});
