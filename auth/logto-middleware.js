/**
 * Logto OIDC Auth Middleware – No-Op Shim
 *
 * Logto wurde aus der Plattform entfernt. Alle Methoden sind inaktiv.
 * Die `createLogtoAuth`-Factory gibt eine inaktive Instanz zurück,
 * sodass bestehende Call-Sites nicht brechen.
 */

function createLogtoAuth() {
  function routes() {
    const { Router } = require('express');
    return Router();
  }

  function requireAuth() {
    return (_req, _res, next) => next();
  }

  function getUser() {
    return null;
  }

  return {
    enabled: false,
    routes,
    requireAuth,
    getUser,
    appId: '',
    logtoEndpoint: '',
  };
}

module.exports = { createLogtoAuth };
