// Extrae un color "dominante" de una imagen para usarlo como acento visual
// (fondo degradado). A propósito NO toca el <img> que se está mostrando en
// pantalla: crea su propia Image() aparte con crossOrigin="anonymous" para
// poder leer píxeles del canvas — si el servidor no manda los headers CORS
// necesarios en esa respuesta, el fallo (canvas "tainted") queda contenido
// acá adentro (sin color, sin degradado) y no rompe la carátula visible,
// que se sigue cargando por su cuenta sin crossOrigin. Los console.warn de
// las dos rutas de fallo son a propósito (para poder diagnosticar desde
// devtools si el glow no aparece), no afectan a nadie más que a quien mire
// la consola.
export function extractDominantColor(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        resolve(vividize(sampleDominantColor(img)));
      } catch (err) {
        console.warn("No se pudo leer el color de la carátula (¿CORS en Plan A?):", err);
        resolve(null);
      }
    };
    img.onerror = () => {
      console.warn("No se pudo cargar la carátula con crossOrigin para extraer su color.");
      resolve(null);
    };
    img.src = url;
  });
}

function sampleDominantColor(img) {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Cuantiza a baldes de a 32 por canal y se queda con el más frecuente —
  // un promedio simple da colores grisáceos/muddy en carátulas con mucho
  // contraste; esto se acerca más a "el color que predomina a simple vista".
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 128) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 245 && min > 245) continue; // casi blanco puro: suele ser fondo/borde
    if (max < 12) continue; // casi negro puro: idem
    const key = `${r >> 5},${g >> 5},${b >> 5}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count++;
    buckets.set(key, bucket);
  }

  let best = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  return {
    r: Math.round(best.r / best.count),
    g: Math.round(best.g / best.count),
    b: Math.round(best.b / best.count),
  };
}

// El balde ganador puede salir opaco/oscuro (carátulas apagadas, o el balde
// más grande siendo un gris intermedio) — para un glow que siempre se note
// contra el fondo casi negro de la app, se fuerza saturación e iluminación a
// un rango vivo conservando el matiz (hue) original.
function vividize(color) {
  if (!color) return null;
  const { h, s, l } = rgbToHsl(color.r, color.g, color.b);
  const boostedS = Math.max(s, 0.55);
  const boostedL = Math.min(Math.max(l, 0.4), 0.6);
  return hslToRgb(h, boostedS, boostedL);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h, s, l) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const toChannel = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return {
    r: Math.round(toChannel(h + 1 / 3) * 255),
    g: Math.round(toChannel(h) * 255),
    b: Math.round(toChannel(h - 1 / 3) * 255),
  };
}
