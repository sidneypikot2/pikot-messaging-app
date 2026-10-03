// Where the login token and user are kept: sessionStorage, or localStorage with
// "remember me". Used by every page. No UI.

const TOKEN_KEY = "pikotchat_token";
const USER_KEY = "pikotchat_user";

const Session = {
  save(token, user, remember) {
    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(TOKEN_KEY, token);
    store.setItem(USER_KEY, JSON.stringify(user));
  },

  token() {
    return window.localStorage.getItem(TOKEN_KEY) || window.sessionStorage.getItem(TOKEN_KEY);
  },

  user() {
    const raw = window.localStorage.getItem(USER_KEY) || window.sessionStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },

  // The signed-in user changed their profile (KAN-63): rewrite it wherever it's kept.
  updateUser(user) {
    [window.localStorage, window.sessionStorage].forEach((store) => {
      if (store.getItem(USER_KEY)) store.setItem(USER_KEY, JSON.stringify(user));
    });
  },

  clear() {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(USER_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(USER_KEY);
  },
};
