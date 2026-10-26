/* Mi Rutina: cuentas por invitación, rutinas, registro de sesiones y panel del entrenador. */
const PLAY='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const FEEL=['Muy dura','Dura','Normal','Bien','Genial'];
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const uid=()=>'e'+Math.random().toString(36).slice(2,9);
const fdate=iso=>{try{return new Date(iso).toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'})}catch(e){return ''}};
const n$=v=>/^\d+([.,]\d+)?$/.test(String(v).trim())?String(v).trim()+' kg':v;
const CFG=window.APP_CONFIG||{};
const configured=!!(CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!CFG.SUPABASE_URL.includes('PEGA_AQUI'));
const FROM_LINK=/type=(invite|recovery)/.test(location.hash);
let sb=null,me=null;
let S={state:'loading',tab:'rutina',w:0,d:0,err:'',info:'',busy:false,forgot:false};
let routine=null,sessions=[],draft={},clients=[],assigned=new Set(),tpl=null,lib=[],selClient=null,cSessions=[],edit=null,finish=null;
const loadJ=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch(e){return f}};
const saveJ=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const label=c=>(c&&(c.name||c.email))||'Cliente';
const soft=()=>{const a=document.activeElement;if(a&&a.matches&&a.matches('input,textarea'))return;render()};
const isCoach=()=>me&&me.role==='admin';

/* ---------- arranque y sesión ---------- */
async function boot(){
  render();
  if(!configured){S.state='noconfig';render();return}
  sb=supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
  sb.auth.onAuthStateChange(ev=>{if(ev==='PASSWORD_RECOVERY'){S.state='setpw';render()}});
  const {data}=await sb.auth.getSession();
  if(FROM_LINK){S.state=data.session?'setpw':'login';render();return}
  if(data.session)await enter();else{S.state='login';render()}
}
async function enter(){
  const {data:{user}}=await sb.auth.getUser();
  if(!user){S.state='login';render();return}
  const {data,error}=await sb.from('profiles').select('*').eq('id',user.id).single();
  if(error||!data){S.state='login';S.err='No se pudo cargar tu perfil. Avisa a tu entrenador.';render();return}
  me=data;draft=loadJ('rutina-draft-'+me.id,{});S.err='';selClient=null;edit=null;finish=null;S.w=0;S.d=0;S.tab=isCoach()?'clientes':'rutina';
  if(isCoach()){S.state='coach';render();await loadCoach()}else{S.state='client';render();await loadClient()}
}
async function loadClient(){
  const [r,s]=await Promise.all([
    sb.from('routines').select('title,data').eq('client_id',me.id).maybeSingle(),
    sb.from('sessions').select('*').eq('client_id',me.id).order('performed_at',{ascending:false}).limit(40)]);
  routine=r.data?{title:r.data.title,weeks:r.data.data.weeks}:null;
  sessions=(s.data||[]).map(x=>({...x,date:x.performed_at}));
  soft();
}
async function loadCoach(){
  const [c,r,t]=await Promise.all([
    sb.from('profiles').select('id,email,name,role').eq('role','client').order('email'),
    sb.from('routines').select('client_id'),
    sb.from('templates').select('id,data')]);
  clients=c.data||[];assigned=new Set((r.data||[]).map(x=>x.client_id));
  const base=(t.data||[]).find(x=>x.id==='base'),lb=(t.data||[]).find(x=>x.id==='lib');
  tpl=base?base.data:null;lib=lb?(lb.data.items||[]):[];
  soft();
}
async function loadClientSessions(id){
  const {data}=await sb.from('sessions').select('*').eq('client_id',id).order('performed_at',{ascending:false}).limit(30);
  cSessions=(data||[]).map(x=>({...x,date:x.performed_at}));soft();
}

/* ---------- piezas comunes ---------- */
const head=(t,sub)=>`<header>${t}<div class="sub">${sub||''}</div></header>`;
const topbar=()=>me?`<div class="topbar"><button class="linkb" data-act="logout">Salir (${esc(me.email)})</button></div>`:'';
function facts(it){
  const f=[];
  if(it.cat==='Cardio'){if(it.series)f.push(['Duración',it.series+' min','big']);if(it.reps)f.push(['Intensidad',it.reps]);}
  else{if(it.series)f.push(['Series',it.series,'big']);if(it.reps)f.push(['Reps',it.reps,'big']);if(it.kg)f.push(['Carga',n$(it.kg)]);}
  if(it.rest)f.push(['Descanso',it.rest]);
  return f;
}
const factHTML=f=>f.map(([l,v,c])=>`<div class="fact ${c||''}"><small>${l}</small>${esc(v)}</div>`).join('');
const vidHTML=it=>it.video?`<a class="vid" href="${esc(it.video)}" target="_blank" rel="noopener">${PLAY}Ver vídeo</a>`:'<span class="novid">Sin vídeo</span>';
function nav(m,withAdd){
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
function loginView(){
  if(S.forgot)return head('<h1>Mi rutina</h1>','')+`<form class="auth" id="fForgot"><p class="hint">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p><label>Correo<input type="email" id="em" autocomplete="email" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}${S.info?`<div class="ok" role="status">${esc(S.info)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Enviando…':'Enviar enlace'}</button><button type="button" class="linkb" data-act="backlogin">Volver</button></form>`;
  return head('<h1>Mi rutina</h1>','Entra con tu cuenta')+`<form class="auth" id="fLogin"><label>Correo<input type="email" id="em" autocomplete="email" required></label><label>Contraseña<input type="password" id="pw" autocomplete="current-password" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Entrando…':'Entrar'}</button><button type="button" class="linkb" data-act="forgot">He olvidado mi contraseña</button><p class="hint">¿Aún no tienes cuenta? Tu entrenador te enviará una invitación por correo.</p></form>`;
}
function setpwView(){
  return head('<h1>Crea tu contraseña</h1>','Último paso para entrar')+`<form class="auth" id="fSetpw"><label>Contraseña nueva (mínimo 8 caracteres)<input type="password" id="pw" autocomplete="new-password" minlength="8" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar y entrar'}</button></form>`;
}
const noconfigView=()=>head('<h1>Falta configurar</h1>','')+`<div class="hero"><p>Abre el archivo <b>config.js</b> y pega la URL y la clave de tu proyecto de Supabase. Los pasos están en GUIA.md.</p></div>`;

/* ---------- cliente ---------- */
const dkey=()=>S.w+'|'+S.d;
const isCardio=it=>it.cat==='Cardio';
const dget=it=>{const k=dkey();draft[k]=draft[k]||{};return draft[k][it.id]=draft[k][it.id]||Array.from({length:isCardio(it)?1:(parseInt(it.series)||1)},()=>({kg:'',reps:'',done:false}))};
function lastFor(id){
  for(const s of sessions){const it=(s.items||[]).find(x=>x.id===id);if(it){const t=(it.sets||[]).filter(x=>x.done).map(x=>(x.kg||'–')+'×'+(x.reps||'–')).join(' · ');if(t)return t}}
  return '';
}
function findEx(id){for(const w of routine.weeks)for(const d of w.days)for(const i of d.items)if(i.id===id)return i}
function clientRoutine(){
  normNav(routine);
  const day=routine.weeks[S.w].days[S.d];
  let total=0,done=0;
  const cards=day.items.map(it=>{
    const c=isCardio(it);const sets=dget(it);total+=sets.length;done+=sets.filter(x=>x.done).length;
    const last=lastFor(it.id);
    const rows=sets.map((s,i)=>c?`<div class="srow c"><i>${i+1}</i><span>${esc(it.series||'')} min</span><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Hecho">${s.done?'✓':'•'}</button></div>`
      :`<div class="srow"><i>${i+1}</i><input inputmode="decimal" data-ex="${it.id}" data-i="${i}" data-fld="kg" value="${esc(s.kg)}" placeholder="${/^\d/.test(it.kg||'')?esc(it.kg):'kg'}" aria-label="Kilos serie ${i+1}"><input inputmode="numeric" data-ex="${it.id}" data-i="${i}" data-fld="reps" value="${esc(s.reps)}" placeholder="${esc(it.reps||'reps')}" aria-label="Repeticiones serie ${i+1}"><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Serie ${i+1} hecha">${s.done?'✓':'•'}</button></div>`).join('');
    return `<article class="card ${sets.every(x=>x.done)?'done':''}"><div class="cat">${esc((it.cat||'').replace(/_/g,' '))}</div><div class="name">${esc(it.name)}</div><div class="facts">${factHTML(facts(it))}</div>${last?`<p class="hint">Última vez: ${esc(last)}</p>`:''}${rows}<div style="margin-top:6px">${vidHTML(it)}</div></article>`;
  }).join('')||'<div class="empty">Este día aún no tiene ejercicios.</div>';
  const fin=finish?`<div class="sheet"><h2>Terminar sesión</h2><div><label>Cómo te has sentido</label><div class="feel" style="margin-top:8px">${[1,2,3,4,5].map(n=>`<button data-act="feel" data-n="${n}" aria-pressed="${finish.feeling===n}">${n}</button>`).join('')}</div><div class="fl"><span>${FEEL[0]}</span><span>${FEEL[4]}</span></div></div><label>Notas para tu entrenador<textarea id="fnote" placeholder="Dolor, sensaciones, cambios que hiciste...">${esc(finish.notes)}</textarea></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" data-act="savesession" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar sesión'}</button><button class="back" data-act="cancelfin">Seguir entrenando</button></div>`
    :`<button class="btn big" style="margin-top:6px" data-act="fin" ${done?'':'disabled'}>Terminar sesión</button>`;
  return nav(routine)+`<main><div class="prog"><div class="bar"><i style="width:${total?done/total*100:0}%"></i></div><b>${done}/${total} series</b></div>${cards}${fin}</main>`;
}
function sessionHTML(s){
  const its=s.items||[];let t=0,d=0;its.forEach(i=>(i.sets||[]).forEach(x=>{t++;if(x.done)d++}));
  return `<details class="ses"><summary><span><b>${esc(s.dname||'Sesión')}</b><br><small class="sub">${esc(fdate(s.date))} · ${esc(s.wname||'')}</small></span><span class="tag ${d===t?'ok':''}">${d}/${t} series${s.feeling?' · '+s.feeling+'/5':''}</span></summary>${its.map(i=>`<div class="ex"><strong>${esc(i.name)}</strong>${(i.sets||[]).map((x,n)=>`${n+1}: ${esc(x.kg||'–')} kg × ${esc(x.reps||'–')}${x.done?'':' (sin hacer)'}`).join('<br>')}</div>`).join('')}${s.notes?`<p class="hint" style="margin-top:10px">Nota: ${esc(s.notes)}</p>`:''}</details>`;
}
function clientView(){
  const tabs=`<div class="seg"><button data-tab="rutina" aria-pressed="${S.tab==='rutina'}">Rutina</button><button data-tab="historial" aria-pressed="${S.tab==='historial'}">Historial</button></div>`;
  let body;
  if(!routine)body=`<div class="empty" style="margin-top:20px">Tu entrenador aún no te ha asignado una rutina. Vuelve en un rato.</div>`;
  else if(S.tab==='historial')body=`<main class="panel">${sessions.length?sessions.map(sessionHTML).join(''):'<div class="empty">Todavía no has guardado ninguna sesión.</div>'}</main>`;
  else body=clientRoutine();
  return topbar()+head(`<h1>${esc(routine?routine.title:'Mi rutina')}</h1>`,esc(me.name||''))+tabs+body;
}

/* ---------- entrenador ---------- */
function coachView(){
  if(edit)return editorView();
  const tabs=`<div class="seg"><button data-tab="clientes" aria-pressed="${S.tab!=='plantilla'}">Clientes</button><button data-tab="plantilla" aria-pressed="${S.tab==='plantilla'}">Plantilla</button></div>`;
  let body='';
  const sel=clients.find(c=>c.id===selClient);
  if(S.tab==='plantilla'){
    body=`<main class="panel"><h2>Plantilla base</h2><p class="hint">Es la rutina que se copia a un cliente nuevo. Cambiarla no modifica las rutinas ya asignadas.</p>${tpl?`<button class="btn big" data-act="edittpl">Editar plantilla</button>`:'<div class="empty">Aún no hay plantilla base.</div><button class="btn big" data-act="newtpl">Crear plantilla vacía</button>'}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}</main>`;
  }else if(sel){
    const has=assigned.has(sel.id);
    body=`<button class="back" data-act="backc">← Clientes</button><main class="panel"><h2>${esc(label(sel))}</h2><p class="hint" style="margin:0">${esc(sel.email)}</p><div class="ed2" style="display:flex;gap:8px"><input id="cname" value="${esc(sel.name||'')}" placeholder="Nombre del cliente" aria-label="Nombre del cliente"><button class="btn sec" data-act="savename">Guardar</button></div>${has?`<button class="btn big" data-act="editr">Editar su rutina</button>`:`<div class="empty">Este cliente aún no tiene rutina.</div><button class="btn big" data-act="assign" ${tpl?'':'disabled'}>Asignar plantilla base</button>${tpl?'':'<p class="hint">Crea primero la plantilla base.</p>'}`}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<h2 style="margin-top:14px">Sesiones registradas</h2>${cSessions.length?cSessions.map(sessionHTML).join(''):'<div class="empty">Todavía no ha registrado sesiones.</div>'}</main>`;
  }else{
    body=`<main class="panel"><h2>Tus clientes</h2>${clients.length?clients.map(c=>`<button class="li" data-act="pick" data-id="${esc(c.id)}"><span><b>${esc(label(c))}</b><small>${assigned.has(c.id)?'Rutina asignada':'Sin rutina'}</small></span><span class="tag ${assigned.has(c.id)?'ok':''}">${assigned.has(c.id)?'Activo':'Pendiente'}</span></button>`).join(''):'<div class="empty">Aún no hay clientes. Invítalos desde Supabase: Authentication → Users → Invite user. Aparecerán aquí cuando acepten.</div>'}<button class="btn sec" data-act="reload">Actualizar lista</button></main>`;
  }
  return topbar()+head('<h1>Panel del entrenador</h1>','Clientes y rutinas')+tabs+body;
}
function editorView(){
  const m=edit.model;normNav(m);const day=m.weeks[S.w].days[S.d];
  const f=(it,k,l,full)=>`<div class="${full?'full':''}"><label>${l}<input data-id="${it.id}" data-f="${k}" value="${esc(it[k])}" ${k==='name'?'list="lib"':''} ${k==='video'?'inputmode="url" placeholder="https://youtube.com/..."':''}></label></div>`;
  return head(`<input class="titlein" id="ttl" value="${esc(m.title)}" aria-label="Título" style="width:100%;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);padding:8px 10px">`,esc(edit.label))+nav(m,true)+`<main><div class="card ed" style="margin-top:14px"><div class="grid"><div><label>Nombre de la semana<input data-wf="name" value="${esc(m.weeks[S.w].name)}"></label></div><div><label>Nombre del día<input data-df="name" value="${esc(day.name)}"></label></div></div><div class="tools"><button class="btn warn" data-act="delday">Quitar este día</button><button class="btn warn" data-act="delwk">Quitar esta semana</button><button class="btn sec" data-act="dupwk">Copiar semana</button></div></div><div style="height:12px"></div>`
   +day.items.map((it,i)=>`<article class="card ed"><div class="grid">${f(it,'name','Ejercicio',1)}${f(it,'cat','Categoría',1)}${f(it,'series','Series')}${f(it,'reps','Repeticiones')}${f(it,'kg','Carga')}${f(it,'rest','Descanso')}${f(it,'video','Enlace del vídeo',1)}</div><div class="tools"><button class="btn sec" data-act="up" data-i="${i}">Subir</button><button class="btn sec" data-act="down" data-i="${i}">Bajar</button><button class="btn warn" data-act="del" data-i="${i}">Quitar</button></div></article>`).join('')
   +`<button class="btn sec" data-act="addex" style="width:100%;padding:14px">+ Añadir ejercicio</button></main><div class="coach"><span>${esc(edit.label)}</span><button class="btn sec" data-act="canceled">Cancelar</button><button class="btn" data-act="saveed" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar'}</button>${S.err?`<div class="msg" role="alert">${esc(S.err)}</div>`:''}</div>`;
}

/* ---------- render ---------- */
function render(){
  let h;
  switch(S.state){
    case 'loading':h=head('<h1>Mi rutina</h1>','Cargando…');break;
    case 'noconfig':h=noconfigView();break;
    case 'login':h=loginView();break;
    case 'setpw':h=setpwView();break;
    case 'coach':h=coachView();break;
    default:h=clientView();
  }
  document.getElementById('app').innerHTML=`<div class="wrap">${h}</div>`;
  let dl=document.getElementById('lib');
  if(!dl){dl=document.createElement('datalist');dl.id='lib';document.body.append(dl)}
  dl.innerHTML=lib.map(x=>`<option value="${esc(x.name)}">`).join('');
}

/* ---------- acciones ---------- */
const werr=e=>e&&e.message?('No se pudo guardar: '+e.message):'No se pudo guardar. Prueba de nuevo.';
function saveDraft(){saveJ('rutina-draft-'+me.id,draft)}
async function act(a,t){
  if(a==='logout'){await sb.auth.signOut();me=null;routine=null;sessions=[];selClient=null;edit=null;finish=null;S.state='login';S.err='';render();return}
  if(a==='forgot'){S.forgot=true;S.err='';S.info='';render();return}
  if(a==='backlogin'){S.forgot=false;S.err='';S.info='';render();return}
  if(a==='tog'){const it=findEx(t.dataset.ex);const s=dget(it)[+t.dataset.i];s.done=!s.done;saveDraft();render();return}
  if(a==='fin'){finish={feeling:0,notes:''};S.err='';render();return}
  if(a==='cancelfin'){finish=null;render();return}
  if(a==='feel'){finish.feeling=+t.dataset.n;render();return}
  if(a==='savesession'){
    S.busy=true;S.err='';render();
    const day=routine.weeks[S.w].days[S.d];
    const items=day.items.map(it=>({id:it.id,name:it.name,cat:it.cat||'',plan:{series:it.series||'',reps:it.reps||'',kg:it.kg||''},sets:dget(it).map(s=>({kg:s.kg,reps:s.reps,done:s.done}))}));
    const {error}=await sb.from('sessions').insert({client_id:me.id,week:S.w,day:S.d,wname:routine.weeks[S.w].name,dname:day.name,feeling:finish.feeling||null,notes:finish.notes,items});
    S.busy=false;
    if(error){S.err=werr(error);render();return}
    delete draft[dkey()];saveDraft();finish=null;S.tab='historial';await loadClient();render();return;
  }
  /* entrenador */
  if(a==='reload'){await loadCoach();return}
  if(a==='pick'){selClient=t.dataset.id;S.err='';cSessions=[];render();loadClientSessions(selClient);return}
  if(a==='backc'){selClient=null;S.err='';render();return}
  if(a==='savename'){const v=document.getElementById('cname').value.trim();const {error}=await sb.from('profiles').update({name:v||null}).eq('id',selClient);if(error)S.err=werr(error);else{S.err='';clients.find(c=>c.id===selClient).name=v}render();return}
  if(a==='newtpl'){const d={title:'Mi rutina',weeks:[{name:'Semana 1',days:[{name:'Día 1',items:[]}]}]};const {error}=await sb.from('templates').upsert({id:'base',data:d});if(error){S.err=werr(error);render()}else{tpl=d;render()}return}
  if(a==='edittpl'){startEdit('tpl',tpl,'Plantilla base');return}
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
    else({error}=await sb.from('routines').upsert({client_id:selClient,title:m.title,data:{weeks:m.weeks},updated_at:new Date().toISOString()}));
    S.busy=false;if(error){S.err=werr(error);render();return}
    edit=null;render();return;
  }
  /* editor */
  const m=edit&&edit.model;
  if(m){
    const wk=m.weeks[S.w],day=wk.days[S.d];
    if(a==='addex')day.items.push({id:uid(),cat:'',name:'Nuevo ejercicio',series:'3',reps:'10',kg:'',rest:'',video:''});
    else if(a==='del')day.items.splice(+t.dataset.i,1);
    else if(a==='up'||a==='down'){const i=+t.dataset.i,j=a==='up'?i-1:i+1;if(day.items[j])[day.items[i],day.items[j]]=[day.items[j],day.items[i]]}
    else if(a==='addday'){wk.days.push({name:'Día '+(wk.days.length+1),items:[]});S.d=wk.days.length-1}
    else if(a==='delday'){wk.days.splice(S.d,1);S.d=0}
    else if(a==='addwk'){m.weeks.push({name:'Semana '+(m.weeks.length+1),days:[{name:'Día 1',items:[]}]});S.w=m.weeks.length-1;S.d=0}
    else if(a==='dupwk'){const c=JSON.parse(JSON.stringify(wk));c.name='Semana '+(m.weeks.length+1);c.days.forEach(d=>d.items.forEach(i=>i.id=uid()));m.weeks.push(c);S.w=m.weeks.length-1;S.d=0}
    else if(a==='delwk'){if(m.weeks.length>1){m.weeks.splice(S.w,1);S.w=0;S.d=0}else S.err='Tiene que quedar al menos una semana.'}
    render();
  }
}
function startEdit(kind,data,label){edit={kind,label,model:JSON.parse(JSON.stringify({title:data.title,weeks:data.weeks}))};S.w=0;S.d=0;S.err='';render()}

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
  if(id==='fForgot'){
    const em=val('em').trim();
    S.busy=true;render();
    await sb.auth.resetPasswordForEmail(em,{redirectTo:location.origin+location.pathname});
    S.busy=false;S.info='Si el correo existe, recibirás un enlace en unos minutos.';render();return;
  }
  if(id==='fSetpw'){
    const pw=val('pw');
    S.busy=true;render();
    const {error}=await sb.auth.updateUser({password:pw});
    S.busy=false;
    if(error){S.err=error.message;render();return}
    history.replaceState(null,'',location.pathname);await enter();
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.id==='ttl'&&edit){edit.model.title=t.value;return}
  if(t.id==='fnote'&&finish){finish.notes=t.value;return}
  if(edit){
    const wk=edit.model.weeks[S.w];
    if(t.dataset.wf){wk.name=t.value;return}
    if(t.dataset.df){wk.days[S.d].name=t.value;return}
    if(t.dataset.f){const it=wk.days[S.d].items.find(x=>x.id===t.dataset.id);if(it)it[t.dataset.f]=t.value;return}
  }
  if(t.dataset.fld&&routine){const it=findEx(t.dataset.ex);dget(it)[+t.dataset.i][t.dataset.fld]=t.value;saveDraft()}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(edit&&t.dataset.f==='name'){
    const l=lib.find(x=>x.name===t.value);
    if(l){const it=edit.model.weeks[S.w].days[S.d].items.find(x=>x.id===t.dataset.id);it.cat=l.cat||it.cat;it.video=l.video||'';setTimeout(render,0)}
  }
});
document.addEventListener('click',e=>{
  const t=e.target.closest('button');if(!t)return;
  const y=scrollY;
  if(t.dataset.tab){S.tab=t.dataset.tab;selClient=null;S.err='';render();return}
  if(t.dataset.w!==undefined){S.w=+t.dataset.w;S.d=0;render();scrollTo(0,y);return}
  if(t.dataset.d!==undefined){S.d=+t.dataset.d;render();scrollTo(0,y);return}
  if(t.dataset.act)act(t.dataset.act,t).then(()=>scrollTo(0,y));
});
boot();
