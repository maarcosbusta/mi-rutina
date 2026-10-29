# Mi Rutina: mapa del proyecto

Lee esto antes de tocar nada. Busca el texto entre comillas para ir directo a cada parte. Si cambias la estructura, actualiza este mapa en el mismo commit.

## Qué es

App web para móvil (se usa de pie en el gimnasio) de Marcos Bustamante, fisio deportivo. Los clientes ven su rutina, apuntan kg y repeticiones por serie, terminan la sesión puntuando el esfuerzo (1-10, solo lo ve el entrenador) y chatean con el entrenador. El entrenador (perfil con `role='admin'`) gestiona clientes, plantilla, rutinas e importa planes desde Excel.

Página estática sin build: GitHub Pages sirve los ficheros tal cual. Backend: Supabase (autenticación por invitación + base de datos).

## Ficheros

| Fichero | Qué hay |
| --- | --- |
| `index.html` | Solo carga fuentes, `style.css`, supabase-js 2.45.4 (CDN), `config.js`, `xlsx-lite.js` y `app.js`. Lleva `?v=32` para saltarse la caché: súbelo en los tres ficheros al publicar cambios de CSS/JS. |
| `config.js` | URL y clave **anon** de Supabase (pública por diseño; los permisos los dan las políticas RLS). Nunca pongas aquí la clave `service_role`. |
| `app.js` | Toda la app (~620 líneas). Ver abajo. |
| `style.css` | Estilos. Bloques: "barra superior", "semanas y días", "progreso y mapa de bloques", "bloque de superserie", "barra fija de sesión", "botones y formularios", "panel del entrenador", "editor del entrenador", "marca Marcos Bustamante", "series desplegables", "tipo de bloque". Tema oscuro en `:root[data-theme="dark"]`. |
| `xlsx-lite.js` | Lector mínimo de .xlsx/.xlsm sin dependencias (lo usa la importación de Excel). |

## app.js por secciones

Cabeceras `/* ---------- X ---------- */`:

- **"arranque y sesión"**: `boot`, `enter` (decide entrenador o cliente con `isCoach()`), `loadClient`, `loadCoach`, `loadMsgs`, `loadComments`.
- **"piezas comunes"**: `topbar`, `nav` (semanas y días), `facts`, `normNav`. Nombre del entrenador en `const TRAINER`.
- **"acceso"**: `loginView`, `setpwView` (invitación y recuperar contraseña), `offlineView`, `welcomeHTML`. Requisitos de contraseña en `const PWR` (8+ caracteres, mayúscula, minúscula, número y símbolo) y comprobación de contraseñas filtradas en `pwned` (Have I Been Pwned por k-anonimato; si el servicio no responde, no bloquea). Deben coincidir con lo configurado en Supabase > Authentication > Passwords.
- **"cliente"**: `clientRoutine` (pantalla principal de entrenamiento), `groupsOf`/`isSS`/`syncSS` (superseries), `dget` (borrador de series), `lastSets`/`lastFor` ("Última vez"), descanso (`startRest`, `restBar`), `chatHTML`, `sessionHTML` (historial), `clientView`.
- **"entrenador"**: `coachView` (pestañas Clientes / Actividad / Plantilla), `feedHTML`, `msgsHTML`, `newHTML`, `previewView`, `editorView`, `importCard`.
- **"render"**: `render()` repinta todo desde el estado `S` (no hay framework).
- **"acciones"**: `act(a,t)` gestiona cada botón según su `data-act` (guardar sesión `savesession`, editor `saveed`, chat `chatsend`...).
- **"importar Excel (hoja Plan_SS1)"**: `parsePlan`, `importForClient`, `importXlsx`.
- **"eventos"**: delegación de clics, inputs y cambios.
- Al final: avatar (`setAvatar`, `resizeImg`) y refresco cada pocos segundos (`setInterval`).

## Datos (Supabase)

Tablas que usa la app:

- `profiles`: id, email, name, role (`client` / `admin`), avatar_url.
- `routines`: client_id, title, data = `{weeks:[{name, days:[{name, items:[ejercicio]}]}]}`, updated_at.
- `templates`: id `base` (plantilla, mismo formato que una rutina) e id `lib` (`{items:[{name}]}`, autocompletado de ejercicios).
- `sessions`: client_id, week, day, wname, dname, performed_at, feeling (1-5, solo sesiones antiguas: ya no se rellena), notes, items (ejercicios con `sets:[{kg,reps,done}]`).
- `session_effort`: session_id, client_id, effort (1-10). Privada: el cliente solo puede insertar el suyo; solo el entrenador (`is_admin()`) puede leer. La carga `loadEfforts`.
- `session_comments`: session_id, author_id, body, created_at.
- `session_seen`: session_id, seen_at. Sesiones que el entrenador ya revisó en Actividad ("Ya lo vi" o al abrirlas). Solo el entrenador (`is_admin()`). La cargan `loadSeen`/`markSeen`; vuelve a salir como "Por responder" solo si el cliente comenta después de `seen_at`. SQL en `supabase/session_seen.sql`.
- `messages`: client_id, author_id, body, kind (`bien`/`duro`/`molestia`/`duda`), ex_name, ctx, read_at.
- RPC: `mark_read`, `set_name`, `set_avatar`.

Ejercicio dentro de `items`: `{id, block, name, cat, series, reps, kg, rest, video, tips, ss}`. `video` puede ser un archivo propio (`.mp4/.webm/.mov`, p. ej. `videos/sentadilla.mp4` en este repositorio), que se ve dentro de la tarjeta, o un enlace (YouTube), que abre fuera. `tips` = claves técnicas separadas por `;`. `block` agrupa ejercicios seguidos; `ss` marca superserie (si falta, 2+ ejercicios en el bloque = superserie).

En el navegador (localStorage): `rutina-draft-<id>` (series a medio apuntar), `welcome-<id>`, `seen-<id>` (respaldo de `session_seen`).

## No tocar sin cuidado

- El formato de `data.weeks` y de `sessions.items`: lo leen las rutinas y sesiones ya guardadas.
- Las políticas de seguridad de Supabase: `config.js` cita `supabase/schema.sql` y `GUIA.md`, pero no están en este repositorio. Revisa las políticas antes de cambiar tablas.
- La marca: colores y fuentes según la skill `marca-marcos-bustamante` (Anton, Barlow, Barlow Condensed, IBM Plex Mono; negro, amarillo, azul).
