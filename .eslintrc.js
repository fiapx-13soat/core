module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { sourceType: 'module', ecmaVersion: 2022 },
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended'
  ],
  root: true,
  env: { node: true, jest: true },
  ignorePatterns: ['dist', 'node_modules', 'jest.config.js', '.eslintrc.js'],
  rules: {
    // o domínio/serviços usam o non-null assertion pontualmente (ex.: canais já garantidos)
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    // `any` é permitido nos testes (mocks); no código de produção evitamos, mas sem travar o build
    '@typescript-eslint/no-explicit-any': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }]
  },
  overrides: [
    {
      // specs reimportam módulos após setar env/mocks — require() é legítimo aqui
      files: ['**/*.spec.ts'],
      rules: { '@typescript-eslint/no-require-imports': 'off', '@typescript-eslint/no-var-requires': 'off' }
    }
  ]
};
