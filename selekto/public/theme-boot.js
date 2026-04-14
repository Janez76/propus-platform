(function () {
  try {
    var k = "propus-preview-theme";
    var s = localStorage.getItem(k);
    var dark = s ? s === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.body.classList.add("theme-dark");
  } catch (e) {
    /* ignore */
  }
})();
