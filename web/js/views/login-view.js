import { h, mount } from "../utils/dom-helpers.js";
import { icon } from "../utils/icons.js";
import { signInWithGoogle, takeNotAllowedError } from "../auth/auth-service.js";

// Logo oficial de Google ("G" multicolor) tal como lo pide la guía de marca
// de "Sign in with Google" — a diferencia del resto de los íconos de la app
// (icons.js, Lucide mono-color vía currentColor), este es fijo en sus 4
// colores y no vive en ese set genérico.
function googleLogo() {
  const template = document.createElement("template");
  template.innerHTML = `
    <svg viewBox="0 0 24 24" class="google-btn-icon" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.44a5.5 5.5 0 0 1-2.39 3.6v3h3.87c2.26-2.09 3.57-5.17 3.57-8.79Z"/>
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.94H1.29v3.1A12 12 0 0 0 12 24Z"/>
      <path fill="#FBBC05" d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6v-3.1H1.29a12 12 0 0 0 0 10.8z"/>
      <path fill="#EA4335" d="M12 4.75c1.76 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.6l4 3.1C6.23 6.86 8.88 4.75 12 4.75Z"/>
    </svg>
  `.trim();
  return template.content.firstElementChild;
}

export function renderLoginView(root) {
  const notAllowed = takeNotAllowedError();

  const alertText = h("span", {}, [
    notAllowed ? "Esa cuenta de Google no tiene acceso a esta app." : "",
  ]);
  const alertBox = h("p", { class: notAllowed ? "auth-alert" : "auth-alert hidden" }, [
    icon("alertCircle"),
    alertText,
  ]);

  const buttonIcon = googleLogo();
  const buttonLabel = h("span", {}, ["Continuar con Google"]);
  const signInButton = h(
    "button",
    {
      class: "google-btn",
      onclick: async () => {
        signInButton.disabled = true;
        signInButton.setAttribute("aria-busy", "true");
        buttonIcon.replaceWith(h("span", { class: "google-btn-spinner" }));
        buttonLabel.textContent = "Conectando...";
        try {
          await signInWithGoogle();
        } catch (err) {
          alertText.textContent = "No se pudo completar el inicio de sesión con Google.";
          alertBox.classList.remove("hidden");
          signInButton.disabled = false;
          signInButton.removeAttribute("aria-busy");
          root.querySelector(".google-btn-spinner")?.replaceWith(googleLogo());
          buttonLabel.textContent = "Continuar con Google";
        }
      },
    },
    [buttonIcon, buttonLabel]
  );

  mount(
    root,
    h("div", { class: "auth-screen" }, [
      h("div", { class: "auth-glow" }),
      h("div", { class: "auth-card" }, [
        h("img", { class: "auth-logo", src: "assets/logo-full.svg", alt: "K-Rez" }),
        h("div", { class: "auth-eq" }, [h("span"), h("span"), h("span"), h("span")]),
        h("div", { class: "auth-divider" }),
        signInButton,
        alertBox,
        h("p", { class: "auth-footnote" }, ["Acceso restringido a la cuenta de Google autorizada."]),
      ]),
    ])
  );
}
