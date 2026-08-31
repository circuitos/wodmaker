/* Preferences that survive a reload.
 *
 * Everything else in the app is deliberately stateless: a reload gives you a
 * fresh workout. These are the few choices that are about the person rather
 * than the session, so re-asking for them every visit is just friction.
 *
 * localStorage throws rather than returning null in some contexts (private
 * windows, browsers set to block site data), so every access is guarded. A
 * preference that cannot be saved is not an error worth surfacing: the app
 * works, it just forgets. */

const KEY = "wodmaker.prefs";

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function loadPref(name, fallback) {
  const v = readAll()[name];
  return v === undefined ? fallback : v;
}

export function savePref(name, value) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [name]: value }));
  } catch {
    /* forgetting is the acceptable failure here */
  }
}
