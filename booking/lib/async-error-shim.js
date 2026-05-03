/**
 * Async-Error-Shim für Express 4. Siehe `tours/lib/async-error-shim.js` für
 * den vollständigen Kontext. Inline-Kopie, damit beide Sub-Apps unabhängig
 * deploybar bleiben.
 */

let Layer;
try {
  Layer = require('express/lib/router/layer');
} catch (_e) {
  Layer = null;
}

if (Layer && Layer.prototype && !Layer.prototype.__propusAsyncShimInstalled) {
  const original = Layer.prototype.handle_request;
  Layer.prototype.handle_request = function handle(req, res, next) {
    const fn = this.handle;
    if (!fn || fn.length > 3) return original.apply(this, arguments);
    try {
      const result = fn(req, res, next);
      if (result && typeof result.then === 'function' && typeof result.catch === 'function') {
        result.catch(next);
      }
    } catch (err) {
      next(err);
    }
  };
  Layer.prototype.__propusAsyncShimInstalled = true;
} else if (!Layer) {
  // eslint-disable-next-line no-console
  console.warn('[booking] async-error-shim: express/lib/router/layer nicht gefunden, Shim NICHT aktiv.');
}

module.exports = {};
