import { registerRoute, startRouter, navigate } from "./router.js";
import { onAuthChange, enforceAllowedUser } from "./auth/auth-service.js";
import { withAuth } from "./auth/auth-guard.js";
import { renderLoginView } from "./views/login-view.js";
import { renderSongsListView } from "./views/songs-list-view.js";
import { renderSongEditView } from "./views/song-edit-view.js";
import { renderSongConfigView } from "./views/song-config-view.js";
import { renderLiveView } from "./views/song-live-view.js";

const root = document.getElementById("app");

registerRoute(
  "/",
  withAuth(() => navigate("/songs"))
);
registerRoute("/login", () => renderLoginView(root));
registerRoute(
  "/songs",
  withAuth((_params, user) => renderSongsListView(root, user))
);
registerRoute(
  "/songs/new",
  withAuth(() => renderSongEditView(root, null))
);
registerRoute(
  "/songs/:id",
  withAuth((params) => renderLiveView(root, params.id))
);
registerRoute(
  "/songs/:id/config",
  withAuth((params) => renderSongConfigView(root, params.id))
);
registerRoute(
  "/songs/:id/edit",
  withAuth((params) => renderSongEditView(root, params.id))
);

let started = false;

onAuthChange(async (rawUser) => {
  const user = await enforceAllowedUser(rawUser);
  const path = location.hash.slice(1) || "/";

  if (!started) {
    started = true;
    if (!user && path !== "/login") location.hash = "#/login";
    else if (user && path === "/login") location.hash = "#/songs";
    startRouter();
    return;
  }

  if (user && path === "/login") navigate("/songs");
  else if (!user) navigate("/login");
});
