# K-Rez — Documentación (Plan B: Frontend)

App web de gestión de canciones con letra sincronizada, reproductor integrado (archivo propio +
YouTube) y modo de control remoto entre dispositivos del mismo usuario.

Este documento cubre la parte de **Plan B**: todo el frontend (`web/`), Firebase Auth/Firestore,
y su contrato con el servidor de **Plan A**. Lo que falta por hacer está en
[`PENDIENTES.md`](./PENDIENTES.md).

## 1. Arquitectura general — dos sesiones, un solo repo

El proyecto se construye en dos sesiones de trabajo independientes, sin canal directo entre sí (todo
se coordina a través del usuario, copiando mensajes de una sesión a la otra):

- **Plan A** — corre en otra máquina ("SERVER-REZ"). Backend FastAPI (`~/k-rez/backend/`) que expone
  storage/streaming de audio, verificación de idToken de Firebase, y (a futuro) el canal SSE de
  control remoto. Solo alcanzable por Tailscale hoy (`http://100.82.19.31:8081`).
- **Plan B** — esta sesión. Todo el frontend: `web/`, Firebase Auth + Firestore (SDK directo, sin API
  propia intermedia), publicación en GitHub Pages vía GitHub Actions.

Ver la sección 6 para el contrato exacto entre ambos.

## 2. Stack

- **Vanilla JS + ES modules nativos** — sin bundler, sin paso de build. Import map en `index.html`
  para cargar el SDK modular de Firebase desde CDN.
- **Firebase Auth** (Google Sign-In, popup) + **Firestore** (SDK directo desde el navegador).
- **YouTube IFrame API** para la fuente de video (cargada en runtime, nunca se descarga audio de
  YouTube).
- **GitHub Pages** vía GitHub Actions (`.github/workflows/deploy-pages.yml`) — el workflow solo copia
  la carpeta `web/`, no compila nada.
- CSS plano con custom properties, mobile-first con ajustes específicos para escritorio (≥900px).

## 3. Estructura de carpetas

```
K-Rez/
├── firebase.json, .firebaserc, firestore.rules, firestore.indexes.json
├── .github/workflows/deploy-pages.yml
├── docs/                              (esta documentación)
│   └── plan-B-webapp-firebase-original.md   (planeación original, histórico)
└── web/                               ← raíz publicada en GitHub Pages
    ├── index.html, manifest.webmanifest
    ├── css/
    │   ├── base.css        (reset, variables/tokens de cristal, .screen/.screen-wide, header fijo,
    │   │                     fondo animado con acento de carátula, scrollbars, íconos)
    │   ├── components.css  (inputs, botones, .bar, lista de canciones, sidebar de canciones)
    │   ├── player.css      (transporte, barra de buffer unificada, layout de Live, player-bar fijo)
    │   ├── lyrics.css      (editor de letra/secciones, panel de letra y chips en Live)
    │   └── remote.css      (reservado para Fase 4, vacío)
    └── js/
        ├── app.js                    (rutas + bootstrap de auth)
        ├── firebase-config.js        (config del proyecto Firebase — no es secreta)
        ├── router.js                 (hash router mínimo)
        ├── auth/
        │   ├── auth-service.js       (Google Sign-In, sign out, getIdToken)
        │   ├── auth-guard.js         (redirige a /login si no hay usuario)
        │   └── access-config.js      (lee el email permitido desde Firestore)
        ├── data/
        │   ├── firestore-paths.js
        │   └── songs-repo.js         (CRUD de canciones, offsets, letra, secciones)
        ├── views/
        │   ├── login-view.js
        │   ├── songs-list-view.js
        │   ├── song-edit-view.js     (metadata: nombre/artista/key/bpm)
        │   ├── song-config-view.js   (setup: subir archivo/link, calibrar offset, editar letra/secciones)
        │   ├── song-live-view.js     (consumo: video + letra + secciones, solo lectura)
        │   ├── song-header.js        (header compartido Live/Config — título + navegación, ver sección 10)
        │   ├── songs-sidebar.js      (panel lateral con la lista de canciones + su pestaña, ver sección 10)
        │   ├── cover-accent.js       (acento de color de la carátula + tracking de su posición en pantalla)
        │   └── file-slot.js          (dropzone/input de archivo reusado en los paneles de Config)
        ├── player/
        │   ├── player-source.js      (contrato base de una fuente de audio/video)
        │   ├── file-audio-source.js  (envuelve <audio>)
        │   ├── youtube-source.js     (envuelve YT.Player)
        │   ├── mix-source.js         (mezcla instrumental + voces como dos FileAudioSource sincronizados)
        │   ├── player-controller.js  (única interfaz que usan las vistas; offsets, crossfade, preload)
        │   ├── player-session.js     (sesión de reproducción persistente entre Live/Config de una canción)
        │   ├── player-bar.js         (barra de transporte fija — play/pause, seek, buffer, tiempo)
        │   ├── mix-control.js        (segmented control Inst/Original/Voz + popover de ajuste fino)
        │   ├── audio-reactive-bg.js  (analiza el audio para el fondo animado, ver sección 10)
        │   ├── version-resolution.js (helpers compartidos entre Config y Live)
        │   └── offset-calibrator.js  (UI de calibración de offset)
        ├── lyrics/
        │   ├── lyrics-editor.js      (editor de letra en Config)
        │   ├── sections-editor.js    (editor de estructura/secciones en Config)
        │   └── lyrics-playback.js    (resalta línea/sección activa durante reproducción — genérico)
        ├── media/
        │   ├── api-client.js         (fetch autenticado contra el servidor de Plan A)
        │   └── media-url.js          (resuelve una URL de audio reproducible con token fresco)
        └── utils/
            ├── events.js, time-format.js, dom-helpers.js
            ├── color-extract.js      (extrae el color dominante de una imagen, ver sección 10)
            └── icons.js              (íconos de Lucide como SVG inline, ver sección 10)
```

## 4. Autenticación

- Login exclusivamente con **Google (popup)** — se probó `signInWithRedirect` primero pero fallaba en
  Edge/localhost por protecciones de tracking de terceros; `signInWithPopup` es la decisión final.
- **Restricción a un solo usuario**, en dos capas:
  1. `firestore.rules` — toda regla pasa por `isSignedIn()`, que compara
     `request.auth.token.email` contra `get(/databases/$(database)/documents/config/access).data.allowedEmail`.
     Esta es la barrera real (server-side), no bypasseable desde el cliente.
  2. Cliente (`auth-service.js` → `enforceAllowedUser`) — si el email no coincide, cierra la sesión
     inmediatamente y muestra "Esa cuenta de Google no tiene acceso a esta app." en vez de dejar ver
     una app vacía.
- El email permitido **no está hardcodeado** — vive en el documento `config/access` de Firestore
  (campo `allowedEmail`), editable desde la consola de Firebase sin tocar código. Ver
  `access-config.js`.
- Requiere que el documento `config/access` exista antes de poder loguearse (falla cerrado si no
  existe).

## 5. Modelo de datos (Firestore)

Colección única `songs`, filtrada por `ownerUid` (aunque hoy es single-user, se escribe ya pensando en
eso):

```
songs/{songId}
  nombre: string
  artista: string
  key: string
  bpm: number | null
  ownerUid: string
  letra: [
    { texto: string, timestampSeconds: number | null, endSeconds?: number | null }
  ]
  secciones: [
    { nombre: string, timestampSeconds: number | null }
  ]
  versiones: {
    original: { tipo: "archivo" | "youtube", url: string, offsetSeconds: number }
    karaoke:  { tipo: "archivo" | "youtube", url: string, offsetSeconds: number }
  }

config/access
  allowedEmail: string    (único documento, no tiene songId — es config global)
```

**Decisiones de diseño no obvias:**
- Los `timestampSeconds` de `letra[]` y `secciones[]` son **siempre relativos a la línea de tiempo de
  la versión `original`**, sin importar qué versión esté sonando. `PlayerController.convertBetweenVersions()`
  hace la conversión automática al marcar o al hacer seek desde `karaoke`. Esto evita tener dos
  nociones de "tiempo canónico".
- Para versiones de tipo `archivo`, el campo `url` guarda la ruta base **sin token**
  (`/media/{songId}/{version}`) — es solo un indicador de "hay algo subido". La URL reproducible con
  token se resuelve en caliente (`media-url.js`) y nunca se persiste, porque el token dura 15 minutos.
- Líneas de letra con `texto` vacío (`""`) son separadores visuales de estrofa para Live. En Config
  siguen siendo una fila (toda línea es una fila, siempre — ver sección 9), solo que sin controles de
  tiempo hasta que se les escribe algo.
- `endSeconds` es opcional. Lo puebla el import por JSON (ver sección 9) o, en Config, el botón ícono
  `circle` de la derecha de cada fila ("Marcar Fin") — independiente del de la izquierda ("Marcar Inicio"),
  cada uno solo afecta su propia fila (no hay cascada entre filas). Cuando `endSeconds` existe,
  `lyrics-playback.js` apaga el resaltado de esa línea al pasarlo en vez de mantenerla activa hasta que
  arranque la siguiente, para no marcar de más durante huecos instrumentales largos. Sin
  `timestampSeconds` (start) propio, una fila no se resalta nunca — `endSeconds` sin `start` no tiene
  efecto.
- Convención `[texto]`: una línea de letra cuyo `texto` (recortado) matchea `/^\[.*\]$/` es una marca de
  sección no cantada (ej. `[Inst]`), no letra real — se puede escribir así tanto en el textarea de
  "Reemplazar"/"Importar JSON" como a mano en el campo de texto de una fila en Config. `[]` (sin
  etiqueta adentro) es el estado por defecto: sigue siendo una fila real con tiempo marcable (a
  diferencia de una línea con `texto: ""`, que es solo un separador sin tiempo), pero Live **no la
  agrega al DOM** — a diferencia de una línea en blanco (que sí reserva 2em de alto como separador
  visual de estrofa), un `[]` sin etiqueta no ocupa ningún espacio; solo existe para apagar el resaltado
  de la línea anterior en el instrumental. Si se le pone contenido (`[Inst]`), Live sí la muestra, en
  cursiva (`.live-lyrics-marker`). Ver `parseMarkerLine` en `song-live-view.js`.

## 6. Contrato con el servidor de Plan A

Confirmado y probado end-to-end (2026-08-14):

| Endpoint | Método | Auth | Notas |
|---|---|---|---|
| `POST /api/upload` | multipart | idToken Firebase (header) | Cliente manda `cancion_id` (= songId de Firestore, reusado para que ambas versiones caigan en la misma carpeta), `version`, `file`. |
| `POST /api/media-token` | JSON | idToken Firebase (header) | Body `{cancion_id, version}` (snake_case). Devuelve `{token, expires_in}` — `expires_in` siempre 900s. |
| `GET /media/{id}/{version}` | — | Query param `?token=...` (token corto, no idToken) | Soporta Range (`206 Partial Content`), confirmado. |
| `GET /control/stream` (SSE) | — | Diseño propuesto, no implementado | Ver Pendientes. |
| `POST /control/command` | — | Diseño propuesto, no implementado | Ver Pendientes. |

**Importante:** el token de `/api/media-token` nunca se guarda — se pide fresco cada vez
(`media-url.js`), y `PlayerController` refresca el archivo activo cada 10 minutos
(`reloadActiveVersion()`) preservando posición y estado de reproducción, para no perder el stream a
mitad de un TTL de 15 min.

**Mixed content:** `MEDIA_BASE_URL` en `api-client.js` apunta a `http://100.82.19.31:8081` (Tailscale,
sin TLS). Funciona en `http://localhost` pero el navegador lo va a bloquear en cuanto el sitio se
sirva desde GitHub Pages (https). Bloqueante solo para publicación real (Fase 5), no para seguir
desarrollando localmente — depende del Cloudflare Tunnel que es responsabilidad de Plan A.

## 7. Rutas de la SPA (`app.js`)

| Ruta | Vista | Qué hace |
|---|---|---|
| `/login` | `login-view.js` | Botón único "Iniciar sesión con Google". |
| `/songs` | `songs-list-view.js` | Lista de canciones del usuario, alta/edición/borrado. |
| `/songs/new` | `song-edit-view.js` | Alta de canción (metadata). |
| `/songs/:id` | `song-live-view.js` | **Live** — vista principal al abrir una canción. |
| `/songs/:id/config` | `song-config-view.js` | Setup y edición (antes vivía en `/songs/:id`). |
| `/songs/:id/edit` | `song-edit-view.js` | Edición de metadata. |

Live es la vista "home" de una canción; si no tiene ningún recurso configurado (`versiones.original` y
`versiones.karaoke` ambas sin `url`), redirige a Config con un aviso (`sessionStorage` flag
`k-rez-live-blocked`).

## 8. El reproductor

Pieza central del proyecto — diseñada para que **letra, secciones y control remoto (a futuro) nunca
necesiten saber si la fuente activa es un archivo o un video de YouTube**.

- `PlayerSource` — contrato base (`load/play/pause/seekTo/getCurrentTime/getDuration/getBufferedFraction/setVolume`)
  + eventos (`ready/play/pause/timeupdate/ended/error`).
- `FileAudioSource` — envuelve `<audio>`. `getBufferedFraction()` lee `audio.buffered`.
- `YoutubeSource` — envuelve `YT.Player`. Importante: la API de YouTube **reemplaza** el elemento DOM
  que recibe por un `<iframe>`, así que se le pasa un div interno descartable (`mountPoint`) y el
  contenedor real que maneja la vista nunca se toca — evita que un `classList.toggle` posterior quede
  operando sobre un nodo huérfano.
- `PlayerController` — la única interfaz que consumen las vistas:
  - `loadVersion` / `switchTo` (con **crossfade de 600ms** entre fuentes si estaba sonando) /
    `reloadActiveVersion` (refresco de token sin perder posición).
  - `preloadVersion` — precarga la versión inactiva en segundo plano apenas termina de cargar la
    activa, para que el toggle se sienta instantáneo. Un `Set` interno (`#loadedVersions`) evita
    recargar una fuente ya bufferizada.
  - `convertBetweenVersions(seconds, fromKey, toKey)` — la fórmula de offset
    (`seconds - offsetOrigen + offsetDestino`) que usan letra, secciones y el propio toggle de versión.
  - `getBufferedFractionFor(versionKey)` — buffer de una versión específica (activa o precargada), para
    poder mostrar ambos buffers a la vez en la UI.

### UI del slider

Una sola barra (`.seek-wrapper` en `player.css`) con tres capas:
1. `.seek-buffer-track` — fondo dividido en mitad superior (buffer de `original`) y mitad inferior
   (buffer de `karaoke`), coloreado según tipo: rojo si es YouTube, azul oscuro si es `original`
   archivo, gris claro si es `karaoke` archivo (`bufferColorClass` en `version-resolution.js`).
2. El `<input type="range">` real, con track transparente y un gradiente CSS (`--played`, seteado por
   JS en cada `timeupdate`) que pinta el progreso reproducido por encima del buffer.
3. El thumb, estilizado a mano vía pseudo-elementos (`::-webkit-slider-thumb` / `::-moz-range-thumb`).

El reproductor (play/pause, slider, ±1s) vive en una barra fija al fondo de la pantalla
(`.player-bar`, `position: fixed`) tanto en Config como en Live — el contenido normal de la página
lleva `padding-bottom` (`.has-player-bar`) para no quedar tapado.

### Barra del reproductor: navegación consolidada

La navegación entre vistas se reparte entre `.player-bar` (versión/mezcla) y `.screen-header` (Config↔Live
y volver a la lista) — el sidebar de canciones ya no vive en ninguna de las dos, tiene su propia pestaña
fija (ver sección 10):

- **Transporte** — `−1s`/play-pause/`+1s`/slider/tiempo.
- **Un solo botón de versión** (no dos pills separadas) que muestra la versión activa (`VERSION_LABEL`,
  "Original"/"Karaoke") y alterna a la otra al clickearlo — mismo patrón en Live y Config.
- **Un solo botón para saltar a la otra vista**, en el header (ícono `settings` + "Config" en Live, ícono
  `play` + "Live" en Config — ver `song-header.js`).
- **Volver a la lista** — ícono `house`, en el header, siempre navega a `/songs` sin importar desde qué
  vista se abrió (antes, el "Volver" de Config llevaba a Live en vez de a la lista; ahora ambos van al
  mismo lado).

El sidebar de canciones (`createSongsSidebar()` en `songs-sidebar.js`, compartido entre Live y Config):
panel lateral con la lista de canciones del usuario (`listSongsForUser`), cada una con su propio botón de
play además del nombre (clickeable para navegar sin reproducir). Ese botón hace dos cosas: guarda en
`sessionStorage` (`k-rez-autoplay-request`) un pedido `{songId, mode}` — `mode` es el resultado de
`getCurrentMode()`, la versión que esté sonando *en ese momento* en la vista desde la que se abrió el
sidebar — y navega al Live de esa canción. `takeAutoplayRequest(songId)` (llamado una sola vez al montar
`renderLiveView`) lo consume: si hay un pedido para esa canción y el modo pedido está disponible, Live
arranca en ese modo y dispara `playerController.play()` automáticamente apenas el reproductor está listo
— sin este mecanismo, cada canción abierta desde el sidebar volvería a defaultear a "Original" y a esperar
un click más.

Config ya no muestra el video de YouTube (`.youtube-container.hidden` fijo) — el elemento sigue existiendo
en el DOM porque `YoutubeSource` necesita dónde montar el iframe cuando la versión activa es de tipo
`youtube`, solo que oculto; el audio sigue sonando igual, no hace falta verlo para calibrar offsets o
marcar tiempos.

## 9. Letra y estructura (secciones)

- **Config** (`lyrics-editor.js`): la lista de filas (`.lyrics-rows`) se ve como un único textarea — un
  solo borde real para todo el bloque, sin gap entre filas, sin borde/padding/margin propio en ningún
  botón o input de adentro (todo escapado bajo `.lyrics-editor` en `lyrics.css`, para no afectar a
  `sections-editor.js`, que comparte las mismas clases base pero mantiene su look normal con bordes).
  Los botones **por fila** son solo ícono (Lucide vía `icon()` de `utils/icons.js` — ver sección 10, ya
  no caracteres Unicode sueltos); los botones del **toolbar** (fuera de `.lyrics-rows`: modo, reemplazar,
  importar/exportar, agregar, guardar) llevan ícono + texto, por ser pocos y más importantes que la
  repetición densa de las filas.
- **Dos modos globales, mutuamente excluyentes en contenido** (`mode`, `setMode()`, botones "Setup" /
  "Edición" en el toolbar, cada uno con su ícono — `settings`/`pencil`):
  - **Setup** (default): para marcar tiempos sin arriesgar la estructura. Cada fila muestra tiempo de
    inicio y fin editables (ver más abajo) con sus nudges `−`/`+` (0.1s, tooltip) y un botón ícono
    `circle` (relleno) en cada extremo absoluto de la fila — el de la izquierda ("Marcar Inicio") setea
    `timestampSeconds`, el de la derecha ("Marcar Fin") setea `endSeconds`; cada uno independiente, sin
    efecto sobre otras filas (no hay cascada). No hay forma de editar el texto en este modo ni de
    agregar/eliminar líneas — es exclusivamente para tiempos; el texto es de solo lectura, clickear las
    dos zonas del input hace seek.
  - **Edición**: para reescribir/reestructurar contenido. Todas las filas quedan con el texto editable al
    mismo tiempo (sin ningún toggle por fila), con íconos `arrowUp`/`arrowDown`/`x` visibles en cada fila
    (más "+ Línea" al final) para insertar o borrar. No se muestra ningún control de tiempo.
  - `renderRows()` arma cada fila distinto según el modo (`rowChildren`); cambiar de modo re-renderiza
    toda la lista.
- **Tiempo editable a mano**: los campos de tiempo (start/end) son `<input type="text">`, no botones — al
  enfocarlos muestran el número crudo y seleccionado (fácil de sobreescribir), y al perder el foco o con
  Enter se parsea y redondea a 2 decimales (`commitTimeEdit`). Se muestran tal cual están guardados, sin
  redondeo forzado a una cantidad fija de decimales ni sufijo (`formatOffsetTime` usa `String(seconds)`,
  no `toFixed`). No hacen seek al click (un campo no puede a la vez dejarte escribir y hacer seek) — el
  seek sigue disponible clickeando las dos zonas del texto de la línea.
- **Botones cuadrados de tamaño fijo** (56×56px, igual al `min-height` de la fila) en vez de
  `aspect-ratio` — esa combinación con `align-items: stretch` no daba un ancho estable entre navegadores y
  desbordaba la fila en horizontal. Para que el ancho total nunca desborde, tanto `.lyrics-text-wrap`
  como el `<input>` de la letra llevan `min-width: 0` explícito — sin eso, un input de texto no cede
  espacio por debajo de su ancho de contenido aunque tenga `flex: 1` (default `min-width: auto` en flex
  items), y los grupos de tiempo (que sí tienen un piso real, por los botones cuadrados) terminaban
  empujando todo fuera del contenedor.
- **Color por lado, sin costura con el texto**: `.lyrics-time-group-start` (izquierda) es azul
  (`rgba(77,163,255,·)`, el mismo `--accent`), `.lyrics-time-group-end` (derecha) es verde azulado
  (`rgba(72,191,145,·)`). El degradé de las dos zonas clickeables del input de letra usa exactamente los
  mismos colores en sus mitades (mismo `rgba`), y `gap: 0` en la fila y en los grupos evita cualquier
  espacio visible entre botones y textbox — todo se funde en una sola banda de color continua por lado.
- **Líneas en blanco**: siempre son una fila (no existe el concepto de "oculta a menos que se agregue a
  mano"). En Setup, lo que cambia con el contenido es la **visibilidad de los controles de tiempo**:
  `startGroup`/`endGroup` quedan ocultos con `visibility` (no `display`, para no desalinear columnas
  entre filas) mientras `texto` esté vacío, y aparecen apenas se escribe algo. Una línea nueva arranca
  así: vacía, sin controles de tiempo, hasta que se le escribe algo. Ver la convención `[texto]` más abajo
  para el caso de uso principal (una fila `[]`/`[Inst]` entre dos frases, alrededor de un instrumental).
- **`preventBlur`**: clickear cualquier botón de una fila mientras el input de texto o de tiempo está
  enfocado dispara primero el evento `blur` de ese input (el foco pasa al botón) — eso puede interferir
  con la edición en curso. `onmousedown: preventDefault()` en los botones de fila (nudges, marcar,
  insertar, eliminar) evita que le saquen el foco a lo que se esté editando. Los campos de tiempo mismos
  no lo llevan, porque sí necesitan poder recibir foco para editarse.
- **`.hidden` con `!important`** (`base.css`): varias clases con `display` propio (`.actions`,
  `.lyrics-rows`) tienen la misma especificidad que `.hidden` (una sola clase) pero están definidas
  después en la cascada — sin `!important`, `.hidden` perdía y el elemento quedaba visible igual. Bug real
  encontrado al ocultar el toolbar/filas en modo reemplazo (ver abajo); el fix es global, no solo para
  el editor de letra.
- **Reemplazo y Setup/Edición son vistas mutuamente excluyentes** (`setReplaceVisible()`): no hay textarea
  de edición masiva a la vista por defecto — el botón "Reemplazar" (ícono `arrowLeftRight`) pide
  confirmación explícita (`confirm()`) antes de mostrar un textarea temporal con "Aplicar"/"Cancelar"
  (íconos `check`/`x`), y al abrirlo oculta el toolbar, la lista de filas y la barra inferior (nada de eso
  aplica hasta confirmar o cancelar). Al aplicar, usa la misma reconciliación por LCS que antes vivía en
  "Cargar letra" (`reconcileBulkLyrics`): las frases sin cambios conservan su
  `timestampSeconds`/`endSeconds` tal cual estaban, sin importar qué se agregó o borró alrededor; dentro
  de un tramo que cambió, empareja posicionalmente lo que sobra de un lado y del otro (mismo conteo de
  líneas viejas y nuevas ahí ⇒ "edité el texto de esta frase", conserva el tiempo); lo que sobra sin
  pareja es una línea nueva de verdad y arranca en `timestampSeconds: 0` (o `null` si es un separador en
  blanco).
- **Importar/Exportar JSON** (`lyrics-editor.js`, botones "Importar"/"Exportar" — íconos
  `arrowDown`/`arrowUp`): alternativa a "Reemplazar" para cuando ya existe una transcripción con tiempos
  (ej. de una herramienta de alineación externa). Formato: `{ song: string, lines: [{ text, start, end? }] }`.
  Al importar:
  - `text`/`start` mapean a `texto`/`timestampSeconds`; `end` (opcional) se guarda como `endSeconds`.
  - Si `song` no coincide con el nombre de la canción abierta, pide confirmación antes de sobrescribir
    (`song` no se persiste en Firestore, es solo un chequeo de seguridad en el import).
  - Una línea con `text: ""` (start/end en `null` o ausentes) se importa tal cual como separador de
    estrofa — así un JSON reexportado por K-Rez conserva sus separadores exactos.
  - Si el JSON no trae separadores explícitos (ej. viene de una herramienta externa, como en el caso de
    uso original), huecos de más de `IMPORT_GAP_SECONDS` (3s) entre el fin de una línea y el inicio de
    la siguiente insertan automáticamente una línea en blanco. Esta heurística no corre inmediatamente
    después de un separador explícito, para no duplicarlo.
  - Reemplaza la letra completa (con `confirm()` propio), no hace merge.
  - "Exportar JSON" hace el camino inverso: incluye **todas** las líneas, incluidas las de separador
    (`{ text: "", start: null, end: null }`), para que el ciclo exportar → reimportar sea fiel.
- **Live** (`song-live-view.js`): paneles de solo lectura — línea(s) de letra activa(s) resaltadas y
  scroll automático (`lyrics-playback.js`, reusado también para las secciones), chips de sección para
  navegación rápida. Ninguno de los dos tiene controles de edición.
- `attachLyricsPlayback` (en `lyrics-playback.js`) es genérico: sirve para letra y para secciones, y
  acepta `{ scrollIntoView: false }` para Config (donde el auto-scroll de la página sería disruptivo
  mientras se edita) vs. el default `true` en Live (donde sí se quiere "seguir" la canción). El centrado
  usa `scrollOptions` (default `{ block: "center", inline: "nearest" }` para la letra, verticalmente
  centrada; los chips de sección en Live pasan `{ block: "nearest", inline: "center" }` porque scrollean
  horizontal, no vertical).
- **Resaltado múltiple**: si los rangos `[timestampSeconds, endSeconds)` de dos o más líneas se
  superponen en un punto dado, todas quedan con la clase `.active` a la vez — no hay un único "ganador".
  `effectiveEnd()` calcula el fin real de cada línea (su `endSeconds`, o si no tiene, el `timestampSeconds`
  de la próxima línea que arranca después — mismo comportamiento "dura hasta que la siguiente empieza" de
  siempre). El auto-scroll sigue apuntando a una sola fila "primaria" (la de `timestampSeconds` más
  reciente entre las activas), para no pelearse a sí mismo si hay varias resaltadas al mismo tiempo.

## 10. Diseño visual — tema "cristal"

Rediseño cosmético completo sobre glassmorphism ("crystal"): superficies traslúcidas con blur, acento de
color extraído de la carátula en reproducción, fondo animado reactivo al audio, e íconos de Lucide.

### Tokens (`base.css`, `:root`)

- `--glass-bg` / `--glass-border` / `--glass-highlight` — blanco translúcido por default; se
  retintan con el acento de la carátula cuando hay una activa (ver más abajo).
- `--glass-blur: 20px` — radio del `backdrop-filter: blur()` compartido por las superficies de cristal.
- `--bar-height: 64px` — alto fijo compartido por `.screen-header` y `.player-bar` (con
  `min-height`, no `height`: la player-bar puede crecer si el control de mezcla envuelve en pantallas
  angostas; el header en cambio trunca su título con ellipsis en vez de crecer, así que el suyo nunca
  varía). `.has-header-bar`/`.has-player-bar` reservan ese mismo alto como padding en el contenido de la
  pantalla para que nada quede tapado.
- `--sidebar-width: min(320px, 85vw)` — compartido entre el panel del sidebar y su pestaña, para que se
  muevan juntos exactamente esa distancia al abrir/cerrar (ver más abajo).

### Barras fijas: header, player-bar, sidebar

`.screen-header` y `.player-bar` son `position: fixed`, edge-to-edge (`left:0; right:0`), sin
`border-radius` (se funden con el contenido en vez de flotar como tarjetas) — el contenido de la pantalla
arranca justo debajo/termina justo arriba vía `.has-header-bar`/`.has-player-bar`. El sidebar de canciones
(`.songs-sidebar`, `songs-sidebar.js`) ocupa el espacio *entre* las dos (`top`/`bottom: var(--bar-height)`,
no `0`) y va por detrás de ambas en z-index (10/11/12 contra 15/20) — así nunca las tapa al abrir, y su
propio backdrop (`.songs-sidebar-backdrop`) también respeta esa franja para no oscurecerlas. Reemplaza al
viejo botón ☰ que vivía en la player-bar por una pestaña fija al borde izquierdo (`.songs-sidebar-tab`,
siempre visible) que se desliza *junto con* el panel al abrir/cerrar (mismo `--sidebar-width`, misma
duración de transición) — se lee como la manija del panel, no como un control aparte.

**Bug conocido de Chrome con `backdrop-filter`:** el header NO lleva `backdrop-filter` (a diferencia de
la player-bar y el sidebar, que sí). Chrome tiene un bug de renderizado documentado donde el muestreo del
borde de un elemento con `backdrop-filter: blur()` usa modo "extend" — cualquier cambio de contenido
cerca de ese borde (hasta un scroll de 1px) puede volarle el color por completo
([issue 41471914](https://issues.chromium.org/issues/41471914)). Confirmado a mano que era exactamente
este header el afectado (desactivar la propiedad en DevTools con el glitch pasando lo eliminaba al
toque) — la player-bar y el sidebar tienen el mismo CSS y nunca lo mostraron. El header usa
`var(--glass-bg)` sin blur en vez de un fondo opaco de compensación (confirmado que se sigue viendo bien
así). Si en algún momento ese header necesita blur real de nuevo, revisar primero si Chrome ya lo arregló
(el fix propuesto — mirror edgeMode en vez de duplicate — está en discusión en el issue de arriba).

### Acento de color de carátula (`cover-accent.js`, `utils/color-extract.js`)

- `extractDominantColor(url)` — crea su **propia** `Image()` con `crossOrigin="anonymous"` (nunca toca el
  `<img>` visible en pantalla) para poder leer píxeles vía canvas; cuantiza a baldes de a 32 por canal y
  se queda con el más frecuente (un promedio simple da colores grisáceos en carátulas con contraste), y
  "vividiza" el resultado (fuerza saturación/luminosidad a un rango vivo conservando el matiz) para que el
  glow se note contra el fondo casi negro de la app. Si el servidor no manda headers CORS en esa carga (Plan
  A hoy no los manda para la carátula), el fallo queda contenido ahí adentro — sin color, sin degradado —
  sin romper la carátula visible, que se sigue cargando por su cuenta sin `crossOrigin`.
- `applyCoverAccent(songId, url)` / `clearCoverAccent(songId)` — ponen/sacan `--cover-accent` (3
  componentes `r, g, b`) y la clase `body.has-cover-accent`. Estado a nivel de módulo (no por vista): el
  degradado y el `--accent` tienen que verse igual en el header y la player-bar, que son hermanos en el
  DOM, así que la única forma de que ambos hereden la misma custom property es ponerla en `body`.
- `trackGlowPosition(element)` / `stopTrackingGlowPosition()` — miden con `getBoundingClientRect()` el
  centro real de la carátula en pantalla (el `<img>` grande en Live, el thumbnail en Config) y lo escriben
  en `--glow-x`/`--glow-y` (% del viewport), actualizándolo con `ResizeObserver` + `resize`/`scroll`. Un
  guard descarta mediciones con ancho/alto en cero (lo que devuelve un elemento `display:none`, como la
  carátula de Live cuando se muestra el video de YouTube en su lugar) para no saltar a `0%, 0%` — el glow
  se queda quieto en el último centro real conocido en vez de saltar a la esquina.

### Fondo animado (`audio-reactive-bg.js` + `body.has-cover-accent::before` en `base.css`)

Un `::before` de `body` (`position: fixed`, `z-index: -1`) con un `radial-gradient(circle farthest-corner
at var(--glow-x) var(--glow-y), ...)` — `circle`, no el `ellipse` default, para que el brillo sea redondo
sin importar el aspect ratio de la ventana. `opacity`/`transform: scale()` reaccionan a `--audio-level`
(0–1), que escribe `audio-reactive-bg.js` en un loop propio de `requestAnimationFrame`.

- **Por qué `::before` de `body` y no el `background` de `body` directo**: `body` no puede tener su
  propio `background` opaco a la vez (el orden de pintado de CSS hace que el fondo de un `body` no
  posicionado se dibuje *después* de sus descendientes con z-index negativo — con `background` en los
  dos, el de `body` tapaba el degradado animado sin importar su opacidad). El fondo plano vive solo en
  `html`.
- **Nunca conecta el `<audio>` real** de la sesión a un `AnalyserNode` — arma su propio
  `<audio crossOrigin="anonymous">` silencioso que carga la misma URL (con un parámetro extra en la query
  para no compartir caché HTTP con la petición real, que va sin `crossOrigin`) solo para poder leer su
  espectro. Mismo patrón defensivo que `color-extract.js`: si el servidor no manda CORS para el origin
  real, lo peor que pasa es que no haya reactividad, nunca que se corte el audio real.
- **Silencio vía `GainNode` en 0, no `audio.muted`**: `muted` en el elemento fuente hace que el navegador
  directamente deje de decodificar samples reales para cualquier nodo Web Audio enganchado a él — el
  `AnalyserNode` se queda leyendo ceros para siempre aunque el audio esté sonando. Un `GainNode` con
  `gain.value = 0` conectado a destino corta recién al final del grafo, dejando pasar la señal hasta ahí
  (lo que el analizador necesita) sin volverlo audible.
- **Desbloqueo del `AudioContext`**: `resume()` necesita pasar sincrónicamente dentro de un gesto real del
  usuario — el evento `"play"` del controlador llega async (lo relaya el `<audio>` nativo) y ya no cuenta.
  Un listener global de una sola vez (`pointerdown`/`keydown` en `window`) lo resuelve sin tener que
  acordarse de desbloquear a mano en cada botón que puede disparar play.
- **Señal real e idle, mutuamente excluyentes**: `--audio-level` es el nivel real de graves (banda baja
  del espectro, no el promedio completo — da un pulso "de beat" en vez de tembloroso) cuando hay sesión
  reproduciendo con el analizador enganchado, o si no una onda idle de baja amplitud (pausado, o playing
  sin poder analizar — YouTube, CORS, autoplay policy). Nunca se mezclan (antes se tomaba el máximo de las
  dos, y la real casi siempre le ganaba a la idle sin que se notara su aporte). El loop arranca con
  `startIdleLoop()` apenas hay sesión (no recién al darle play) y solo escribe en `body.style` si
  `body.has-cover-accent` está presente — sin eso, no tiene ningún efecto visual y sería puro gasto.
- **Solo versiones de archivo**: un video de YouTube corre en un iframe cross-origin, no hay forma de leer
  su audio con Web Audio API — con YouTube activo, cae al pulso idle.

### Íconos (`utils/icons.js`)

Set de [Lucide](https://lucide.dev) (licencia ISC) como SVG inline exactos — sin CDN, sin paso de build
(consistente con el resto del proyecto). `icon(name, { filled })` devuelve un elemento `<svg>` real
(parseado desde un template) listo para pasarle a `h()` como cualquier otro hijo, mezclado con texto en el
mismo botón. Se escalan por CSS (`.icon { width: 1em; height: 1em; }`, en `base.css`) como si fueran un
caracter más, heredando `currentColor`. `play`/`pause`/`circle` vienen rellenos por default (el resto
outline) — reemplazan a los caracteres Unicode sueltos que se usaban antes (▶ ⏸ ⚙ ⌂ ☰ ▾ ● ✎ ✓ ✕ ⇄ ↑ ↓).

## 11. Setup local / despliegue

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com): habilitar **Auth**
   (proveedor Google) y **Firestore**.
2. Copiar el `firebaseConfig` real a `web/js/firebase-config.js` (ya hecho — apunta al proyecto
   `k-rez-b52a2`).
3. Poner el ID del proyecto en `.firebaserc`.
4. Crear a mano el documento `config/access` en Firestore con el campo `allowedEmail`.
5. Desplegar las reglas: `firebase deploy --only firestore:rules` (o pegarlas manualmente en la
   consola).
6. Servir `web/` localmente para desarrollo (ej. `npx serve web`) — **usar siempre el host `localhost`,
   nunca `127.0.0.1`**, aunque apunten a la misma máquina. Confirmado en pruebas: servir desde
   `http://127.0.0.1:5500` (default de la extensión Live Server de VS Code) rompe dos cosas a la vez —
   `/api/media-token` se bloquea por CORS (el servidor de Plan A solo whitelistea `localhost:5500`) y el
   IFrame Player API de YouTube falla al reproducir (error de `postMessage` origin mismatch, se ve como
   "Este video no está disponible" aunque el video sea válido). Si usás Live Server, configurar
   `"liveServer.settings.host": "localhost"`.
7. Para producción: push a GitHub, activar Pages (Settings → Pages → Source: GitHub Actions), agregar
   el dominio resultante a CORS y a Authorized domains de Firebase Auth.

Ver [`PENDIENTES.md`](./PENDIENTES.md) para el estado real de este último paso y todo lo demás que
falta.
