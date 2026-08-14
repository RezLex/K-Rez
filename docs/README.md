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
├── plan-B-webapp-firebase.md.txt      (documento de planeación original)
├── docs/                              (esta documentación)
└── web/                               ← raíz publicada en GitHub Pages
    ├── index.html, manifest.webmanifest
    ├── css/
    │   ├── base.css        (reset, variables, .screen/.screen-wide, .has-player-bar)
    │   ├── components.css  (inputs, botones, .bar, lista de canciones)
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
        │   └── song-live-view.js     (consumo: video + letra + secciones, solo lectura)
        ├── player/
        │   ├── player-source.js      (contrato base de una fuente de audio/video)
        │   ├── file-audio-source.js  (envuelve <audio>)
        │   ├── youtube-source.js     (envuelve YT.Player)
        │   ├── player-controller.js  (única interfaz que usan las vistas; offsets, crossfade, preload)
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
    { texto: string, timestampSeconds: number | null }
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
- Líneas de letra con `texto` vacío (`""`) son separadores visuales de estrofa para Live — se guardan,
  pero Config no las muestra como filas editables (ver `lyrics-editor.js`, `alwaysShow`).

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

## 9. Letra y estructura (secciones)

- **Config** (`lyrics-editor.js`, `sections-editor.js`): filas editables con botón "Marcar tiempo"
  (toma el tiempo actual convertido a la referencia `original`), nudges `−0.1`/`+0.1` para ajuste fino,
  y un toggle "Editar" — el campo de texto es de solo lectura por defecto (click reproduce desde su
  timestamp) y se vuelve editable al tocar "Editar". "Cargar letra" permite pegar la letra completa
  (una frase por línea, preservando líneas en blanco como separadores) de una sola vez.
- **Live** (`song-live-view.js`): paneles de solo lectura — línea de letra grande con la activa
  resaltada y scroll automático (`lyrics-playback.js`, reusado también para las secciones), chips de
  sección para navegación rápida. Ninguno de los dos tiene controles de edición.
- `attachLyricsPlayback` (en `lyrics-playback.js`) es genérico: sirve para letra y para secciones, y
  acepta `{ scrollIntoView: false }` para Config (donde el auto-scroll de la página sería disruptivo
  mientras se edita) vs. el default `true` en Live (donde sí se quiere "seguir" la canción).

## 10. Setup local / despliegue

1. Crear proyecto en [Firebase Console](https://console.firebase.google.com): habilitar **Auth**
   (proveedor Google) y **Firestore**.
2. Copiar el `firebaseConfig` real a `web/js/firebase-config.js` (los placeholders actuales deben
   reemplazarse).
3. Poner el ID del proyecto en `.firebaserc`.
4. Crear a mano el documento `config/access` en Firestore con el campo `allowedEmail`.
5. Desplegar las reglas: `firebase deploy --only firestore:rules` (o pegarlas manualmente en la
   consola).
6. Servir `web/` localmente para desarrollo (ej. `npx serve web`) — Google Sign-In funciona en
   `localhost` sin configuración extra.
7. Para producción: push a GitHub, activar Pages (Settings → Pages → Source: GitHub Actions), agregar
   el dominio resultante a CORS y a Authorized domains de Firebase Auth.

Ver [`PENDIENTES.md`](./PENDIENTES.md) para el estado real de este último paso y todo lo demás que
falta.
