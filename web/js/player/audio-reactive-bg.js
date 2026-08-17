// Fondo ambiental reactivo al audio (ver base.css, body.has-cover-accent::before,
// que lee --audio-level en tiempo real). Solo funciona con versiones de
// ARCHIVO: un video de YouTube corre en un iframe cross-origin, no hay forma
// de leer su stream con Web Audio API.
//
// El loop corre SIEMPRE mientras hay sesión (ver startIdleLoop, llamado al
// crear la sesión, no al arrancar a reproducir) y nunca muestra un valor fijo:
// --audio-level es UNA de dos fuentes, nunca las dos mezcladas — el nivel
// real de graves cuando hay señal real que leer (versión de archivo activa,
// sonando, con el AnalyserNode enganchado), o si no una onda "idle" de baja
// amplitud (pausado, o playing sin poder analizar — YouTube/CORS/autoplay
// policy). Así el fondo nunca se ve del todo estático sin depender de que
// el análisis funcione, pero tampoco compiten entre sí: con audio real
// sonando, la idle no le resta ni le suma nada al pulso real.
//
// A propósito NO conecta el <audio> real de la sesión (player-controller.js)
// al AnalyserNode: arma su propio <audio crossOrigin="anonymous"> silencioso,
// que carga la MISMA url solo para poder leer su espectro — mismo patrón
// defensivo que color-extract.js con su propia Image() aparte para no
// arriesgar el <img> visible. Motivo: si el servidor de Plan A no manda los
// headers CORS correctos para el origin real (hoy los manda para localhost y
// para IPs de red local, pero no está garantizado en todo despliegue),
// conectar el <audio> REAL a un AnalyserNode sin CORS lo deja mudo para
// siempre (comportamiento del navegador, no un error atrapable) — con esta
// copia aislada, lo peor que puede pasar es que no haya reactividad real,
// nunca que se corte el audio real.
//
// AudioContext exige un gesto real del usuario para arrancar/reanudar
// (autoplay policy) — ver unlockOnFirstGesture más abajo: NO alcanza con
// que el play() real ya haya sido gatillado por un click en algún botón,
// porque el resume() de acá se dispara desde el evento "play" del
// controlador, que llega async y ya no cuenta como gesto para el navegador.

const FFT_SIZE = 256;
const BASS_BIN_FRACTION = 0.25;
const ATTACK = 0.5;
const RELEASE = 0.08;

const IDLE_PERIOD_MS = 5200;
const IDLE_AMPLITUDE = 0.5;
const IDLE_AMPLITUDE_REDUCED_MOTION = 0.22;

const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const startTime = performance.now();

let audioContext = null;
let shadowAudio = null;
let analyser = null;
let freqData = null;
let currentUrl = null;
let isPlaying = false;
let level = 0;
let rafHandle = null;
let levelRule = null;

// --audio-level se escribe acá, vía CSSOM sobre una regla propia, en vez de
// con document.body.style.setProperty como antes: ese enfoque pisaba el
// atributo style de body 60 veces por segundo, y cualquier edición manual
// en el panel Styles de F12 (que DevTools sincroniza contra ese mismo
// atributo) se perdía antes de llegar a aplicarse. Una regla CSS aparte no
// toca el atributo style de ningún elemento, así que F12 deja de competir
// con este loop. Se declara en :root (no en body) porque las custom
// properties heredan hacia abajo igual — body.has-cover-accent::before
// (ver base.css) la sigue leyendo sin cambios.
function ensureLevelRule() {
  if (levelRule) return levelRule;
  const styleEl = document.createElement("style");
  document.head.appendChild(styleEl);
  const sheet = styleEl.sheet;
  const index = sheet.insertRule(":root { --audio-level: 0; }", sheet.cssRules.length);
  levelRule = sheet.cssRules[index];
  return levelRule;
}

function setAudioLevel(value) {
  ensureLevelRule().style.setProperty("--audio-level", value);
}

function ensureGraph() {
  if (audioContext) return true;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    shadowAudio = new Audio();
    shadowAudio.crossOrigin = "anonymous";
    shadowAudio.preload = "auto";
    const sourceNode = audioContext.createMediaElementSource(shadowAudio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.3;
    sourceNode.connect(analyser);
    // Dos motivos para esta ganancia en 0 en vez de shadowAudio.muted (que es
    // lo primero que se prueba y NO funciona, confirmado a mano): (1) un nodo
    // que no llega ni directa ni indirectamente a audioContext.destination
    // puede quedar sin "tirón" real del grafo en algunos navegadores — el
    // AnalyserNode existe y no tira error, pero getByteFrequencyData() se
    // queda leyendo el buffer inicial (todo ceros) para siempre; (2) el
    // <audio>.muted del elemento fuente hace que el navegador directamente
    // deje de decodificar samples reales para CUALQUIER nodo Web Audio
    // enganchado a él (createMediaElementSource incluido) — silenciarlo así
    // "corta la señal en el origen", no solo la saca de los parlantes, y deja
    // al analizador leyendo ceros para siempre aunque el audio esté sonando
    // (confirmado con logs: crossOrigin solo → funciona, muted solo o junto
    // con crossOrigin → siempre cero). La ganancia en 0, en cambio, corta
    // recién al final del grafo: dejar pasar la señal hasta ahí es
    // justamente lo que necesita el analizador para tener algo que leer.
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    analyser.connect(silentGain);
    silentGain.connect(audioContext.destination);
    freqData = new Uint8Array(analyser.frequencyBinCount);
    return true;
  } catch (err) {
    console.warn("Fondo reactivo al audio no disponible (Web Audio API):", err);
    audioContext = null;
    analyser = null;
    return false;
  }
}

// Onda lenta siempre activa — con prefers-reduced-motion se aplana a un
// valor bajo fijo (amplitud 0, misma fórmula) en vez de quedar apagada del
// todo, para no perder el acento de color por completo.
function idleWave(now) {
  if (reducedMotion) return IDLE_AMPLITUDE_REDUCED_MOTION;
  const phase = ((now - startTime) % IDLE_PERIOD_MS) / IDLE_PERIOD_MS;
  return (0.5 + 0.5 * Math.sin(phase * Math.PI * 2)) * IDLE_AMPLITUDE;
}

function tick(now) {
  const hasRealSignal = Boolean(analyser && isPlaying);
  let target = 0;
  if (hasRealSignal) {
    analyser.getByteFrequencyData(freqData);
    // Bandas bajas (kick/bajo) en vez del espectro completo: dan un pulso
    // más "de beat" — el promedio de todo el espectro queda dominado por
    // medios/agudos y se ve tembloroso en vez de pulsante.
    const bassBins = Math.max(1, Math.floor(freqData.length * BASS_BIN_FRACTION));
    let sum = 0;
    for (let i = 0; i < bassBins; i++) sum += freqData[i];
    target = sum / bassBins / 255;
  }
  // Ataque rápido / release lento (como un VU meter): el pulso salta con el
  // golpe y decae suave, en vez de temblar cuadro a cuadro.
  level += (target - level) * (target > level ? ATTACK : RELEASE);
  // Con audio real sonando, la onda "idle" NO participa (antes se tomaba
  // Math.max de las dos, y el nivel real casi siempre le ganaba — la idle
  // se calculaba pero quedaba invisible, tapada). Ahora son mutuamente
  // excluyentes: real cuando hay señal real que leer, idle el resto del
  // tiempo (pausado, o playing sin poder analizar — YouTube/CORS/autoplay
  // policy), nunca las dos mezcladas.
  const display = hasRealSignal ? level : idleWave(now);
  // Este loop corre siempre, tenga o no carátula la canción — pero sin
  // --cover-accent no existe body.has-cover-accent::before (ver base.css),
  // así que --audio-level no tiene ningún efecto visual sin esa clase.
  // Sin este guard se seguía escribiendo en body.style igual, 60 veces por
  // segundo, para nada.
  if (document.body.classList.contains("has-cover-accent")) {
    setAudioLevel(display.toFixed(3));
  }
  rafHandle = requestAnimationFrame(tick);
}

// Arranca el pulso "idle" apenas existe una sesión de reproducción (ver
// player-session.js#createSession) — no espera a que el usuario le dé play,
// así el fondo ya se ve vivo desde que se carga la carátula.
export function startIdleLoop() {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(tick);
}

// url: string tokenizada de una versión de ARCHIVO activa (ver
// version-resolution.js#activeFileUrl), o null si no se puede analizar.
export function setActiveFileUrl(url) {
  if (url === currentUrl) return;
  currentUrl = url;
  if (!url) {
    shadowAudio?.pause();
    return;
  }
  if (!ensureGraph()) return;
  // El <audio> real de la sesión (player-controller.js) pide esta MISMA url
  // sin crossOrigin (modo "no-cors", el default) — si el navegador sirve la
  // respuesta de esta copia (crossOrigin="anonymous") desde la caché de
  // aquella, la trata como "opaca" aunque el servidor mande los headers CORS
  // correctos: reproduce bien pero el AnalyserNode lee silencio (0), sin
  // ningún error. Un parámetro extra en la query hace que el navegador la
  // trate como un recurso distinto para cachear, evitando la colisión — Plan
  // A lo ignora sin problema (confirmado con curl).
  const separator = url.includes("?") ? "&" : "?";
  shadowAudio.src = `${url}${separator}_bg=1`;
  shadowAudio.load();
  if (isPlaying) shadowAudio.play().catch(() => {});
}

// AudioContext.resume() necesita pasar SINCRÓNICAMENTE dentro de un gesto
// real del usuario (click/tecla) para que el navegador lo honre — el evento
// "play" del controlador llega de forma asíncrona (lo relaya el <audio>
// nativo), y para cuando llega ya no cuenta como gesto: resume() llamado
// ahí queda "pending" para siempre y el AnalyserNode se queda leyendo un
// contexto "suspended" (silencio total) aunque el resto del pipeline esté
// armado bien. El pulso "idle" sigue andando igual (por eso el síntoma era
// "veo el pulso pero nunca reacciona a la música real"): audio.play() en un
// elemento muted SÍ se permite sin gesto, a diferencia de resume().
//
// En vez de acordarse de desbloquear a mano en cada botón que puede
// disparar play (el de la barra, la barra espaciadora, el autoplay del
// sidebar de canciones), un solo listener global de una sola vez alcanza:
// cualquier click o tecla real en la página cuenta como gesto, sea cual sea
// el que efectivamente haga falta.
function unlockOnFirstGesture() {
  if (ensureGraph()) audioContext.resume?.();
}
["pointerdown", "keydown"].forEach((eventName) =>
  window.addEventListener(eventName, unlockOnFirstGesture, { once: true, capture: true })
);

export function setPlaying(playing) {
  isPlaying = playing;
  if (playing && currentUrl && ensureGraph()) {
    audioContext.resume?.();
    shadowAudio.play().catch(() => {});
  } else {
    shadowAudio?.pause();
  }
}

export function stop() {
  isPlaying = false;
  currentUrl = null;
  shadowAudio?.pause();
  if (shadowAudio) shadowAudio.src = "";
  if (rafHandle !== null) {
    cancelAnimationFrame(rafHandle);
    rafHandle = null;
  }
  level = 0;
  setAudioLevel("0");
}

// Todo el estado de este módulo es privado (closures) — sin esto, diagnosticar
// desde la consola del navegador ("¿el audio fantasma cargó? ¿hay error de
// CORS? ¿el AudioContext quedó suspended?") no tiene forma de hacerse sin
// tocar código. shadowAudioError.code === 4 (MEDIA_ERR_SRC_NOT_SUPPORTED) es
// la firma típica de un bloqueo por CORS en un <audio crossOrigin>.
export function debugState() {
  return {
    audioContextState: audioContext?.state ?? "no creado todavía",
    hasAnalyser: Boolean(analyser),
    currentUrl,
    isPlaying,
    level,
    shadowAudioSrc: shadowAudio?.currentSrc || shadowAudio?.src || null,
    shadowAudioPaused: shadowAudio?.paused ?? null,
    shadowAudioReadyState: shadowAudio?.readyState ?? null,
    shadowAudioNetworkState: shadowAudio?.networkState ?? null,
    shadowAudioError: shadowAudio?.error
      ? { code: shadowAudio.error.code, message: shadowAudio.error.message }
      : null,
  };
}
