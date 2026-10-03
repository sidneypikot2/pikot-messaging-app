// Settings → Preferences (KAN-63), kept on this device only: appearance (System, Light
// or Dark) and message sounds. Loaded in <head>, ahead of the other chat scripts, so the
// chosen appearance is on <html> before the page first paints. No UI.

const THEME_KEY = "pikotchat_theme";
const SOUNDS_KEY = "pikotchat_sounds";
const systemDarkQuery = window.matchMedia("(prefers-color-scheme: dark)");

// Storage can throw (blocked site data, some private windows); the defaults stand then.
function readPreference(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key, value) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Not saved, but still applied for this page.
  }
}

const Preferences = {
  // "system" | "light" | "dark"
  theme() {
    const theme = readPreference(THEME_KEY);
    return theme === "light" || theme === "dark" ? theme : "system";
  },

  setTheme(theme) {
    writePreference(THEME_KEY, theme === "system" ? null : theme);
    this.applyTheme();
  },

  // System leaves it to base.css's prefers-color-scheme block; Light or Dark pins it.
  applyTheme() {
    const theme = this.theme();
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.dataset.theme = theme;
  },

  isDark() {
    const theme = this.theme();
    return theme === "dark" || (theme === "system" && systemDarkQuery.matches);
  },

  soundsOn() {
    return readPreference(SOUNDS_KEY) !== "off";
  },

  setSounds(on) {
    writePreference(SOUNDS_KEY, on ? null : "off");
  },
};

Preferences.applyTheme();
