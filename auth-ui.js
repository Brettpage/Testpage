// ============================================================
// auth-ui.js — Verdrahtet den Auth-Screen (index.html) mit auth.js
// ============================================================

import {
  isConfigured,
  usernameExists,
  registerPlayer,
  loginPlayer,
  getSession,
  setSession,
  clearSession,
  refreshPlayer,
  validateUsername
} from "./auth.js?v=1786964007";

let debounceTimer = null;

// Fügt zu jedem type="password"-Feld mit [data-toggle] einen kleinen
// Augen-Button zum Ein-/Ausblenden hinzu. Wiederverwendbar für Login,
// Registrierung und später das Passwort-ändern-Formular im Profil.
export function wirePasswordToggles(scope = document) {
  scope.querySelectorAll('input[type="password"][data-toggle]').forEach((input) => {
    if (input.dataset.toggled) return; // nicht doppelt verdrahten
    input.dataset.toggled = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pw-toggle";
    btn.textContent = "👁";
    btn.setAttribute("aria-label", "Passwort anzeigen");
    input.insertAdjacentElement("afterend", btn);
    const wrapper = document.createElement("div");
    wrapper.className = "pw-field";
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    wrapper.appendChild(btn);
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.textContent = show ? "🙈" : "👁";
    });
  });
}

export async function initAuthScreen(onAuthenticated) {
  const authScreen = document.getElementById("auth-screen");

  if (!isConfigured()) {
    authScreen.innerHTML = `
      <div class="auth-card">
        <div class="auth-brand">✦ SPRACHBRETT</div>
        <div class="auth-error" style="display:block;">
          Das Konto-System ist nicht konfiguriert (SUPABASE_URL/ANON_KEY in js/auth.js fehlen).
        </div>
      </div>`;
    return;
  }

  // Bereits angemeldet (Session auf diesem Gerät) -> serverseitig kurz
  // bestätigen (Konto könnte inzwischen gesperrt/gelöscht worden sein),
  // dann direkt starten statt erneut nach dem Passwort zu fragen.
  const existing = getSession();
  if (existing && existing.username) {
    authScreen.innerHTML = `<div class="auth-card"><div class="auth-brand">✦ SPRACHBRETT</div><div class="auth-sub">Melde an…</div></div>`;
    try {
      const player = await refreshPlayer(existing.username);
      onAuthenticated(player);
      return;
    } catch (err) {
      clearSession();
      // Weiter unten zum normalen Login-Screen durchfallen.
      location.reload();
      return;
    }
  }

  wirePasswordToggles();

  const tabLogin = document.getElementById("auth-tab-login");
  const tabRegister = document.getElementById("auth-tab-register");
  const formLogin = document.getElementById("auth-form-login");
  const formRegister = document.getElementById("auth-form-register");

  tabLogin.addEventListener("click", () => switchTab("login"));
  tabRegister.addEventListener("click", () => switchTab("register"));

  function switchTab(which) {
    const isLogin = which === "login";
    tabLogin.classList.toggle("active", isLogin);
    tabRegister.classList.toggle("active", !isLogin);
    formLogin.hidden = !isLogin;
    formRegister.hidden = isLogin;
  }

  // ---- Login ----
  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const errorBox = document.getElementById("login-error");
    const btn = document.getElementById("login-submit");
    errorBox.textContent = "";
    if (!username.trim() || !password) {
      errorBox.textContent = "Bitte Benutzername und Passwort eingeben.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Prüfe…";
    try {
      const player = await loginPlayer(username, password);
      setSession(player.username);
      onAuthenticated(player);
    } catch (err) {
      errorBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = "Anmelden";
    }
  });

  // ---- Registrierung: Live-Prüfung ob Benutzername schon existiert ----
  const regUsername = document.getElementById("register-username");
  const regStatus = document.getElementById("register-username-status");

  regUsername.addEventListener("input", () => {
    const name = regUsername.value.trim();
    clearTimeout(debounceTimer);
    if (!name) { regStatus.textContent = ""; regStatus.className = "username-status"; return; }
    const invalid = validateUsername(name);
    if (invalid) {
      regStatus.textContent = invalid;
      regStatus.className = "username-status bad";
      return;
    }
    regStatus.textContent = "Prüfe Verfügbarkeit…";
    regStatus.className = "username-status checking";
    debounceTimer = setTimeout(async () => {
      try {
        const taken = await usernameExists(name);
        if (regUsername.value.trim() !== name) return; // Eingabe hat sich zwischenzeitlich geändert
        regStatus.textContent = taken
          ? `„${name}" ist bereits vergeben.`
          : `„${name}" ist verfügbar.`;
        regStatus.className = "username-status " + (taken ? "bad" : "ok");
      } catch (err) {
        regStatus.textContent = "Verfügbarkeit konnte nicht geprüft werden: " + err.message;
        regStatus.className = "username-status bad";
      }
    }, 400);
  });

  // ---- Registrierung: Absenden ----
  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = regUsername.value;
    const password = document.getElementById("register-password").value;
    const password2 = document.getElementById("register-password2").value;
    const errorBox = document.getElementById("register-error");
    const btn = document.getElementById("register-submit");
    errorBox.textContent = "";

    const invalid = validateUsername(username.trim());
    if (invalid) { errorBox.textContent = invalid; return; }
    if (password.length < 4) { errorBox.textContent = "Das Passwort muss mindestens 4 Zeichen lang sein."; return; }
    if (password !== password2) { errorBox.textContent = "Die Passwörter stimmen nicht überein."; return; }

    btn.disabled = true;
    btn.textContent = "Erstelle Konto…";
    try {
      // Serverseitige, verbindliche Prüfung + Anlage — der Live-Check
      // oben ist nur Komfort, hier wird nochmal sauber abgelehnt, falls
      // der Name inzwischen (z.B. durch einen anderen Nutzer) vergeben wurde.
      const player = await registerPlayer(username, password);
      setSession(player.username);
      onAuthenticated(player);
    } catch (err) {
      errorBox.textContent = err.message;
      btn.disabled = false;
      btn.textContent = "Konto erstellen";
    }
  });
}
