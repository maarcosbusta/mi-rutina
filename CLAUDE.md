# Mi Rutina: mapa del proyecto

Lee esto antes de tocar nada. Busca el texto entre comillas para ir directo a cada parte. Si cambias la estructura, actualiza este mapa en el mismo commit.

## Qué es

App web para móvil (se usa de pie en el gimnasio) de Marcos Bustamante, fisio deportivo. Los clientes ven su rutina, apuntan kg y repeticiones por serie, terminan la sesión puntuando el esfuerzo (1-10, solo lo ve el entrenador) y chatean con el entrenador. El entrenador (perfil con `role='admin'`) gestiona clientes, plantilla, rutinas e importa planes desde Excel.

Página estática sin build: GitHub Pages sirve los ficheros tal cual. Backend: Supabase (autenticación por invitación + base de datos).

## Ficheros

| Fichero | Qué hay |
| --- | --- |
| `index.html` | Solo carga fuentes, `style.css`, supabase-js 2.45.4 (CDN), `config.js`, `xlsx-lite.js` y `app.js`, el manifest y registra `sw.js`. Lleva `?v=51` para saltarse la caché: súbelo en todos los `?v=` de `index.html` (iconos, `style.css`, `xlsx-lite.js` y `app.js`; `config.js` no lleva) al publicar cambios de CSS/JS. |
| `config.js` | URL y clave **anon** de Supabase (pública por diseño; los permisos los dan las políticas RLS). Nunca pongas aquí la clave `service_role`. |
| `app.js` | Toda la app (~1300 líneas). Ver abajo. |
| `style.css` | Estilos. Bloques: "barra superior", "semanas y días", "progreso y mapa de bloques", "bloque de superserie", "barra fija de sesión", "botones y formularios", "panel del entrenador", "editor del entrenador", "marca Marcos Bustamante", "series desplegables", "tipo de bloque", "formulario añadir cliente", "vista de escritorio del entrenador (Mac)", "pestaña Ejercicios", "programador de rutinas" (siempre en claro, clases `pg-`), "pestaña Programador rutinas" (clases `pc-`), "descanso «todo en negro»" (`.rest`) y "nota del fisio" (`.nota`) y «Última vez» del programador (`.pg-ult`, `.pg-lv`). Tema oscuro en `:root[data-theme="dark"]`. |
| `xlsx-lite.js` | Lector mínimo de .xlsx/.xlsm sin dependencias (lo usa la importación de Excel). |
| `manifest.webmanifest`, `sw.js` | La app se puede instalar en la pantalla de inicio. `sw.js` solo muestra el aviso «Descanso terminado» y lo abre al tocarlo; no guarda caché. |
| `icon.svg`, `apple-touch-icon.png` | Iconos de la pestaña y de la pantalla de inicio del móvil. |
| `prototipo-peso-auto.html`, `prototipo-ultima-vez-programador.html` | Prototipos sueltos: la app no los carga. |
| `supabase/` | `session_seen.sql`, `videos.sql`, `avisos_descanso.sql`, `functions/invitar-cliente/index.ts` y `functions/aviso-descanso/index.ts`. No hay `schema.sql` en el repositorio. |
| `.claude/launch.json` | Servidor local para probar la app en el puerto 8765. |

## app.js por secciones

Cabeceras `/* ---------- X ---------- */`:

- **"tema claro / oscuro"**: `applyTheme`, `curTheme`, `setTheme`. Engranaje «Opciones» en la barra superior (`GEAR`, `optsHTML`, estado `S.opts`, acciones `opts` y `theme`): Claro / Oscuro / Como el móvil. Se guarda en localStorage (`tema`) y en la cuenta de Supabase (`user_metadata.theme`) para verse igual en todos los dispositivos.
- **"arranque y sesión"**: `boot`, `enter` (decide entrenador o cliente con `isCoach()`), `loadClient`, `loadCoach`, `loadMsgs`, `loadComments`, `loadEfforts`, `loadSeen`/`markSeen` y `soft` (repinta sin pisar lo que se está escribiendo).
- **"piezas comunes"**: `topbar`, `nav` (semanas y días), `facts`, `normNav`, vídeos (`vidHTML`, `clipHTML`, `ytClip`, `inApp`), `notaHTML`, y avance de series (`isDone`, `firstFree`, `goNext`). Nombre del entrenador en `const TRAINER`.
- **"acceso"**: `loginView`, `setpwView` (invitación y recuperar contraseña), `offlineView`, `welcomeHTML`. Requisitos de contraseña en `const PWR` (8+ caracteres, mayúscula, minúscula, número y símbolo) y comprobación de contraseñas filtradas en `pwned` (Have I Been Pwned por k-anonimato; si el servicio no responde, no bloquea). Deben coincidir con lo configurado en Supabase > Authentication > Passwords.
- **"aviso de descanso (notificación push)"**: sección «Aviso de descanso» del engranaje (`pushHTML`, acciones `pushon`/`pushoff`, estado `S.pushMsg`/`S.pushBusy`). `pushOn` = permiso concedido + `avisos-<id>` en localStorage; `pushSync` (en `enter`) vuelve a guardar la suscripción. `startRest` llama a `alarmSet` (fila en `rest_alarms` con la hora de fin y la próxima serie); `stopRest` y `logout` la borran con `alarmDel` si el descanso se corta o acaba con la app a la vista. En iPhone solo funciona con la app añadida a la pantalla de inicio.
- **"cliente"**: `clientRoutine` (pantalla principal de entrenamiento), `groupsOf`/`isSS`/`syncSS` (superseries), `dget` (borrador de series; las series sin tocar se rellenan solas con `pfill`: kg y reps de la última vez o, si no hay, el primer número del plan con `num1` («Peso corporal» → «P.C.» con `pkg`), marcadas `auto` y pintadas más claritas con la clase `auto`; al guardar, las `auto` sin hacer van vacías), `lastSets`/`lastFor` ("Última vez"), descanso (`restSecs` entiende «2 min», «1 minuto y medio», «1,5 min», «1'30''», «90''», «90 s», «medio minuto» y un número solo: menos de 10 = minutos, si no segundos; `startRest`, `stopRest`, `beep`, `restBar` en negro con línea amarilla que se acorta `restPct` y la próxima serie con «Última vez» `nextSet`), nota del fisio (`notaHTML`: solo la primera clave de `tips` a la vista y el resto plegado en «Más claves»; el entrenador sigue viendo todas con `tipsHTML`), `chatHTML`, mensaje sobre un ejercicio (`exmHTML`, acción `exsend`), no leídos (`markRead`, `unreadIn`), `entrenando()` (hay alguna serie hecha en el día abierto), `sessionHTML` (historial), `hechoHTML` (pantalla «Hecho, nombre» tras guardar la sesión, estado `S.hecho`; el selector de esfuerzo 1-10 con zonas está en la hoja de terminar, clases `esf`/`ezon`; la tarjeta usa la clase `sdone`), `clientView`.
- **"entrenador"**: `coachView` (pestañas Clientes / Actividad / Programador rutinas / Ejercicios; la tercera usa `S.tab='plantilla'` y la pinta `progTabHTML`: lista de clientes `pcListHTML` con foto, los «sin rutina» arriba en amarillo, buscador `#pcq` y filtros (estado `S.pc`); se elige con `pcsel` y «Programar →» (`progcli`) abre el programador; debajo, la plantilla base. «Actualizada hace…» sale de `routines.updated_at` (`rupd`, `hace`)), `inviteHTML` (botón «+ Añadir cliente» y formulario `fInvite`, estado `S.inv`), `feedHTML`, `msgsHTML`, `newHTML`, `previewView`, `importCard`. Qué falta por responder en Actividad: `isHot`/`needsReply` y el número `actN` (definidos al final de "cliente").
- **"vista de escritorio (Mac)"**: a partir de 1024 px de ancho (`wide()`), `coachView` llama a `deskView`: menú lateral (Clientes / Actividad › Chats y Sesiones / Programador rutinas / Ejercicios, subapartado en `S.sub`), lista en el centro y detalle a la derecha. `chatsHTML` (chats estilo WhatsApp con el número de no leídos, filtro `S.cf`), `fichaHTML` (ficha del cliente sin chat) y `deskHero`. En el Mac los mensajes solo se marcan leídos con el chat abierto (`deskChat`). El editor y la vista previa van a pantalla ancha (`.wrap.wed`). En el móvil no cambia nada.
- **"base de ejercicios (pestaña Ejercicios del entrenador)"**: estado en `S.x`, prefijo `x` en funciones y en `data-x` de los botones). Lista plegable por categoría general › categoría (`xListHTML`), filtros plegables de categoría, material que tengo y vídeo (`xFiltersHTML`; en el Mac van en la columna negra), ficha (`xDetHTML`), edición y alta (`xStartEdit`, `xEditHTML`, `xsave`), editor de categorías (`xCatsHTML`), subida de vídeo propio (`xupload`) y «Cargar Excel» (`xImport`: hojas BASE_EJERCICIOSVIDEOS y LISTAS). Clics en `xact`, cambios en `xchange`. Todo se guarda con `saveLib`.
- **"programador de rutinas (editor del entrenador)"**: `editorView` (editar rutina de un cliente o plantilla; estado en `S.p`, prefijo `p` en funciones y `data-p` en botones). Base de ejercicios a la izquierda (`plibHTML`, con los filtros de la pestaña Ejercicios en `pfiltersHTML`; «Material que tengo» es el mismo `xlib.have`), el día por bloques en el centro (`pdayHTML`, `psumHTML`) y la ficha del ejercicio a la derecha (`pinspHTML`). En el móvil base y ficha suben como paneles. Arrastrar con ratón o dedo: `pdg`, `pstart`, `ptarget`, `pend`; colocar en `pplace`. Bloques: nombre editable (de base `PDEF`: Movilidad, Estabilizadores, Fuerza 1, Fuerza 2) y selector Superserie / Series normales. «Copiar con progresión» crea la semana siguiente sumando carga, repeticiones o series (`pprogHTML`). «Última vez»: al editar la rutina de un cliente se cargan sus sesiones (`loadClientSessions` en `startEdit`, en `cSessions`) y cada ejercicio enseña lo que hizo la última vez con una etiqueta Más carga / Menos carga / No llegó a las reps / Lo mandado (`plast`, `plastHTML`, `pcmp`); en la ficha, `plastBox` con series, esfuerzo y botones «Poner X kg» (acción `lastkg`). En la plantilla no sale. Clics en `pclick`, escritura en `pinput`, cambios en `pchange`.
- **"render"**: `render()` repinta todo desde el estado `S` (no hay framework).
- **"acciones"**: `act(a,t)` gestiona cada botón según su `data-act` (guardar sesión `savesession`, editor `saveed`, chat `chatsend`...).
- **"importar Excel (hoja Plan_SS1)"**: `parsePlan`, `importForClient`, `importXlsx`.
- **"eventos"**: delegación de clics, inputs y cambios.
- Al final: avatar (`setAvatar`, `resizeImg`) y refresco cada 15 s (`setInterval`).

## Datos (Supabase)

Tablas que usa la app:

- `profiles`: id, email, name, role (`client` / `admin`), avatar_url (foto de perfil; el entrenador la ve en la lista de Programador rutinas).
- `routines`: client_id, title, data = `{weeks:[{name, days:[{name, items:[ejercicio]}]}]}`, updated_at.
- `templates`: id `base` (plantilla, mismo formato que una rutina) e id `lib`, la base de ejercicios: `{items:[{name,cat,mat,prog,video,vs,tips}], gens:[{name,cats}], mats, have}`. `items` también alimenta el autocompletado del editor de rutinas; `gens` son las categorías generales; `mats` material añadido a mano; `have` material que tiene el entrenador (null = todo); `vs` = `mio`/`otro`.
- `sessions`: client_id, week, day, wname, dname, performed_at, feeling (1-5, solo sesiones antiguas: ya no se rellena), notes, items (ejercicios con `sets:[{kg,reps,done}]`).
- `session_effort`: session_id, client_id, effort (1-10, con CHECK; una fila por sesión). Privada: el cliente solo puede insertar el suyo; solo el entrenador (`is_admin()`) puede leer. La carga `loadEfforts`.
- `session_comments`: session_id, author_id, body, created_at.
- `session_seen`: session_id, seen_at. Sesiones que el entrenador ya revisó en Actividad ("Ya lo vi" o al abrirlas). Solo el entrenador (`is_admin()`). La cargan `loadSeen`/`markSeen`; vuelve a salir como "Por responder" solo si el cliente comenta después de `seen_at`. SQL en `supabase/session_seen.sql`.
- `messages`: client_id, author_id, body, kind (`bien`/`duro`/`molestia`/`duda`, con CHECK), ex_name, ctx, read_at. Cada mensaje de un cliente avisa al entrenador por correo (`notify_coach` con Resend).
- `push_subs` (móviles con avisos: endpoint, user_id, p256dh, auth) y `rest_alarms` (una alarma de descanso por usuario: fire_at, title, body). RLS: cada uno lo suyo. `push_config` (claves VAPID y contraseña del cron; RLS sin políticas, solo el servidor) y RPC `vapid_public()` (solo la clave pública). pg_cron `aviso-descanso` cada 3 s llama a la Edge Function `aviso-descanso` (verify_jwt desactivado, protegida con la cabecera `x-cron`) si hay alarmas vencidas; la función las borra y manda el push. SQL en `supabase/avisos_descanso.sql`.
- Storage: almacén público `videos` para los vídeos propios de los ejercicios (solo el entrenador sube o borra). SQL en `supabase/videos.sql`.
- RPC: `mark_read`, `set_name`, `set_avatar`. Solo afectan a quien llama (o al entrenador).
- Edge Function `invitar-cliente` (`supabase/functions/invitar-cliente/index.ts`): comprueba que quien llama es admin y envía la invitación por correo con la clave service_role (solo en el servidor). Si la cambias, vuelve a desplegarla en Supabase.

Ejercicio dentro de `items`: `{id, block, name, cat, series, reps, kg, rest, video, tips, ss}`. `video` puede ser un archivo propio (`.mp4/.webm/.mov`, p. ej. `videos/sentadilla.mp4` en este repositorio), que se ve dentro de la tarjeta, o un enlace de YouTube, que también se ve dentro de la tarjeta (`ytClip`, `inApp`, `clipHTML`): en silencio y, si el enlace lleva `&start=X&end=Y` (segundos), solo ese tramo. Otros enlaces abren fuera. `tips` = claves técnicas separadas por `;`. `block` agrupa ejercicios seguidos; `ss` marca superserie (si falta, 2+ ejercicios en el bloque = superserie).

En el navegador (localStorage): `rutina-draft-<id>` (series a medio apuntar), `welcome-<id>`, `seen-<id>` (respaldo de `session_seen`), `avisos-<id>` (avisos de descanso activados en ese móvil) y `tema` (el tema claro / oscuro).

## No tocar sin cuidado

- El formato de `data.weeks` y de `sessions.items`: lo leen las rutinas y sesiones ya guardadas.
- Las políticas de seguridad de Supabase: `config.js` cita `supabase/schema.sql`, pero no está en este repositorio. Revisa las políticas antes de cambiar tablas.
- La marca: colores y fuentes según la skill `marca-marcos-bustamante` (Anton, Barlow, Barlow Condensed, IBM Plex Mono; negro, amarillo, azul).
- Entreno sin distracciones (vista del cliente): con la sesión en marcha (`entrenando()`), el aviso de Chat es un punto gris sin número (`.dot2.calm`); los enlaces de vídeo externos no se enseñan al cliente; YouTube va en silencio y en bucle (el logo de YouTube sigue enlazando fuera: mejor vídeos propios). Nada de autoplay con sonido, confeti, notificaciones ni animaciones. Única excepción, pedida por los clientes: el aviso «Descanso terminado» (push), que solo se activa si el cliente lo pide en Opciones.
