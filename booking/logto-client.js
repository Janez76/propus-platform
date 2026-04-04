/**
 * Logto Management API Client – No-Op Shim
 *
 * Logto wurde aus der Plattform entfernt. Alle Methoden sind inaktiv.
 * `isConfigured()` gibt immer false zurück, sodass alle Aufrufer sauber
 * abbrechen, ohne zu werfen.
 */

function notConfigured(name) {
  return async () => {
    throw new Error(`Logto wurde entfernt. '${name}' ist nicht mehr verfügbar.`);
  };
}

function isConfigured() {
  return false;
}

module.exports = {
  isConfigured,
  getManagementToken: notConfigured('getManagementToken'),
  mgmtApi: notConfigured('mgmtApi'),
  getRoles: async () => new Map(),
  invalidateRolesCache: () => {},
  ensureGlobalRole: async () => null,
  getUserRoles: async () => [],
  assignRolesToUser: async () => {},
  removeRolesFromUser: async () => {},
  findUserByEmail: async () => null,
  getUserById: async () => null,
  updateUser: notConfigured('updateUser'),
  updateUserCustomData: notConfigured('updateUserCustomData'),
  updateUserPassword: notConfigured('updateUserPassword'),
  listOrganizations: async () => [],
  createOrganization: notConfigured('createOrganization'),
  updateOrganization: notConfigured('updateOrganization'),
  deleteOrganization: notConfigured('deleteOrganization'),
  addUsersToOrganization: async () => null,
  removeUserFromOrganization: async () => null,
  getOrganizationUsers: async () => [],
  listOrganizationRoles: async () => new Map(),
  ensureOrganizationRole: async () => null,
  assignOrganizationRolesToUser: async () => null,
  listUserOrganizationRoles: async () => [],
  removeOrganizationRolesFromUser: async () => {},
};
