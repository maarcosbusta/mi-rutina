/* Mi Rutina: cuentas por invitación, rutinas, registro de sesiones y panel del entrenador. */
const PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const FEEL=['Casi sin esfuerzo','Fácil','Moderado','Duro','Esfuerzo máximo'];
const FSHORT=['Sin esfuerzo','Fácil','Moderado','Duro','Máximo'];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>'e'+Math.random().toString(36).slice(2,9);
const fdate=iso=>{try{return new Date(iso).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}catch(e){return ''}};
const n$=v=>/^\d+([.,]\d+)?$/.test(String(v).trim())?String(v).trim()+' kg':v;
const CFG=window.APP_CONFIG||{};
const configured=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!CFG.SUPABASE_URL.includes('PEGA_AQUI'));
const FROM_LINK=/type=(invite|recovery)/.test(location.hash);
let sb=null,me=null;
let S={state:'loading',tab:'rutina',w:0,d:0,err:'',info:'',busy:false,forgot:false};
let msgs=[],comments={},efforts={},feed=[],seen={},routine=null,sessions=[],draft={},clients=[],assigned=new Set(),tpl=null,lib=[],selClient=null,cSessions=[],edit=null,finish=null;
const loadJ=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch(e){return f}};
const saveJ=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const label=c=>(c&&(c.name||c.email))||'Cliente';
const soft=()=>{const a=document.activeElement;if(a&&a.matches&&a.matches('input,textarea'))return;if(typeof pdg!=='undefined'&&pdg&&pdg.on)return;render()};
const isCoach=()=>me&&me.role==='admin';
/* ---------- tema claro / oscuro ---------- */
// 'light', 'dark' o 'auto' (como el móvil). Se guarda en el navegador y en la cuenta (Supabase) para verse igual en todos los dispositivos
const applyTheme=t=>{const r=document.documentElement;if(t==='light'||t==='dark')r.dataset.theme=t;else r.removeAttribute('data-theme')};
const curTheme=()=>{try{return localStorage.getItem('tema')||'auto'}catch(e){return 'auto'}};
function setTheme(t,sync){applyTheme(t);try{localStorage.setItem('tema',t)}catch(e){}if(sync&&sb&&me)sb.auth.updateUser({data:{theme:t}}).catch(()=>{})}
applyTheme(curTheme());

/* ---------- arranque y sesión ---------- */
async function boot(){
  render();
  if(!configured){S.state='noconfig';render();return}
  sb=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange(ev=>{if(ev==='PASSWORD_RECOVERY'){S.state='setpw';render()}});
  let data;try{({data}=await sb.auth.getSession())}catch(e){S.state='offline';render();return}
  if(FROM_LINK&&data.session){try{const p=await sb.from('profiles').select('name').eq('id',data.session.user.id).maybeSingle();S.linkName=p.data&&p.data.name}catch(e){}}
  if(FROM_LINK){S.state=data.session?'setpw':'login';render();return}
  if(data.session)await enter();else{S.state='login';render()}
}
const netErr=e=>!!e&&(!navigator.onLine||/fetch|network|load failed|timeout|offline/i.test(String(e.message||e)));
async function enter(){
  let user;try{({data:{user}}=await sb.auth.getUser())}catch(e){S.state='offline';render();return}
  if(!user){S.state='login';render();return}
  const ut=user.user_metadata&&user.user_metadata.theme;if(ut)setTheme(ut);
  const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(netErr(error)){S.state='offline';render();return}
  if(error||!data){S.state='login';S.err='No se pudo cargar tu perfil. Avisa a tu entrenador.';render();return}
  me=data;draft=loadJ('rutina-draft-'+me.id,{});S.err='';S.prevOn=false;S.prev=null;selClient=null;edit=null;finish=null;S.w=0;S.d=0;S.auto=true;S.tab=isCoach()?'clientes':'rutina';
  S.welcome=!isCoach()&&!(()=>{try{return localStorage.getItem('welcome-'+me.id)}catch(e){return 1}})();
  if(isCoach()){S.state='coach';render();await loadCoach()}else{S.state='client';render();await loadClient()}
}
async function loadMsgs(){const {data,error}=await sb.from('messages').select('*').order('created_at',{ascending:true}).limit(400);if(error)return;
  // Si ya lo marcamos leído aquí y la recarga llegó antes que mark_read, no lo volvemos a dar por nuevo
  const rd={};msgs.forEach(m=>{if(m.read_at)rd[m.id]=m.read_at});msgs=(data||[]).map(m=>m.read_at||!rd[m.id]?m:{...m,read_at:rd[m.id]})}
// Sesiones revisadas por el entrenador ("Ya lo vi"): {id: fecha}. Se guardan en Supabase (tabla session_seen) para que no vuelvan a salir en otro dispositivo ni si iOS borra la memoria del navegador; el navegador queda de respaldo.
async function loadSeen(){
  seen={};try{const v=JSON.parse(localStorage.getItem('seen-'+me.id)||'{}');if(Array.isArray(v))v.forEach(id=>{seen[id]=new Date().toISOString()});else seen=v||{}}catch(e){}
  const {data,error}=await sb.from('session_seen').select('session_id,seen_at');
  if(!error){(data||[]).forEach(x=>{if(!seen[x.session_id]||new Date(seen[x.session_id])<new Date(x.seen_at))seen[x.session_id]=x.seen_at});
    // Sube a Supabase lo que solo estaba en este navegador
    const up=Object.keys(seen).filter(id=>!(data||[]).some(x=>x.session_id===id)&&feed.some(s=>s.id===id)).map(id=>({session_id:id,seen_at:seen[id]}));if(up.length)sb.from('session_seen').upsert(up).then(()=>{})}
}
function markSeen(sid){seen[sid]=new Date().toISOString();try{localStorage.setItem('seen-'+me.id,JSON.stringify(seen))}catch(e){}sb.from('session_seen').upsert({session_id:sid,seen_at:seen[sid]}).then(()=>{})}

async function loadComments(ids){
  ids=[...new Set(ids)].filter(Boolean);if(!ids.length)return;
  const {data}=await sb.from('session_comments').select('*').in('session_id',ids).order('created_at',{ascending:true});
  ids.forEach(id=>{comments[id]=[]});(data||[]).forEach(c=>comments[c.session_id].push(c));
}
async function loadEfforts(ids){
  if(!isCoach())return;ids=[...new Set(ids)].filter(Boolean);if(!ids.length)return;
  const {data}=await sb.from('session_effort').select('session_id,effort').in('session_id',ids);
  (data||[]).forEach(e=>{efforts[e.session_id]=e.effort});
}
async function loadClient(){
  const [r,s]=await Promise.all([
    sb.from('routines').select('title,data').eq('client_id',me.id).maybeSingle(),
    sb.from('sessions').select('*').eq('client_id',me.id).order('performed_at',{ascending:false}).limit(40)]);
  if(netErr(r.error)||netErr(s.error)){S.state='offline';render();return}
  routine=r.data?{title:r.data.title,weeks:r.data.data.weeks}:null;
  sessions=(s.data||[]).map(x=>({...x,date:x.performed_at}));
  await loadComments(sessions.map(x=>x.id));
  await loadMsgs();
  if(S.auto&&routine){S.auto=false;goNext()}
  soft();
}
async function loadCoach(){
  const [c,r,t]=await Promise.all([
    sb.from('profiles').select('id,email,name,role,avatar_url').eq('role','client').order('email'),
    sb.from('routines').select('client_id,updated_at'),
    sb.from('templates').select('id,data')]);
  if(netErr(c.error)||netErr(r.error)){S.state='offline';render();return}
  clients=c.data||[];assigned=new Set((r.data||[]).map(x=>x.client_id));rupd=Object.fromEntries((r.data||[]).map(x=>[x.client_id,x.updated_at]));
  const base=(t.data||[]).find(x=>x.id==='base'),lb=(t.data||[]).find(x=>x.id==='lib');
  tpl=base?base.data:null;lib=lb?(lb.data.items||[]):[];
  xlib={gens:lb&&lb.data.gens||[],mats:lb&&lb.data.mats||[],have:lb&&lb.data.have||null};
  const f=await sb.from('sessions').select('id,client_id,dname,wname,performed_at,feeling,notes,items').order('performed_at',{ascending:false}).limit(40);
  feed=(f.data||[]).map(x=>({...x,date:x.performed_at}));
  await loadSeen();
  await loadComments(feed.map(x=>x.id));
  await loadEfforts(feed.map(x=>x.id));
  await loadMsgs();
  soft();
}
async function loadClientSessions(id){
  const {data}=await sb.from('sessions').select('*').eq('client_id',id).order('performed_at',{ascending:false}).limit(30);
  cSessions=(data||[]).map(x=>({...x,date:x.performed_at}));await loadComments(cSessions.map(x=>x.id));await loadEfforts(cSessions.map(x=>x.id));soft();
}

/* ---------- piezas comunes ---------- */
const head=(t,sub)=>`<header>${t}<div class="sub">${sub||''}</div></header>`;
const TRAINER='Marcos Bustamante De La Escalera';
const MARK='<span class="mark" aria-hidden="true">MB</span>';
const initial=c=>String((c&&(c.name||c.email))||'?').trim()[0].toUpperCase();
const topbar=()=>me?`<div class="appbar"><div class="brand">${MARK}<span class="bt2">Mi rutina<small>Entrenador: ${TRAINER}</small></span></div><div class="menuw"><button class="gear" data-act="opts" aria-label="Opciones" aria-expanded="${!!S.opts}" aria-haspopup="dialog">${GEAR}</button><button class="av" data-act="menu" aria-label="Cuenta" aria-expanded="${!!S.menu}" aria-haspopup="menu"${me.avatar_url?` style="background-image:url('${esc(me.avatar_url)}')"`:''}>${me.avatar_url?'':esc(initial(me))}</button><input type="file" id="avf" accept="image/*" hidden>${S.menu?`<div class="pop" role="menu"><small>${esc(me.email)}</small><button role="menuitem" data-act="photo">${me.avatar_url?'Cambiar foto':'Añadir foto de perfil'}</button>${me.avatar_url?'<button role="menuitem" data-act="rmphoto">Quitar foto</button>':''}<button role="menuitem" data-act="chpw">Cambiar contraseña</button><button role="menuitem" data-act="logout">Salir</button></div>`:''}${S.opts?optsHTML():''}</div></div>`:'';
// Panel «Opciones» del engranaje (de momento, solo la apariencia)
const GEAR='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 4.3c.4-1.8 3-1.8 3.4 0a1.7 1.7 0 0 0 2.6 1.1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.5c1.8.5 1.8 3 0 3.5a1.7 1.7 0 0 0-1 2.5c.9 1.6-.9 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1.1c-.4 1.8-3 1.8-3.4 0a1.7 1.7 0 0 0-2.6-1.1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.5c-1.8-.5-1.8-3 0-3.5a1.7 1.7 0 0 0 1-2.5c-.9-1.6.9-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1.1z"/><circle cx="12" cy="12" r="3"/></svg>';
const optsHTML=()=>{const t=curTheme();return `<div class="pop opts" role="dialog" aria-label="Opciones"><b class="opth">Opciones</b><small>Apariencia</small>${[['light','Claro'],['dark','Oscuro'],['auto','Como el móvil']].map(([v,l])=>`<button data-act="theme" data-t="${v}" aria-pressed="${t===v}">${l}${t===v?'<span aria-hidden="true">✓</span>':''}</button>`).join('')}</div>`};
function facts(it){
  const f=[];
  if(it.cat==='Cardio'){if(it.series)f.push(['Duración',it.series+' min','big']);if(it.reps)f.push(['Intensidad',it.reps]);}
  else{if(it.series)f.push(['Series',it.series,'big']);if(it.reps)f.push(['Reps',it.reps,'big']);if(it.kg)f.push(['Carga',n$(it.kg)]);}
  if(it.rest)f.push(['Descanso',it.rest]);
  return f;
}
const bname=b=>String(b||'').replace(/^.*bloque\s*:\s*/i,'').trim();
const factHTML=f=>f.map(([l,v,c])=>`<div class="fact ${c||''}"><small>${l}</small>${esc(v)}</div>`).join('');
const isFile=v=>/\.(mp4|webm|mov)(\?|#|$)/i.test(String(v||'').trim());
const clipHTML=it=>`<video class="clip" src="${esc(it.video)}" muted loop playsinline controls preload="none" aria-label="Vídeo de ${esc(it.name)}"></video>`;
const tipsHTML=it=>{const ts=String(it.tips||'').split(';').map(x=>x.trim()).filter(Boolean);return ts.length?`<ol class="tips">${ts.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:''};
// Nota del fisio (lo que ve el cliente): solo la primera clave, corta, en la caja con el punto amarillo de articulación.
// El resto de claves, si las hay, quedan plegadas: no todos quieren todos los detalles.
const notaHTML=it=>{const ts=String(it.tips||'').split(';').map(x=>x.trim()).filter(Boolean);if(!ts.length)return '';
  return `<div class="nota"><span class="nbar" aria-hidden="true"><i></i></span><div class="nc"><p>${esc(ts[0])}</p>${ts.length>1?`<details class="nmas"><summary>Más claves (${ts.length-1})</summary><ul>${ts.slice(1).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}</div></div>`};
const vidHTML=it=>(isFile(it.video)?clipHTML(it):it.video?`<a class="vid" href="${esc(it.video)}" target="_blank" rel="noopener">${PLAY}Ver vídeo</a>`:'<span class="novid">Sin vídeo</span>')+notaHTML(it);
// Día ya hecho: el cliente guardó una sesión de esa semana y ese día
const isDone=(w,d)=>!isCoach()&&sessions.some(s=>+s.week===w&&+s.day===d);
// Primer día sin hacer de una semana (o -1 si están todos hechos)
const firstFree=w=>routine.weeks[w].days.findIndex((_,d)=>!isDone(w,d));
// Lleva al cliente al primer día pendiente de toda la rutina
function goNext(){for(let w=0;w<routine.weeks.length;w++){const d=firstFree(w);if(d>=0){S.w=w;S.d=d;return}}}
function nav(m,withAdd){
  if(!withAdd){
    const ds=m.weeks[S.w].days;
    return `<nav>${m.weeks.length>1?`<div class="dseg wk" style="--n:${m.weeks.length}">${m.weeks.map((w,i)=>`<button data-w="${i}" aria-pressed="${i===S.w}">${esc(w.name.replace(/^Semana/i,'Semana'))}</button>`).join('')}</div>`:''}<div class="dseg" style="--n:${ds.length}">${ds.map((d,i)=>{const h=isDone(S.w,i);return `<button data-d="${i}" aria-pressed="${i===S.d}"${h?' class="hecho" disabled aria-label="'+esc(d.name)+', hecho"':''}>${esc(d.name)}${h?' ✓':''}</button>`}).join('')}</div></nav>`;
  }
  return `<nav><div class="row">${m.weeks.map((w,i)=>`<button class="chip" data-w="${i}" aria-pressed="${i===S.w}">${esc(w.name.replace(/^Semana/i,'Sem'))}</button>`).join('')}${withAdd?'<button class="chip add" data-act="addwk">+ Semana</button>':''}</div>
  <div class="row">${m.weeks[S.w].days.map((d,i)=>`<button class="chip day" data-d="${i}" aria-pressed="${i===S.d}">${esc(d.name)}</button>`).join('')}${withAdd?'<button class="chip add" data-act="addday">+ Día</button>':''}</div></nav>`;
}
function normNav(m){
  if(!m.weeks.length)m.weeks.push({name:'Semana 1',days:[{name:'Día 1',items:[]}]});
  if(!m.weeks[S.w])S.w=0;
  if(!m.weeks[S.w].days.length)m.weeks[S.w].days.push({name:'Día 1',items:[]});
  if(!m.weeks[S.w].days[S.d])S.d=0;
}

/* ---------- acceso ---------- */
function offlineView(){return `<div class="hero">${MARK}</div>`+head('<h1>Sin conexión</h1>','No consigo conectar con el servidor.')+`<main class="panel"><p class="hint" style="margin:0">Revisa tu wifi o tus datos móviles y vuelve a intentarlo. No se ha perdido nada de lo que habías anotado.</p><button class="btn big" data-act="retry">Reintentar</button></main>`}
function welcomeHTML(){const n=me.name?String(me.name).split(' ')[0]:'';
  return `<div class="mo" role="dialog" aria-modal="true"><div class="mc"><h2>¡Bienvenido${n?', '+esc(n):''}!</h2><small class="sub">Tu entrenador: ${esc(TRAINER)}</small>${me.name?'':'<label class="wn">¿Cómo te llamas?<input id="wname" autocomplete="name" maxlength="80" placeholder="Nombre y apellidos"></label>'}<ol class="wl"><li><b>Elige tu día</b> y ve bloque a bloque.</li><li><b>Apunta kg y repeticiones</b> y marca ✓ cada serie. El ⏱ cuenta tu descanso.</li><li><b>Al acabar</b>, pulsa «Terminar sesión» y puntúa el esfuerzo del 1 al 10.</li><li><b>¿Dudas o molestias?</b> Escríbeme con 💬 en un ejercicio o en la pestaña Chat.</li></ol><button class="btn big" data-act="welcomeok">Empezar</button></div></div>`}
function loginView(){
  if(S.forgot)return head('<h1>Mi rutina</h1>','')+`<form class="auth" id="fForgot"><p class="hint">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p><label>Correo<input type="email" id="em" autocomplete="email" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}${S.info?`<div class="ok" role="status">${esc(S.info)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Enviando…':'Enviar enlace'}</button><button type="button" class="linkb" data-act="backlogin">Volver</button></form>`;
  return `<div class="bhero"><div class="bl">${MARK}<span class="bn2"><b>Marcos Bustamante</b><small>Fisio deportivo · Entrenamiento</small></span></div><h1>Entrena sano.<br><em>Rinde más.</em></h1></div><p class="hint" style="margin:18px 0 0">Entra con tu cuenta</p><form class="auth" id="fLogin"><label>Correo<input type="email" id="em" autocomplete="email" required></label><label>Contraseña<input type="password" id="pw" autocomplete="current-password" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Entrando…':'Entrar'}</button><button type="button" class="linkb" data-act="forgot">He olvidado mi contraseña</button><p class="hint">¿Aún no tienes cuenta? Tu entrenador te enviará una invitación por correo.</p></form>`;
}
function setpwView(){
  return head(S.chpw?'<h1>Cambiar contraseña</h1>':'<h1>Crea tu contraseña</h1>',S.chpw?'':'Último paso para entrar')+`<form class="auth" id="fSetpw">${!S.chpw&&!S.linkName?`<label>Tu nombre y apellidos<input id="nm" autocomplete="name" maxlength="80" value="${esc(S.nm||'')}" required></label>`:''}<label>Contraseña nueva<input type="password" id="pw" autocomplete="new-password" minlength="8" required aria-describedby="pwreq"></label><div class="pwbox"><p class="hint" style="margin:0 0 6px">Tu contraseña debe tener:</p><ul class="pwreq" id="pwreq">${pwReqHTML('')}</ul><p class="hint" style="margin:6px 0 0">Tampoco vale una contraseña que haya salido en filtraciones de internet: lo comprobamos sin enviarla a nadie.</p></div>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?(S.busyTxt||'Guardando…'):(S.chpw?'Guardar contraseña':'Guardar y entrar')}</button>${S.chpw?'<button type="button" class="linkb" data-act="cancelpw">Cancelar</button>':''}</form>`;
}
// Requisitos de contraseña. Coinciden con los que se pueden exigir en Supabase (Authentication > Passwords).
const PWR=[[/.{8,}/,'8 caracteres o más','8 caracteres como mínimo'],[/[A-Z]/,'Una mayúscula (A-Z)','una mayúscula'],[/[a-z]/,'Una minúscula (a-z)','una minúscula'],[/[0-9]/,'Un número (0-9)','un número'],[/[!@#$%^&*()_+\-=\[\]{};'\\:"|<>?,.\/`~]/,'Un símbolo, como ! ? * # @ . -','un símbolo']];
const pwReqHTML=pw=>PWR.map(([re,t])=>`<li class="${re.test(pw)?'okr':''}">${esc(t)}</li>`).join('');
// Comprueba en Have I Been Pwned si la contraseña ha salido en filtraciones (k-anonimato: solo se envían 5 caracteres del hash SHA-1).
async function pwned(pw){
  try{
    const h=[...new Uint8Array(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(pw)))].map(b=>b.toString(16).padStart(2,'0')).join('').toUpperCase();
    const r=await fetch('https://api.pwnedpasswords.com/range/'+h.slice(0,5),{headers:{'Add-Padding':'true'}});
    if(!r.ok)return false;
    return (await r.text()).split('\n').some(l=>{const [suf,n]=l.trim().split(':');return suf===h.slice(5)&&+n>0});
  }catch(e){return false} // sin conexión con el servicio: no bloquea, Supabase sigue validando el resto
}
const noconfigView=()=>head('<h1>Falta configurar</h1>','')+`<div class="hero"><p>Abre el archivo <b>config.js</b> y pega la URL y la clave de tu proyecto de Supabase. Los pasos están en GUIA.md.</p></div>`;

/* ---------- cliente ---------- */
const dkey=()=>S.w+'|'+S.d;
S.ro={};
const CHEV='<svg class="chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const isCardio=it=>it.cat==='Cardio';
// Bloques seguidos con el mismo nombre. Superserie: lo elige el entrenador (it.ss); si no, 2+ ejercicios.
function groupsOf(items){const gs=[];items.forEach((it,i)=>{const g=gs[gs.length-1];if(it.block&&g&&g.block===it.block)g.items.push(it);else gs.push({block:it.block||'',start:i,items:[it]})});return gs}
const isSS=g=>!!g.block&&(g.items[0].ss!==undefined?!!g.items[0].ss:g.items.length>1);
// En una superserie, series y descanso son del bloque: se copian del primer ejercicio.
function syncSS(g){const f=g.items[0];g.items.forEach(it=>{it.ss=true;it.series=f.series;it.rest=f.rest})}
const dget=it=>{const k=dkey();draft[k]=draft[k]||{};const n=isCardio(it)?1:(parseInt(it.series)||1),a=draft[k][it.id]=draft[k][it.id]||[];while(a.length<n)a.push({kg:'',reps:'',done:false});return a};
function lastSets(it){
  const nm=String(it.name||'').trim().toLowerCase();
  for(const s of sessions){const x=(s.items||[]).find(y=>y.id===it.id)||(s.items||[]).find(y=>String(y.name||'').trim().toLowerCase()===nm);if(x){const ss=x.sets||[];if(ss.some(q=>q.done&&(q.kg||q.reps)))return ss}}
  return null;
}
function lastFor(it){const ss=lastSets(it);return ss?ss.filter(x=>x.done&&(x.kg||x.reps)).map(x=>(x.kg||'–')+'×'+(x.reps||'–')).join(' · '):''}
const restSecs=r=>{r=String(r||'').toLowerCase().trim();if(!r||/continu/.test(r))return 0;let m;
  if(m=r.match(/(\d+)\s*(?:'|min|m\b)\s*(\d+)?/))return(+m[1])*60+(+m[2]||0);
  if(m=r.match(/(\d+)/)){const n=+m[1];return n<10?n*60:n}return 0};
let restTimer=null,restIv=null;
const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
function beep(){try{navigator.vibrate&&navigator.vibrate([250,120,250]);const c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=880;g.gain.value=.15;o.start();o.stop(c.currentTime+.35)}catch(e){}}
function startRest(sec){
  if(!sec)return;clearInterval(restIv);restTimer={end:Date.now()+sec*1000,dur:sec*1000};render();
  restIv=setInterval(()=>{if(!restTimer){clearInterval(restIv);return}const left=Math.ceil((restTimer.end-Date.now())/1000),el=document.getElementById('restt'),bar=document.getElementById('restp');
    if(left<=0){stopRest(true);return}if(el)el.textContent=fmtT(left);if(bar)bar.style.width=restPct()+'%'},250);
}
function stopRest(ring){clearInterval(restIv);restTimer=null;if(ring)beep();render()}
// Lo que queda de descanso, en %, para la línea amarilla que se acorta
const restPct=()=>restTimer?Math.max(0,Math.min(100,(restTimer.end-Date.now())/restTimer.dur*100)):0;
// Siguiente serie por hacer del día (en superserie, por rondas), para enseñarla durante el descanso
function nextSet(){const w=routine&&routine.weeks[S.w],day=w&&w.days[S.d];if(!day)return null;
  for(const g of groupsOf(day.items)){
    if(isSS(g)){const n=Math.max(...g.items.map(it=>dget(it).length));for(let i=0;i<n;i++)for(const it of g.items){const s=dget(it)[i];if(s&&!s.done)return{it,i,n:dget(it).length}}}
    else for(const it of g.items){const ss=dget(it),i=ss.findIndex(s=>!s.done);if(i>=0)return{it,i,n:ss.length}}}
  return null}
// Descanso «todo en negro»: cuenta atrás, línea amarilla que se acorta y debajo la próxima serie con lo que hizo la última vez
function restBar(){if(!restTimer)return '';const left=Math.max(0,Math.ceil((restTimer.end-Date.now())/1000));
  const nx=nextSet();let next='';
  if(nx){const it=nx.it,c=isCardio(it),l=(lastSets(it)||[])[nx.i],kr=(kg,r)=>[kg&&n$(kg),r].filter(Boolean).join(' × ');
    const plan=c?'':kr(it.kg,it.reps),last=l&&l.done&&(l.kg||l.reps)?kr(l.kg,l.reps):'';
    next=`<div class="rnext"><span>Ahora: <strong>${esc(it.name)}</strong>${c?'':` · serie ${nx.i+1} de ${nx.n}`}</span>${plan||last?`<span class="rd"><span>${esc(plan)}</span>${last?`<em>Última vez: ${esc(last)}</em>`:''}</span>`:''}</div>`}
  return `<div class="rest" role="timer" aria-live="off"><div class="rtop"><span class="rl">Descanso</span><b id="restt">${fmtT(left)}</b><button data-act="restadd">+15 s</button><button data-act="restskip">Saltar</button></div>${next}<i class="rbar" id="restp" style="width:${restPct()}%"></i></div>`}
function findEx(id){for(const w of routine.weeks)for(const d of w.days)for(const i of d.items)if(i.id===id)return i}
function clientRoutine(){
  normNav(routine);
  const day=routine.weeks[S.w].days[S.d];
  const stat=its=>{let t=0,d=0;its.forEach(it=>{const st=dget(it);t+=st.length;d+=st.filter(x=>x.done).length});return[t,d]};
  const [total,done]=stat(day.items);
  const exHTML=(it,cur)=>{
    const c=isCardio(it);const sets=dget(it);
    const last=lastFor(it),ls=lastSets(it)||[];
    const rows=sets.map((s,i)=>c?`<div class="srow c"><i>${i+1}</i><span>${esc(it.series||'')} min</span><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Hecho">${s.done?'✓':'•'}</button></div>`
      :`<div class="srow"><i>${i+1}</i><input inputmode="decimal" data-ex="${it.id}" data-i="${i}" data-fld="kg" value="${esc(s.kg)}" placeholder="${esc((ls[i]||{}).kg||(/^\d/.test(it.kg||'')?it.kg:'kg'))}" aria-label="Kilos serie ${i+1}"><input inputmode="numeric" data-ex="${it.id}" data-i="${i}" data-fld="reps" value="${esc(s.reps)}" placeholder="${esc((ls[i]||{}).reps||'reps')}" aria-label="Repeticiones serie ${i+1}"><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Serie ${i+1} hecha">${s.done?'✓':'•'}</button></div>`).join('');
    const plan=c?[it.series&&it.series+' min',it.reps].filter(Boolean).join(' · '):[it.series&&it.series+' series',it.reps,it.kg&&('Carga: '+n$(it.kg)),it.rest&&'descanso '+it.rest].filter(Boolean).join(' · ');
    const k=dkey()+'-e'+it.id,nd=sets.filter(s=>s.done).length,all=nd===sets.length,op=S.ro[k]!==undefined?S.ro[k]:!!cur&&!all;
    return `<details class="bex ro" data-k="${k}" data-b="${k}"${op?' open':''}><summary class="bsum"><span class="name">${esc(it.name)}</span><span class="cnt ${all?'full':''}">${nd}/${sets.length}</span>${CHEV}</summary>${plan?`<div class="plan">${esc(plan)}</div>`:''}${last?`<p class="hint">Última vez: ${esc(last)}</p>`:''}${rows}<div style="margin-top:6px">${vidHTML(it)}</div></details>`;
  };
  const groups=groupsOf(day.items);
  groups.forEach(g=>{if(isSS(g)){const f=g.items[0];g.items.forEach(it=>{if(!it.series)it.series=f.series;if(!it.rest)it.rest=f.rest})}});
  const miniVid=it=>isFile(it.video)?`<button class="play" data-act="vid" data-id="${esc(it.id)}" aria-pressed="${S.vid.has(it.id)}" aria-label="Ver vídeo de ${esc(it.name)}">${PLAY}</button>`:it.video?`<a class="play" href="${esc(it.video)}" target="_blank" rel="noopener" aria-label="Ver vídeo de ${esc(it.name)}">${PLAY}</a>`:'';
  const planOf=it=>[it.reps,it.kg&&('Carga: '+n$(it.kg))].filter(Boolean).join(' · ');
  const blockHTML=(g,gi,cur)=>{
    const sr=g.items.find(x=>x.series),rs=g.items.find(x=>x.rest);
    const [bt,bd]=stat(g.items);
    const legend=g.items.map((it,k)=>`<li class="ex"><span class="dot" aria-hidden="true"></span><div class="ln"><b>${esc(it.name)}</b><small>${esc(planOf(it))}</small>${lastFor(it)?`<small class="lt">Última vez: ${esc(lastFor(it))}</small>`:''}</div><button class="cmx" data-act="exmsg" data-name="${esc(it.name)}" aria-label="Escribir sobre ${esc(it.name)}">💬</button>${miniVid(it)}${S.vid.has(it.id)&&isFile(it.video)?`<div class="lv">${clipHTML(it)}${notaHTML(it)}</div>`:''}</li>`).join('');
    const rounds=Math.max(0,...g.items.map(it=>dget(it).length));
    let rh='';
    const doneAt=r=>g.items.filter(it=>dget(it)[r]).every(it=>dget(it)[r].done);
    let fu=-1;for(let r=0;r<rounds;r++){if(!doneAt(r)){fu=r;break}}
    for(let r=0;r<rounds;r++){
      const have=g.items.filter(it=>dget(it)[r]);
      const rdone=have.every(it=>dget(it)[r].done);
      const bk=dkey()+'-b'+gi,rk=bk+'-'+r,op=S.ro[rk]!==undefined?S.ro[rk]:(cur&&r===fu);
      rh+=`<details class="round ro" data-k="${rk}" data-b="${bk}"${op?' open':''}><summary class="rh"><span>Serie ${r+1}</span><button class="rall" data-act="round" data-ids="${have.map(it=>it.id).join(',')}" data-i="${r}" aria-pressed="${rdone}">${rdone?'Serie hecha ✓':'Marcar toda la serie'}</button>${CHEV}</summary>`+g.items.map((it,k)=>{
        const s=dget(it)[r];if(!s)return '';
        const ctl=isCardio(it)?`<span class="rc">${esc(it.series||'')} min</span>`
          :`<input inputmode="decimal" data-ex="${it.id}" data-i="${r}" data-fld="kg" value="${esc(s.kg)}" placeholder="${esc(((lastSets(it)||[])[r]||{}).kg||(/^\d/.test(it.kg||'')?it.kg:'kg'))}" aria-label="Kilos ${esc(it.name)} serie ${r+1}"><input inputmode="numeric" data-ex="${it.id}" data-i="${r}" data-fld="reps" value="${esc(s.reps)}" placeholder="${esc(((lastSets(it)||[])[r]||{}).reps||'reps')}" aria-label="Repeticiones ${esc(it.name)} serie ${r+1}">`;
        return `<div class="rrow"><span class="rn"><em>${esc(it.name)}</em></span>${ctl}<button class="set" data-ex="${it.id}" data-i="${r}" data-act="tog" aria-pressed="${s.done}" aria-label="${esc(it.name)} serie ${r+1} hecha">${s.done?'✓':'•'}</button></div>`;
      }).join('')+`</details>`;
    }
    const chips=[sr?sr.series+' series':'',rs?'Descanso '+rs.rest.toLowerCase():''].filter(Boolean);
    return blockHead(g,gi,'Superserie',chips)+`<ul class="legend">${legend}</ul>${rh}</section>`;
  };
  const blockHead=(g,gi,kind,chips)=>{const [bt,bd]=stat(g.items);return `<section class="card bcard bk${gi%4} ${bd===bt&&bt?'done':''}" id="blk${gi}"><div class="bh"><span class="bn">${gi+1}</span><div class="bt"><h2>${esc(bname(g.block))}</h2><div class="chips"><span class="kind">${kind}</span>${chips.map(c=>`<span>${esc(c)}</span>`).join('')}</div></div><span class="bp">${bd}/${bt}</span></div>`};
  // Series normales: cada ejercicio entero, solo abierto el primero sin terminar
  const normalHTML=(g,gi,cur)=>{const f=g.items.find(it=>dget(it).some(s=>!s.done));return blockHead(g,gi,'Series normales',[g.items.length+(g.items.length>1?' ejercicios':' ejercicio')])+g.items.map(it=>exHTML(it,cur&&it===f)).join('')+`</section>`};
  const blocked=groups.filter(g=>g.block);
  const map=blocked.length>1?`<div class="map" role="group" aria-label="Bloques de la sesión">${groups.map((g,gi)=>{if(!g.block)return '';const [t,d]=stat(g.items);return `<button class="bk${gi%4} ${d===t&&t?'full':''}" data-go="blk${gi}" style="--p:${t?d/t*100:0}%" aria-label="Ir al bloque ${esc(bname(g.block))}, ${d} de ${t} series"><span>${esc(bname(g.block))}</span></button>`}).join('')}</div>`:'';
  const curG=groups.findIndex(g=>g.items.some(it=>dget(it).some(s=>!s.done)));
  const cards=groups.map((g,gi)=>{
    if(isSS(g))return blockHTML(g,gi,gi===curG);
    if(g.block)return normalHTML(g,gi,gi===curG);
    return `<article class="card bcard">${g.items.map(it=>exHTML(it,gi===curG)).join('')}</article>`;
  }).join('')||'<div class="empty">Este día aún no tiene ejercicios.</div>';
  if(isDone(S.w,S.d))return nav(routine)+`<main><div class="empty">✓ Este día ya está hecho. ${routine.weeks.every((_,w)=>firstFree(w)<0)?'¡Has terminado toda la rutina! Tu entrenador te preparará la siguiente.':firstFree(S.w)<0?'Esta semana ya está completa: pasa a la siguiente semana arriba.':'Elige el siguiente día arriba.'}</div></main>`;
  const fin=finish?`<div class="sheet"><h2>Terminar sesión</h2><label>Notas para tu entrenador (opcional)<textarea id="fnote" placeholder="Dolor, sensaciones, cambios que hiciste...">${esc(finish.notes)}</textarea></label><div><label>¿Cuánto esfuerzo te ha costado?</label><p class="ft" style="margin:2px 0 8px">Puntúa la sesión entera, no la última serie. Al tocar un número se guarda la sesión.</p><div class="esf">${[1,2,3,4,5,6,7,8,9,10].map(n=>`<button data-act="effort" data-n="${n}" aria-pressed="${finish.effort===n}" ${S.busy?'disabled':''} aria-label="Esfuerzo ${n} de 10">${n}</button>`).join('')}</div><div class="ezon" aria-hidden="true"><span>Suave</span><span>Moderado</span><span>Duro</span><span>Máximo</span></div></div>${S.busy?'<p class="ft" role="status">Guardando…</p>':''}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="back" data-act="cancelfin">Seguir entrenando</button></div>`
    :restBar()+`<div class="dock"><div class="dk"><b>${done}</b><small>de ${total} series</small></div><button class="rbtn" data-act="rest" aria-label="Temporizador de descanso">⏱</button><button class="btn" data-act="fin" ${done?'':'disabled'}>Terminar sesión</button></div>`;
  return nav(routine)+`<main>${map}${cards}${fin}</main>`+exmHTML()+(S.toast?`<div class="toast" role="status">${esc(S.toast)}</div>`:'');
}
const effHTML=s=>!isCoach()?'':efforts[s.id]?`<span class="tag ef${efforts[s.id]>=8?' hi':''}">Esfuerzo ${efforts[s.id]}/10</span>`:feelHTML(s.feeling);
const feelHTML=f=>{f=+f||0;return f?`<span class="fl l${f}" title="${esc(FEEL[f-1]||'')}">${[1,2,3,4,5].map(n=>`<i class="${n<=f?'on':''}"></i>`).join('')}</span><span class="fw">${esc(FEEL[f-1]||'')}</span>`:''};
S.open=new Set();S.cmd={};S.vid=new Set();
function whoIs(c,s){const mine=c.author_id===me.id;if(mine)return 'Tú';if(c.author_id===s.client_id)return label(clients.find(x=>x.id===s.client_id)||{name:'Cliente'});return 'Entrenador'}
function commentsHTML(s,cs){
  return `<div class="cm"><b class="cmt">Comentarios</b>${cs.length?cs.map(c=>`<div class="cmi ${c.author_id===me.id?'me':''}"><small>${esc(whoIs(c,s))} · ${esc(fdate(c.created_at))}</small><p>${esc(c.body)}</p></div>`).join(''):'<p class="hint" style="margin:0">Aún no hay comentarios.</p>'}<div class="cmf"><input class="cm-in" id="cm-${esc(s.id)}" data-sid="${esc(s.id)}" maxlength="1000" placeholder="${isCoach()?'Escribe al cliente…':'Escribe a tu entrenador…'}" value="${esc(S.cmd[s.id]||'')}" aria-label="Escribir comentario"><button class="btn sec" data-act="cmsend" data-sid="${esc(s.id)}">Enviar</button></div></div>`;
}
const KIND={bien:'👍 Bien',duro:'😅 Duro',molestia:'🤕 Molestia',duda:'❓ Duda'};
const ftime=iso=>{try{return new Date(iso).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}catch(e){return ''}};
S.chatKind=null;S.chatDraft={};S.exm=null;S.mf='un';S.toast='';
const unreadIn=cid=>msgs.filter(m=>m.client_id===cid&&m.author_id!==me.id&&!m.read_at);
async function markRead(cid){const u=unreadIn(cid);if(!u.length)return;const {error}=await sb.rpc('mark_read',{cid});if(error)return;const t=new Date().toISOString();u.forEach(m=>m.read_at=t);render()}
function threadFor(cid){
  const ss=isCoach()?(selClient===cid?cSessions:[]):sessions;
  const old=ss.flatMap(s=>(comments[s.id]||[]).map(c=>({id:c.id,author_id:c.author_id,body:c.body,created_at:c.created_at,ctx:'Sesión: '+(s.dname||''),client_id:cid})));
  return [...msgs.filter(m=>m.client_id===cid),...old].sort((x,y)=>x.created_at<y.created_at?-1:1);
}
function chatHTML(cid){
  const th=threadFor(cid);let li=-1;th.forEach((m,i)=>{if(m.author_id===me.id)li=i});
  const list=th.length?th.map((m,i)=>{const mine=m.author_id===me.id;
    return `<div class="cmsg ${mine?'me':''}">${m.ex_name?`<span class="mctx">🏋️ ${esc(m.ex_name)}${m.ctx?' · '+esc(m.ctx):''}</span>`:(m.ctx?`<span class="mctx">${esc(m.ctx)}</span>`:'')}${m.kind?`<span class="mk k-${m.kind}">${KIND[m.kind]}</span>`:''}<p>${esc(m.body)}</p><small>${esc(ftime(m.created_at))}${mine&&i===li&&m.read_at?' · ✓ Visto':''}</small></div>`}).join(''):'<p class="hint" style="margin:auto;text-align:center">Aún no hay mensajes. Escribe el primero.</p>';
  return `<div class="chat"><div class="cl" role="log">${list}</div><div class="kq">${Object.keys(KIND).map(k=>`<button class="kc ${S.chatKind===k?'on':''}" data-act="ckind" data-k="${k}" aria-pressed="${S.chatKind===k}">${KIND[k]}</button>`).join('')}</div><div class="cmf"><input id="chat-in" maxlength="1000" autocomplete="off" placeholder="${isCoach()?'Escribe al cliente…':'Escribe a tu entrenador…'}" value="${esc(S.chatDraft[cid]||'')}" aria-label="Mensaje"><button class="btn sec" data-act="chatsend" data-cid="${esc(cid)}">Enviar</button></div></div>`;
}
function clistHTML(){const q=(S.q||'').trim().toLowerCase(),L=q?clients.filter(c=>(label(c)+' '+(c.email||'')).toLowerCase().includes(q)):clients;return L.length?L.map(c=>`<button class="li" data-act="pick" data-id="${esc(c.id)}"${c.id===selClient?' aria-current="true"':''}><span class="who"><span class="av sm">${esc(initial(c))}</span><span><b>${esc(label(c))}</b><small>${assigned.has(c.id)?'Rutina asignada':'Sin rutina'}</small></span></span>${unreadIn(c.id).length?`<span class="tag warn">${unreadIn(c.id).length} nuevo${unreadIn(c.id).length>1?'s':''}</span>`:`<span class="tag ${assigned.has(c.id)?'ok':''}">${assigned.has(c.id)?'Activo':'Pendiente'}</span>`}</button>`).join(''):q?'<div class="empty">Ningún cliente coincide.</div>':'<div class="empty">Aún no hay clientes. Pulsa «+ Añadir cliente» y escribe su correo. Aparecerán aquí cuando acepten la invitación.</div>'}
// Añadir cliente: el entrenador escribe el correo y le llega la invitación
function inviteHTML(){const v=S.inv;if(!v)return '<button class="btn big" data-act="addcli" style="margin-top:10px">+ Añadir cliente</button>';
  return `<form class="auth invf" id="fInvite"><label>Correo del cliente<input type="email" id="inem" autocomplete="off" required placeholder="cliente@correo.com" value="${esc(v.em||'')}"></label><p class="hint" style="margin:0">Le llegará un correo para crear su contraseña. Aparecerá en tu lista cuando entre por primera vez.</p>${v.err?`<div class="err" role="alert">${esc(v.err)}</div>`:''}${v.ok?`<div class="ok" role="status">${esc(v.ok)}</div>`:''}<button class="btn big" ${v.busy?'disabled':''}>${v.busy?'Enviando…':'Enviar invitación'}</button><button type="button" class="linkb" data-act="addclix">Cerrar</button></form>`}
function newHTML(){
  const nw=clients.filter(c=>!assigned.has(c.id));if(!nw.length)return '';
  return `<section class="feed"><h2>Clientes nuevos</h2>${nw.map(c=>`<div class="fi hot"><button class="fib" data-act="pick" data-id="${esc(c.id)}"><span class="av sm">${esc(initial(c))}</span><span class="fit"><b>${esc(label(c))}</b><small>${esc(c.email)}</small><span class="sm"><span class="tag warn">Sin rutina</span><span class="fw">Toca para asignarle una</span></span></span></button></div>`).join('')}</section>`}
function msgsHTML(){
  const cl=id=>clients.find(c=>c.id===id)||{name:'Cliente'};
  const un=clients.map(c=>({c,n:unreadIn(c.id)})).filter(x=>x.n.length);
  const pain=msgs.filter(m=>m.kind==='molestia'&&m.author_id===m.client_id&&Date.now()-new Date(m.created_at)<14*864e5).reverse().slice(0,8);
  if(!un.length&&!pain.length)return '';
  const row=(c,m,n)=>`<div class="fi ${n?'hot':''}"><button class="fib" data-act="pick" data-id="${esc(c.id)}"><span class="av sm">${esc(initial(c))}</span><span class="fit"><b>${esc(label(c))}</b><small>${m.ex_name?'🏋️ '+esc(m.ex_name)+' · ':''}${esc(ftime(m.created_at))}</small><span class="sm">${m.kind?`<span class="mk k-${m.kind}">${KIND[m.kind]}</span>`:''}${n?`<span class="tag warn">${n} sin leer</span>`:''}</span><q>${esc(m.body)}</q></span></button></div>`;
  const items=S.mf==='pain'?pain.map(m=>row(cl(m.client_id),m,0)):un.map(x=>row(x.c,x.n[x.n.length-1],x.n.length));
  return `<section class="feed"><h2>Mensajes</h2><div class="kq"><button class="kc ${S.mf==='un'?'on':''}" data-act="mf" data-k="un">Sin leer (${un.length})</button><button class="kc ${S.mf==='pain'?'on':''}" data-act="mf" data-k="pain">🤕 Molestias (${pain.length})</button></div>${items.join('')||'<p class="hint" style="margin:0">Nada por aquí.</p>'}</section>`;
}
function exmHTML(){const e=S.exm;if(!e)return '';
  return `<div class="mo" role="dialog" aria-modal="true"><div class="mc"><h2>${esc(e.name)}</h2><small class="sub">${esc(e.ctx)}</small><div class="kq">${Object.keys(KIND).map(k=>`<button class="kc ${e.kind===k?'on':''}" data-act="ekind" data-k="${k}" aria-pressed="${e.kind===k}">${KIND[k]}</button>`).join('')}</div><textarea id="exm-t" maxlength="1000" placeholder="¿Cómo te ha ido? ¿Alguna molestia o duda?">${esc(e.text)}</textarea><button class="btn big" data-act="exsend">Enviar a mi entrenador</button><button class="back" data-act="excancel">Cancelar</button></div></div>`}
const actN=()=>clients.filter(c=>!assigned.has(c.id)).length+clients.reduce((n,c)=>n+unreadIn(c.id).length,0)+feed.filter(s=>new Date(s.date)>Date.now()-14*864e5&&isHot(s)).length;
// Por responder: necesita respuesta y el cliente no ha escrito nada nuevo desde que la viste
const isHot=s=>{if(!needsReply(s))return false;const v=seen[s.id];if(!v)return true;const cs=comments[s.id]||[],l=cs[cs.length-1];return !!(l&&l.author_id===s.client_id&&new Date(l.created_at)>new Date(v))};
const needsReply=s=>{const cs=comments[s.id]||[],l=cs[cs.length-1];if(l)return l.author_id===s.client_id;return !!((s.notes||'').trim()||(s.feeling&&s.feeling>=4)||efforts[s.id]>=8)};
function feedHTML(){
  const cut=Date.now()-14*864e5;
  const rec=feed.filter(s=>new Date(s.date)>cut);
  const att=rec.filter(isHot).slice(0,8);
  const rest=feed.filter(s=>!att.includes(s)).slice(0,6);
  const cl=s=>clients.find(c=>c.id===s.client_id)||{name:'Cliente'};
  const tot=s=>{let t=0,d=0;(s.items||[]).forEach(i=>(i.sets||[]).forEach(x=>{t++;if(x.done)d++}));return[d,t]};
  const row=(s,hot)=>{const [d,t]=tot(s),cs=comments[s.id]||[],l=cs[cs.length-1];
    return `<div class="fi ${hot?'hot':''}"><button class="fib" data-act="openses" data-cid="${esc(s.client_id)}" data-sid="${esc(s.id)}"><span class="av sm">${esc(initial(cl(s)))}</span><span class="fit"><b>${esc(label(cl(s)))}</b><small>${esc(s.dname||'Sesión')} · ${esc(fdate(s.date))} · ${d}/${t} series</small><span class="sm">${effHTML(s)}${hot?'<span class="tag warn">Por responder</span>':''}</span>${l&&l.author_id===s.client_id?`<q>${esc(l.body)}</q>`:(s.notes?`<q>${esc(s.notes)}</q>`:'')}</span></button>${hot?`<button class="seen" data-act="seen" data-sid="${esc(s.id)}">Ya lo vi</button>`:''}</div>`};
  if(!feed.length)return '';
  return `<section class="feed"><h2>Actividad reciente</h2>${att.length?att.map(s=>row(s,true)).join(''):'<p class="hint" style="margin:0 0 6px">Todo al día: no hay nada por responder.</p>'}${rest.length?`<h3>Últimas sesiones</h3>${rest.map(s=>row(s,false)).join('')}`:''}</section>`;
}
function sessionHTML(s){
  const its=s.items||[];let t=0,d=0;its.forEach(i=>(i.sets||[]).forEach(x=>{t++;if(x.done)d++}));
  const dt=new Date(s.date),ok=!isNaN(dt);
  const day=ok?dt.getDate():'·',mon=ok?dt.toLocaleDateString('es-ES',{month:'short'}).replace('.',''):'';
  const wk=ok?dt.toLocaleDateString('es-ES',{weekday:'long'}):'';
  const pct=t?Math.round(d/t*100):0;
  const dots=effHTML(s),cs=comments[s.id]||[];
  const gs=[];its.forEach(i=>{const k=i.block||'';const l=gs[gs.length-1];if(l&&l.k===k)l.items.push(i);else gs.push({k,items:[i]})});
  const body=gs.map((g,gi)=>`<div class="sb bk${gi%4}">${g.k?`<div class="sbh"><span class="sbn">${gi+1}</span>${esc(bname(g.k))}</div>`:''}${g.items.map(i=>`<div class="sx"><strong>${esc(i.name)}</strong><div class="sets">${(i.sets||[]).map((x,n)=>`<span class="st${x.done?' ok':''}"><em>${n+1}</em>${x.kg||x.reps?(x.kg?esc(x.kg)+' kg':'–')+' × '+(x.reps?esc(x.reps):'–'):'Sin datos'}</span>`).join('')}</div></div>`).join('')}</div>`).join('');
  return `<details class="ses" data-sid="${esc(s.id)}"${S.open&&S.open.has(s.id)?' open':''}><summary><div class="dt"><b>${day}</b><small>${esc(mon)}</small></div><div class="si"><strong>${esc(s.dname||'Sesión')}</strong><small>${esc(wk)}${s.wname?' · '+esc(s.wname):''}</small><div class="pb"><i style="width:${pct}%"></i></div><div class="sm"><span class="tag ${d===t&&t?'ok':''}">${d}/${t} series</span>${dots}${cs.length?`<span class="tag cmb">💬 ${cs.length}</span>`:''}</div></div><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="sbody">${body}${s.notes?`<div class="snote"><b>Nota</b>${esc(s.notes)}</div>`:''}${commentsHTML(s,cs)}</div></details>`;
}
// pantalla tras guardar la sesión: te llama por tu nombre, te dice qué viene y te invita a escribir
function hechoHTML(){
  const n=me.name?String(me.name).split(' ')[0]:'',now=new Date();
  const mes=sessions.filter(s=>{const d=new Date(s.date);return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear()}).length;
  const nd=!isDone(S.w,S.d)&&routine.weeks[S.w]&&routine.weeks[S.w].days[S.d];
  const prox=nd?` Próxima: ${esc(nd.name)}${routine.weeks.length>1?' · '+esc(routine.weeks[S.w].name):''}.`:' Has terminado todos los días de tu rutina.';
  return `<section class="sdone bk0"><div class="hband" aria-hidden="true"><i></i><i></i></div><div class="hbd"><h2>Hecho${n?', '+esc(n):''}.</h2><p><b class="hn">${mes}</b> ${mes===1?'sesión':'sesiones'} este mes.${prox}</p>${S.hecho.ef?'<p class="ft">Esfuerzo apuntado. Lo reviso y te digo algo.</p>':''}<p class="hbox">¿Algo que deba saber? Una molestia, una duda…</p><button class="btn big hk" data-act="hechochat">Escribir a ${esc(TRAINER.split(' ')[0])}</button><button class="btn big ht" data-act="hechook">Volver a mi rutina</button></div></section>`;
}
function clientView(){
  const tabs=`<div class="seg"><button data-tab="rutina" aria-pressed="${S.tab==='rutina'}">Rutina</button><button data-tab="historial" aria-pressed="${S.tab==='historial'}">Historial</button><button data-tab="chat" aria-pressed="${S.tab==='chat'}">Chat${unreadIn(me.id).length?` <span class="dot2">${unreadIn(me.id).length}</span>`:''}</button></div>`;
  let body;
  if(S.tab==='chat')body=`<main class="panel">${chatHTML(me.id)}</main>`;
  else if(!routine)body=`<div class="empty" style="margin-top:20px">Tu entrenador aún no te ha asignado una rutina. Vuelve en un rato.</div>`;
  else if(S.tab==='historial')body=`<main class="panel">${sessions.length?sessions.map(sessionHTML).join(''):'<div class="empty">Todavía no has guardado ninguna sesión.</div>'}</main>`;
  else if(S.hecho)body=hechoHTML();
  else body=clientRoutine();
  return (S.welcome?welcomeHTML():'')+topbar()+head(`<h1>${me.name?'Hola, '+esc(String(me.name).split(' ')[0]):'Tu rutina'}</h1>`,routine&&routine.title!=='Mi rutina'?esc(routine.title):'')+tabs+body;
}

/* ---------- entrenador ---------- */
function previewView(){
  const c=clients.find(x=>x.id===selClient)||{};
  return `<div class="prev"><div class="pvbar"><span>Vista previa · <b>${esc(label(c))}</b><small>Así lo ve el cliente. No se guarda nada.</small></span><button class="btn sec" data-act="endpreview">Volver</button></div>`+head(`<h1>${esc(routine.title)}</h1>`,esc(c.name||''))+clientRoutine()+`</div>`;
}
function coachView(){
  if(S.prevOn&&routine)return previewView();
  if(edit)return editorView();
  if(wide())return deskView();
  const tabs=`<div class="seg"><button data-tab="clientes" aria-pressed="${S.tab==='clientes'}">Clientes</button><button data-tab="actividad" aria-pressed="${S.tab==='actividad'}">Actividad${actN()?` <span class="dot2">${actN()}</span>`:''}</button><button data-tab="plantilla" aria-pressed="${S.tab==='plantilla'}">Programador rutinas</button><button data-tab="ejercicios" aria-pressed="${S.tab==='ejercicios'}">Ejercicios</button></div>`;
  let body='';
  const sel=clients.find(c=>c.id===selClient);
  if(S.tab==='ejercicios'){
    const X=S.x;
    body=`<main class="panel xm">${X.view==='list'?xHeadHTML()+`<div class="xsr"><input id="xq" class="sin" type="search" placeholder="Buscar ejercicio" value="${esc(X.q)}" autocomplete="off"><button class="btn sec" data-x="fopen" aria-expanded="${X.fopen}">Filtros${xnAct()?` <span class="dot2">${xnAct()}</span>`:''}</button></div>${X.fopen?`<div class="xfp">${xFiltersHTML()}</div>`:''}<div id="xlist">${xListHTML()}</div>`:xMainHTML()}</main>`;
  }else if(S.tab==='plantilla'){
    body=progTabHTML();
  }else if(sel){
    const has=assigned.has(sel.id);
    body=`<button class="back" data-act="backc">← Clientes</button><main class="panel"><h2>${esc(label(sel))}</h2><p class="hint" style="margin:0">${esc(sel.email)}</p><div class="ed2" style="display:flex;gap:8px"><input id="cname" value="${esc(sel.name||'')}" placeholder="Nombre del cliente" aria-label="Nombre del cliente"><button class="btn sec" data-act="savename">Guardar</button></div>${has?`<button class="btn big" data-act="preview" style="margin-top:10px">Ver como lo ve el cliente</button>`:''}<label class="btn sec" for="xlsc" style="display:block;text-align:center;margin-top:10px">Cargar Excel (.xlsm) para este cliente</label><input type="file" id="xlsc" accept=".xlsm,.xlsx" hidden>${has?`<button class="btn big" data-act="editr">Editar su rutina</button>`:`<div class="empty">Este cliente aún no tiene rutina.</div><button class="btn big" data-act="assign" ${tpl?'':'disabled'}>Asignar plantilla base</button>${tpl?'':'<p class="hint">Crea primero la plantilla base.</p>'}`}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<h2 style="margin-top:14px">Chat</h2>${chatHTML(sel.id)}<h2 style="margin-top:14px">Sesiones registradas</h2>${cSessions.length?cSessions.map(sessionHTML).join(''):'<div class="empty">Todavía no ha registrado sesiones.</div>'}</main>`;
  }else{
    body=S.tab==='actividad'?`<main class="panel">${newHTML()}${msgsHTML()}${feedHTML()||''}${!newHTML()&&!msgsHTML()&&!feedHTML()?'<div class="empty">Aún no hay actividad de tus clientes.</div>':''}</main>`:`<main class="panel"><div class="hrow"><h2>Tus clientes</h2><button class="sbtn" data-act="search" aria-label="Buscar cliente"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg></button></div>${S.q!=null?`<input id="cq" class="sin" type="search" placeholder="Buscar por nombre o correo" value="${esc(S.q)}" autocomplete="off">`:''}${inviteHTML()}<div id="clist">${clistHTML()}</div><button class="btn sec" data-act="reload">Actualizar lista</button></main>`;
  }
  return topbar()+head('<h1>Panel del entrenador</h1>','Clientes y rutinas')+tabs+body;
}
// Pestaña «Programador rutinas»: lista de clientes (los que no tienen rutina, arriba en amarillo) para programar su rutina, y la plantilla base
let rupd={};S.pc={q:'',f:'all'};
// «Actualizada hoy / ayer / hace 3 días / hace 2 semanas / hace 1 mes»
function hace(iso){const d=new Date(iso);if(!iso||isNaN(d))return 'Con rutina';const n=Math.floor((Date.now()-d)/864e5);
  return 'Actualizada '+(n<1?'hoy':n<2?'ayer':n<14?`hace ${n} días`:n<60?`hace ${Math.floor(n/7)} semanas`:`hace ${Math.floor(n/30)} meses`)}
const PCGO='<svg class="pc-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
function pcListHTML(){
  const q=S.pc.q.trim().toLowerCase(),f=S.pc.f;
  const L=[...clients].sort((a,b)=>label(a).localeCompare(label(b),'es')).filter(c=>(f==='all'||(f==='si')===assigned.has(c.id))&&(!q||(label(c)+' '+c.email).toLowerCase().includes(q)));
  const row=c=>{const has=assigned.has(c.id);return `<button class="pc-cl" data-act="pcsel" data-id="${esc(c.id)}" aria-pressed="${c.id===selClient}"><span class="pc-av"${c.avatar_url?` style="background-image:url('${esc(c.avatar_url)}')"`:''}>${c.avatar_url?'':esc(initial(c))}</span><span class="pc-ct"><b>${esc(label(c))}</b><small>${has?esc(hace(rupd[c.id])):'Empieza desde la plantilla'}<span> · ${esc(c.email)}</span></small></span><span class="pc-tag ${has?'ok':'no'}">${has?'Con rutina':'Sin rutina'}</span>${PCGO}</button>`};
  const sin=L.filter(c=>!assigned.has(c.id)),con=L.filter(c=>assigned.has(c.id));
  if(!L.length)return `<div class="pc-grp"><div class="pc-none">${clients.length?'Ningún cliente coincide.':'Aún no tienes clientes. Añádelos en la pestaña Clientes.'}</div></div>`;
  return (sin.length?`<section class="pc-grp pend"><div class="pc-gh"><b>Sin rutina</b><small>${sin.length} pendiente${sin.length>1?'s':''}</small></div>${sin.map(row).join('')}</section>`:'')
    +(con.length?`<section class="pc-grp"><div class="pc-gh"><b>Con rutina</b><small>${con.length}</small></div>${con.map(row).join('')}</section>`:'');
}
function progTabHTML(){
  const nr=clients.filter(c=>!assigned.has(c.id)).length,s=clients.find(c=>c.id===selClient);
  const chip=(k,t,n)=>`<button class="pc-chip" data-act="pcf" data-k="${k}" aria-pressed="${S.pc.f===k}">${t} <em>${n}</em></button>`;
  return `<main class="panel pc"><header class="pc-hero"><p class="pc-eyb">// Programador rutinas</p><h2>¿A quién le programas hoy?</h2><p>Elige un cliente y se abre el programador con su rutina.</p></header>
  <div class="pc-tools"><label class="pc-search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input id="pcq" type="search" placeholder="Buscar cliente por nombre o correo" value="${esc(S.pc.q)}" autocomplete="off" aria-label="Buscar cliente"></label>
  <div class="pc-chips">${chip('all','Todos',clients.length)}${chip('si','Con rutina',clients.length-nr)}${chip('no','Sin rutina',nr)}</div></div>
  <div id="pclist">${pcListHTML()}</div>
  ${s?`<div class="pc-act"><div><small>// ${assigned.has(s.id)?'Programar rutina de':'Rutina nueva para'}</small><b>${esc(label(s))}</b></div><button class="pc-btn" data-act="progcli">Programar →</button></div>`:`<div class="pc-act off"><div><small>// Ningún cliente elegido</small><b>Elige un cliente</b></div><button class="pc-btn" disabled>Programar →</button></div>`}
  ${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}
  <section class="pc-tpl"><div><h2>Plantilla base</h2><p>La rutina que se copia a un cliente nuevo. Cambiarla no modifica las ya asignadas.</p></div>${tpl?`<button class="pc-btn sec" data-act="edittpl">Editar plantilla</button>`:'<button class="pc-btn sec" data-act="newtpl">Crear plantilla vacía</button>'}</section></main>`;
}
function importCard(){
  const i=edit.imp||{};
  return `<div class="card ed"><b>Cargar desde Excel</b><p class="hint" style="margin:6px 0 10px">Sube tu planificador (.xlsm). Leo la hoja <b>Plan_SS1</b> y coloco aquí la rutina entera, con sus vídeos. No se guarda hasta que pulses Guardar.</p><label class="btn sec" for="xlsf" style="display:block;text-align:center;${i.busy?'opacity:.6;pointer-events:none':''}">${i.busy?'Leyendo Excel…':'Cargar Excel (.xlsm)'}</label><input type="file" id="xlsf" accept=".xlsm,.xlsx" hidden>${i.ok?`<p class="hint" style="margin:10px 0 0" role="status">${esc(i.text)}</p>${i.noVideo&&i.noVideo.length?`<p class="hint" style="margin:6px 0 0">Sin vídeo: ${esc(i.noVideo.join(', '))}.</p>`:''}`:''}${i.err?`<div class="err" role="alert" style="margin-top:10px">${esc(i.err)}</div>`:''}</div>`;
}

/* ---------- vista de escritorio (Mac) ---------- */
// En pantallas anchas el entrenador ve menú lateral + lista + detalle. En el móvil todo sigue igual.
const WIDE=matchMedia('(min-width:1024px)');
const wide=()=>WIDE.matches;
WIDE.addEventListener('change',()=>render());
S.sub='chats';S.cf='all';
const deskChat=()=>S.tab==='actividad'&&S.sub==='chats';
// Hora corta estilo WhatsApp: 10:42, Ayer o 3 oct
const wtime=iso=>{const d=new Date(iso),n=new Date();if(isNaN(d))return '';const y=new Date(n);y.setDate(n.getDate()-1);
  if(d.toDateString()===n.toDateString())return d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'});
  if(d.toDateString()===y.toDateString())return 'Ayer';
  return d.toLocaleDateString('es-ES',{day:'numeric',month:'short'}).replace('.','')};
function chatsHTML(){
  const last={};msgs.forEach(m=>{last[m.client_id]=m});
  const pain=id=>msgs.some(m=>m.client_id===id&&m.author_id===id&&m.kind==='molestia'&&Date.now()-new Date(m.created_at)<14*864e5);
  let L=clients.map(c=>({c,l:last[c.id],n:unreadIn(c.id).length}));
  if(S.cf==='un')L=L.filter(x=>x.n);else if(S.cf==='pain')L=L.filter(x=>pain(x.c.id));
  L.sort((a,b)=>(b.l?b.l.created_at:'').localeCompare(a.l?a.l.created_at:'')||label(a.c).localeCompare(label(b.c)));
  const f=(k,t)=>`<button class="kc ${S.cf===k?'on':''}" data-act="cf" data-k="${k}" aria-pressed="${S.cf===k}">${t}</button>`;
  const row=({c,l,n})=>{const mine=l&&l.author_id===me.id;
    return `<button class="wa${n?' un':''}" data-act="pickchat" data-id="${esc(c.id)}"${c.id===selClient?' aria-current="true"':''}><span class="av sm">${esc(initial(c))}</span><span class="wat"><b>${esc(label(c))}</b><small>${l?(mine?'Tú: ':'')+(l.kind==='molestia'&&!mine?'<em>Molestia ·</em> ':'')+esc(l.body):'Sin mensajes'}</small></span><span class="wam"><small>${l?esc(wtime(l.created_at)):''}</small>${n?`<span class="wan" aria-label="${n} sin leer">${n}</span>`:''}</span></button>`};
  return `<div class="dhd"><h2>Chats</h2></div><div class="kq">${f('all','Todos')}${f('un','Sin leer')}${f('pain','Molestias')}</div><div class="wal">${L.map(row).join('')||'<p class="hint">Nada por aquí.</p>'}</div>`;
}
// Cabecera negra del cliente con sus acciones
function deskHero(sel,acts){
  return `<div class="dhero"><div class="dht"><small>// ${esc(sel.email||'')}</small><h2>${esc(label(sel))}</h2></div><div class="dacts">${acts}</div></div>`;
}
function fichaHTML(sel){
  const has=assigned.has(sel.id),n=unreadIn(sel.id).length;
  const acts=(has?`<button class="btn" data-act="editr">Editar rutina</button><button class="btn ghost" data-act="preview">Ver como cliente</button>`:`<button class="btn" data-act="assign" ${tpl?'':'disabled'}>Asignar plantilla base</button>`)
    +`<label class="btn ghost blue" for="xlsc">Cargar Excel</label><input type="file" id="xlsc" accept=".xlsm,.xlsx" hidden><button class="btn ghost" data-act="sub" data-k="chats" data-keep>Chat${n?` <span class="dot2">${n}</span>`:''}</button>`;
  return deskHero(sel,acts)+`<div class="dbody">${!has?`<div class="dnote">Este cliente aún no tiene rutina.${tpl?'':' Crea primero la plantilla base.'}</div>`:''}${n?`<button class="dnote" data-act="sub" data-k="chats" data-keep>Tiene ${n} mensaje${n>1?'s':''} sin leer. Abrir chat →</button>`:''}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<div class="ed2" style="display:flex;gap:8px"><input id="cname" value="${esc(sel.name||'')}" placeholder="Nombre del cliente" aria-label="Nombre del cliente"><button class="btn sec" data-act="savename">Guardar</button></div><h3 class="dh3">Sesiones registradas</h3>${cSessions.length?cSessions.map(sessionHTML).join(''):'<div class="empty">Todavía no ha registrado sesiones.</div>'}</div>`;
}
function deskView(){
  const nc=clients.reduce((k,c)=>k+unreadIn(c.id).length,0),na=actN(),ns=Math.max(0,na-nc);
  const sel=clients.find(c=>c.id===selClient);
  const b=n=>n?`<span class="dot2">${n}</span>`:'';
  const nav=`<div class="dnav"><button data-tab="clientes" aria-pressed="${S.tab==='clientes'}">Clientes</button><button data-tab="actividad" aria-pressed="${S.tab==='actividad'}">Actividad${b(na)}</button>${S.tab==='actividad'?`<div class="dsub"><button data-act="sub" data-k="chats" aria-pressed="${S.sub==='chats'}">Chats${b(nc)}</button><button data-act="sub" data-k="ses" aria-pressed="${S.sub!=='chats'}">Sesiones${b(ns)}</button></div>`:''}<button data-tab="plantilla" aria-pressed="${S.tab==='plantilla'}">Programador rutinas</button><button data-tab="ejercicios" aria-pressed="${S.tab==='ejercicios'}">Ejercicios</button></div>`;
  const pick=t=>`<div class="empty">${t}</div>`;
  // Ejercicios: filtros en la columna negra, lista en el centro y ficha a la derecha
  if(S.tab==='ejercicios'){
    const X=S.x;
    return `<div class="desk"><aside class="dside xs">${topbar()}${nav}<div class="xflt">${xFiltersHTML()}</div></aside><section class="dlist">${xHeadHTML()}<input id="xq" class="sin" type="search" placeholder="Buscar ejercicio" value="${esc(X.q)}" autocomplete="off"><div id="xlist">${xListHTML()}</div></section><section class="dmain">${X.view==='list'?pick('Elige un ejercicio de la lista.'):xMainHTML()}</section></div>`;
  }
  const side=`<aside class="dside">${topbar()}${nav}</aside>`;
  let list='',main='';
  if(S.tab==='plantilla'){
    main=progTabHTML();
    return `<div class="desk nol">${side}<section class="dmain">${main}</section></div>`;
  }
  if(S.tab==='actividad'&&S.sub==='chats'){
    list=chatsHTML();
    main=sel?deskHero(sel,`<button class="btn ghost" data-act="ficha">Ver ficha</button>`)+`<div class="dbody">${chatHTML(sel.id)}</div>`:pick('Elige un chat de la lista.');
  }else if(S.tab==='actividad'){
    const nw=newHTML(),fd=feedHTML();
    list=`<div class="dhd"><h2>Sesiones</h2></div>${nw}${fd}${!nw&&!fd?'<div class="empty">Aún no hay actividad de tus clientes.</div>':''}`;
    main=sel?fichaHTML(sel):pick('Elige una sesión o un cliente nuevo.');
  }else{
    list=`<div class="dhd"><h2>Clientes</h2><button class="sbtn" data-act="reload" aria-label="Actualizar lista" title="Actualizar lista"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg></button></div><input id="cq" class="sin" type="search" placeholder="Buscar cliente" value="${esc(S.q||'')}" autocomplete="off">${inviteHTML()}<div id="clist">${clistHTML()}</div>`;
    main=sel?fichaHTML(sel):pick('Elige un cliente de la lista.');
  }
  return `<div class="desk">${side}<section class="dlist">${list}</section><section class="dmain">${main}</section></div>`;
}

/* ---------- base de ejercicios (pestaña Ejercicios del entrenador) ---------- */
// Se guarda en templates id 'lib': {items:[{name,cat,mat,prog,video,vs,tips}], gens:[{name,cats}], mats, have}.
// items es la misma lista que usa el autocompletado del editor de rutinas.
let xlib={gens:[],mats:[],have:null};
S.x={q:'',cats:new Set(),vids:new Set(),og:new Set(),oc:new Set(),fo:new Set(),fg:new Set(),fopen:false,view:'list',sel:null,ed:null,msg:'',err:'',busy:false};
const XVS={mio:'Vídeo mío',otro:'Vídeo de otro',no:'Sin vídeo'};
const XCV='<svg class="xcv" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
const az=(a,b)=>String(a).localeCompare(String(b),'es');
const pad2=n=>String(n).padStart(2,'0');
const xnice=c=>String(c||'').replace(/_/g,' ');
const xnorm=s=>xnice(s).toLowerCase().replace(/\s+/g,' ').trim();
const xvs=it=>it.video?(it.vs==='mio'?'mio':'otro'):'no';
const xmats=it=>String(it.mat||'').split(',').map(s=>s.trim()).filter(Boolean);
const xallMats=()=>[...new Set([...xlib.mats,...lib.flatMap(xmats)])].sort(az);
const xhas=m=>!xlib.have||xlib.have.includes(m);
const xcats=()=>[...new Set([...xlib.gens.flatMap(g=>g.cats),...lib.map(i=>i.cat).filter(Boolean)])];
const xgenOf=c=>xlib.gens.find(g=>g.cats.includes(c));
const xgi=c=>{const i=xlib.gens.findIndex(g=>g.cats.includes(c));return i<0?'none':String(i)};
const xloose=()=>xcats().filter(c=>!xgenOf(c)).sort(az);
const xgroups=()=>[...xlib.gens.map((g,i)=>({key:String(i),name:g.name,cats:g.cats})),...(xloose().length?[{key:'none',name:'Sin categoría general',cats:xloose()}]:[])];
const xcnt=c=>lib.filter(i=>i.cat===c).length;
const xtaken=v=>xcats().some(c=>xnorm(c)===xnorm(v));
const xnAct=()=>S.x.cats.size+S.x.vids.size+(xlib.have?1:0);
// Un ejercicio sale si es de lo marcado y tienes TODO su material
function xfiltered(){const X=S.x,q=X.q.trim().toLowerCase();
  return lib.map((it,i)=>({it,i})).filter(({it})=>(!X.cats.size||X.cats.has(it.cat))&&(!X.vids.size||X.vids.has(xvs(it)))&&xmats(it).every(xhas)&&(!q||(it.name+' '+(it.mat||'')).toLowerCase().includes(q)))}
async function saveLib(){
  S.x.busy=true;const {error}=await sb.from('templates').upsert({id:'lib',data:{items:lib,gens:xlib.gens,mats:xlib.mats,have:xlib.have}});S.x.busy=false;
  if(error){S.x.err=werr(error);render();return false}S.x.err='';return true}
function xHeadHTML(){const n=lib.filter(i=>!i.video).length;
  return `<div class="dhd"><h2>Ejercicios</h2></div><div class="xst"><span><b>${lib.length}</b> ejercicios</span><span><b>${xlib.gens.length}</b> generales</span><span><b>${n}</b> sin vídeo</span></div><div class="xacts"><button class="btn" data-x="new">+ Nuevo</button><button class="btn sec" data-x="cats">Categorías</button><label class="btn sec" for="xxls">${S.x.imp==='busy'?'Leyendo…':'Cargar Excel'}</label><input type="file" id="xxls" accept=".xlsm,.xlsx" hidden></div>${S.x.err?`<div class="err" role="alert">${esc(S.x.err)}</div>`:''}${S.x.impMsg?`<div class="ok" role="status">${esc(S.x.impMsg)}</div>`:''}`}
const xck=(f,v,l,on,n,ind)=>`<label class="xck"><input type="checkbox" data-xf="${f}" value="${esc(v)}" ${on?'checked':''} ${ind?'data-ind':''}>${esc(l)}${n!=null?`<em>${n}</em>`:''}</label>`;
const xsec=(k,t,sum,links,inner)=>{const o=S.x.fo.has(k);return `<div class="xfs"><button class="xft" data-x="tf" data-k="${k}" aria-expanded="${o}">${XCV}<b>${t}</b><small>${sum}</small></button>${o?`${links?`<div class="xfl">${links}</div>`:''}<div class="xfin">${inner}</div>`:''}</div>`};
function xFiltersHTML(){
  const X=S.x,ms=xallMats(),nh=ms.filter(xhas).length;
  return `<div class="xfh">Filtros</div>`
  +xsec('cat','Categoría',X.cats.size?`${X.cats.size} marc.`:'Todas',`${X.cats.size?'<button class="xlk" data-x="clrcat">Quitar</button>':''}<button class="xlk" data-x="cats">Editar</button>`,
    xgroups().map(g=>{const s=g.cats.filter(c=>X.cats.has(c)).length,all=g.cats.length>0&&s===g.cats.length,o=X.fg.has(g.key);
      return `<div class="xgh">${xck('gen',g.key,xnice(g.name),all,null,s&&!all)}<button class="xgt" data-x="tfg" data-k="${g.key}" aria-expanded="${o}" aria-label="Ver categorías de ${esc(xnice(g.name))}">${XCV}</button></div>${o?`<div class="xsub">${g.cats.map(c=>xck('cat',c,xnice(c),X.cats.has(c),xcnt(c))).join('')}</div>`:''}`}).join('')||'<p class="hint">Aún no hay categorías.</p>')
  +xsec('mat','Material que tengo',xlib.have?`${nh}/${ms.length}`:'Todo','<button class="xlk" data-x="allmat">Todo</button><button class="xlk" data-x="nomat">Nada</button>',
    `<p class="hint">Solo salen los ejercicios que puedes hacer con lo marcado.</p>${ms.map(m=>xck('mat',m,m,xhas(m))).join('')}<div class="xam"><input id="xnm" placeholder="Añadir material" autocomplete="off"><button class="btn sec" data-x="addmat">Añadir</button></div>`)
  +xsec('vid','Vídeo',X.vids.size?`${X.vids.size} marc.`:'Todos','',Object.keys(XVS).map(v=>xck('vid',v,XVS[v],X.vids.has(v),lib.filter(i=>xvs(i)===v).length)).join(''))
  +(xnAct()?'<button class="xlk" data-x="clrall" style="margin-top:10px">Quitar todos los filtros</button>':'');
}
function xListHTML(){
  const X=S.x,f=xfiltered(),force=!!X.q.trim();
  const body=xgroups().map(g=>{const cs=g.cats.map(c=>[c,f.filter(x=>x.it.cat===c)]).filter(x=>x[1].length);if(!cs.length)return '';
    const go=force||X.og.has(g.key),tot=cs.reduce((a,x)=>a+x[1].length,0);
    return `<button class="xgn" data-x="tg" data-t="gen" data-k="${g.key}" aria-expanded="${go}"><span>${esc(xnice(g.name))}</span><small>${tot} ejercicios · ${cs.length} cat.</small>${XCV}</button>`
    +(go?cs.map(([c,xs])=>{const co=force||X.oc.has(c);return `<div class="xfi"><button class="xfc" data-x="tg" data-t="cat" data-k="${esc(c)}" aria-expanded="${co}"><span>${esc(xnice(c))}</span><small>${pad2(xs.length)}</small>${XCV}</button>${co?xs.map(({it,i},n)=>`<button class="xrw" data-x="row" data-i="${i}"${X.sel===i&&X.view!=='list'?' aria-current="true"':''}><i>${pad2(n+1)}</i><span class="xt"><b>${esc(it.name)}</b><small>${esc(it.mat||'—')}${it.prog!=null&&it.prog!==''?` · nivel ${esc(it.prog)}`:''}</small></span><span class="xvb ${xvs(it)}">${XVS[xvs(it)].replace('Vídeo ','')}</span></button>`).join(''):''}</div>`}).join(''):'')}).join('');
  return body?`<div class="xlb"><span>${f.length} ejercicios</span><span><button class="xlk" data-x="openall">Desplegar todo</button><button class="xlk" data-x="closeall">Plegar todo</button></span></div>${body}`:'<div class="empty">Ningún ejercicio cumple los filtros.</div>';
}
function xMainHTML(){const X=S.x;return `<button class="back" data-x="back">← Volver a la lista</button>`+(X.view==='edit'?xEditHTML():X.view==='cats'?xCatsHTML():xDetHTML(lib[X.sel]))}
function xDetHTML(it){
  if(!it)return '<div class="empty">Ese ejercicio ya no existe.</div>';
  const g=xgenOf(it.cat),p=it.prog!=null&&it.prog!==''?it.prog:'';
  const vid=!it.video?`<div class="xvd no">Falta vídeo<button class="btn" data-x="editvid">+ Añadir vídeo</button></div>`:isFile(it.video)?clipHTML(it):`<a class="xvd" href="${esc(it.video)}" target="_blank" rel="noopener"><span class="xpl">${PLAY}</span>Ver vídeo</a>`;
  return `<article class="xdt"><div class="dhero"><div class="dht"><small>// ${esc(xnice(g?g.name:'Sin general').toUpperCase())} › ${esc(xnice(it.cat).toUpperCase())}</small><h2>${esc(it.name)}</h2></div><div class="dacts"><button class="btn" data-x="edit">Editar</button></div></div><div class="dbody">
  ${S.x.msg?`<div class="ok" role="status">${esc(S.x.msg)}</div>`:''}${vid}${it.video?'<button class="xlk" data-x="editvid" style="justify-self:end">Cambiar vídeo</button>':''}
  <dl class="xdl"><div><dt>Material</dt><dd>${esc(it.mat||'—')}</dd></div><div><dt>Vídeo</dt><dd><span class="xvb ${xvs(it)}">${XVS[xvs(it)]}</span></dd></div><div><dt>Progresión</dt><dd>${p!==''?'Nivel '+esc(p):'—'}</dd></div></dl>
  ${tipsHTML(it)||'<div class="dnote">Sin claves técnicas todavía.</div>'}</div></article>`;
}
function xStartEdit(i){const it=i!=null?lib[i]:null,own=it&&isFile(it.video);
  S.x.ed={i,name:it?it.name:'',gen:it?xgi(it.cat):(xlib.gens.length?'0':'none'),cat:it?it.cat:((xlib.gens[0]||{cats:[]}).cats[0]||'__new'),newcat:'',mat:it?xmats(it):[],
    video:it&&!own?it.video||'':'',file:own?decodeURIComponent(it.video.split('/').pop()):'',url:own?it.video:'',up:'',vmode:own?'file':'link',vs:it&&it.vs==='otro'?'otro':'mio',prog:it&&it.prog!=null?String(it.prog):'',tips:it?it.tips||'':''};
  S.x.view='edit';S.x.err='';S.x.msg='';}
function xEditHTML(){
  const d=S.x.ed,opts=d.gen==='none'?xloose():xlib.gens[+d.gen].cats;
  return `<article class="xdt"><div class="dhero"><div class="dht"><small>// ${d.i==null?'NUEVO EJERCICIO':'EDITAR EJERCICIO'}</small><h2>${esc(d.name||'Sin nombre')}</h2></div></div><div class="dbody xform">
  <label class="xfd"><span>Nombre</span><input id="xe-name" data-xe="name" value="${esc(d.name)}" placeholder="Dead bug con goma" autocomplete="off"></label>
  <div class="xtw"><label class="xfd"><span>Categoría general</span><select data-xe="gen">${xlib.gens.map((g,i)=>`<option value="${i}" ${String(i)===d.gen?'selected':''}>${esc(xnice(g.name))}</option>`).join('')}<option value="none" ${d.gen==='none'?'selected':''}>Sin general</option></select></label>
  <label class="xfd"><span>Categoría</span><select data-xe="cat">${opts.map(c=>`<option value="${esc(c)}" ${c===d.cat?'selected':''}>${esc(xnice(c))}</option>`).join('')}${d.gen!=='none'?`<option value="__new" ${d.cat==='__new'?'selected':''}>+ Nueva categoría…</option>`:''}</select></label></div>
  ${d.cat==='__new'?`<label class="xfd"><span>Nombre de la nueva categoría</span><input data-xe="newcat" value="${esc(d.newcat)}" autocomplete="off"></label>`:''}
  <div class="xfd"><span>Material</span><div class="xmc">${xallMats().map(m=>`<button data-x="em" data-k="${esc(m)}" aria-pressed="${d.mat.includes(m)}">${esc(m)}</button>`).join('')}</div></div>
  <div class="xfd"><span>Vídeo</span><div class="mode"><button data-x="vm" data-k="link" aria-pressed="${d.vmode==='link'}">Enlace de YouTube</button><button data-x="vm" data-k="file" aria-pressed="${d.vmode==='file'}">Subir archivo</button></div>
  ${d.vmode==='file'?`<label class="xup" for="xfile">${d.up==='busy'?'Subiendo vídeo…':d.file?`<b>${esc(d.file)}</b><small>Toca para cambiarlo</small>`:'<b>Elegir vídeo</b><small>.mp4, .mov o .webm · máximo 50 MB</small>'}</label><input type="file" id="xfile" accept="video/mp4,video/quicktime,video/webm" hidden><p class="hint" style="margin:0">Se guarda como vídeo tuyo y tus clientes lo ven dentro de la app.</p>`
  :`<input id="xe-video" data-xe="video" value="${esc(d.video)}" placeholder="https://youtube.com/shorts/…" inputmode="url" autocomplete="off"><div class="mode"><button data-x="vsel" data-k="mio" aria-pressed="${d.vs==='mio'}">Es mío</button><button data-x="vsel" data-k="otro" aria-pressed="${d.vs==='otro'}">De otro</button></div>`}
  ${d.video||d.url?'<button class="xlk" data-x="clrvid" style="justify-self:start">Quitar vídeo</button>':''}</div>
  <label class="xfd"><span>Progresión</span><select data-xe="prog"><option value="">Sin nivel</option>${[-3,-2,-1,0,1,2,3,4,5,6,7,8,9,10].map(n=>`<option value="${n}" ${String(n)===d.prog?'selected':''}>Nivel ${n>0?'+':''}${n}</option>`).join('')}</select></label>
  <label class="xfd"><span>Claves técnicas</span><textarea data-xe="tips" rows="3" placeholder="Lumbar pegada al suelo; Exhala al bajar">${esc(d.tips)}</textarea></label>
  ${S.x.err?`<div class="err" role="alert">${esc(S.x.err)}</div>`:''}
  <div class="tools"><button class="btn" data-x="save" ${S.x.busy?'disabled':''}>${S.x.busy?'Guardando…':'Guardar'}</button><button class="btn sec" data-x="back">Cancelar</button></div></div></article>`;
}
function xCatsHTML(){
  return `<article class="xdt"><div class="dhero"><div class="dht"><small>// ORGANIZAR</small><h2>Categorías</h2></div></div><div class="dbody"><p class="hint" style="margin:0">Escribe encima para cambiar un nombre. Con el desplegable mueves una categoría a otra general. Solo se puede borrar una categoría vacía.</p>${S.x.err?`<div class="err" role="alert">${esc(S.x.err)}</div>`:''}
  ${xgroups().map(g=>`<div class="xeg"><div class="xeh">${g.key==='none'?'<b class="dh3" style="margin:0">Sin categoría general</b>':`<input class="xbig" data-xrg="${g.key}" value="${esc(xnice(g.name))}" aria-label="Nombre de la categoría general"><button class="xlk" data-x="delgen" data-k="${g.key}">Borrar</button>`}</div>
  ${g.cats.map(c=>`<div class="xec"><input data-xrc="${esc(c)}" value="${esc(xnice(c))}" aria-label="Nombre de la categoría"><em>${xcnt(c)}</em><select data-xmv="${esc(c)}" aria-label="Mover a otra general">${xlib.gens.map((x,i)=>`<option value="${i}" ${xgenOf(c)===x?'selected':''}>${esc(xnice(x.name))}</option>`).join('')}${g.key==='none'?'<option value="none" selected>Sin general</option>':''}</select><button class="xdel" data-x="delcat" data-k="${esc(c)}" aria-label="Borrar ${esc(xnice(c))}" ${xcnt(c)?'disabled title="Tiene ejercicios: muévelos antes de borrarla"':''}>×</button></div>`).join('')}
  ${g.key!=='none'?`<div class="xec"><input id="xnc${g.key}" placeholder="Nueva categoría en ${esc(xnice(g.name))}" autocomplete="off"><button class="btn sec" data-x="addcat" data-k="${g.key}">Añadir</button></div>`:''}</div>`).join('')}
  <div class="xeg"><b class="dh3" style="margin:0">Nueva categoría general</b><div class="xec" style="padding:0"><input id="xng" placeholder="Potencia" autocomplete="off"><button class="btn" data-x="addgen">Añadir</button></div></div></div></article>`;
}
async function xsave(){
  const X=S.x,d=X.ed,name=d.name.trim(),fail=m=>{X.err=m;render()};
  if(!name)return fail('Ponle un nombre al ejercicio.');
  if(lib.some((it,i)=>i!==d.i&&String(it.name).trim()===name))return fail('Ya hay un ejercicio con ese nombre.');
  if(d.up==='busy')return fail('Espera a que termine de subir el vídeo.');
  const gens0=JSON.parse(JSON.stringify(xlib.gens)),lib0=JSON.parse(JSON.stringify(lib));
  let cat=d.cat;
  if(cat==='__new'){const v=d.newcat.trim();if(!v)return fail('Escribe el nombre de la nueva categoría.');const ya=xcats().find(c=>xnorm(c)===xnorm(v));if(ya)cat=ya;else{xlib.gens[+d.gen].cats.push(v);cat=v}}
  const video=d.vmode==='file'?d.url:d.video.trim();
  const rec={...(d.i!=null?lib[d.i]:{}),name,cat,mat:d.mat.join(', '),prog:d.prog,video,vs:video?(d.vmode==='file'?'mio':d.vs):'',tips:d.tips.trim()};
  const i=d.i==null?lib.length:d.i;lib[i]=rec;
  if(!await saveLib()){lib=lib0;xlib.gens=gens0;render();return}
  X.og.add(xgi(cat));X.oc.add(cat);X.sel=i;X.ed=null;X.view='det';X.msg=d.i==null?'Ejercicio creado':'Cambios guardados';render();
}
// Vídeo propio: se sube al almacén "videos" de Supabase (ver supabase/videos.sql)
async function xupload(file){
  const d=S.x.ed;if(!d)return;
  if(file.size>50*1024*1024){S.x.err='El vídeo pesa más de 50 MB. Recórtalo o expórtalo con menos calidad.';render();return}
  d.up='busy';S.x.err='';render();
  const ext=(file.name.match(/\.(mp4|mov|webm)$/i)||['','mp4'])[1].toLowerCase();
  const path=Date.now()+'-'+(xnorm(d.name||file.name).normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'video')+'.'+ext;
  const {error}=await sb.storage.from('videos').upload(path,file,{contentType:file.type||'video/mp4'});
  if(error){d.up='';S.x.err=/bucket|not found/i.test(error.message||'')?'Falta preparar el almacén de vídeos en Supabase (archivo supabase/videos.sql).':'No se pudo subir el vídeo: '+error.message;render();return}
  d.url=sb.storage.from('videos').getPublicUrl(path).data.publicUrl;d.file=file.name;d.up='ok';render();
}
// Cargar base desde el planificador Excel: hoja BASE_EJERCICIOSVIDEOS (ejercicios) y LISTAS (categorías generales)
async function xImport(file){
  S.x.imp='busy';S.x.impMsg='';S.x.err='';render();
  try{
    const sheets=await readXlsx(await file.arrayBuffer());
    if(!sheets['BASE_EJERCICIOSVIDEOS'])throw new Error('No encuentro la hoja "BASE_EJERCICIOSVIDEOS" en este Excel.');
    const b=await sheets['BASE_EJERCICIOSVIDEOS']();
    const s=v=>v==null?'':String(v).trim();let upd=0,add=0;const used=new Set();
    for(const r in b.rows){const x=b.rows[r],name=s(x[2]);if(+r<1||!name)continue;
      const link=/^https?:/.test(s(x[5]))?s(x[5]):'',mine=/m[ií]o/i.test(s(x[6]));
      // Primero el nombre exacto: hay ejercicios que solo se diferencian en mayúsculas (Peso Muerto / Peso muerto)
      const it=lib.find(y=>!used.has(y)&&s(y.name)===name)||lib.find(y=>!used.has(y)&&xnorm(y.name)===xnorm(name));if(it)used.add(it);
      const prog=typeof x[4]==='number'?String(Math.round(x[4])):s(x[4]);
      if(it){upd++;it.cat=s(x[1])||it.cat;it.mat=s(x[3])||it.mat||'';if(prog!=='')it.prog=prog;if(link&&!isFile(it.video))it.video=link;if(it.video&&!isFile(it.video))it.vs=mine?'mio':'otro'}
      else{add++;lib.push({name,cat:s(x[1]),mat:s(x[3]),prog,video:link,vs:link?(mine?'mio':'otro'):'',tips:''})}}
    // Categorías generales: en LISTAS, fila con "Estabilidad · Cadena_Posterior · Movilidad · Otro" y sus categorías debajo
    let gmsg='';
    if(!xlib.gens.length&&sheets['LISTAS']){const l=await sheets['LISTAS']();const rows=Object.keys(l.rows).map(Number).sort((a,b)=>a-b);
      const h=rows.find(r=>s(l.rows[r][2])==='Estabilidad'&&s(l.rows[r][3]));
      if(h!=null){const gens=[];for(let c=2;c<8;c++){const g=s(l.rows[h][c]);if(!g||/estado/i.test(g))continue;const cats=[];for(let r=h+1;r<h+30;r++){const v=s((l.rows[r]||{})[c]);if(!v)break;cats.push(xcats().find(y=>xnorm(y)===xnorm(v))||v)}gens.push({name:g,cats})}
        if(gens.length){xlib.gens=gens;gmsg=` y ${gens.length} categorías generales`}}}
    if(!await saveLib()){S.x.imp='';render();return}
    S.x.imp='';S.x.impMsg=`Listo: ${upd} ejercicios actualizados, ${add} nuevos${gmsg}.`;render();
  }catch(e){S.x.imp='';S.x.err=(e&&e.message)||'No se pudo leer el Excel.';render()}
}
async function xact(a,t){
  const X=S.x,k=t.dataset.k,tog=(set,v)=>set.has(v)?set.delete(v):set.add(v);
  if(a==='tf')tog(X.fo,k);
  else if(a==='tfg')tog(X.fg,k);
  else if(a==='tg')tog(t.dataset.t==='gen'?X.og:X.oc,k);
  else if(a==='fopen')X.fopen=!X.fopen;
  else if(a==='openall')xgroups().forEach(g=>{X.og.add(g.key);g.cats.forEach(c=>X.oc.add(c))});
  else if(a==='closeall'){X.og.clear();X.oc.clear()}
  else if(a==='clrcat')X.cats.clear();
  else if(a==='clrall'){X.cats.clear();X.vids.clear();if(xlib.have){xlib.have=null;saveLib()}}
  else if(a==='allmat'){xlib.have=null;saveLib()}
  else if(a==='nomat'){xlib.have=[];saveLib()}
  else if(a==='addmat'){const v=(document.getElementById('xnm').value||'').trim();if(v&&!xallMats().some(m=>m.toLowerCase()===v.toLowerCase())){xlib.mats.push(v);if(xlib.have)xlib.have.push(v);saveLib()}}
  else if(a==='row'){X.sel=+t.dataset.i;X.view='det';X.msg='';X.err='';if(!wide())scrollTo(0,0)}
  else if(a==='back'){X.view='list';X.ed=null;X.err=''}
  else if(a==='cats'){X.view='cats';X.err=''}
  else if(a==='new')xStartEdit(null);
  else if(a==='edit')xStartEdit(X.sel);
  else if(a==='editvid'){xStartEdit(X.sel);render();const v=document.getElementById('xe-video');if(v)v.focus();return}
  else if(a==='em'){const l=X.ed.mat;X.ed.mat=l.includes(k)?l.filter(y=>y!==k):[...l,k]}
  else if(a==='vm')X.ed.vmode=k;
  else if(a==='vsel')X.ed.vs=k;
  else if(a==='clrvid'){X.ed.video='';X.ed.url='';X.ed.file=''}
  else if(a==='save'){await xsave();return}
  else if(a==='delgen'){xlib.gens.splice(+k,1);X.fg.clear();X.og.clear();saveLib()}
  else if(a==='delcat'&&!xcnt(k)){xlib.gens.forEach(g=>{g.cats=g.cats.filter(y=>y!==k)});X.cats.delete(k);saveLib()}
  else if(a==='addcat'){const v=(document.getElementById('xnc'+k).value||'').trim();if(v&&!xtaken(v)){xlib.gens[+k].cats.push(v);saveLib()}}
  else if(a==='addgen'){const v=(document.getElementById('xng').value||'').trim();if(v&&!xlib.gens.some(g=>xnorm(g.name)===xnorm(v))){xlib.gens.push({name:v,cats:[]});saveLib()}}
  render();
}
// Cambios en casillas, desplegables y nombres de la pestaña Ejercicios
function xchange(t){
  const X=S.x,d=t.dataset;
  if(t.id==='xfile'){if(t.files&&t.files[0])xupload(t.files[0]);return true}
  if(t.id==='xxls'){if(t.files&&t.files[0])xImport(t.files[0]);return true}
  if(d.xe&&X.ed&&t.tagName==='SELECT'){if(d.xe==='gen'){X.ed.gen=t.value;const cs=t.value==='none'?xloose():xlib.gens[+t.value].cats;X.ed.cat=cs[0]||'__new'}else X.ed[d.xe]=t.value;render();return true}
  if(d.xrg!=null){const v=t.value.trim();if(v){xlib.gens[+d.xrg].name=v;saveLib()}render();return true}
  if(d.xrc!=null){const old=d.xrc,v=t.value.trim();if(v&&xnorm(v)!==xnorm(old)&&!xtaken(v)){lib.forEach(x=>{if(x.cat===old)x.cat=v});xlib.gens.forEach(g=>{g.cats=g.cats.map(c=>c===old?v:c)});if(X.cats.delete(old))X.cats.add(v);if(X.oc.delete(old))X.oc.add(v);saveLib()}render();return true}
  if(d.xmv!=null){xlib.gens.forEach(g=>{g.cats=g.cats.filter(y=>y!==d.xmv)});if(t.value!=='none')xlib.gens[+t.value].cats.push(d.xmv);saveLib();render();return true}
  if(d.xf){const f=d.xf,v=t.value;
    if(f==='gen')xgroups().find(g=>g.key===v).cats.forEach(c=>t.checked?X.cats.add(c):X.cats.delete(c));
    else if(f==='cat')t.checked?X.cats.add(v):X.cats.delete(v);
    else if(f==='vid')t.checked?X.vids.add(v):X.vids.delete(v);
    else if(f==='mat'){const h=new Set(xlib.have||xallMats());t.checked?h.add(v):h.delete(v);xlib.have=h.size===xallMats().length?null:[...h];saveLib()}
    render();return true}
  return false;
}

/* ---------- programador de rutinas (editor del entrenador) ---------- */
// Editar rutina o plantilla: base de ejercicios a la izquierda (arrastrar o «+»), el día por bloques en el centro y la ficha del ejercicio a la derecha.
// En el móvil, base y ficha suben como paneles. Guarda en el formato de siempre: block = nombre del bloque, ss = superserie.
S.p={q:'',cats:new Set(),vids:new Set(),fopen:false,fo:new Set(['cat']),fg:new Set(),sel:null,lib:false,undo:null,ls:0,prog:false,P:{kg:2.5,reps:0,series:0}};
const PDEF=['Movilidad','Estabilizadores','Fuerza 1','Fuerza 2'];
const PI={
  grip:'<svg width="14" height="20" viewBox="0 0 14 20" fill="currentColor" aria-hidden="true"><circle cx="4" cy="4" r="1.8"/><circle cx="10" cy="4" r="1.8"/><circle cx="4" cy="10" r="1.8"/><circle cx="10" cy="10" r="1.8"/><circle cx="4" cy="16" r="1.8"/><circle cx="10" cy="16" r="1.8"/></svg>',
  plus:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  vid:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="3"/><path d="M17 10l4-2.5v9L17 14" stroke-linejoin="round"/></svg>',
  x:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
const pday=()=>edit.model.weeks[S.w].days[S.d];
const pblocks=d=>groupsOf(d.items).map(g=>g.items);
const pss=b=>b.length>1&&isSS({block:b[0].block,items:b});
const pset=(d,bs)=>{d.items=bs.filter(b=>b.length).flat()};
// Nombre de un bloque nuevo: el primero de los de base que no esté ya en el día; si no, «Bloque 5»…
function pnew(items,i){const used=new Set(items.map(x=>bname(x.block)));return PDEF.find(n=>!used.has(n))||'Bloque '+(i+1)}
function pfind(){const bs=pblocks(pday());for(let b=0;b<bs.length;b++){const p=bs[b].findIndex(x=>x.id===S.p.sel);if(p>=0)return {b,p,blk:bs[b],x:bs[b][p]}}return null}
// Tiempo estimado: ~40 s de trabajo por serie más el descanso
const psecs=r=>{r=String(r||'').trim();let m;if(m=r.match(/^(\d+):(\d+)/))return +m[1]*60+ +m[2];if(m=r.match(/^(\d+(?:[.,]\d+)?)\s*min/))return parseFloat(m[1].replace(',','.'))*60;if(m=r.match(/^(\d+)/))return +m[1];return 60};
function pmin(d){let t=0;pblocks(d).forEach(b=>{if(pss(b))t+=(+b[0].series||3)*(b.length*40+psecs(b[0].rest));else b.forEach(x=>{t+=isCardio(x)?(+x.series||10)*60:(+x.series||3)*(40+psecs(x.rest))})});return Math.max(5,Math.round(t/60/5)*5)}
const pgen=c=>{const g=xlib.gens.find(g=>g.cats.includes(c));return xnice(g?g.name:c?'Sin categoría general':'Sin categoría')};

function editorView(){
  const m=edit.model;normNav(m);const wk=m.weeks[S.w],d=wk.days[S.d],nw=m.weeks.length,P=S.p;
  const insp=!!pfind()&&!wide();
  return `<div class="pg${P.lib&&!wide()?' libopen':''}${insp?' inspopen':''}" id="pg">
  <header class="pg-top"><div class="pg-tb"><div class="pg-brand"><span class="pg-mb">MB</span><span><b>MARCOS BUSTAMANTE</b><small>Programador de rutinas</small></span></div><div class="pg-acts"><button class="pg-btn ghost" data-act="canceled">Cancelar</button><button class="pg-btn" data-act="saveed" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar'}</button></div></div>
  <p class="pg-eyb">// ${esc(edit.label)}</p><input class="pg-ttl" id="ttl" value="${esc(m.title)}" aria-label="Título de la rutina" autocomplete="off"><div class="pg-wkp"><span>Semana ${S.w+1} de ${nw}</span><i><b style="width:${(S.w+1)/nw*100}%"></b></i></div></header>
  ${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}
  <div class="pg-shell"><aside class="pg-lib" aria-label="Base de ejercicios">${plibHTML()}</aside>
  <main class="pg-plan"><div class="pg-nav"><div class="pg-row">${m.weeks.map((w,i)=>`<button class="pg-pill" data-w="${i}" aria-pressed="${i===S.w}">${esc(w.name)}</button>`).join('')}<button class="pg-pill prog" data-p="prog">Copiar con progresión</button><button class="pg-pill add" data-act="addwk">+ Semana</button></div>
  <div class="pg-row">${wk.days.map((x,i)=>`<button class="pg-pill" data-d="${i}" aria-pressed="${i===S.d}">${esc(x.name)}</button>`).join('')}<button class="pg-pill add" data-act="addday">+ Día</button></div></div>
  <div class="pg-names"><label>Semana<input data-wf="name" value="${esc(wk.name)}"></label><label>Día<input data-df="name" value="${esc(d.name)}"></label></div>
  <div class="pg-tools"><button class="pg-lnk" data-act="delday">Quitar este día</button><button class="pg-lnk" data-act="delwk">Quitar esta semana</button></div>
  <div class="pg-sum" id="pg-sum">${psumHTML()}</div><div id="pg-day">${pdayHTML()}</div>
  <button class="pg-free" data-p="free">+ Ejercicio que no está en la base</button>${importCard()}</main>
  <aside class="pg-insp" aria-label="Ficha del ejercicio">${pinspHTML()}</aside></div>
  <div class="pg-mbar"><button class="pg-btn add" data-p="openlib">+ Añadir ejercicios</button><button class="pg-btn ghost" data-act="saveed" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar'}</button></div>
  <div class="pg-scrim" data-pscrim></div>${P.prog?pprogHTML():''}</div>`;
}
function psumHTML(){
  const d=pday();if(!d.items.length)return '';
  const by={};d.items.forEach(x=>{const g=pgen(x.cat);by[g]=(by[g]||0)+(parseInt(x.series)||0)});
  const max=Math.max(1,...Object.values(by));
  return `<div class="pg-st"><div><small>Ejercicios</small><b>${d.items.length}</b></div><div><small>Bloques</small><b>${pblocks(d).length}</b></div><div><small>Duración</small><b>≈${pmin(d)}<em>min</em></b></div></div>
  <div class="pg-sg"><small>Series por grupo</small>${Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="pg-sgr"><span>${esc(k)}</span><i><b style="width:${v/max*100}%"></b></i><em>${v}</em></div>`).join('')}</div>`;
}
function pdayHTML(){
  const bs=pblocks(pday());
  if(!bs.length)return `<div class="pg-empty pg-gap" data-at="0"><b>Día vacío</b>${wide()?'Arrastra aquí ejercicios desde la base de la izquierda.':'Pulsa «+ Añadir ejercicios» abajo.'}</div>`;
  const gap=i=>`<div class="pg-gap" data-at="${i}">Nuevo bloque</div>`;
  return bs.map((b,bi)=>{const ss=pss(b),f=b[0],many=b.length>1;
    return gap(bi)+`<section class="pg-blk${ss?' ss':''}" data-b="${bi}"><div class="pg-bh"><input class="pg-bnm" data-bn="${bi}" value="${esc(bname(f.block))}" placeholder="Sin nombre" aria-label="Nombre del bloque" autocomplete="off"></div>`
      +(many?`<div class="pg-bmode"><div class="pg-mode" role="group" aria-label="Tipo de bloque"><button data-p="bmode" data-b="${bi}" data-m="ss" aria-pressed="${ss}">Superserie</button><button data-p="bmode" data-b="${bi}" data-m="normal" aria-pressed="${!ss}">Series normales</button></div><small>${ss?`${esc(f.series||'?')} rondas · ${esc(f.rest||'sin descanso')}`:'Cada uno entero'}</small></div>`:'')
      +b.map((x,p)=>`<div class="pg-ex" data-id="${x.id}" data-b="${bi}" data-p2="${p}"${x.id===S.p.sel?' aria-current="true"':''}><span class="pg-grip" aria-hidden="true">${PI.grip}</span><div class="pg-exb"><b>${esc(x.name)}</b><span><em>${esc(x.series||'?')} × ${esc(x.reps||'?')}</em>${x.kg?' · '+esc(n$(x.kg)):''}${!ss&&x.rest?' · '+esc(x.rest):''}</span></div>${x.video?`<span class="pg-vid" title="Tiene vídeo">${PI.vid}</span>`:''}</div>`).join('')
      +`</section>`}).join('')+gap(bs.length);
}
// Lista de la base con los filtros de la pestaña Ejercicios (categoría, material que tengo y vídeo)
function plist(){const P=S.p,q=P.q.trim().toLowerCase();
  return lib.map((it,i)=>({it,i})).filter(({it})=>(!P.cats.size||P.cats.has(it.cat))&&(!P.vids.size||P.vids.has(xvs(it)))&&xmats(it).every(xhas)&&(!q||(it.name+' '+xnice(it.cat)+' '+(it.mat||'')).toLowerCase().includes(q)))}
const pnAct=()=>S.p.cats.size+S.p.vids.size+(xlib.have?1:0);
const pck=(f,v,l,on,n,ind)=>`<label class="xck"><input type="checkbox" data-pf="${f}" value="${esc(v)}" ${on?'checked':''} ${ind?'data-ind':''}>${esc(l)}${n!=null?`<em>${n}</em>`:''}</label>`;
const psec=(k,t,sum,links,inner)=>{const o=S.p.fo.has(k);return `<div class="xfs"><button class="xft" data-p="tf" data-k="${k}" aria-expanded="${o}">${XCV}<b>${t}</b><small>${sum}</small></button>${o?`${links?`<div class="xfl">${links}</div>`:''}<div class="xfin">${inner}</div>`:''}</div>`};
function pfiltersHTML(){
  const P=S.p,ms=xallMats(),nh=ms.filter(xhas).length;
  return `<div class="xfp">`
  +psec('cat','Categoría',P.cats.size?`${P.cats.size} marc.`:'Todas',P.cats.size?'<button class="xlk" data-p="clrcat">Quitar</button>':'',
    xgroups().map(g=>{const n=g.cats.filter(c=>P.cats.has(c)).length,all=g.cats.length>0&&n===g.cats.length,o=P.fg.has(g.key);
      return `<div class="xgh">${pck('gen',g.key,xnice(g.name),all,null,n&&!all)}<button class="xgt" data-p="tfg" data-k="${g.key}" aria-expanded="${o}" aria-label="Ver categorías de ${esc(xnice(g.name))}">${XCV}</button></div>${o?`<div class="xsub">${g.cats.map(c=>pck('cat',c,xnice(c),P.cats.has(c),xcnt(c))).join('')}</div>`:''}`}).join('')||'<p class="hint">Aún no hay categorías.</p>')
  +psec('mat','Material que tengo',xlib.have?`${nh}/${ms.length}`:'Todo','<button class="xlk" data-p="allmat">Todo</button><button class="xlk" data-p="nomat">Nada</button>',
    `<p class="hint">Solo salen los ejercicios que puedes hacer con lo marcado.</p>${ms.map(m=>pck('mat',m,m,xhas(m))).join('')}`)
  +psec('vid','Vídeo',P.vids.size?`${P.vids.size} marc.`:'Todos','',Object.keys(XVS).map(v=>pck('vid',v,XVS[v],P.vids.has(v),lib.filter(i=>xvs(i)===v).length)).join(''))
  +`${pnAct()?'<button class="xlk" data-p="clrall">Quitar todos los filtros</button>':''}</div>`;
}
function plibListHTML(){
  const P=S.p,list=plist(),inDay=new Set(pday().items.map(x=>x.name)),n=pnAct();
  const cats=[...xgroups().flatMap(g=>g.cats),''].filter(c=>list.some(({it})=>(it.cat||'')===c));
  return `${n&&!P.fopen?`<p class="pg-fsum">${list.length} de ${lib.length} ejercicios con filtros</p>`:''}${P.fopen?pfiltersHTML():''}`
   +(cats.length?cats.map(c=>`<div class="pg-lc">// ${esc(xnice(c)||'Sin categoría')}</div>`+list.filter(({it})=>(it.cat||'')===c).map(({it,i})=>`<div class="pg-li" data-lib="${i}"><span class="pg-grip" aria-hidden="true">${PI.grip}</span><div class="pg-lt"><b>${esc(it.name)}</b><small>${esc(it.mat||'Sin material')}${it.video?' · vídeo':''}${inDay.has(it.name)?' · <i>ya en este día</i>':''}</small></div><button class="pg-plus" data-p="addlib" data-i="${i}" aria-label="Añadir ${esc(it.name)} al día">${PI.plus}</button></div>`).join('')).join('')
   :`<div class="pg-none">${lib.length?'Ningún ejercicio coincide con los filtros.':'Tu base de ejercicios está vacía. Créala en la pestaña Ejercicios.'}</div>`);
}
function plibHTML(){
  const n=pnAct();
  return `<div class="pg-handle"></div><div class="pg-lh"><h2>Base de ejercicios<button class="pg-x" data-p="closelib" aria-label="Cerrar">${PI.x}</button></h2><div class="pg-sr"><input id="pg-q" type="search" placeholder="Buscar ejercicio" value="${esc(S.p.q)}" autocomplete="off"><button class="pg-fbtn" data-p="fopen" aria-expanded="${S.p.fopen}">Filtros${n?` <span class="dot2">${n}</span>`:''}${XCV}</button></div></div><div class="pg-ll" id="pg-ll">${plibListHTML()}</div>`;
}
function pinspHTML(){
  const s=pfind();
  if(!s)return `<div class="pg-hello"><h3>Cómo se usa</h3><ol class="pg-steps"><li><span>Arrastra un ejercicio de la base a un hueco <b>entre bloques</b>: crea un bloque nuevo.</span></li><li><span>Suéltalo <b>encima de otro ejercicio</b>: entra en su bloque. Debajo del nombre del bloque eliges <b>Superserie</b> o <b>Series normales</b>.</span></li><li><span>Toca el nombre del bloque para cambiarlo.</span></li><li><span>Arrastra los del día para cambiar el orden.</span></li><li><span>Toca un ejercicio para poner series, repeticiones, carga y descanso.</span></li></ol><p class="pg-note">En el móvil, mantén el dedo sobre los puntitos para arrastrar.</p></div>`;
  const {blk,x}=s,ss=pss(blk),other=blk.filter(y=>y!==x).map(y=>y.name),l=lib.find(y=>y.name===x.name)||{};
  const qs=(f,vals)=>vals.map(v=>`<button class="pg-q" data-p="qv" data-f="${f}" data-v="${esc(v)}" aria-pressed="${String(x[f])===v}">${esc(v)}</button>`).join('');
  const inp=(f,extra)=>`<input id="pg-${f}" data-pi="${f}" value="${esc(x[f])}" autocomplete="off" ${extra||''}>`;
  const cardio=isCardio(x);
  return `<div class="pg-handle"></div><div class="pg-ih"><div><span class="pg-eyb">// ${esc(bname(x.block)||'Sin bloque')}${ss?' · Superserie':''}</span><h3>${esc(x.name)}</h3><small>${esc(xnice(x.cat)||'Sin categoría')}${l.mat?' · '+esc(l.mat):''}</small></div><button class="pg-x" data-p="closeinsp" aria-label="Cerrar">${PI.x}</button></div>
  <div class="pg-ib">${ss?`<p class="pg-note">Superserie con ${esc(other.join(' y '))}. Las series y el descanso son los mismos para todo el bloque.</p>`:''}
  <div class="pg-fld"><label for="pg-name">Ejercicio</label>${inp('name','list="lib" class="w"')}</div>
  <div class="pg-fld"><label for="pg-series">${cardio?'Duración (min)':ss?'Rondas (series del bloque)':'Series'}</label><div class="pg-fl">${inp('series','inputmode="numeric"')}${cardio?'':qs('series',['2','3','4','5'])}</div></div>
  <div class="pg-fld"><label for="pg-reps">${cardio?'Intensidad':'Repeticiones'}</label><div class="pg-fl">${inp('reps')}${cardio?'':qs('reps',['5','6','8','10','12','15'])}</div></div>
  ${cardio?'':`<div class="pg-fld"><label for="pg-kg">Carga</label><div class="pg-fl">${inp('kg','class="w" placeholder="20 kg, RIR 2, banda roja…"')}<button class="pg-q" data-p="kg" data-v="-2.5">−2,5</button><button class="pg-q" data-p="kg" data-v="2.5">+2,5</button></div></div>`}
  <div class="pg-fld"><label for="pg-rest">${ss?'Descanso entre rondas':'Descanso'}</label><div class="pg-fl">${inp('rest')}${qs('rest',['45 s','60 s','90 s','2 min','3 min'])}</div></div>
  <div class="pg-fld"><label for="pg-tips">Claves técnicas</label><textarea id="pg-tips" data-pi="tips" placeholder="Clave 1; clave 2">${esc(x.tips)}</textarea></div>
  <div class="pg-fld"><label for="pg-video">Vídeo (archivo o enlace)</label>${inp('video','class="w" inputmode="url" placeholder="videos/ejercicio.mp4 o enlace de YouTube"')}</div>
  <div class="pg-iacts">${blk.length>1?'<button class="pg-btn sec" data-p="split">Sacar del bloque</button>':''}<button class="pg-btn sec" data-p="dup">Duplicar</button><button class="pg-btn warn" data-p="del">Quitar</button></div></div>`;
}
// Repinta solo el día y el resumen (para no perder el foco al escribir)
function prepaint(){const a=document.getElementById('pg-day'),b=document.getElementById('pg-sum');if(a)a.innerHTML=pdayHTML();if(b)b.innerHTML=psumHTML()}
let ptt;function ptoast(msg,undo){let t=document.getElementById('pg-toast');if(!t){t=document.createElement('div');t.id='pg-toast';t.className='pg-toast';document.body.append(t)}
  t.innerHTML=`<span>${esc(msg)}</span>${undo?'<button data-p="undo">Deshacer</button>':''}`;t.hidden=false;clearTimeout(ptt);ptt=setTimeout(()=>{t.hidden=true},undo?5000:2200)}
function pflash(id){setTimeout(()=>{const e=document.querySelector(`.pg-ex[data-id="${id}"]`);if(e){e.classList.add('new');e.scrollIntoView({block:'nearest',behavior:'smooth'})}},0)}
const psnap=()=>{S.p.undo=JSON.stringify(edit.model)};

/* colocar un ejercicio: desde la base ({lib:i}) o moviéndolo ({id}); destino {gap:i} = bloque nuevo, {b,pos} = dentro del bloque b */
function pfromLib(i){const l=lib[i];return {id:uid(),block:'',cat:l.cat||'',name:l.name,series:'3',reps:'10',kg:'',rest:'60 s',video:l.video||'',tips:l.tips||'',ss:false}}
function pplace(src,t){
  const d=pday(),bs=pblocks(d);let x,keep='';
  if(src.id){
    let sb=-1,sp=-1;bs.forEach((b,bi)=>{const p=b.findIndex(y=>y.id===src.id);if(p>=0){sb=bi;sp=p}});if(sb<0)return;x=bs[sb][sp];
    if(t.gap!=null){if(bs[sb].length===1&&(t.gap===sb||t.gap===sb+1))return}
    else if(t.b===sb&&(t.pos===sp||t.pos===sp+1))return;
    psnap();bs[sb].splice(sp,1);const gone=!bs[sb].length;
    if(t.gap!=null){if(gone&&sb<t.gap)t.gap--}
    else{if(t.b===sb&&sp<t.pos)t.pos--;if(gone&&sb<t.b)t.b--}
    if(gone){bs.splice(sb,1);keep=x.block} // un bloque de un solo ejercicio conserva su nombre al moverlo
  }else{psnap();x=src.x||pfromLib(src.lib)}
  if(t.gap!=null){x.block=keep||pnew(bs.flat(),t.gap);x.ss=false;bs.splice(t.gap,0,[x])}
  else{const b=bs[t.b],ss=pss(b);
    if(!b[0].block){const nm=pnew(bs.flat(),t.b);b.forEach(y=>y.block=nm)}
    b.forEach(y=>y.ss=ss);x.block=b[0].block;x.ss=ss;if(ss){x.series=b[0].series;x.rest=b[0].rest}b.splice(t.pos,0,x)}
  pset(d,bs);if(wide())S.p.sel=x.id; // en el móvil no abre la ficha al añadir o mover
  render();pflash(x.id);
  if(!src.id&&!wide())ptoast(x.name+' añadido');
}

/* arrastrar con ratón o dedo (Pointer Events: Mac, iPhone y Android) */
let pdg=null,pjust=false;
function ptarget(cx,cy){
  const el=document.elementFromPoint(cx,cy);if(!el)return null;const bs=pblocks(pday());
  const g=el.closest('.pg-gap');if(g)return {el:g,cls:'ov',t:{gap:+g.dataset.at},txt:'Nuevo bloque'};
  const ex=el.closest('.pg-ex');if(ex){const r=ex.getBoundingClientRect(),after=cy>r.top+r.height/2,b=+ex.dataset.b;return {el:ex,cls:after?'ov-b':'ov-t',t:{b,pos:+ex.dataset.p2+(after?1:0)},txt:'Al bloque '+(bname(bs[b][0].block)||'sin nombre')}}
  const bk=el.closest('.pg-blk');if(bk){const b=+bk.dataset.b;return {el:bk,cls:'ov',t:{b,pos:bs[b].length},txt:'Al bloque '+(bname(bs[b][0].block)||'sin nombre')}}
  if(el.closest('.pg-plan'))return {el:null,t:{gap:bs.length},txt:'Nuevo bloque'};
  return null;
}
const pclear=()=>document.querySelectorAll('.pg .ov,.pg .ov-t,.pg .ov-b').forEach(e=>e.classList.remove('ov','ov-t','ov-b'));
function pstart(){
  pdg.on=true;const root=document.getElementById('pg');root&&root.classList.add('dragging');
  const g=document.createElement('div');g.className='pg-drg';g.innerHTML=`<b>${esc(pdg.name)}</b><small>Suelta en el día</small>`;document.body.append(g);pdg.g=g;
  if(pdg.src.id){const e=document.querySelector(`.pg-ex[data-id="${pdg.src.id}"]`);e&&e.classList.add('src')}
  navigator.vibrate&&navigator.vibrate(15);pmove(pdg.x,pdg.y);pauto();
}
function pmove(cx,cy){
  pdg.x=cx;pdg.y=cy;pdg.g.style.left=cx+'px';pdg.g.style.top=cy+'px';
  pclear();const h=ptarget(cx,cy);pdg.h=h;if(h&&h.el)h.el.classList.add(h.cls);
  pdg.g.querySelector('small').textContent=h?'→ '+h.txt:'Suelta en el día';
}
function pauto(){if(!pdg||!pdg.on)return;const m=70;let v=0;if(pdg.y<m)v=-12;else if(pdg.y>innerHeight-m-(wide()?0:70))v=12;if(v){scrollBy(0,v);pmove(pdg.x,pdg.y)}requestAnimationFrame(pauto)}
function pend(drop){
  if(!pdg)return;clearTimeout(pdg.lp);const d=pdg;pdg=null;
  if(!d.on)return;
  pjust=true;setTimeout(()=>{pjust=false},50);pclear();d.g.remove();
  const root=document.getElementById('pg');if(root)root.classList.remove('dragging');
  document.querySelectorAll('.pg-ex.src').forEach(e=>e.classList.remove('src'));
  if(drop&&d.h){if(d.src.lib!=null&&!wide())S.p.lib=false;pplace(d.src,d.h.t)}
}
document.addEventListener('pointerdown',e=>{
  if(!edit||e.button||!e.target.closest)return;
  const ex=e.target.closest('.pg-ex'),li=e.target.closest('.pg-li');
  if(!ex&&!li||e.target.closest('button,input'))return;
  const touch=e.pointerType!=='mouse',onGrip=!!e.target.closest('.pg-grip');
  pdg={src:ex?{id:ex.dataset.id}:{lib:+li.dataset.lib},name:(ex||li).querySelector('b').textContent,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,on:false,ready:!touch||onGrip};
  // Con el dedo fuera de los puntitos: mantener pulsado 0,35 s para arrastrar (así deslizar sigue haciendo scroll)
  if(touch&&!onGrip)pdg.lp=setTimeout(()=>{if(pdg){pdg.ready=true;pstart()}},350);
});
addEventListener('pointermove',e=>{
  if(!pdg)return;if(pdg.on){pmove(e.clientX,e.clientY);return}
  const dist=Math.hypot(e.clientX-pdg.x0,e.clientY-pdg.y0);
  if(!pdg.ready){if(dist>8){clearTimeout(pdg.lp);pdg=null}return}
  if(dist>6){pdg.x=e.clientX;pdg.y=e.clientY;pstart()}
});
addEventListener('pointerup',()=>pend(true));
addEventListener('pointercancel',()=>{if(pdg&&pdg.on)return;pend(false)});
document.addEventListener('touchmove',e=>{if(pdg&&(pdg.on||pdg.ready)){e.preventDefault();const p=e.touches[0];if(pdg.on&&p)pmove(p.clientX,p.clientY)}},{passive:false});
// Respaldo por si el navegador corta los eventos de puntero durante el arrastre con el dedo
document.addEventListener('touchend',()=>{if(pdg&&pdg.on)pend(true)});
document.addEventListener('contextmenu',e=>{if(edit&&e.target.closest&&e.target.closest('.pg-ex,.pg-li'))e.preventDefault()});
document.addEventListener('scroll',e=>{if(e.target&&e.target.id==='pg-ll')S.p.ls=e.target.scrollTop},true);

/* progresión al copiar semana */
const pfmt=v=>String(Math.round(v*100)/100).replace('.',',');
function pbumpKg(v,d){if(!d)return v;const m=String(v).match(/^(\D*?)(\d+(?:[.,]\d+)?)(\s*(?:kg.*)?)$/i);if(!m||/[a-z]/i.test(m[1]))return v;return m[1]+pfmt(Math.max(0,parseFloat(m[2].replace(',','.'))+d))+m[3]}
function pbumpReps(v,d){if(!d)return v;v=String(v);let m;if(m=v.match(/^(\d+)$/))return String(+m[1]+d);if(m=v.match(/^(\d+)\s*-\s*(\d+)$/))return (+m[1]+d)+'-'+(+m[2]+d);return v}
function pprogHTML(){
  const m=edit.model,w=m.weeks[S.w],P=S.p.P,n=m.weeks.length+1;
  const o=(k,vals,lab)=>`<div class="pg-fld"><label>${lab}</label><div class="pg-fl">${vals.map(v=>`<button class="pg-q" data-p="pv" data-k="${k}" data-v="${v}" aria-pressed="${P[k]===v}">${v>0?'+':''}${pfmt(v)}</button>`).join('')}</div></div>`;
  return `<div class="pg-modal" data-pmodal><div class="pg-mbox" role="dialog" aria-label="Copiar con progresión"><div class="pg-mhd"><span class="pg-eyb">// Progresión · Semana ${n}</span><h3>Copiar ${esc(w.name)}</h3></div>
  <p>Crea la Semana ${n} igual que ${esc(w.name)} y aplica estos cambios a todos los ejercicios. La carga solo cambia cuando es un número de kg.</p>
  ${o('kg',[0,1,2.5,5],'Carga (kg)')}${o('reps',[0,1,2],'Repeticiones')}${o('series',[0,1],'Series')}
  <div class="pg-iacts end"><button class="pg-btn sec" data-p="closeprog">Cancelar</button><button class="pg-btn" data-p="doprog">Crear Semana ${n}</button></div></div></div>`;
}

/* clics, escritura y cambios del programador */
function pclick(e){
  if(pjust){e.preventDefault();return true}
  const t=e.target.closest('button'),P=S.p;
  if(!t){
    if(e.target.matches('[data-pscrim]')){P.lib=false;P.sel=null;render();return true}
    if(e.target.matches('[data-pmodal]')){P.prog=false;render();return true}
    const ex=e.target.closest('.pg-ex');if(ex){P.sel=ex.dataset.id;render();return true}
    return false;
  }
  const a=t.dataset.p;if(!a)return false;
  const k=t.dataset.k,tog=(set,v)=>set.has(v)?set.delete(v):set.add(v),s=pfind();
  if(a==='openlib')P.lib=true;
  else if(a==='closelib')P.lib=false;
  else if(a==='closeinsp')P.sel=null;
  else if(a==='addlib'){pplace({lib:+t.dataset.i},{gap:pblocks(pday()).length});return true}
  else if(a==='free'){pplace({x:{id:uid(),block:'',cat:'',name:'Nuevo ejercicio',series:'3',reps:'10',kg:'',rest:'60 s',video:'',tips:'',ss:false}},{gap:pblocks(pday()).length});P.sel=pday().items[pday().items.length-1].id;render();return true}
  else if(a==='fopen')P.fopen=!P.fopen;
  else if(a==='tf')tog(P.fo,k);
  else if(a==='tfg')tog(P.fg,k);
  else if(a==='clrcat')P.cats.clear();
  else if(a==='clrall'){P.cats.clear();P.vids.clear();if(xlib.have){xlib.have=null;saveLib()}}
  else if(a==='allmat'){xlib.have=null;saveLib()}
  else if(a==='nomat'){xlib.have=[];saveLib()}
  else if(a==='bmode'){psnap();const b=pblocks(pday())[+t.dataset.b];if(b){if(t.dataset.m==='ss')syncSS({items:b});else b.forEach(y=>y.ss=false)}}
  else if(a==='prog')P.prog=true;
  else if(a==='closeprog')P.prog=false;
  else if(a==='pv')P.P[k]=+t.dataset.v;
  else if(a==='doprog'){const m=edit.model,c=JSON.parse(JSON.stringify(m.weeks[S.w]));c.name='Semana '+(m.weeks.length+1);
    c.days.forEach(d=>d.items.forEach(x=>{x.id=uid();if(!isCardio(x)){x.kg=pbumpKg(x.kg,P.P.kg);x.reps=pbumpReps(x.reps,P.P.reps)}if(P.P.series&&/^\d+$/.test(x.series))x.series=String(+x.series+P.P.series)}));
    m.weeks.push(c);S.w=m.weeks.length-1;S.d=0;P.sel=null;P.prog=false;render();ptoast(c.name+' creada');return true}
  else if(a==='undo'){if(P.undo){edit.model=JSON.parse(P.undo);P.undo=null;P.sel=null;const tt=document.getElementById('pg-toast');if(tt)tt.hidden=true}}
  else if(s&&a==='qv'){const f=t.dataset.f;(pss(s.blk)&&(f==='series'||f==='rest')?s.blk:[s.x]).forEach(y=>y[f]=t.dataset.v)}
  else if(s&&a==='kg'){const m=String(s.x.kg).match(/(\d+(?:[.,]\d+)?)/),base=m?parseFloat(m[1].replace(',','.')):0,v=pfmt(Math.max(0,base+ +t.dataset.v));s.x.kg=m?String(s.x.kg).replace(m[1],v):v+' kg'}
  else if(s&&a==='del'){psnap();const bs=pblocks(pday());bs[s.b].splice(s.p,1);pset(pday(),bs);P.sel=null;render();ptoast(s.x.name+' quitado',true);return true}
  else if(s&&a==='dup'){psnap();const c={...s.x,id:uid(),ss:false},bs=pblocks(pday());c.block=pnew(pday().items,s.b+1);bs.splice(s.b+1,0,[c]);pset(pday(),bs);P.sel=c.id;render();pflash(c.id);return true}
  else if(s&&a==='split'){pplace({id:s.x.id},{gap:s.b+1});P.sel=s.x.id;render();return true}
  else return false;
  render();return true;
}
function pinput(t){
  if(t.id==='pg-q'){S.p.q=t.value;S.p.ls=0;const l=document.getElementById('pg-ll');if(l){l.innerHTML=plibListHTML();l.scrollTop=0}return true}
  const f=t.dataset.pi,s=f&&pfind();if(!s)return !!f;
  (pss(s.blk)&&(f==='series'||f==='rest')?s.blk:[s.x]).forEach(y=>y[f]=t.value);
  prepaint();document.querySelectorAll(`.pg-insp .pg-q[data-f="${f}"]`).forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===t.value));
  return true;
}
function pchange(t){
  const d=t.dataset;
  if(d.wf||d.df){render();return true}
  // Nombre de un ejercicio de la base: trae su categoría, vídeo y claves
  if(d.pi==='name'){const s=pfind(),l=lib.find(x=>x.name===t.value);if(s&&l){s.x.cat=l.cat||s.x.cat;s.x.video=l.video||'';if(l.tips)s.x.tips=l.tips}render();return true}
  if(d.bn!=null){const bs=pblocks(pday()),i=+d.bn;if(!bs[i])return true;let v=t.value.trim()||pnew(pday().items,i);
    // Dos bloques seguidos con el mismo nombre se juntarían: se añade un número
    const nb=j=>bs[j]&&bname(bs[j][0].block)===v;if(nb(i-1)||nb(i+1))v+=' 2';
    psnap();bs[i].forEach(y=>y.block=v);render();return true}
  if(d.pf){const f=d.pf,v=t.value,P=S.p;
    if(f==='gen')xgroups().find(g=>g.key===v).cats.forEach(c=>t.checked?P.cats.add(c):P.cats.delete(c));
    else if(f==='cat')t.checked?P.cats.add(v):P.cats.delete(v);
    else if(f==='vid')t.checked?P.vids.add(v):P.vids.delete(v);
    else if(f==='mat'){const h=new Set(xlib.have||xallMats());t.checked?h.add(v):h.delete(v);xlib.have=h.size===xallMats().length?null:[...h];saveLib()}
    render();return true}
  return false;
}

/* ---------- render ---------- */
function render(){
  let h;
  switch(S.state){
    case 'loading':h=head('<h1>Mi rutina</h1>','Cargando…');break;
    case 'noconfig':h=noconfigView();break;
    case 'login':h=loginView();break;
    case 'offline':h=offlineView();break;
    case 'setpw':h=setpwView();break;
    case 'coach':h=coachView();break;
    default:h=clientView();
  }
  document.getElementById('app').innerHTML=`<div class="wrap${S.state==='coach'&&wide()?(S.prevOn?' wed':' wide'):''}">${S.off?'<div class="offb" role="status">Sin conexión. Vuelve a conectarte para guardar o enviar.</div>':''}${h}</div>`;
  let dl=document.getElementById('lib');
  if(!dl){dl=document.createElement('datalist');dl.id='lib';document.body.append(dl)}
  document.querySelectorAll('.cl').forEach(e=>{e.scrollTop=e.scrollHeight});
  dl.innerHTML=lib.map(x=>`<option value="${esc(x.name)}">`).join('');
  document.querySelectorAll('[data-ind]').forEach(x=>{x.indeterminate=true});
  document.body.classList.toggle('pgon',S.state==='coach'&&!!edit&&!S.prevOn);
  const pl=document.getElementById('pg-ll');if(pl)pl.scrollTop=S.p.ls;
}

/* ---------- acciones ---------- */
const werr=e=>e&&e.message?('No se pudo guardar: '+e.message):'No se pudo guardar. Prueba de nuevo.';
function saveDraft(){saveJ('rutina-draft-'+me.id,draft)}
async function act(a,t){
  if(a==='logout'){S.menu=false;S.prevOn=false;S.prev=null;clearInterval(restIv);restTimer=null;await sb.auth.signOut();me=null;routine=null;sessions=[];selClient=null;edit=null;finish=null;S.state='login';S.err='';render();return}
  if(a==='cmsend'){const sid=t.dataset.sid,inp=document.getElementById('cm-'+sid),body=(inp?inp.value:'').trim();if(!body)return;
    inp.disabled=true;const {error}=await sb.from('session_comments').insert({session_id:sid,author_id:me.id,body});
    if(error){inp.disabled=false;alert('No se pudo enviar: '+error.message);return}
    S.cmd[sid]='';await loadComments([sid]);render();const n=document.getElementById('cm-'+sid);if(n)n.focus();return}
  if(a==='openses'){selClient=t.dataset.cid;S.open.add(t.dataset.sid);markSeen(t.dataset.sid);S.err='';cSessions=[];render();loadClientSessions(selClient);if(!wide())markRead(selClient);return}
  if(a==='seen'){markSeen(t.dataset.sid);render();return}
  if(a==='ckind'){S.chatKind=S.chatKind===t.dataset.k?null:t.dataset.k;render();return}
  if(a==='mf'){S.mf=t.dataset.k;render();return}
  if(a==='chatsend'){const cid=t.dataset.cid,inp=document.getElementById('chat-in'),text=(inp.value||'').trim(),kind=S.chatKind;if(!text&&!kind)return;
    inp.disabled=true;const {error}=await sb.from('messages').insert({client_id:cid,author_id:me.id,body:text||KIND[kind],kind});
    if(error){inp.disabled=false;alert('No se pudo enviar: '+error.message);return}
    S.chatDraft[cid]='';S.chatKind=null;await loadMsgs();render();const n=document.getElementById('chat-in');if(n)n.focus();return}
  if(a==='exmsg'){const day=routine.weeks[S.w].days[S.d];S.exm={name:t.dataset.name,ctx:day.name,kind:null,text:''};render();return}
  if(a==='ekind'){S.exm.kind=S.exm.kind===t.dataset.k?null:t.dataset.k;render();return}
  if(a==='excancel'){S.exm=null;render();return}
  if(a==='exsend'){const e=S.exm;if(!e.text.trim()&&!e.kind)return;
    const {error}=await sb.from('messages').insert({client_id:me.id,author_id:me.id,body:e.text.trim()||KIND[e.kind],kind:e.kind,ex_name:e.name,ctx:e.ctx});
    if(error){alert('No se pudo enviar: '+error.message);return}
    S.exm=null;S.toast='Enviado a tu entrenador ✓';await loadMsgs();render();setTimeout(()=>{S.toast='';render()},2500);return}
  if(a==='retry'){S.state='loading';render();if(sb)await enter();else boot();return}
  if(a==='welcomeok'){const w=document.getElementById('wname'),nm=w&&w.value.trim();if(nm){const {error}=await sb.rpc('set_name',{n:nm});if(!error)me.name=nm}S.welcome=false;try{localStorage.setItem('welcome-'+me.id,'1')}catch(e){}render();return}
  if(a==='photo'){S.menu=false;render();document.getElementById('avf').click();return}
  if(a==='rmphoto'){S.menu=false;await setAvatar(null);return}
  if(a==='menu'){S.menu=!S.menu;S.opts=false;render();return}
  if(a==='opts'){S.opts=!S.opts;S.menu=false;render();return}
  if(a==='theme'){setTheme(t.dataset.t,true);render();return}
  if(a==='chpw'){S.menu=false;S.chpw=true;S.err='';S.state='setpw';render();return}
  if(a==='cancelpw'){S.chpw=false;S.err='';await enter();return}
  if(a==='forgot'){S.forgot=true;S.err='';S.info='';render();return}
  if(a==='backlogin'){S.forgot=false;S.err='';S.info='';render();return}
  if(a==='tog'){clearRo(t);const it=findEx(t.dataset.ex);const s=dget(it)[+t.dataset.i];s.done=!s.done;saveDraft();bexNext(t);if(s.done&&restSecs(it.rest)){startRest(restSecs(it.rest));return}render();return}
  if(a==='rest'){restTimer?stopRest():startRest(60);return}
  if(a==='restadd'){if(restTimer){restTimer.end+=15000;restTimer.dur+=15000;render()}return}
  if(a==='restskip'){stopRest();return}
  if(a==='round'){clearRo(t);const ids=t.dataset.ids.split(','),i=+t.dataset.i;const its=ids.map(findEx);const all=its.every(it=>dget(it)[i].done);its.forEach(it=>{dget(it)[i].done=!all});saveDraft();const rs=Math.max(0,...its.map(it=>restSecs(it.rest)));if(!all&&rs){startRest(rs);return}render();return}
  if(a==='fin'){finish={effort:0,notes:''};S.err='';render();return}
  if(a==='vid'){const id=t.dataset.id;S.vid.has(id)?S.vid.delete(id):S.vid.add(id);render();return}
  if(a==='cancelfin'){finish=null;render();return}
  if(a==='hechook'){S.hecho=null;render();return}
  if(a==='hechochat'){S.hecho=null;S.tab='chat';render();if(me)markRead(me.id);return}
  if(a==='effort'||a==='savesession'){
    if(S.busy||isDone(S.w,S.d))return;if(a==='effort')finish.effort=+t.dataset.n;
    S.busy=true;S.err='';render();
    const day=routine.weeks[S.w].days[S.d];
    const items=day.items.map(it=>({id:it.id,block:it.block||'',name:it.name,cat:it.cat||'',plan:{series:it.series||'',reps:it.reps||'',kg:it.kg||''},sets:dget(it).map(s=>({kg:s.kg,reps:s.reps,done:s.done}))}));
    const {data:ns,error}=await sb.from('sessions').insert({client_id:me.id,week:S.w,day:S.d,wname:routine.weeks[S.w].name,dname:day.name,notes:finish.notes,items}).select('id').single();
    if(error){S.busy=false;S.err=werr(error);render();return}
    // El esfuerzo va en una tabla aparte que el cliente puede escribir pero no leer
    if(finish.effort){const {error:ee}=await sb.from('session_effort').insert({session_id:ns.id,client_id:me.id,effort:finish.effort});if(ee)console.warn('esfuerzo no guardado',ee)}
    S.busy=false;
    S.hecho={ef:finish.effort};delete draft[dkey()];saveDraft();finish=null;S.tab='rutina';S.auto=true;await loadClient();render();scrollTo(0,0);return;
  }
  /* entrenador */
  if(a==='preview'){
    const {data,error}=await sb.from('routines').select('title,data').eq('client_id',selClient).maybeSingle();
    if(error||!data){S.err=error?werr(error):'Este cliente aún no tiene rutina.';render();return}
    S.prev={routine,sessions,draft};routine={title:data.title,weeks:data.data.weeks};sessions=[];draft={};S.w=0;S.d=0;S.err='';S.prevOn=true;render();scrollTo(0,0);return;
  }
  if(a==='endpreview'){const p=S.prev;if(p){routine=p.routine;sessions=p.sessions;draft=p.draft}S.prev=null;S.prevOn=false;S.w=0;S.d=0;render();return}
  if(a==='reload'){await loadCoach();return}
  if(a==='addcli'){S.inv={em:''};render();const i=document.getElementById('inem');i&&i.focus();return}
  if(a==='addclix'){S.inv=null;render();return}
  if(a==='search'){S.q=S.q==null?'':null;render();if(S.q!=null){const q=document.getElementById('cq');q&&q.focus()}return}
  if(a==='pick'){selClient=t.dataset.id;S.err='';cSessions=[];render();loadClientSessions(selClient);if(!wide())markRead(selClient);return}
  if(a==='pickchat'){selClient=t.dataset.id;S.err='';cSessions=[];render();loadClientSessions(selClient);markRead(selClient);return}
  if(a==='sub'){S.tab='actividad';S.sub=t.dataset.k;if(t.dataset.keep==null)selClient=null;S.err='';render();if(S.sub==='chats'&&selClient)markRead(selClient);return}
  if(a==='ficha'){S.tab='clientes';S.err='';render();return}
  if(a==='cf'){S.cf=t.dataset.k;render();return}
  if(a==='backc'){selClient=null;S.err='';render();return}
  if(a==='savename'){const v=document.getElementById('cname').value.trim();const {error}=await sb.from('profiles').update({name:v||null}).eq('id',selClient);if(error)S.err=werr(error);else{S.err='';clients.find(c=>c.id===selClient).name=v}render();return}
  if(a==='newtpl'){const d={title:'Mi rutina',weeks:[{name:'Semana 1',days:[{name:'Día 1',items:[]}]}]};const {error}=await sb.from('templates').upsert({id:'base',data:d});if(error){S.err=werr(error);render()}else{tpl=d;render()}return}
  if(a==='edittpl'){startEdit('tpl',tpl,'Plantilla base');return}
  if(a==='pcsel'){selClient=selClient===t.dataset.id?null:t.dataset.id;S.err='';render();return}
  if(a==='pcf'){S.pc.f=t.dataset.k;render();return}
  if(a==='progcli'){const id=selClient;if(!id)return;S.err='';
    if(assigned.has(id)){await act('editr',t);return}
    // Sin rutina: empieza desde la plantilla base (o vacía) y se crea al pulsar Guardar
    const c=tpl?JSON.parse(JSON.stringify(tpl)):{title:'Mi rutina',weeks:[{name:'Semana 1',days:[{name:'Día 1',items:[]}]}]};c.weeks.forEach(w=>w.days.forEach(d=>d.items.forEach(i=>i.id=uid())));
    startEdit('routine',c,'Rutina nueva de '+label(clients.find(x=>x.id===id)));return}
  if(a==='editr'){const {data,error}=await sb.from('routines').select('title,data').eq('client_id',selClient).single();if(error){S.err=werr(error);render();return}startEdit('routine',{title:data.title,weeks:data.data.weeks},'Rutina de '+label(clients.find(c=>c.id===selClient)));return}
  if(a==='assign'){
    const c=JSON.parse(JSON.stringify(tpl));c.weeks.forEach(w=>w.days.forEach(d=>d.items.forEach(i=>i.id=uid())));
    const {error}=await sb.from('routines').upsert({client_id:selClient,title:c.title,data:{weeks:c.weeks},updated_at:new Date().toISOString()});
    if(error)S.err=werr(error);else{S.err='';assigned.add(selClient)}render();return;
  }
  if(a==='canceled'){edit=null;S.err='';render();return}
  if(a==='saveed'){
    S.busy=true;S.err='';render();
    const m=edit.model;let error;
    if(edit.kind==='tpl'){({error}=await sb.from('templates').upsert({id:'base',data:{title:m.title,weeks:m.weeks}}));if(!error)tpl={title:m.title,weeks:m.weeks}}
    else{({error}=await sb.from('routines').upsert({client_id:selClient,title:m.title,data:{weeks:m.weeks},updated_at:new Date().toISOString()}));if(!error){assigned.add(selClient);rupd[selClient]=new Date().toISOString()}}
    S.busy=false;if(error){S.err=werr(error);render();return}
    edit=null;render();return;
  }
  /* editor */
  const m=edit&&edit.model;
  if(m){
    const wk=m.weeks[S.w],day=wk.days[S.d];
    if(a==='addex')day.items.push({id:uid(),block:((day.items[day.items.length-1]||{}).block)||'',cat:'',name:'Nuevo ejercicio',series:'3',reps:'10',kg:'',rest:'',video:''});
    else if(a==='del')day.items.splice(+t.dataset.i,1);
    else if(a==='bmode'){const g=groupsOf(day.items).find(x=>x.start===+t.dataset.i);if(g){if(t.dataset.m==='ss')syncSS(g);else g.items.forEach(it=>it.ss=false)}}
    else if(a==='up'||a==='down'){const i=+t.dataset.i,j=a==='up'?i-1:i+1;if(day.items[j])[day.items[i],day.items[j]]=[day.items[j],day.items[i]]}
    else if(a==='addday'){wk.days.push({name:'Día '+(wk.days.length+1),items:[]});S.d=wk.days.length-1}
    else if(a==='delday'){wk.days.splice(S.d,1);S.d=0}
    else if(a==='addwk'){m.weeks.push({name:'Semana '+(m.weeks.length+1),days:[{name:'Día 1',items:[]}]});S.w=m.weeks.length-1;S.d=0}
    else if(a==='dupwk'){const c=JSON.parse(JSON.stringify(wk));c.name='Semana '+(m.weeks.length+1);c.days.forEach(d=>d.items.forEach(i=>i.id=uid()));m.weeks.push(c);S.w=m.weeks.length-1;S.d=0}
    else if(a==='delwk'){if(m.weeks.length>1){m.weeks.splice(S.w,1);S.w=0;S.d=0}else S.err='Tiene que quedar al menos una semana.'}
    render();
  }
}
/* ---------- importar Excel (hoja Plan_SS1) ---------- */
async function parsePlan(buf){
  const sheets=await readXlsx(buf);
  if(!sheets['Plan_SS1'])throw new Error('No encuentro la hoja "Plan_SS1" en este Excel.');
  const vids={};
  if(sheets['BASE_EJERCICIOSVIDEOS']){
    const b=await sheets['BASE_EJERCICIOSVIDEOS']();
    for(const r in b.rows){const x=b.rows[r];if(+r>0&&x[2]&&typeof x[5]==='string'&&/^https?:/.test(x[5]))vids[String(x[2]).trim().toLowerCase()]=x[5].trim()}
  }
  const sh=await sheets['Plan_SS1']();
  const raw=(r,c)=>{
    let v=(sh.rows[r]||{})[c];
    if(v===undefined){const m=sh.merges.find(m=>r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2);if(m)v=(sh.rows[m.r1]||{})[m.c1]}
    return v===undefined?'':v;
  };
  const txt=(r,c)=>{const v=raw(r,c);return typeof v==='number'?String(Math.round(v*100)/100):String(v).trim()};
  // Superserie en el Excel: series y descanso en una casilla combinada para todo el bloque
  const merged=(r,c)=>sh.merges.some(m=>m.r2>m.r1&&r>=m.r1&&r<=m.r2&&c>=m.c1&&c<=m.c2);
  const starts=[];
  for(let r=0;r<=sh.maxR;r++)if(/^semana\s*\d+/i.test(txt(r,1)))starts.push(r);
  const weeks=[],noVideo=new Set();let total=0;
  starts.forEach((st,wi)=>{
    const end=wi+1<starts.length?starts[wi+1]:sh.maxR+1;
    const wk={name:'Semana '+(txt(st,1).match(/\d+/)||[wi+1])[0],days:[]};
    [1,11,21].forEach((dc,di)=>{
      const nm=txt(st+1,dc);
      const day={name:/^d[ií]a/i.test(nm)?nm:'Día '+(di+1),items:[]};
      let block='';
      for(let r=st+2;r<end;r++){
        const bt=txt(r,dc);
        if(/bloque\s*:/i.test(bt)){block=bt;continue}
        const name=txt(r,dc+2);
        if(!name||name==='Ejercicio'||/bloque/i.test(txt(r,dc)))continue;
        const video=vids[name.toLowerCase()]||(lib.find(x=>x.name===name)||{}).video||'';
        if(!video)noVideo.add(name);
        day.items.push({id:uid(),block,cat:txt(r,dc+1),name,series:txt(r,dc+4),reps:txt(r,dc+5),kg:txt(r,dc+6),rest:txt(r,dc+8),video,_m:merged(r,dc+4)||merged(r,dc+8)});
        total++;
      }
      groupsOf(day.items).forEach(g=>{if(!g.block)return;const ss=g.items.length>1&&g.items.every(it=>it._m);if(ss)syncSS(g);else g.items.forEach(it=>it.ss=false)});
      day.items.forEach(it=>delete it._m);
      if(day.items.length)wk.days.push(day);
    });
    if(wk.days.length)weeks.push(wk);
  });
  if(!weeks.length)throw new Error('La hoja Plan_SS1 no tiene ejercicios.');
  return{weeks,total,noVideo:[...noVideo]};
}
async function importForClient(file){
  S.err='';
  try{
    const r=await parsePlan(await file.arrayBuffer());
    let title='Mi rutina';
    if(assigned.has(selClient)){const {data}=await sb.from('routines').select('title').eq('client_id',selClient).single();if(data&&data.title)title=data.title}
    startEdit('routine',{title,weeks:r.weeks},'Rutina de '+label(clients.find(c=>c.id===selClient)));
    edit.imp={ok:true,text:`Cargada${r.weeks.length>1?'s':''} ${r.weeks.length} semana${r.weeks.length>1?'s':''} y ${r.total} ejercicios desde "${file.name}". Revisa y pulsa Guardar para dársela a este cliente (o Cancelar para descartarlo).`,noVideo:r.noVideo};
    render();
  }catch(e){S.err=(e&&e.message)||'No se pudo leer el Excel.';render()}
}
async function importXlsx(file){
  edit.imp={busy:true};render();
  try{
    const r=await parsePlan(await file.arrayBuffer());
    edit.model.weeks=r.weeks;S.w=0;S.d=0;
    edit.imp={ok:true,text:`Cargada${r.weeks.length>1?'s':''} ${r.weeks.length} semana${r.weeks.length>1?'s':''} y ${r.total} ejercicios desde "${file.name}". Revisa y pulsa Guardar para aplicarlo (o Cancelar para descartarlo).`,noVideo:r.noVideo};
  }catch(e){edit.imp={err:(e&&e.message)||'No se pudo leer el Excel.'}}
  render();
}
function startEdit(kind,data,label){edit={kind,label,model:JSON.parse(JSON.stringify({title:data.title,weeks:data.weeks}))};S.w=0;S.d=0;S.err='';S.p.sel=null;S.p.lib=false;S.p.prog=false;S.p.undo=null;render();scrollTo(0,0)}

/* ---------- eventos ---------- */
document.addEventListener('submit',async e=>{
  e.preventDefault();const id=e.target.id;
  const val=i=>(document.getElementById(i)||{}).value||'';
  S.err='';S.info='';
  if(id==='fLogin'){
    const em=val('em').trim(),pw=val('pw');
    S.busy=true;render();
    const {error}=await sb.auth.signInWithPassword({email:em,password:pw});
    S.busy=false;
    if(error){S.err='Correo o contraseña incorrectos.';render();return}
    await enter();return;
  }
  if(id==='fInvite'){
    const v=S.inv,em=val('inem').trim().toLowerCase();v.em=em;v.err='';v.ok='';v.busy=true;render();
    const {data,error}=await sb.functions.invoke('invitar-cliente',{body:{email:em,redirectTo:location.origin+location.pathname}});
    v.busy=false;
    // Si la función responde con error, saca el mensaje que manda
    if(error){let m='No se pudo enviar la invitación.';try{const j=await error.context.json();if(j&&j.error)m=j.error}catch(x){}v.err=m}
    else{v.ok='Invitación enviada a '+em+'.';v.em=''}
    render();if(!error){const i=document.getElementById('inem');i&&i.focus()}return;
  }
  if(id==='fForgot'){
    const em=val('em').trim();
    S.busy=true;render();
    await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
    S.busy=false;S.info='Si el correo existe, recibirás un enlace en unos minutos.';render();return;
  }
  if(id==='fSetpw'){
    const pw=val('pw'),nm=val('nm').trim();S.nm=nm;
    const miss=PWR.filter(([re])=>!re.test(pw)).map(x=>x[2]);
    if(miss.length){S.err='A tu contraseña le falta: '+miss.join(', ')+'.';render();return}
    S.busy=true;S.busyTxt='Comprobando…';render();
    if(await pwned(pw)){S.busy=false;S.err='Esa contraseña ha aparecido en filtraciones de internet y no es segura. Elige otra distinta.';render();return}
    S.busyTxt='Guardando…';render();
    const {error}=await sb.auth.updateUser({password:pw});
    S.busy=false;
    if(error){S.err=error.code==='weak_password'||/weak|password should/i.test(error.message||'')?'La contraseña no cumple los requisitos de seguridad. Revisa la lista y prueba otra.':error.code==='same_password'?'La contraseña nueva tiene que ser distinta de la anterior.':error.message;render();return}
    if(nm)await sb.rpc('set_name',{n:nm});
    S.chpw=false;S.linkName=null;history.replaceState(null,'',location.pathname);await enter();
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='pw'){const l=document.getElementById('pwreq');if(l)l.innerHTML=pwReqHTML(t.value);return}
  if(t.classList&&t.classList.contains('cm-in')){S.cmd[t.dataset.sid]=t.value;return}
  if(t.id==='inem'&&S.inv){S.inv.em=t.value;return}
  if(t.id==='pcq'){S.pc.q=t.value;const l=document.getElementById('pclist');if(l)l.innerHTML=pcListHTML();return}
  if(t.id==='cq'){S.q=t.value;const l=document.getElementById('clist');if(l)l.innerHTML=clistHTML();return}
  if(t.id==='xq'){S.x.q=t.value;const l=document.getElementById('xlist');if(l)l.innerHTML=xListHTML();return}
  if(t.dataset.xe&&S.x.ed&&t.tagName!=='SELECT'){S.x.ed[t.dataset.xe]=t.value;return}
  if(t.id==='chat-in'){S.chatDraft[isCoach()?selClient:me.id]=t.value;return}
  if(t.id==='exm-t'&&S.exm){S.exm.text=t.value;return}
  if(t.id==='ttl'&&edit){edit.model.title=t.value;return}
  if(edit&&pinput(t))return;
  if(t.id==='fnote'&&finish){finish.notes=t.value;return}
  if(edit){
    const wk=edit.model.weeks[S.w];
    if(t.dataset.wf){wk.name=t.value;return}
    if(t.dataset.df){wk.days[S.d].name=t.value;return}
    if(t.dataset.f){const it=wk.days[S.d].items.find(x=>x.id===t.dataset.id);if(it)it[t.dataset.f]=t.value;return}
    if(t.dataset.bf){const g=groupsOf(wk.days[S.d].items).find(x=>x.start===+t.dataset.i);if(g)g.items.forEach(it=>it[t.dataset.bf]=t.value);return}
  }
  if(t.dataset.fld&&routine){const it=findEx(t.dataset.ex);dget(it)[+t.dataset.i][t.dataset.fld]=t.value;saveDraft()}
});
// Superserie: al completar una serie se queda abierta y la siguiente no se abre sola.
// Series normales: se cierra el ejercicio hecho y se abre el siguiente.
function clearRo(t){const d=t.closest&&t.closest('details[data-b]');if(!d)return;
  if(d.classList.contains('round')){document.querySelectorAll('details.round').forEach(x=>{if(x.dataset.b===d.dataset.b)S.ro[x.dataset.k]=x.open});return}
  Object.keys(S.ro).forEach(k=>{if(k.indexOf(d.dataset.b)===0)delete S.ro[k]})}
// Series normales: el ejercicio sigue abierto hasta completarlo; entonces se cierra y se abre el siguiente sin terminar.
function bexNext(t){const d=t.closest&&t.closest('details.bex');if(!d)return;const exOf=x=>{const q=x.querySelector('[data-ex]');return q&&findEx(q.dataset.ex)},it=exOf(d);if(!it)return;
  if(!dget(it).every(s=>s.done)){S.ro[d.dataset.k]=true;return}
  S.ro[d.dataset.k]=false;const bs=[...d.parentElement.querySelectorAll('details.bex')],nx=bs.slice(bs.indexOf(d)+1).find(x=>{const e=exOf(x);return e&&dget(e).some(s=>!s.done)});
  if(nx)S.ro[nx.dataset.k]=true}
function autoNext(t){
  const it=findEx(t.dataset.ex);if(!it)return;const i=+t.dataset.i,st=dget(it)[i];
  const lk=((lastSets(it)||[])[i]||{}).kg,hasKg=!!st.kg||/^\d/.test(lk||'')||/^\d/.test(it.kg||'');
  const noLoad=!it.kg&&!lk;
  if(!st.reps||st.done||!(hasKg||noLoad))return;
  st.done=true;saveDraft();
  const d=t.closest('details[data-b]');
  clearRo(t);bexNext(t);
  let rest=0,stay=false;
  if(d&&d.classList.contains('round')){const ids=[...new Set([...d.querySelectorAll('[data-ex]')].map(x=>x.dataset.ex))];
    if(ids.every(id=>{const s=dget(findEx(id))[i];return !s||s.done})){stay=true;rest=Math.max(0,...ids.map(id=>restSecs(findEx(id).rest)))}}
  else rest=restSecs(it.rest);
  const cur=t.dataset.ex+'|'+i;
  if(rest)startRest(rest);else render();
  if(stay){document.activeElement&&document.activeElement.blur&&document.activeElement.blur();return}
  setTimeout(()=>{
    const all=[...document.querySelectorAll('input[data-fld=kg]')].filter(x=>x.offsetParent!==null&&!(dget(findEx(x.dataset.ex))[+x.dataset.i]||{}).done);
    const at=[...document.querySelectorAll('input[data-fld=kg]')].findIndex(x=>x.dataset.ex+'|'+x.dataset.i===cur);
    const all2=[...document.querySelectorAll('input[data-fld=kg]')];
    const nx=all.find(x=>all2.indexOf(x)>at)||all[0];
    if(nx){nx.focus();nx.select&&nx.select()}
  },60);
}
async function setAvatar(url){
  const {error}=await sb.rpc('set_avatar',{url});
  if(error){alert('No se pudo guardar la foto: '+error.message);return}
  me.avatar_url=url;render();
}
function resizeImg(file,n=192){return new Promise((ok,ko)=>{const im=new Image(),u=URL.createObjectURL(file);im.onload=()=>{const s=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=n;c.getContext('2d').drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,n,n);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.82))};im.onerror=()=>ko(new Error('Imagen no válida'));im.src=u})}
document.addEventListener('change',async e=>{
  if(e.target.id==='avf'){const f=e.target.files[0];if(!f)return;try{await setAvatar(await resizeImg(f))}catch(x){alert(x.message)}return}
  const t=e.target;
  if(isCoach()&&S.tab==='ejercicios'&&!edit&&xchange(t))return;
  if(t.dataset&&t.dataset.fld==='reps'&&routine&&S.tab!=='chat'&&!edit){autoNext(t);return}
  if(t.id==='xlsf'&&edit&&t.files&&t.files[0]){importXlsx(t.files[0]);return}
  if(t.id==='xlsc'&&selClient&&t.files&&t.files[0]){importForClient(t.files[0]);return}
  if(edit&&pchange(t))return;
  if(edit&&t.dataset.f==='name'){
    const l=lib.find(x=>x.name===t.value);
    if(l){const it=edit.model.weeks[S.w].days[S.d].items.find(x=>x.id===t.dataset.id);it.cat=l.cat||it.cat;it.video=l.video||'';setTimeout(render,0)}
  }
});
document.addEventListener('click',e=>{
  if((S.menu||S.opts)&&!e.target.closest('.menuw')){S.menu=false;S.opts=false;render()}
  const sm=e.target.closest('summary');
  if(sm&&!e.target.closest('button')&&sm.parentElement.dataset.k){const d=sm.parentElement;setTimeout(()=>{S.ro[d.dataset.k]=d.open},0)}
  if(edit&&!S.prevOn&&pclick(e))return;
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.go){const el=document.getElementById(t.dataset.go);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});return}
  const y=scrollY;
  if(t.dataset.tab){S.tab=t.dataset.tab;S.hecho=null;selClient=null;S.err='';render();if(S.tab==='chat'&&me)markRead(me.id);return}
  if(t.dataset.w!==undefined){S.w=+t.dataset.w;S.d=0;if(S.state==='client'&&routine&&!S.prevOn){const d=firstFree(S.w);if(d>=0)S.d=d}render();scrollTo(0,y);return}
  if(t.dataset.d!==undefined){S.d=+t.dataset.d;render();scrollTo(0,y);return}
  if(t.dataset.x){const a=t.dataset.x;xact(a,t).then(()=>{if(a!=='row')scrollTo(0,y)});return}
  if(t.dataset.act)act(t.dataset.act,t).then(()=>scrollTo(0,y));
});
boot();

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList&&(e.target.classList.contains('cm-in')||e.target.id==='chat-in')){e.preventDefault();const b=e.target.parentElement.querySelector('[data-act=cmsend],[data-act=chatsend]');if(b)b.click()}
  // Ejercicios: Enter en "añadir material/categoría" pulsa su botón; en un nombre, lo guarda
  const id=e.target.id||'';if(e.key==='Enter'&&(id==='xnm'||id==='xng'||id.startsWith('xnc'))){e.preventDefault();const b=e.target.parentElement.querySelector('[data-x]');if(b)b.click()}
  if(e.key==='Enter'&&e.target.dataset&&(e.target.dataset.xrg!=null||e.target.dataset.xrc!=null)){e.preventDefault();e.target.blur()}});
setInterval(async()=>{if(!me||!sb||document.hidden||S.exm||S.state==='login')return;try{await loadMsgs();if(isCoach()){const [c,r]=await Promise.all([sb.from('profiles').select('id,email,name,role,avatar_url').eq('role','client').order('email'),sb.from('routines').select('client_id,updated_at')]);if(!c.error&&!r.error){clients=c.data||[];assigned=new Set((r.data||[]).map(x=>x.client_id));rupd=Object.fromEntries((r.data||[]).map(x=>[x.client_id,x.updated_at]))}}const c=isCoach()?(!wide()||deskChat()?selClient:null):(S.tab==='chat'?me.id:null);if(c)await markRead(c);soft()}catch(e){}},15000);
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details.ses')){const id=d.dataset.sid;if(d.open)S.open.add(id);else S.open.delete(id)}},true);

addEventListener('offline',()=>{S.off=true;render()});addEventListener('online',()=>{S.off=false;render()});
