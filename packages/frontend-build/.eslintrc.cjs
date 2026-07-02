module.exports = {
  root: true,
  extends: [require.resolve('@citizens-wear/config/eslint-preset.cjs')],
  env: { node: true },
  overrides: [
    {
      // index.js is intentionally plain CommonJS — `node scripts/build-frontend.js`
      // in each host app requires it directly, with no transpile step.
      files: ['*.js', '*.cjs'],
      parserOptions: { sourceType: 'script' },
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
  ],
};
