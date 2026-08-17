export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") el.className = value;
    else if (key.startsWith("on") && typeof value === "function") {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined) {
      el.setAttribute(key, value);
    }
  }
  for (const child of children) {
    el.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

export function mount(root, node) {
  root.replaceChildren(node);
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

function isEditingElement(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === "SELECT") return true;
  if (tag === "INPUT" || tag === "TEXTAREA") {
    // Un input/textarea readonly (ej. el texto de la letra en modo Setup,
    // clickeable para hacer seek pero no editable) no cuenta como "editando"
    // — si no, el navegador aplica su default de espacio = scroll de página
    // en vez de que este handler haga preventDefault() y controle play/pause.
    return !element.readOnly && !element.disabled;
  }
  return false;
}

// Espacio = play/pause del reproductor en toda la página (Live y Config),
// salvo que el foco esté en un input/textarea/select — si no, escribir un
// espacio en cualquier campo (letra, nombre de canción, etc.) dispararía
// play/pause en vez de tipear el espacio.
export function attachSpacebarToggle(button) {
  function handleKeydown(event) {
    if (event.code !== "Space" || event.repeat) return;
    if (isEditingElement(document.activeElement)) return;
    event.preventDefault();
    if (!button.disabled) button.click();
  }
  window.addEventListener("keydown", handleKeydown);
  return () => window.removeEventListener("keydown", handleKeydown);
}
