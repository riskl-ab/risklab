(() => {
  "use strict";

  const DEMO_USERS = {
    "alugoga": {
      password: "216267899",
      label: "Jefatura de Riesgos Financieros",
      permissions: { laboratorio: true, captura: true }
    },
    "ovallejomo": {
      password: "ovallejomo",
      label: "Dirección de Análisis",
      permissions: { laboratorio: false, captura: false }
    },
    "alandinja": {
      password: "Onedirection",
      label: "Coordinación de Estudios Actuariales",
      permissions: { laboratorio: false, captura: false }
    },
    "aramirezza": {
      password: "aramirezza",
      label: "Subdirección de Planeación",
      permissions: { laboratorio: false, captura: false }
    },
    "hcastanedaar": {
      password: "5020103",
      label: "Coordinación de Análisis de Inversiones en Capitales, Divisas y Derivados",
      permissions: { laboratorio: false, captura: false }
    },
    "jaraujova": {
      password: "5020103",
      label: "Dirección de Inversiones",
      permissions: { laboratorio: false, captura: false }
    },    
    "hgomezre": {
      password: "hgomezre",
      label: "Coordinación de Riesgos Financieros",
      permissions: { laboratorio: false, captura: false }
    }
  };

  function initDemoLogin() {
    const form = document.getElementById("login-form");
    const overlay = document.getElementById("login-overlay");
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const passwordToggle = document.getElementById("login-password-toggle");
    const error = document.getElementById("login-error");

    if (!form || !overlay || !usernameInput || !passwordInput) return;

    document.body.classList.add("login-locked");
    overlay.hidden = false;
    usernameInput.focus({ preventScroll: true });

    passwordToggle?.addEventListener("click", () => {
      const showPassword = passwordInput.type === "password";
      passwordInput.type = showPassword ? "text" : "password";
      passwordToggle.textContent = showPassword ? "Ocultar" : "Ver";
      passwordToggle.setAttribute(
        "aria-label",
        showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
      );
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();

      const username = usernameInput.value.trim().toLowerCase();
      const password = passwordInput.value;
      const account = DEMO_USERS[username];

      if (!account || account.password !== password) {
        error.hidden = false;
        passwordInput.setAttribute("aria-invalid", "true");
        passwordInput.value = "";
        passwordInput.focus();
        return;
      }

      error.hidden = true;
      passwordInput.removeAttribute("aria-invalid");

      // No se guarda la contraseña ni una sesión persistente.
      // Al recargar la página se solicitará acceso nuevamente.
      overlay.classList.add("login-overlay-closing");
      overlay.hidden = true;
      document.body.classList.remove("login-locked");

      window.dispatchEvent(new CustomEvent("risklab:authenticated", {
        detail: {
          username,
          role: account.label,
          permissions: account.permissions || {
            laboratorio: false,
            captura: false
          },
          demo: true
        }
      }));
    });

    [usernameInput, passwordInput].forEach((input) => {
      input.addEventListener("input", () => {
        error.hidden = true;
        passwordInput.removeAttribute("aria-invalid");
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDemoLogin, { once: true });
  } else {
    initDemoLogin();
  }
})();
