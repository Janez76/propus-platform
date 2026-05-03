/**
 * Async-Error-Shim für Express 4.
 *
 * Express 4 leitet abgelehnte Promises aus async-Handlern NICHT automatisch an
 * `next(err)` weiter. Ergebnis: der Client hängt bis zum Timeout, der globale
 * Error-Handler springt nie an, und Logs zeigen nur "UnhandledPromiseRejection".
 *
 * Dieser Shim patcht `Layer.prototype.handle_request` so, dass jeder Promise-
 * Reject und jeder synchrone Throw über `next(err)` zum Express-Error-Handler
 * gelangt. Reine Error-Middleware (Signatur mit 4 Argumenten) wird nicht
 * angefasst.
 *
 * Wirkung: alle bestehenden `router.get(..., async (req, res) => {...})` ohne
 * try/catch werden automatisch sicher.
 *
 * Quelle des Patches: Pattern aus express-async-errors (MIT). Inline
 * implementiert um keine neue Dependency einzuführen. Robust gegen Express-
 * Versionen, in denen das interne Layer-Modul nicht erreichbar ist.
 */

let Layer;
try {
  // Express 4 / 5 stellen Layer typischerweise hier bereit.
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
  // Strukturwandel im Express-Modul: nicht crashen, nur warnen. Routen ohne
  // try/catch bleiben dann anfällig, aber das Booten der App ist wichtiger.
  // eslint-disable-next-line no-console
  console.warn('[tours] async-error-shim: express/lib/router/layer nicht gefunden, Shim NICHT aktiv.');
}

module.exports = {};
