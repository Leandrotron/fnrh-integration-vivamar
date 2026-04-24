window.APP_CONFIG = window.APP_CONFIG || {};
window.APP_CONFIG.API_BASE = window.APP_CONFIG.API_BASE || "";

(function initializeAppConfig(global) {
  const rawApiBase = String(global.APP_CONFIG.API_BASE || "").trim();
  const normalizedApiBase = rawApiBase.replace(/\/+$/, "");
  const hostname = window.location.hostname;
  const isLocalHost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "";
  const isFileProtocol = window.location.protocol === "file:";

  function resolveApiBase() {
    if (normalizedApiBase) {
      return normalizedApiBase;
    }

    if (isFileProtocol || isLocalHost) {
      return "http://localhost:3000";
    }

    return normalizedApiBase || "https://fnrh-integration-vivamar.onrender.com";
  }

  global.APP_CONFIG.API_BASE = normalizedApiBase;
  global.getApiBase = resolveApiBase;
})(window);
