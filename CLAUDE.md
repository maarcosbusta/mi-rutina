# Mi Rutina: mapa del proyecto

Lee esto antes de tocar nada. Busca el texto entre comillas para ir directo a cada parte. Si cambias la estructura, actualiza este mapa en el mismo commit.

## Qué es

App web para móvil (se usa de pie en el gimnasio) de Marcos Bustamante, fisio deportivo. Los clientes ven su rutina, apuntan kg y repeticiones por serie, terminan la sesión puntuando el esfuerzo (1-10, solo lo ve el entrenador) y chatean con el entrenador. El entrenador (perfil con `role='admin'`) gestiona clientes, plantilla, rutinas e importa planes desde Excel.

Página estática sin build: GitHub Pages sirve los ficheros tal cual. Backend: Supabase (autenticación por invitación + base de datos).

## Ficheros

| Fichero | Qué hay |
| --- | --- |
| `index.html` | Solo carga fuentes, `style.css`, supabase-js 2.45.4 (CDN), `config.js`, `xlsx-lite.js` y `app.js`. Lleva `?v=44` para saltarse la caché: súbelo en los tres ficheros al publicar cambios de CSS/JS. |
| `config.js` | URL y clave **anon** de Supabase (pública por diseño; los permisos los dan las políticas RLS). Nunca pongas aquí la clave `service_role`. |
| `app.js` | Toda la app (~1200 líneas). Ver abajo. |
| `style.css` | Estilos. Bloques: "barra superior", "semanas y días", "progreso y mapa de bloques", "bloque de superserie", "barra fija de sesión", "botones y formularios", "panel del entrenador", "editor del entrenador", "marca Marcos Bustamante", "series desplegables", "tipo de bloque", "formulario añadir cliente", "vista de escritorio del entrenador (Mac)", "pestaña Ejercicios", "programador de rutinas" (siempre en claro, clases `pg-`), "pestaña Programador rutinas" (clases `pc-`), "descanso «todo en negro»" (`.rest`) y "nota del fisio" (`.nota`). Tema oscuro en `:root[data-theme="dark"]`. |
| `xlsx-lite.js` | Lector mínimo de .xlsx/.xlsm sin dependencias (lo usa la importación de Excel). |

## app.js por secciones

Cabeceras `/* ---------- X ---------- */`:

- **"arranque y sesión"**: `boot`, `enter` (decide entrenador o cliente con `isCoach()`), `loadClient`, `loadCoach`, `loadMsgs`, `loadComments`.
- **"tema claro / oscuro"**: `applyTheme`, `curTheme`, `setTheme`. Engranaje «Opciones» en la barra superior (`GEAR`, `optsHTML`, estado `S.opts`, acciones `opts` y `theme`): Claro / Oscuro / Como el móvil. Se guarda en localStorage (`tema`) y en la cuenta de Supabase (`user_metadata.theme`) para verse igual en todos los dispositivos.
- **"piezas comunes"**: `topbar`, `nav` (semanas y días), `facts`, `normNav`. Nombre del entrenador en `const TRAINER`.
- **"acceso"**: `loginView`, `setpwView` (invitación y recuperar contraseña), `offlineView`, `welcomeHTML`. Requisitos de contraseña en `const PWR` (8+ caracteres, mayúscula, minúscula, número y símbolo) y comprobación de contraseñas filtradas en `pwned` (Have I Been Pwned por k-anonimato; si el servicio no responde, no bloquea). Deben coincidir con lo configurado en Supabase > Authentication > Passwords.
- **"cliente"**: `clientRoutine` (pantalla principal de entrenamiento), `groupsOf`/`isSS`/`syncSS` (superseries), `dget` (borrador de series), `lastSets`/`lastFor` ("Última vez"), descanso (`startRest`, `restBar` en negro con línea amarilla que se acorta `restPct` y la próxima serie con «Última vez» `nextSet`), nota del fisio (`notaHTML`: solo la primera clave de `tips` a la vista y el resto plegado en «Más claves»; el entrenador sigue viendo todas con `tipsHTML`), `chatHTML`, `sessionHTML` (historial), `hechoHTML` (pantalla «Hecho, nombre» tras guardar la sesión, estado `S.hecho`; el selector de esfuerzo 1-10 con zonas está en la hoja de terminar, clases `esf`/`ezon`; la tarjeta usa la clase `sdone`), `clientView`.
- **"entrenador"**: `coachView` (pestañas Clientes / Actividad / Programador rutinas / Ejercicios; la tercera usa `S.tab='plantilla'` y la pinta `progTabHTML`: lista de clientes `pcListHTML` con foto, los «sin rutina» arriba en amarillo, buscador `#pcq` y filtros (estado `S.pc`); se elige con `pcsel` y «Programar →» (`progcli`) abre el programador; debajo, la plantilla base. «Actualizada hace…» sale de `routines.updated_at` (`rupd`, `hace`)), `inviteHTML` (botón «+ Añadir cliente» y formulario `fInvite`, estado `S.inv`), `feedHTML`, `msgsHTML`, `newHTML`, `previewView`, `importCard`.
- **"vista de escritorio (Mac)"**: a partir de 1024 px de ancho (`wide()`), `coachView` llama a `deskView`: menú lateral (Clientes / Actividad › Chats y Sesiones / Programador rutinas / Ejercicios, subapartado en `S.sub`), lista en el centro y detalle a la derecha. `chatsHTML` (chats estilo WhatsApp con el número de no leídos, filtro `S.cf`), `fichaHTML` (ficha del cliente sin chat) y `deskHero`. En el Mac los mensajes solo se marcan leídos con el chat abierto (`deskChat`). El editor y la vista previa van a pantalla ancha (`.wrap.wed`). En el móvil no cambia nada.
- **"base de ejercicios"**: pestaña Ejercicios del entrenador (estado en `S.x`, prefijo `x` en funciones y en `data-x` de los botones). Lista plegable por categoría general › categoría (`xListHTML`), filtros plegables de categoría, material que tengo y vídeo (`xFiltersHTML`; en el Mac van en la columna negra), ficha (`xDetHTML`), edición y alta (`xStartEdit`, `xEditHTML`, `xsave`), editor de categorías (`xCatsHTML`), subida de vídeo propio (`xupload`) y «Cargar Excel» (`xImport`: hojas BASE_EJERCICIOSVIDEOS y LISTAS). Clics en `xact`, cambios en `xchange`. Todo se guarda con `saveLib`.
- **"programador de rutinas (editor del entrenador)"**: `editorView` (editar rutina de un cliente o plantilla; estado en `S.p`, prefijo `p` en funciones y `data-p` en botones). Base de ejercicios a la izquierda (`plibHTML`, con los filtros de la pestaña Ejercicios en `pfiltersHTML`; «Material que tengo» es el mismo `xlib.have`), el día por bloques en el centro (`pdayHTML`, `psumHTML`) y la ficha del ejercicio a la derecha (`pinspHTML`). En el móvil base y ficha suben como paneles. Arrastrar con ratón o dedo: `pdg`, `pstart`, `ptarget`, `pend`; colocar en `pplace`. Bloques: nombre editable (de base `PDEF`: Movilidad, Estabilizadores, Fuerza 1, Fuerza 2) y selector Superserie / Series normales. «Copiar con progresión» crea la semana siguiente sumando carga, repeticiones o series (`pprogHTML`). Clics en `pclick`, escritura en `pinput`, cambios en `pchange`.
- **"render"**: `render()` repinta todo desde el estado `S` (no hay framework).
- **"acciones"**: `act(a,t)` gestiona cada botón según su `data-act` (guardar sesión `savesession`, editor `saveed`, chat `chatsend`...).
- **"importar Excel (hoja Plan_SS1)"**: `parsePlan`, `importForClient`, `importXlsx`.
- **"eventos"**: delegación de clics, inputs y cambios.
- Al final: avatar (`setAvatar`, `resizeImg`) y refresco cada pocos segundos (`setInterval`).

## Datos (Supabase)

Tablas que usa la app:

- `profiles`: id, email, name, role (`client` / `admin`), avatar_url (foto de perfil; el entrenador la ve en la lista de Programador rutinas).
- `routines`: client_id, title, data = `{weeks:[{name, days:[{name, items:[ejercicio]}]}]}`, updated_at.
- `templates`: id `base` (plantilla, mismo formato que una rutina) e id `lib`, la base de ejercicios: `{items:[{name,cat,mat,prog,video,vs,tips}], gens:[{name,cats}], mats, have}`. `items` también alimenta el autocompletado del editor de rutinas; `gens` son las categorías generales; `mats` material añadido a mano; `have` material que tiene el entrenador (null = todo); `vs` = `mio`/`otro`.
- `sessions`: client_id, week, day, wname, dname, performed_at, feeling (1-5, solo sesiones antiguas: ya no se rellena), notes, items (ejercicios con `sets:[{kg,reps,done}]`).
- `session_effort`: session_id, client_id, effort (1-10). Privada: el cliente solo puede insertar el suyo; solo el entrenador (`is_admin()`) puede leer. La carga `loadEfforts`.
- `session_comments`: session_id, author_id, body, created_at.
- `session_seen`: session_id, seen_at. Sesiones que el entrenador ya revisó en Actividad ("Ya lo vi" o al abrirlas). Solo el entrenador (`is_admin()`). La cargan `loadSeen`/`markSeen`; vuelve a salir como "Por responder" solo si el cliente comenta después de `seen_at`. SQL en `supabase/session_seen.sql`.
- `messages`: client_id, author_id, body, kind (`bien`/`duro`/`molestia`/`duda`), ex_name, ctx, read_at.
- Storage: almacén público `videos` para los vídeos propios de los ejercicios (solo el entrenador sube o borra). SQL en `supabase/videos.sql`.
- RPC: `mark_read`, `set_name`, `set_avatar`.
- Edge Function `invitar-cliente` (`supabase/functions/invitar-cliente/index.ts`): comprueba que quien llama es admin y envía la invitación por correo con la clave service_role (solo en el servidor). Si la cambias, vuelve a desplegarla en Supabase.

Ejercicio dentro de `items`: `{id, block, name, cat, series, reps, kg, rest, video, tips, ss}`. `video` puede ser un archivo propio (`.mp4/.webm/.mov`, p. ej. `videos/sentadilla.mp4` en este repositorio), que se ve dentro de la tarjeta, o un enlace (YouTube), que abre fuera. `tips` = claves técnicas separadas por `;`. `block` agrupa ejercicios seguidos; `ss` marca superserie (si falta, 2+ ejercicios en el bloque = superserie).

En el navegador (localStorage): `rutina-draft-<id>` (series a medio apuntar), `welcome-<id>`, `seen-<id>`, `tema` (respaldo de `session_seen`).

## No tocar sin cuidado

- El formato de `data.weeks` y de `sessions.items`: lo leen las rutinas y sesiones ya guardadas.
- Las políticas de seguridad de Supabase: `config.js` cita `supabase/schema.sql` y `GUIA.md`, pero no están en este repositorio. Revisa las políticas antes de cambiar tablas.
- La marca: colores y fuentes según la skill `marca-marcos-bustamante` (Anton, Barlow, Barlow Condensed, IBM Plex Mono; negro, amarillo, azul).
