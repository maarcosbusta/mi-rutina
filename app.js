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
let comments={},feed=[],seenSet=new Set(),routine=null,sessions=[],draft={},clients=[],assigned=new Set(),tpl=null,lib=[],selClient=null,cSessions=[],edit=null,finish=null;
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
  me=data;draft=loadJ('rutina-draft-'+me.id,{});S.err='';S.prevOn=false;S.prev=null;selClient=null;edit=null;finish=null;S.w=0;S.d=0;S.tab=isCoach()?'clientes':'rutina';
  if(isCoach()){S.state='coach';render();await loadCoach()}else{S.state='client';render();await loadClient()}
}
async function loadComments(ids){
  ids=[...new Set(ids)].filter(Boolean);if(!ids.length)return;
  const {data}=await sb.from('session_comments').select('*').in('session_id',ids).order('created_at',{ascending:true});
  ids.forEach(id=>{comments[id]=[]});(data||[]).forEach(c=>comments[c.session_id].push(c));
}
async function loadClient(){
  const [r,s]=await Promise.all([
    sb.from('routines').select('title,data').eq('client_id',me.id).maybeSingle(),
    sb.from('sessions').select('*').eq('client_id',me.id).order('performed_at',{ascending:false}).limit(40)]);
  routine=r.data?{title:r.data.title,weeks:r.data.data.weeks}:null;
  sessions=(s.data||[]).map(x=>({...x,date:x.performed_at}));
  await loadComments(sessions.map(x=>x.id));
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
  try{seenSet=new Set(JSON.parse(localStorage.getItem('seen-'+me.id)||'[]'))}catch(e){seenSet=new Set()}
  const f=await sb.from('sessions').select('id,client_id,dname,wname,performed_at,feeling,notes,items').order('performed_at',{ascending:false}).limit(40);
  feed=(f.data||[]).map(x=>({...x,date:x.performed_at}));
  await loadComments(feed.map(x=>x.id));
  soft();
}
async function loadClientSessions(id){
  const {data}=await sb.from('sessions').select('*').eq('client_id',id).order('performed_at',{ascending:false}).limit(30);
  cSessions=(data||[]).map(x=>({...x,date:x.performed_at}));await loadComments(cSessions.map(x=>x.id));soft();
}

/* ---------- piezas comunes ---------- */
const head=(t,sub)=>`<header>${t}<div class="sub">${sub||''}</div></header>`;
const MARK='<span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const initial=c=>String((c&&(c.name||c.email))||'?').trim()[0].toUpperCase();
const topbar=()=>me?`<div class="appbar"><div class="brand">${MARK}Mi rutina</div><div class="menuw"><button class="av" data-act="menu" aria-label="Cuenta" aria-expanded="${!!S.menu}" aria-haspopup="menu"${me.avatar_url?` style="background-image:url('${esc(me.avatar_url)}')"`:''}>${me.avatar_url?'':esc(initial(me))}</button><input type="file" id="avf" accept="image/*" hidden>${S.menu?`<div class="pop" role="menu"><small>${esc(me.email)}</small><button role="menuitem" data-act="photo">${me.avatar_url?'Cambiar foto':'Añadir foto de perfil'}</button>${me.avatar_url?'<button role="menuitem" data-act="rmphoto">Quitar foto</button>':''}<button role="menuitem" data-act="chpw">Cambiar contraseña</button><button role="menuitem" data-act="logout">Salir</button></div>`:''}</div></div>`:'';
function facts(it){
  const f=[];
  if(it.cat==='Cardio'){if(it.series)f.push(['Duración',it.series+' min','big']);if(it.reps)f.push(['Intensidad',it.reps]);}
  else{if(it.series)f.push(['Series',it.series,'big']);if(it.reps)f.push(['Reps',it.reps,'big']);if(it.kg)f.push(['Carga',n$(it.kg)]);}
  if(it.rest)f.push(['Descanso',it.rest]);
  return f;
}
const bname=b=>String(b||'').replace(/^.*bloque\s*:\s*/i,'').trim();
const factHTML=f=>f.map(([l,v,c])=>`<div class="fact ${c||''}"><small>${l}</small>${esc(v)}</div>`).join('');
const vidHTML=it=>it.video?`<a class="vid" href="${esc(it.video)}" target="_blank" rel="noopener">${PLAY}Ver vídeo</a>`:'<span class="novid">Sin vídeo</span>';
function nav(m,withAdd){
  if(!withAdd){
    const ds=m.weeks[S.w].days;
    return `<nav>${m.weeks.length>1?`<div class="dseg wk" style="--n:${m.weeks.length}">${m.weeks.map((w,i)=>`<button data-w="${i}" aria-pressed="${i===S.w}">${esc(w.name.replace(/^Semana/i,'Semana'))}</button>`).join('')}</div>`:''}<div class="dseg" style="--n:${ds.length}">${ds.map((d,i)=>`<button data-d="${i}" aria-pressed="${i===S.d}">${esc(d.name)}</button>`).join('')}</div></nav>`;
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
function loginView(){
  if(S.forgot)return head('<h1>Mi rutina</h1>','')+`<form class="auth" id="fForgot"><p class="hint">Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.</p><label>Correo<input type="email" id="em" autocomplete="email" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}${S.info?`<div class="ok" role="status">${esc(S.info)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Enviando…':'Enviar enlace'}</button><button type="button" class="linkb" data-act="backlogin">Volver</button></form>`;
  return head('<h1>Mi rutina</h1>','Entra con tu cuenta')+`<form class="auth" id="fLogin"><label>Correo<input type="email" id="em" autocomplete="email" required></label><label>Contraseña<input type="password" id="pw" autocomplete="current-password" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Entrando…':'Entrar'}</button><button type="button" class="linkb" data-act="forgot">He olvidado mi contraseña</button><p class="hint">¿Aún no tienes cuenta? Tu entrenador te enviará una invitación por correo.</p></form>`;
}
function setpwView(){
  return head(S.chpw?'<h1>Cambiar contraseña</h1>':'<h1>Crea tu contraseña</h1>',S.chpw?'':'Último paso para entrar')+`<form class="auth" id="fSetpw"><label>Contraseña nueva (mínimo 8 caracteres)<input type="password" id="pw" autocomplete="new-password" minlength="8" required></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" ${S.busy?'disabled':''}>${S.busy?'Guardando…':(S.chpw?'Guardar contraseña':'Guardar y entrar')}</button>${S.chpw?'<button type="button" class="linkb" data-act="cancelpw">Cancelar</button>':''}</form>`;
}
const noconfigView=()=>head('<h1>Falta configurar</h1>','')+`<div class="hero"><p>Abre el archivo <b>config.js</b> y pega la URL y la clave de tu proyecto de Supabase. Los pasos están en GUIA.md.</p></div>`;

/* ---------- cliente ---------- */
const dkey=()=>S.w+'|'+S.d;
const isCardio=it=>it.cat==='Cardio';
const dget=it=>{const k=dkey();draft[k]=draft[k]||{};return draft[k][it.id]=draft[k][it.id]||Array.from({length:isCardio(it)?1:(parseInt(it.series)||1)},()=>({kg:'',reps:'',done:false}))};
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
  if(!sec)return;clearInterval(restIv);restTimer={end:Date.now()+sec*1000};render();
  restIv=setInterval(()=>{if(!restTimer){clearInterval(restIv);return}const left=Math.ceil((restTimer.end-Date.now())/1000),el=document.getElementById('restt');
    if(left<=0){stopRest(true);return}if(el)el.textContent=fmtT(left)},250);
}
function stopRest(ring){clearInterval(restIv);restTimer=null;if(ring)beep();render()}
function restBar(){if(!restTimer)return '';const left=Math.max(0,Math.ceil((restTimer.end-Date.now())/1000));return `<div class="rest" role="timer" aria-live="off"><span>Descanso</span><b id="restt">${fmtT(left)}</b><button data-act="restadd">+15 s</button><button data-act="restskip">Saltar</button></div>`}
function findEx(id){for(const w of routine.weeks)for(const d of w.days)for(const i of d.items)if(i.id===id)return i}
function clientRoutine(){
  normNav(routine);
  const day=routine.weeks[S.w].days[S.d];
  const stat=its=>{let t=0,d=0;its.forEach(it=>{const st=dget(it);t+=st.length;d+=st.filter(x=>x.done).length});return[t,d]};
  const [total,done]=stat(day.items);
  const exHTML=(it)=>{
    const c=isCardio(it);const sets=dget(it);
    const last=lastFor(it),ls=lastSets(it)||[];
    const rows=sets.map((s,i)=>c?`<div class="srow c"><i>${i+1}</i><span>${esc(it.series||'')} min</span><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Hecho">${s.done?'✓':'•'}</button></div>`
      :`<div class="srow"><i>${i+1}</i><input inputmode="decimal" data-ex="${it.id}" data-i="${i}" data-fld="kg" value="${esc(s.kg)}" placeholder="${esc((ls[i]||{}).kg||(/^\d/.test(it.kg||'')?it.kg:'kg'))}" aria-label="Kilos serie ${i+1}"><input inputmode="numeric" data-ex="${it.id}" data-i="${i}" data-fld="reps" value="${esc(s.reps)}" placeholder="${esc((ls[i]||{}).reps||'reps')}" aria-label="Repeticiones serie ${i+1}"><button class="set" data-ex="${it.id}" data-i="${i}" data-act="tog" aria-pressed="${s.done}" aria-label="Serie ${i+1} hecha">${s.done?'✓':'•'}</button></div>`).join('');
    const plan=c?[it.series&&it.series+' min',it.reps].filter(Boolean).join(' · '):[it.series&&it.series+' series',it.reps,it.kg&&('Carga: '+n$(it.kg)),it.rest&&'descanso '+it.rest].filter(Boolean).join(' · ');
    return `<div class="bex"><div class="name">${esc(it.name)}</div>${plan?`<div class="plan">${esc(plan)}</div>`:''}${last?`<p class="hint">Última vez: ${esc(last)}</p>`:''}${rows}<div style="margin-top:6px">${vidHTML(it)}</div></div>`;
  };
  const groups=[];
  day.items.forEach(it=>{const g=groups[groups.length-1];if(it.block&&g&&g.block===it.block)g.items.push(it);else groups.push({block:it.block||'',items:[it]})});
  const miniVid=it=>it.video?`<a class="play" href="${esc(it.video)}" target="_blank" rel="noopener" aria-label="Ver vídeo de ${esc(it.name)}">${PLAY}</a>`:'';
  const planOf=it=>[it.reps,it.kg&&('Carga: '+n$(it.kg))].filter(Boolean).join(' · ');
  const blockHTML=(g,gi)=>{
    const sr=g.items.find(x=>x.series),rs=g.items.find(x=>x.rest);
    const [bt,bd]=stat(g.items);
    const legend=g.items.map((it,k)=>`<li class="ex"><span class="dot" aria-hidden="true"></span><div class="ln"><b>${esc(it.name)}</b><small>${esc(planOf(it))}</small>${lastFor(it)?`<small class="lt">Última vez: ${esc(lastFor(it))}</small>`:''}</div>${miniVid(it)}</li>`).join('');
    const rounds=Math.max(0,...g.items.map(it=>dget(it).length));
    let rh='';
    for(let r=0;r<rounds;r++){
      const have=g.items.filter(it=>dget(it)[r]);
      const rdone=have.every(it=>dget(it)[r].done);
      rh+=`<div class="round"><div class="rh"><span>Serie ${r+1}</span><button class="rall" data-act="round" data-ids="${have.map(it=>it.id).join(',')}" data-i="${r}" aria-pressed="${rdone}">${rdone?'Serie hecha ✓':'Marcar toda la serie'}</button></div>`+g.items.map((it,k)=>{
        const s=dget(it)[r];if(!s)return '';
        const ctl=isCardio(it)?`<span class="rc">${esc(it.series||'')} min</span>`
          :`<input inputmode="decimal" data-ex="${it.id}" data-i="${r}" data-fld="kg" value="${esc(s.kg)}" placeholder="${esc(((lastSets(it)||[])[r]||{}).kg||(/^\d/.test(it.kg||'')?it.kg:'kg'))}" aria-label="Kilos ${esc(it.name)} serie ${r+1}"><input inputmode="numeric" data-ex="${it.id}" data-i="${r}" data-fld="reps" value="${esc(s.reps)}" placeholder="${esc(((lastSets(it)||[])[r]||{}).reps||'reps')}" aria-label="Repeticiones ${esc(it.name)} serie ${r+1}">`;
        return `<div class="rrow"><span class="rn"><em>${esc(it.name)}</em></span>${ctl}<button class="set" data-ex="${it.id}" data-i="${r}" data-act="tog" aria-pressed="${s.done}" aria-label="${esc(it.name)} serie ${r+1} hecha">${s.done?'✓':'•'}</button></div>`;
      }).join('')+`</div>`;
    }
    const chips=[sr?sr.series+' series':'',rs?'Descanso '+rs.rest.toLowerCase():''].filter(Boolean);
    return `<section class="card bcard bk${gi%4} ${bd===bt&&bt?'done':''}" id="blk${gi}"><div class="bh"><span class="bn">${gi+1}</span><div class="bt"><h2>${esc(bname(g.block))}</h2><div class="chips">${chips.map(c=>`<span>${esc(c)}</span>`).join('')}</div></div><span class="bp">${bd}/${bt}</span></div><ul class="legend">${legend}</ul>${rh}</section>`;
  };
  const blocked=groups.filter(g=>g.block);
  const map=blocked.length>1?`<div class="map" role="group" aria-label="Bloques de la sesión">${groups.map((g,gi)=>{if(!g.block)return '';const [t,d]=stat(g.items);return `<button class="bk${gi%4} ${d===t&&t?'full':''}" data-go="blk${gi}" style="--p:${t?d/t*100:0}%" aria-label="Ir al bloque ${esc(bname(g.block))}, ${d} de ${t} series"><span>${esc(bname(g.block))}</span></button>`}).join('')}</div>`:'';
  const cards=groups.map((g,gi)=>{
    if(g.block)return blockHTML(g,gi);
    return `<article class="card bcard">${g.items.map(exHTML).join('')}</article>`;
  }).join('')||'<div class="empty">Este día aún no tiene ejercicios.</div>';
  const fin=finish?`<div class="sheet"><h2>Terminar sesión</h2><div><label>Cómo te has sentido</label><div class="feel" style="margin-top:8px">${[1,2,3,4,5].map(n=>`<button data-act="feel" data-n="${n}" aria-pressed="${finish.feeling===n}">${n}</button>`).join('')}</div><div class="fl"><span>${FEEL[0]}</span><span>${FEEL[4]}</span></div></div><label>Notas para tu entrenador<textarea id="fnote" placeholder="Dolor, sensaciones, cambios que hiciste...">${esc(finish.notes)}</textarea></label>${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<button class="btn big" data-act="savesession" ${S.busy?'disabled':''}>${S.busy?'Guardando…':'Guardar sesión'}</button><button class="back" data-act="cancelfin">Seguir entrenando</button></div>`
    :restBar()+`<div class="dock"><div class="dk"><b>${done}</b><small>de ${total} series</small></div><button class="rbtn" data-act="rest" aria-label="Temporizador de descanso">⏱</button><button class="btn" data-act="fin" ${done?'':'disabled'}>Terminar sesión</button></div>`;
  return nav(routine)+`<main>${map}${cards}${fin}</main>`;
}
const feelHTML=f=>{f=+f||0;return f?`<span class="fl" title="${esc(FEEL[f-1]||'')}">${[1,2,3,4,5].map(n=>`<i class="${n<=f?'on':''}"></i>`).join('')}</span><span class="fw">${esc(FEEL[f-1]||'')}</span>`:''};
S.open=new Set();S.cmd={};
function whoIs(c,s){const mine=c.author_id===me.id;if(mine)return 'Tú';if(c.author_id===s.client_id)return label(clients.find(x=>x.id===s.client_id)||{name:'Cliente'});return 'Entrenador'}
function commentsHTML(s,cs){
  return `<div class="cm"><b class="cmt">Comentarios</b>${cs.length?cs.map(c=>`<div class="cmi ${c.author_id===me.id?'me':''}"><small>${esc(whoIs(c,s))} · ${esc(fdate(c.created_at))}</small><p>${esc(c.body)}</p></div>`).join(''):'<p class="hint" style="margin:0">Aún no hay comentarios.</p>'}<div class="cmf"><input class="cm-in" id="cm-${esc(s.id)}" data-sid="${esc(s.id)}" maxlength="1000" placeholder="${isCoach()?'Escribe al cliente…':'Escribe a tu entrenador…'}" value="${esc(S.cmd[s.id]||'')}" aria-label="Escribir comentario"><button class="btn sec" data-act="cmsend" data-sid="${esc(s.id)}">Enviar</button></div></div>`;
}
const needsReply=s=>{const cs=comments[s.id]||[],l=cs[cs.length-1];if(l)return l.author_id===s.client_id;return !!((s.notes||'').trim()||(s.feeling&&s.feeling<=2))};
function feedHTML(){
  const cut=Date.now()-14*864e5;
  const rec=feed.filter(s=>new Date(s.date)>cut);
  const att=rec.filter(s=>needsReply(s)&&!seenSet.has(s.id)).slice(0,8);
  const rest=feed.filter(s=>!att.includes(s)).slice(0,6);
  const cl=s=>clients.find(c=>c.id===s.client_id)||{name:'Cliente'};
  const tot=s=>{let t=0,d=0;(s.items||[]).forEach(i=>(i.sets||[]).forEach(x=>{t++;if(x.done)d++}));return[d,t]};
  const row=(s,hot)=>{const [d,t]=tot(s),cs=comments[s.id]||[],l=cs[cs.length-1];
    return `<div class="fi ${hot?'hot':''}"><button class="fib" data-act="openses" data-cid="${esc(s.client_id)}" data-sid="${esc(s.id)}"><span class="av sm">${esc(initial(cl(s)))}</span><span class="fit"><b>${esc(label(cl(s)))}</b><small>${esc(s.dname||'Sesión')} · ${esc(fdate(s.date))} · ${d}/${t} series</small><span class="sm">${feelHTML(s.feeling)}${hot?'<span class="tag warn">Por responder</span>':''}</span>${l&&l.author_id===s.client_id?`<q>${esc(l.body)}</q>`:(s.notes?`<q>${esc(s.notes)}</q>`:'')}</span></button>${hot?`<button class="seen" data-act="seen" data-sid="${esc(s.id)}">Ya lo vi</button>`:''}</div>`};
  if(!feed.length)return '';
  return `<section class="feed"><h2>Actividad reciente</h2>${att.length?att.map(s=>row(s,true)).join(''):'<p class="hint" style="margin:0 0 6px">Todo al día: no hay nada por responder.</p>'}${rest.length?`<h3>Últimas sesiones</h3>${rest.map(s=>row(s,false)).join('')}`:''}</section>`;
}
function sessionHTML(s){
  const its=s.items||[];let t=0,d=0;its.forEach(i=>(i.sets||[]).forEach(x=>{t++;if(x.done)d++}));
  const dt=new Date(s.date),ok=!isNaN(dt);
  const day=ok?dt.getDate():'·',mon=ok?dt.toLocaleDateString('es-ES',{month:'short'}).replace('.',''):'';
  const wk=ok?dt.toLocaleDateString('es-ES',{weekday:'long'}):'';
  const pct=t?Math.round(d/t*100):0;
  const dots=feelHTML(s.feeling),cs=comments[s.id]||[];
  const gs=[];its.forEach(i=>{const k=i.block||'';const l=gs[gs.length-1];if(l&&l.k===k)l.items.push(i);else gs.push({k,items:[i]})});
  const body=gs.map((g,gi)=>`<div class="sb bk${gi%4}">${g.k?`<div class="sbh"><span class="sbn">${gi+1}</span>${esc(bname(g.k))}</div>`:''}${g.items.map(i=>`<div class="sx"><strong>${esc(i.name)}</strong><div class="sets">${(i.sets||[]).map((x,n)=>`<span class="st${x.done?' ok':''}"><em>${n+1}</em>${x.kg||x.reps?(x.kg?esc(x.kg)+' kg':'–')+' × '+(x.reps?esc(x.reps):'–'):'Sin datos'}</span>`).join('')}</div></div>`).join('')}</div>`).join('');
  return `<details class="ses" data-sid="${esc(s.id)}"${S.open&&S.open.has(s.id)?' open':''}><summary><div class="dt"><b>${day}</b><small>${esc(mon)}</small></div><div class="si"><strong>${esc(s.dname||'Sesión')}</strong><small>${esc(wk)}${s.wname?' · '+esc(s.wname):''}</small><div class="pb"><i style="width:${pct}%"></i></div><div class="sm"><span class="tag ${d===t&&t?'ok':''}">${d}/${t} series</span>${dots}${cs.length?`<span class="tag cmb">💬 ${cs.length}</span>`:''}</div></div><svg class="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary><div class="sbody">${body}${s.notes?`<div class="snote"><b>Nota</b>${esc(s.notes)}</div>`:''}${commentsHTML(s,cs)}</div></details>`;
}
function clientView(){
  const tabs=`<div class="seg"><button data-tab="rutina" aria-pressed="${S.tab==='rutina'}">Rutina</button><button data-tab="historial" aria-pressed="${S.tab==='historial'}">Historial</button></div>`;
  let body;
  if(!routine)body=`<div class="empty" style="margin-top:20px">Tu entrenador aún no te ha asignado una rutina. Vuelve en un rato.</div>`;
  else if(S.tab==='historial')body=`<main class="panel">${sessions.length?sessions.map(sessionHTML).join(''):'<div class="empty">Todavía no has guardado ninguna sesión.</div>'}</main>`;
  else body=clientRoutine();
  return topbar()+head(`<h1>${me.name?'Hola, '+esc(String(me.name).split(' ')[0]):'Tu rutina'}</h1>`,routine&&routine.title!=='Mi rutina'?esc(routine.title):'')+tabs+body;
}

/* ---------- entrenador ---------- */
function previewView(){
  const c=clients.find(x=>x.id===selClient)||{};
  return `<div class="prev"><div class="pvbar"><span>Vista previa · <b>${esc(label(c))}</b><small>Así lo ve el cliente. No se guarda nada.</small></span><button class="btn sec" data-act="endpreview">Volver</button></div>`+head(`<h1>${esc(routine.title)}</h1>`,esc(c.name||''))+clientRoutine()+`</div>`;
}
function coachView(){
  if(S.prevOn&&routine)return previewView();
  if(edit)return editorView();
  const tabs=`<div class="seg"><button data-tab="clientes" aria-pressed="${S.tab!=='plantilla'}">Clientes</button><button data-tab="plantilla" aria-pressed="${S.tab==='plantilla'}">Plantilla</button></div>`;
  let body='';
  const sel=clients.find(c=>c.id===selClient);
  if(S.tab==='plantilla'){
    body=`<main class="panel"><h2>Plantilla base</h2><p class="hint">Es la rutina que se copia a un cliente nuevo. Cambiarla no modifica las rutinas ya asignadas.</p>${tpl?`<button class="btn big" data-act="edittpl">Editar plantilla</button>`:'<div class="empty">Aún no hay plantilla base.</div><button class="btn big" data-act="newtpl">Crear plantilla vacía</button>'}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}</main>`;
  }else if(sel){
    const has=assigned.has(sel.id);
    body=`<button class="back" data-act="backc">← Clientes</button><main class="panel"><h2>${esc(label(sel))}</h2><p class="hint" style="margin:0">${esc(sel.email)}</p><div class="ed2" style="display:flex;gap:8px"><input id="cname" value="${esc(sel.name||'')}" placeholder="Nombre del cliente" aria-label="Nombre del cliente"><button class="btn sec" data-act="savename">Guardar</button></div>${has?`<button class="btn big" data-act="preview" style="margin-top:10px">Ver como lo ve el cliente</button>`:''}<label class="btn sec" for="xlsc" style="display:block;text-align:center;margin-top:10px">Cargar Excel (.xlsm) para este cliente</label><input type="file" id="xlsc" accept=".xlsm,.xlsx" hidden>${has?`<button class="btn big" data-act="editr">Editar su rutina</button>`:`<div class="empty">Este cliente aún no tiene rutina.</div><button class="btn big" data-act="assign" ${tpl?'':'disabled'}>Asignar plantilla base</button>${tpl?'':'<p class="hint">Crea primero la plantilla base.</p>'}`}${S.err?`<div class="err" role="alert">${esc(S.err)}</div>`:''}<h2 style="margin-top:14px">Sesiones registradas</h2>${cSessions.length?cSessions.map(sessionHTML).join(''):'<div class="empty">Todavía no ha registrado sesiones.</div>'}</main>`;
  }else{
    body=`<main class="panel">${feedHTML()}<h2>Tus clientes</h2>${clients.length?clients.map(c=>`<button class="li" data-act="pick" data-id="${esc(c.id)}"><span class="who"><span class="av sm">${esc(initial(c))}</span><span><b>${esc(label(c))}</b><small>${assigned.has(c.id)?'Rutina asignada':'Sin rutina'}</small></span></span><span class="tag ${assigned.has(c.id)?'ok':''}">${assigned.has(c.id)?'Activo':'Pendiente'}</span></button>`).join(''):'<div class="empty">Aún no hay clientes. Invítalos desde Supabase: Authentication → Users → Invite user. Aparecerán aquí cuando acepten.</div>'}<button class="btn sec" data-act="reload">Actualizar lista</button></main>`;
  }
  return topbar()+head('<h1>Panel del entrenador</h1>','Clientes y rutinas')+tabs+body;
}
function importCard(){
  const i=edit.imp||{};
  return `<div class="card ed"><b>Cargar desde Excel</b><p class="hint" style="margin:6px 0 10px">Sube tu planificador (.xlsm). Leo la hoja <b>Plan_SS1</b> y coloco aquí la rutina entera, con sus vídeos. No se guarda hasta que pulses Guardar.</p><label class="btn sec" for="xlsf" style="display:block;text-align:center;${i.busy?'opacity:.6;pointer-events:none':''}">${i.busy?'Leyendo Excel…':'Cargar Excel (.xlsm)'}</label><input type="file" id="xlsf" accept=".xlsm,.xlsx" hidden>${i.ok?`<p class="hint" style="margin:10px 0 0" role="status">${esc(i.text)}</p>${i.noVideo&&i.noVideo.length?`<p class="hint" style="margin:6px 0 0">Sin vídeo: ${esc(i.noVideo.join(', '))}.</p>`:''}`:''}${i.err?`<div class="err" role="alert" style="margin-top:10px">${esc(i.err)}</div>`:''}</div>`;
}
function editorView(){
  const m=edit.model;normNav(m);const day=m.weeks[S.w].days[S.d];
  const f=(it,k,l,full)=>`<div class="${full?'full':''}"><label>${l}<input data-id="${it.id}" data-f="${k}" value="${esc(it[k])}" ${k==='name'?'list="lib"':''} ${k==='video'?'inputmode="url" placeholder="https://youtube.com/..."':''}></label></div>`;
  return head(`<input class="titlein" id="ttl" value="${esc(m.title)}" aria-label="Título" style="width:100%;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);padding:8px 10px">`,esc(edit.label))+nav(m,true)+`<main><div class="card ed" style="margin-top:14px"><div class="grid"><div><label>Nombre de la semana<input data-wf="name" value="${esc(m.weeks[S.w].name)}"></label></div><div><label>Nombre del día<input data-df="name" value="${esc(day.name)}"></label></div></div><div class="tools"><button class="btn warn" data-act="delday">Quitar este día</button><button class="btn warn" data-act="delwk">Quitar esta semana</button><button class="btn sec" data-act="dupwk">Copiar semana</button></div></div><div style="height:12px"></div>`
   +importCard()
   +day.items.map((it,i)=>(it.block&&it.block!==(day.items[i-1]||{}).block?`<div class="blk"><b>${esc(bname(it.block))}</b></div>`:'')+`<article class="card ed"><div class="grid">${f(it,'block','Bloque (superserie)',1)}${f(it,'name','Ejercicio',1)}${f(it,'series','Series')}${f(it,'reps','Repeticiones')}${f(it,'kg','Carga')}${f(it,'rest','Descanso')}${f(it,'video','Enlace del vídeo',1)}</div><div class="tools"><button class="btn sec" data-act="up" data-i="${i}">Subir</button><button class="btn sec" data-act="down" data-i="${i}">Bajar</button><button class="btn warn" data-act="del" data-i="${i}">Quitar</button></div></article>`).join('')
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
  if(a==='logout'){S.menu=false;S.prevOn=false;S.prev=null;clearInterval(restIv);restTimer=null;await sb.auth.signOut();me=null;routine=null;sessions=[];selClient=null;edit=null;finish=null;S.state='login';S.err='';render();return}
  if(a==='cmsend'){const sid=t.dataset.sid,inp=document.getElementById('cm-'+sid),body=(inp?inp.value:'').trim();if(!body)return;
    inp.disabled=true;const {error}=await sb.from('session_comments').insert({session_id:sid,author_id:me.id,body});
    if(error){inp.disabled=false;alert('No se pudo enviar: '+error.message);return}
    S.cmd[sid]='';await loadComments([sid]);render();const n=document.getElementById('cm-'+sid);if(n)n.focus();return}
  if(a==='openses'){selClient=t.dataset.cid;S.open.add(t.dataset.sid);S.err='';cSessions=[];render();loadClientSessions(selClient);return}
  if(a==='seen'){seenSet.add(t.dataset.sid);try{localStorage.setItem('seen-'+me.id,JSON.stringify([...seenSet]))}catch(e){}render();return}
  if(a==='photo'){S.menu=false;render();document.getElementById('avf').click();return}
  if(a==='rmphoto'){S.menu=false;await setAvatar(null);return}
  if(a==='menu'){S.menu=!S.menu;render();return}
  if(a==='chpw'){S.menu=false;S.chpw=true;S.err='';S.state='setpw';render();return}
  if(a==='cancelpw'){S.chpw=false;S.err='';await enter();return}
  if(a==='forgot'){S.forgot=true;S.err='';S.info='';render();return}
  if(a==='backlogin'){S.forgot=false;S.err='';S.info='';render();return}
  if(a==='tog'){const it=findEx(t.dataset.ex);const s=dget(it)[+t.dataset.i];s.done=!s.done;saveDraft();if(s.done&&restSecs(it.rest)){startRest(restSecs(it.rest));return}render();return}
  if(a==='rest'){restTimer?stopRest():startRest(60);return}
  if(a==='restadd'){if(restTimer){restTimer.end+=15000;render()}return}
  if(a==='restskip'){stopRest();return}
  if(a==='round'){const ids=t.dataset.ids.split(','),i=+t.dataset.i;const its=ids.map(findEx);const all=its.every(it=>dget(it)[i].done);its.forEach(it=>{dget(it)[i].done=!all});saveDraft();const rs=Math.max(0,...its.map(it=>restSecs(it.rest)));if(!all&&rs){startRest(rs);return}render();return}
  if(a==='fin'){finish={feeling:0,notes:''};S.err='';render();return}
  if(a==='cancelfin'){finish=null;render();return}
  if(a==='feel'){finish.feeling=+t.dataset.n;render();return}
  if(a==='savesession'){
    S.busy=true;S.err='';render();
    const day=routine.weeks[S.w].days[S.d];
    const items=day.items.map(it=>({id:it.id,block:it.block||'',name:it.name,cat:it.cat||'',plan:{series:it.series||'',reps:it.reps||'',kg:it.kg||''},sets:dget(it).map(s=>({kg:s.kg,reps:s.reps,done:s.done}))}));
    const {error}=await sb.from('sessions').insert({client_id:me.id,week:S.w,day:S.d,wname:routine.weeks[S.w].name,dname:day.name,feeling:finish.feeling||null,notes:finish.notes,items});
    S.busy=false;
    if(error){S.err=werr(error);render();return}
    delete draft[dkey()];saveDraft();finish=null;S.tab='historial';await loadClient();render();return;
  }
  /* entrenador */
  if(a==='preview'){
    const {data,error}=await sb.from('routines').select('title,data').eq('client_id',selClient).maybeSingle();
    if(error||!data){S.err=error?werr(error):'Este cliente aún no tiene rutina.';render();return}
    S.prev={routine,sessions,draft};routine={title:data.title,weeks:data.data.weeks};sessions=[];draft={};S.w=0;S.d=0;S.err='';S.prevOn=true;render();scrollTo(0,0);return;
  }
  if(a==='endpreview'){const p=S.prev;if(p){routine=p.routine;sessions=p.sessions;draft=p.draft}S.prev=null;S.prevOn=false;S.w=0;S.d=0;render();return}
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
    else{({error}=await sb.from('routines').upsert({client_id:selClient,title:m.title,data:{weeks:m.weeks},updated_at:new Date().toISOString()}));if(!error)assigned.add(selClient)}
    S.busy=false;if(error){S.err=werr(error);render();return}
    edit=null;render();return;
  }
  /* editor */
  const m=edit&&edit.model;
  if(m){
    const wk=m.weeks[S.w],day=wk.days[S.d];
    if(a==='addex')day.items.push({id:uid(),block:((day.items[day.items.length-1]||{}).block)||'',cat:'',name:'Nuevo ejercicio',series:'3',reps:'10',kg:'',rest:'',video:''});
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
        day.items.push({id:uid(),block,cat:txt(r,dc+1),name,series:txt(r,dc+4),reps:txt(r,dc+5),kg:txt(r,dc+6),rest:txt(r,dc+8),video});
        total++;
      }
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
    S.chpw=false;history.replaceState(null,'',location.pathname);await enter();
  }
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.classList&&t.classList.contains('cm-in')){S.cmd[t.dataset.sid]=t.value;return}
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
async function setAvatar(url){
  const {error}=await sb.rpc('set_avatar',{url});
  if(error){alert('No se pudo guardar la foto: '+error.message);return}
  me.avatar_url=url;render();
}
function resizeImg(file,n=192){return new Promise((ok,ko)=>{const im=new Image(),u=URL.createObjectURL(file);im.onload=()=>{const s=Math.min(im.width,im.height),c=document.createElement('canvas');c.width=c.height=n;c.getContext('2d').drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,n,n);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',.82))};im.onerror=()=>ko(new Error('Imagen no válida'));im.src=u})}
document.addEventListener('change',async e=>{
  if(e.target.id==='avf'){const f=e.target.files[0];if(!f)return;try{await setAvatar(await resizeImg(f))}catch(x){alert(x.message)}return}
  const t=e.target;
  if(t.id==='xlsf'&&edit&&t.files&&t.files[0]){importXlsx(t.files[0]);return}
  if(t.id==='xlsc'&&selClient&&t.files&&t.files[0]){importForClient(t.files[0]);return}
  if(edit&&t.dataset.f==='name'){
    const l=lib.find(x=>x.name===t.value);
    if(l){const it=edit.model.weeks[S.w].days[S.d].items.find(x=>x.id===t.dataset.id);it.cat=l.cat||it.cat;it.video=l.video||'';setTimeout(render,0)}
  }
});
document.addEventListener('click',e=>{
  if(S.menu&&!e.target.closest('.menuw')){S.menu=false;render()}
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.go){const el=document.getElementById(t.dataset.go);if(el)el.scrollIntoView({behavior:'smooth',block:'start'});return}
  const y=scrollY;
  if(t.dataset.tab){S.tab=t.dataset.tab;selClient=null;S.err='';render();return}
  if(t.dataset.w!==undefined){S.w=+t.dataset.w;S.d=0;render();scrollTo(0,y);return}
  if(t.dataset.d!==undefined){S.d=+t.dataset.d;render();scrollTo(0,y);return}
  if(t.dataset.act)act(t.dataset.act,t).then(()=>scrollTo(0,y));
});
boot();

document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList&&e.target.classList.contains('cm-in')){e.preventDefault();const b=e.target.parentElement.querySelector('[data-act=cmsend]');if(b)b.click()}});
document.addEventListener('toggle',e=>{const d=e.target;if(d.matches&&d.matches('details.ses')){const id=d.dataset.sid;if(d.open)S.open.add(id);else S.open.delete(id)}},true);
