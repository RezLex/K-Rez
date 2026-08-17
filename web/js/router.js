const routes = [];

export function registerRoute(pattern, handler) {
  const paramNames = [];
  const regex = new RegExp(
    "^" +
      pattern.replace(/:[^/]+/g, (match) => {
        paramNames.push(match.slice(1));
        return "([^/]+)";
      }) +
      "$"
  );
  routes.push({ regex, paramNames, handler });
}

function currentHash() {
  return location.hash.slice(1) || "/";
}

let resolving = false;

function resolve() {
  // Guarda de reentrancia: si el fallback de abajo (navigate("/")) tampoco
  // encuentra ruta porque el hash ya era "/", navigate() llama de vuelta a
  // resolve() sincrónicamente — sin esto, eso recursa sin fin y revienta el
  // stack (visto como RangeError en String.match).
  if (resolving) return;
  resolving = true;
  try {
    const path = currentHash();
    for (const route of routes) {
      const match = path.match(route.regex);
      if (!match) continue;
      const params = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });
      route.handler(params);
      return;
    }
    navigate("/");
  } finally {
    resolving = false;
  }
}

export function navigate(path) {
  if (currentHash() === path) {
    resolve();
    return;
  }
  location.hash = "#" + path;
}

export function startRouter() {
  window.addEventListener("hashchange", resolve);
  resolve();
}
