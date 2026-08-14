import { h, mount } from "../utils/dom-helpers.js";
import { signInWithGoogle, takeNotAllowedError } from "../auth/auth-service.js";

export function renderLoginView(root) {
  const notAllowed = takeNotAllowedError();
  const errorBox = h("p", { class: notAllowed ? "error" : "error hidden" }, [
    notAllowed ? "Esa cuenta de Google no tiene acceso a esta app." : "",
  ]);

  mount(
    root,
    h("div", { class: "screen screen-centered" }, [
      h("h1", {}, ["K-Rez"]),
      h(
        "button",
        {
          class: "primary",
          onclick: async () => {
            try {
              await signInWithGoogle();
            } catch (err) {
              errorBox.textContent = "No se pudo completar el inicio de sesión con Google.";
              errorBox.classList.remove("hidden");
            }
          },
        },
        ["Iniciar sesión con Google"]
      ),
      errorBox,
    ])
  );
}
