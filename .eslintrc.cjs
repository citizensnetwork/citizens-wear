/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  extends: [require.resolve('@citizens-wear/config/eslint-preset.cjs')],
  ignorePatterns: ['node_modules', 'dist', 'build', '.next', '.turbo', 'coverage', 'apps', 'packages'],
};
