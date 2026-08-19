# Pendientes — Plan B (frontend)

Estado al 2026-08-19. Ver [`README.md`](./README.md) para contexto de arquitectura y
[`pendientes-plan-a.md`](./pendientes-plan-a.md) para lo que falta del lado del servidor.

## Bloqueado por Plan A (no depende de este lado)

- **Fase 4 — Control remoto (SSE):** sin luz verde ni contrato cerrado todavía (ver
  `pendientes-plan-a.md`). Una vez esté disponible, falta programar por completo:
  `web/js/remote/device-id.js`, `control-client.js`, `control-commands.js`, `remote-controller-ui.js`,
  `remote-controlled-ui.js`, la vista/banner "Habilitar control remoto" (necesario por políticas de
  autoplay — el dispositivo controlado necesita un gesto de usuario inicial), y aplicar los comandos
  remotos reusando `PlayerController` (nunca una segunda implementación de play/pause/seek).
- **Cloudflare Access sobre `k-api.rez-lex.com` (decisión sin tomar):** si Plan A la activa con login
  interactivo, rompe tanto los `fetch()` autenticados por header como la carga directa de
  `<audio>`/`<video>` por query token — ninguno de los dos manda la cookie `CF_Authorization`. No actuar
  hasta que Plan A confirme cómo quedó resuelto (ver `pendientes-plan-a.md`).
- **CORS del origen de GitHub Pages:** depende de que Plan A confirme que `CORS_ALLOWED_ORIGINS` ya lo
  incluye (no verificado todavía).

## Custom domain para GitHub Pages (sin decidir, opcional)

Se intentó una vez con el apex `rez-lex.com` desde el campo "Custom domain" de Settings → Pages
(commits `Create CNAME` / `Delete CNAME`, 2026-08-17) — no funcionó porque GitHub escribió el archivo
`CNAME` en la **raíz del repo**, y el workflow (`deploy-pages.yml`) solo sube `path: web` como artifact,
así que ese archivo nunca llegó al sitio publicado. Lección: no usar ese campo de la UI directo; el
`CNAME` tiene que vivir en `web/CNAME` para quedar dentro del artifact.

Pendiente, una vez que se elija el hostname (sugerido: subdominio tipo `k-rez.rez-lex.com` o
`app.rez-lex.com`, en línea con `k-api.rez-lex.com` del backend — evitar el apex, que requiere A/AAAA
records en vez de un CNAME simple):

1. Agregar `web/CNAME` al repo con el hostname elegido (una sola línea).
2. Configurar el registro DNS en Cloudflare (lado de Plan A, ver `pendientes-plan-a.md`): `CNAME` del
   subdominio → `rezlex.github.io`, en modo **DNS only** (nube gris) al menos hasta que GitHub emita el
   certificado — proxied desde el principio rompe la validación de Let's Encrypt.
3. Recién ahí completar Settings → Pages → Custom domain con ese hostname, esperar la verificación +
   certificado (minutos a ~24h), y activar **Enforce HTTPS**.
4. Agregar el nuevo dominio a **Authorized domains** de Firebase Auth (además de o en vez de
   `rezlex.github.io`).
5. Pedirle a Plan A que agregue el nuevo origin a `CORS_ALLOWED_ORIGINS`.

## Mixed content / HTTPS — ✅ resuelto (2026-08-17)

`MEDIA_BASE_URL` en `web/js/media/api-client.js` ya apunta a `https://k-api.rez-lex.com` (Cloudflare
Tunnel de Plan A), verificado alcanzable. Ya no bloquea la Fase 5.

## Fase 5 — Publicación (pendiente de este lado)

- **Repo pusheado a GitHub** (`github.com/RezLex/K-Rez`, `main` al día con `origin`, último commit
  `5b607e8`). Pendiente de confirmar (no verificable desde este lado): si GitHub Pages está activado
  (Settings → Pages → Source: GitHub Actions) y si el workflow `.github/workflows/deploy-pages.yml` ya
  corrió al menos una vez.
- Una vez publicado, hay que:
  - Confirmar el dominio final de GitHub Pages y pedirle a Plan A que habilite CORS para ese origen.
  - Agregar ese dominio a **Authorized domains** en Firebase Authentication (si no, Google Sign-In
    falla en producción aunque funcione en localhost).
- Mecanismo de réplica del sitio estático en SERVER-REZ: no decidido (propuesta pendiente — webhook
  post-deploy desde el workflow de Actions, vs. `git pull` periódico en el servidor). Plan A ya lo tiene
  como su propia Fase 4.
- Entrega de una service-account key de Firebase a Plan A para el respaldo de Firestore — pendiente de
  coordinar un canal seguro (no chat/email plano). Vale la pena iniciar el trámite ya, aunque se use
  recién en esa fase.
- **Modelo de datos desactualizado respecto al storage real:** `storage.VALID_VERSIONS` en Plan A ya
  incluye `vocals` y `caratula` (imagen) además de `original`/`karaoke`, pero la sección 5 del `README.md`
  de Plan B solo documenta `original`/`karaoke`. El segmented control "Inst/Original/Voz" de
  `mix-control.js`/`mix-source.js` sugiere que el código ya usa `vocals`, así que esto es una
  desactualización de doc, no necesariamente un pendiente de código — confirmar y corregir el README.

## Bug del commit `5b607e8` ("bad fix") — ✅ corregido (2026-08-17)

`web/css/base.css`, regla `.screen-header`, tenía `padding-top: 100px` muerto (lo pisaba el `padding: 0
var(--gap)` que venía después en la misma regla, así que no se veía en pantalla, pero quedaba como cruft
confuso), líneas en blanco donde antes había `backdrop-filter`/`box-shadow`, y un `will-change:
transform` con un comentario copiado tal cual de `.player-bar` (`player.css`) que ahí sí tiene sentido
("Mismo motivo que `.screen-header`...") pero acá quedaba autorreferencial y sin motivo real (esta regla
ya no tiene `backdrop-filter` que aislar). Se limpió la regla completa — queda consistente con la
sección 10 del README ("SIN backdrop-filter, a diferencia de `.player-bar`/`.songs-sidebar`").

## Documentación desactualizada

La sección 10 del README describe `audio-reactive-bg.js` escribiendo `--audio-level` vía
`document.body.style.setProperty(...)` — el mismo commit `5b607e8` lo cambió a una regla CSS inyectada
por CSSOM en `:root` (para no pisar ediciones manuales del panel Styles de DevTools, que compiten por el
mismo atributo `style` de `body`). El cambio de código está bien explicado en el propio archivo, pero el
README no se actualizó.

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
  Chromium — no se confirmó que el patrón de `AudioContext`/gesto de usuario/`GainNode` en 0 (ver
  sección 10 del README) se comporte igual en Firefox/Safari.
- Prueba de la vista Live específicamente en mobile (el layout de dos columnas es desktop-first; el
  fallback a una columna en mobile no se validó en un dispositivo real, solo se infiere del CSS).

## Marca K-Rez (logo) — en iteración visual, no cerrado

`web/assets/logo-mark.svg`/`logo-full.svg` (ver sección 10 del README) ya reflejan la dirección "placa
esmerilada + destellos" acordada:

- Cortes planos (`stroke-linecap="butt"`, ya no `round`).
- La grieta (agujero + bisel) queda contenida adentro del tile, sin tocar `tileClip`: las 4 puntas
  terminan en los mismos puntos que los destellos de punta (ver más abajo), bien adentro del borde
  redondeado. Dirección anterior descartada: la grieta "saliendo" por el borde (coordenadas extendidas
  más allá del viewBox, truncadas por el clip) — el clip corta a mitad de camino cualquier trazo con
  blur que cruce por ahí, así que el bisel quedaba cortado en vez de apagarse solo. Ningún elemento del
  logo debe depender de `tileClip` para su terminación visual; el clip es solo para las esquinas
  redondeadas de la placa en sí.
- La K es un agujero transparente recortado con `<mask>` sobre la placa (`plateMask`/`plateMaskF`), sin
  ningún efecto propio — se verificó con fondo a cuadros que el hueco deja ver lo que hay detrás.
- El esmerilado (halo blureado + trazo nítido) se aplica por igual al borde exterior de la placa y a los
  dos filos de cada corte de la K (trazos paralelos con offset perpendicular a cada rayo, no un único
  trazo centrado — así el centro del hueco queda realmente transparente en vez de tapado).
- Destellos (`<circle>` + `feGaussianBlur`/`feMerge` para el bloom) sobre esos contornos —borde del tile
  y filos de la K—, nunca sueltos en medio del vidrio; parpadean asincrónicamente (`dur`/`begin`
  distintos por círculo) como en la referencia de "bola de disco".
- En el punto de impacto (donde convergen los 4 cortes) los filos NO se dibujan como 8 trazos sueltos
  (2 por rayo) hasta el vértice — eso los hacía cruzarse y dejaba una mancha con líneas sueltas en el
  centro de la K. Cada filo arranca recortado a cierta distancia del vértice, y ese hueco se cierra con
  un único aro circular centrado en el punto de impacto — mismo tratamiento esmerilado, pero como una
  sola silueta limpia en vez de 8 puntas convergiendo.

Pendiente de decidir con el usuario, no aplicado aún:

- El efecto de vidrio esmerilado de la placa en sí (más allá de los contornos) — por ahora la placa es
  un gradiente plano (`tileGrad`/`tileGradF`), sin textura ni `feGaussianBlur` propio.
- Afinar a ojo el offset/ancho exacto de los dos filos de la K y la posición de los destellos —se
  calcularon por geometría (vector perpendicular a cada rayo) sin una pasada de ajuste visual fino.

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
