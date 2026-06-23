import { WebStorageStateStore } from "oidc-client-ts";
import type { AuthProviderProps } from "react-oidc-context";

// Tokens live in sessionStorage: they survive page refreshes within the tab
// but are cleared when the tab closes, which matches the expected session
// lifecycle for a gambling-adjacent app.
const userStore = new WebStorageStateStore({ store: window.sessionStorage });

export const oidcConfig: AuthProviderProps = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY as string,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID as string,
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI as string,
  scope: "openid profile email",
  response_type: "code",
  post_logout_redirect_uri: window.location.origin,
  userStore,
  onSigninCallback: () => {
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};
