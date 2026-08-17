# Pendientes — Plan A (servidor / SERVER-REZ)

Estado al 2026-08-17. Ver [`README.md`](./README.md) para contexto de arquitectura,
[`pendientes-plan-b.md`](./pendientes-plan-b.md) para lo que falta del lado del frontend, y
`plan-A-server-storage-streaming.md` (en el server, `~/k-rez/planning/`) para el detalle completo del
lado de Plan A.

## Fase 4 — Control remoto (SSE)

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

## Mixed content / HTTPS — ✅ resuelto técnicamente (2026-08-17)

Fase 2 (Cloudflare Tunnel) lista y verificada end-to-end: `k-api.rez-lex.com` → `http://100.82.19.31:8081`
vía `cloudflared-k-rez.service` (systemd `--user`, dominio `rez-lex.com`). `MEDIA_BASE_URL` en
`web/js/media/api-client.js` ya se actualizó a `https://k-api.rez-lex.com`, confirmado alcanzable
(`405` en `GET /media/test/test`, igual que la verificación de Plan A). El dashboard existente sigue
Tailscale-only, sin tocar.

**Nuevo pendiente que reemplaza a este — decisión de Cloudflare Access sin tomar todavía:**
activar Access sobre `k-api.rez-lex.com` puede romper la app entera si exige el flujo de login
interactivo (redirect a HTML + cookie `CF_Authorization`), porque este backend se consume solo por
`fetch()` con `Authorization: Bearer` y por `<audio src="...">`/`<video>` con token corto en la query —
ninguno de los dos maneja ese flujo de cookie. Falta decidir con el usuario entre: (a) Access solo
delante de rutas que un humano visita directo (ninguna existe hoy en este backend), (b) service tokens
para las llamadas `fetch()`, o (c) dejar Access afuera de este hostname y confiar en el
idToken/media-token de Firebase como gate. **No activar Access a ciegas** sobre este hostname.

## Custom domain para GitHub Pages (sin decidir, opcional)

Ver el detalle completo en `pendientes-plan-b.md` — resumen del lado de Plan A: una vez que se elija el
hostname (sugerido `k-rez.rez-lex.com` o similar, evitando el apex `rez-lex.com`), falta un registro
`CNAME` en Cloudflare → `rezlex.github.io`, en modo **DNS only** (nube gris) al menos hasta que GitHub
termine de emitir el certificado Let's Encrypt — si queda proxied desde el arranque, la validación
falla. Después de eso, agregar el nuevo origin a `CORS_ALLOWED_ORIGINS`.

## CORS pendiente

- Confirmar que `CORS_ALLOWED_ORIGINS` (env var leída en `app/main.py:_allowed_origins()`) incluye el
  origen final de GitHub Pages — hoy confirmado solo `http://localhost:5500`, sin verificar si ya se
  amplió tras el tunnel. (No se pudo confirmar el valor en vivo por SSH sin leer el entorno completo del
  proceso, lo cual expondría otros secretos.)
- Origen real de producción para la carga de la carátula que hace `audio-reactive-bg.js` (fondo
  animado del lado de Plan B) — confirmado hoy para `localhost:5500` e IPs de red local, no para el
  dominio de producción. Sin este header el fondo simplemente no reacciona a la música (cae al pulso
  idle), no rompe nada, pero vale la pena confirmarlo una vez publicado.

## Otros pendientes de `plan-A-server-storage-streaming.md` (2026-08-17)

- **Service account de Firebase** para el backup de Firestore — todavía sin transferir (canal seguro,
  ej. `scp` por Tailscale, nunca chat/email plano). Ver también el mismo pendiente del lado de Plan B.
- **Nuevas versiones de storage**: `storage.VALID_VERSIONS` ya incluye `vocals` y `caratula` (imagen),
  con mime types de imagen agregados a la validación de upload — mismo flujo de `/api/media-token`
  (15 min HMAC) para ambas, sin contrato nuevo. Verificar que el modelo de datos documentado en
  `README.md` (sección 5, hoy solo `original`/`karaoke`) y el código de Plan B ya reflejen esto (el
  segmented control "Inst/Original/Voz" de `mix-control.js` sugiere que sí, pero no está en el README).
- Fase 3 (SSE), Fase 4 (backups/réplica de Firestore y del sitio estático) y Fase 5 (documentación
  interna de Plan A) siguen sin arrancar.
