// Loads VERSION file and renders it into the footer (if present).
// Keep it dependency-free so it works for both index.html and admin.html.
(function () {
  function normalizeVersion(rawVersion) {
    var v = String(rawVersion || "").trim();
    if (!v) return "";
    // Strip UTF BOM and any stray non-ASCII control chars from file encoding issues.
    v = v.replace(/^\uFEFF/, "").replace(/[^\x20-\x7E]/g, "");
    v = v.replace(/\s+/g, "");
    v = v.replace(/^v+/i, "");
    v = v.replace(/[^a-zA-Z0-9._-]/g, "");
    if (!v) return "";
    return "v" + v;
  }

  function setVersionText(version) {
    var el = document.getElementById("appVersion");
    if (!el) return;
    var v = normalizeVersion(version);
    if (!v) {
      el.textContent = "";
      el.style.display = "none";
      return;
    }
    el.textContent = " | " + v;
    el.style.display = "";
  }

  function loadVersion() {
    // Cache-bust to avoid stale version after redeploy.
    var url = "VERSION?cb=" + Date.now();
    fetch(url, { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("VERSION fetch failed: " + r.status);
        return r.text();
      })
      .then(function (t) {
        setVersionText(t);
      })
      .catch(function (err) {
        // Non-fatal (e.g. file://, missing file, etc.)
        setVersionText("");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadVersion);
  } else {
    loadVersion();
  }
})();

