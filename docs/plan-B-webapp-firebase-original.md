# Plan B — Webapp (GitHub Pages) + Firebase

**Esta sesión corre en otro entorno** (no en SERVER-REZ). Responsable de: frontend, modelo de datos en
Firestore, autenticación, lógica del reproductor (archivo propio + YouTube embebido), editor de letra
con timestamps, calibración de sincronización, y el cliente del canal de control remoto.

## Contexto del proyecto completo

App web de gestión de canciones con letra sincronizada, reproductor integrado y modo control remoto
(master-slave entre dispositivos del mismo usuario). Arquitectura decidida en dos entornos separados:

- **Plan A** (otra sesión, corre en SERVER-REZ): storage y streaming de audio, Cloudflare Tunnel +
  Access para proteger el storage, canal SSE de control remoto, backups. Ver
  `plan-A-server-storage-streaming.md` en esta misma carpeta.
- **Plan B** (esta sesión, este documento): todo lo demás.

## Contexto de la sesión A (para que esta sesión sepa con qué interactúa)

- El servidor (SERVER-REZ) es una máquina personal ya en producción, con Tailscale, un dashboard interno
  y otros servicios — **no tiene autenticación propia salvo lo que se agregue específicamente para esta
  app**. El acceso al storage de audio va a estar detrás de Cloudflare Access (login por email + ventana
  de aprobación para invitados) — esto es transparente para el frontend, solo importa que las requests a
  `/media/...` y `/api/upload` deben ir autenticadas.
- El servidor expone (contrato fijado en Plan A, no cambiar sin avisar a esa sesión):

| Endpoint | Método | Auth | Descripción |
|---|---|---|---|
| `/api/upload` | POST | Firebase ID token | Sube archivo de audio, devuelve URL/ID de referencia |
| `/media/{id}/{version}` | GET | Firebase ID token (o firma temporal) | Streaming con Range support (necesario para el slider) |
| `/control/stream` | GET (SSE) | Firebase ID token | Recibe comandos/estado en tiempo real |
| `/control/command` | POST | Firebase ID token | Envía comando a otro dispositivo |

- El canal de control remoto **no usa Firebase** — es SSE directo contra el servidor. El frontend debe
  mandar el `idToken` de Firebase Auth en cada request/conexión para que el servidor lo verifique.
- El servidor también guarda una réplica de respaldo de Firestore y del sitio estático — no requiere
  nada del frontend salvo, eventualmente, entregar una service account key de Firebase por un canal
  seguro (coordinar con el usuario, no compartir por chat/email plano).

## Alcance de esta sesión (Plan B)

1. Frontend estático (sin build pesado, mobile-first) publicado en GitHub Pages.
2. Login simple con Firebase Auth (usuario único por ahora).
3. Modelo de datos en Firestore + CRUD de canciones.
4. Reproductor integrado: archivo de audio (HTML5 `<audio>` + slider propio) y YouTube (IFrame Player
   API oficial — nunca descargar audio de YouTube, solo embeber/controlar).
5. Sincronización archivo↔link: campo de offset por versión, calibrado a mano por el usuario ("segundo
   en que realmente arranca la canción"), UI simple para setearlo escuchando.
6. Letra con marcas por línea/párrafo (no palabra por palabra en esta primera versión): click en un verso
   hace seek en la fuente activa (archivo o YouTube).
7. Cliente del canal de control remoto: `deviceId` persistido en `localStorage`, conexión SSE al
   servidor, selector de "dispositivo a controlar", envío de comandos (play/pause/seek/cambiar
   canción/saltar a verso), reflejo del estado remoto en la UI del dispositivo controlador.

## Decisión pendiente a resolver antes de programar

**¿El frontend habla directo con el SDK de Firebase, o a través de una capa de API delgada propia?**
- Directo al SDK: menos trabajo inicial, pero migrar la BD a otro lado en el futuro implica reescribir
  todas las llamadas a datos del frontend.
- Capa de API delgada (aunque hoy solo reenvíe a Firebase): más trabajo inicial, pero migrar después es
  cambiar la implementación de la API, no el frontend.

Recomendación ya discutida con el usuario: definir esto ahora, no después. Si se elige la capa de API,
evaluar si conviene que viva en Cloud Functions o en el propio SERVER-REZ (en cuyo caso hay que avisar a
la sesión A, cambia su alcance).

## Modelo de datos en Firestore (borrador)

```
songs/{songId}
  nombre: string
  artista: string
  key: string
  bpm: number
  ownerUid: string
  letra: [
    { texto: string, timestampSeconds: number | null }
  ]
  versiones: {
    original: {
      tipo: "archivo" | "youtube",
      url: string,          // URL de /media/... si es archivo, o link de YouTube
      offsetSeconds: number // calibrado a mano
    },
    karaoke: { ...mismo shape que original }
  }
```

## Fases

### Fase 1 — Base
- Setup Firebase project (Auth + Firestore), reglas de seguridad (single-user: solo `ownerUid` propio
  puede leer/escribir).
- Login simple (email/password).
- CRUD básico de canciones (sin reproductor todavía).

### Fase 2 — Reproductor
- Componente de audio con slider para archivos propios (streaming desde `/media/...` de Plan A).
- Integración YouTube IFrame API para links.
- Lógica de offset: al cambiar de fuente, `nuevoTiempo = tiempoActual - offsetOrigen + offsetDestino`.

### Fase 3 — Letra sincronizada
- Editor simple: lista de líneas de letra, botón "marcar tiempo actual" mientras se escucha (por
  línea/párrafo).
- Click en una línea en modo reproducción → seek en la fuente activa.

### Fase 4 — Control remoto (cliente)
- `deviceId` en `localStorage`, registro de presencia al abrir la página (conexión SSE a
  `/control/stream`).
- UI de "dispositivos activos" para elegir a cuál controlar.
- Envío de comandos vía `POST /control/command`.
- Nota de UX importante (autoplay): el dispositivo controlado necesita un click inicial de "habilitar
  control remoto" al abrir la página, por las políticas de autoplay de los navegadores — sin esto, un
  comando remoto de "play" puede ser bloqueado silenciosamente.

### Fase 5 — Publicación
- Build estático a GitHub Pages.
- Coordinar con Plan A el mecanismo de réplica del build en el servidor (¿push manual, webhook, o Plan A
  hace `git pull` periódico del repo?) — decidir y documentarlo en ambos lados.

## Verificación end-to-end

1. Login, alta de una canción con archivo propio + link de YouTube, confirmar que ambas versiones
   reproducen.
2. Calibrar offset de una canción, cambiar de fuente a mitad de reproducción, confirmar que el segundo
   resultante es el esperado.
3. Click en una línea de letra, confirmar seek correcto en archivo y en YouTube.
4. Abrir la página en dos dispositivos, controlar reproducción del uno desde el otro (play/pause/seek/
   cambiar canción/click en verso), confirmar reflejo de estado en <1s.
5. Confirmar que sin estar autenticado (sin `idToken` válido), `/media/...` y `/control/...` devuelven
   error de auth (validar contra el servidor de Plan A, no asumir).
