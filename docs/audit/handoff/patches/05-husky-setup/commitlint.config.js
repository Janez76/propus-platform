module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['app', 'booking', 'tours', 'platform', 'core', 'auth', 'website', 'infra', 'ci', 'db', 'deps', 'dx', 'docs'],
    ],
    'header-max-length': [2, 'always', 100],
  },
};
