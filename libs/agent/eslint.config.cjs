const baseConfig = require('../../eslint.config.cjs');

module.exports = [
  {
    ignores: ['**/dist']
  },
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {},
    languageOptions: {
      parserOptions: {
        project: ['libs/agent/tsconfig.*?.json']
      }
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {}
  },
  {
    files: ['**/*.js', '**/*.jsx'],
    rules: {}
  }
];
