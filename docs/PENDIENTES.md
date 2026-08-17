# Pendientes

Estado al 2026-08-14. Ver [`README.md`](./README.md) para contexto de arquitectura.

## Bloqueado por Plan A (no depende de este lado)

### Fase 4 — Control remoto (SSE)
**No tiene luz verde para implementarse todavía** — Plan A se quedó en diseño, sin programar, a la
espera de que el usuario lo autorice explícitamente.

Diseño acordado (propuesta, no contrato cerrado):
- Auth de `EventSource`: mismo patrón que `/api/media-token` (token corto vía endpoint), pero con TTL
  de 1-2h en vez de 15 min, porque una conexión SSE queda abierta más tiempo.
- Presencia de dispositivos: la emite el propio stream, no un endpoint aparte — evento inicial
  `{type: "presence", devices: [...]}` con el snapshot al conectarse, y deltas
  `{type: "presence", action: "connected"|"disconnected", deviceId}` cuando cambia. Un solo
  `EventSource`, dos tipos de evento (`presence` y `command`).
- Comando a dispositivo desconectado: `404`, sin cola ni replay.

Falta confirmar (una vez haya luz verde): esquema exacto de `POST /control/command` y de los eventos
`command` del stream.

Del lado de Plan B, una vez esté disponible, falta programar por completo:
`web/js/remote/device-id.js`, `control-client.js`, `control-commands.js`, `remote-controller-ui.js`,
`remote-controlled-ui.js`, la vista/banner "Habilitar control remoto" (necesario por políticas de
autoplay — el dispositivo controlado necesita un gesto de usuario inicial), y aplicar los comandos
remotos reusando `PlayerController` (nunca una segunda implementación de play/pause/seek).

### Mixed content / HTTPS
`MEDIA_BASE_URL` (en `web/js/media/api-client.js`) apunta a `http://100.82.19.31:8081` — Tailscale, sin
TLS. Funciona mientras se prueba en `localhost`, pero el navegador bloqueará esas requests en cuanto el
sitio se sirva desde GitHub Pages (https). Depende de que Plan A tenga listo el Cloudflare Tunnel (su
propia Fase 2) — no bloquea seguir desarrollando, sí bloquea la publicación real (Fase 5).

## Fase 5 — Publicación (pendiente de este lado)

- **Repo ya pusheado a GitHub** (`github.com/RezLex/K-Rez`, commit `713022e` en `main`) — esto ya no es
  un bloqueante. Pendiente de confirmar (no verificable desde este lado): si GitHub Pages está activado
  (Settings → Pages → Source: GitHub Actions) y si el workflow `.github/workflows/deploy-pages.yml` ya
  corrió al menos una vez.
- Una vez publicado, hay que:
  - Confirmar el dominio final de GitHub Pages y pedirle a Plan A que habilite CORS para ese origen
    (hoy solo está confirmado `http://localhost:5500`).
  - Agregar ese dominio a **Authorized domains** en Firebase Authentication (si no, Google Sign-In
    falla en producción aunque funcione en localhost).
  - Resolver el mixed-content de arriba antes de que esto sirva para algo real.
- Mecanismo de réplica del sitio estático en SERVER-REZ: no decidido (propuesta pendiente — webhook
  post-deploy desde el workflow de Actions, vs. `git pull` periódico en el servidor).
- Entrega de una service-account key de Firebase a Plan A para el respaldo de Firestore — pendiente de
  coordinar un canal seguro (no chat/email plano). Vale la pena iniciar el trámite ya, aunque se use
  recién en esta fase.

## QA pendiente (nunca se probó)

- **Login con popup dentro de una PWA instalada en modo standalone**, en un dispositivo móvil real
  (iOS/Android). El manifest ya declara `display: standalone`; en ese modo, `signInWithPopup` es
  conocido por fallar en algunos navegadores móviles al no poder abrir una ventana emergente real. Se
  decidió quedarse con popup (confirmado funcionando en desktop/Edge) asumiendo este riesgo — falta
  validarlo antes de depender de la app instalada como PWA.
- Prueba end-to-end completa en un navegador que no sea Edge/Chromium (Safari, Firefox) — el proyecto
  usa import maps, `accent-color`/pseudo-elementos de `<input type="range">`, y `aspect-ratio`, que
  deberían tener buen soporte pero no se probaron fuera de Chromium.
- El fondo reactivo al audio (`audio-reactive-bg.js`, Web Audio API + `AnalyserNode`) solo se probó en
  Chromium — no se confirmó que el patrón de `AudioContext`/gesto de usuario/`GainNode` en 0 (ver sección
  10 del README) se comporte igual en Firefox/Safari.
- Prueba de la vista Live específicamente en mobile (el layout de dos columnas es desktop-first; el
  fallback a una columna en mobile no se validó en un dispositivo real, solo se infiere del CSS).

## Cosas menores, no bloqueantes

- El flujo "+ Línea" en el editor de letra/secciones agrega una fila en modo solo-lectura (por el
  toggle de "Editar" agregado a pedido) — hay que tocar "Editar" antes de poder escribir, un paso extra
  respecto al comportamiento anterior donde se podía escribir directo. Es consistente con el
  comportamiento pedido para el resto de las filas, pero vale la pena confirmar que la fricción extra
  en el caso de "línea recién creada" es aceptable.
- No hay manejo de error específico si `/api/media-token` o `/api/upload` fallan por token de Firebase
  vencido a mitad de sesión larga (más allá del refresco proactivo cada 10 min ya implementado) — un
  fallo de red puntual solo muestra "No se pudo cargar el reproductor." genérico.
- No hay suite de tests automatizados para el frontend (Plan A sí tiene 19 tests del lado del backend).
- `web/css/remote.css` existe vacío, reservado para Fase 4.
- Decisión tomada pero no revisada con datos reales: usar `signInWithPopup` en vez de
  `signInWithRedirect` en producción — ver la sección de QA de arriba.
- **`.screen-header` no tiene `backdrop-filter`** (a diferencia de la player-bar y el sidebar) por un bug
  de renderizado de Chrome confirmado a mano (ver sección 10 del README, "Bug conocido de Chrome"). Si
  Chrome termina de shippear el fix propuesto (mirror edgeMode) en el
  [issue 41471914](https://issues.chromium.org/issues/41471914), vale la pena reintentar el blur ahí para
  que las tres superficies vuelvan a ser 100% iguales.
- El fondo reactivo al audio necesita que el streaming de Plan A mande headers CORS para el origin real
  del audio "fantasma" (`audio-reactive-bg.js`) — confirmado hoy para `localhost:5500` y IPs de red local,
  no para el dominio de producción (mismo tema que el bloqueante de "Mixed content / HTTPS" de arriba). Si
  el CORS no cubre el origin real, el fondo simplemente no reacciona a la música (cae al pulso idle), no
  rompe nada — pero vale la pena confirmar una vez publicado.
