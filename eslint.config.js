import eslint from '@eslint/js';
import tsEslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

const ignores = [
  '**/build/**/*',
  '**/node_modules/**/*',
  '**/coverage/**/*',
  '**/docs/**/*',
  '**/.claude/**/*',
  '**/compat/**/*',
];

const stylisticConfig = {
  rules: {
    'lines-around-comment': ['error', { beforeBlockComment: false }],
    quotes: [
      'error',
      'double',
      {
        allowTemplateLiterals: true,
        avoidEscape: true,
      },
    ],
  },
};

const config = tsEslint.config(
  {
    ignores,
  },
  eslint.configs.recommended,
  stylisticConfig,
  {
    files: ['**/*.ts'],
    extends: tsEslint.configs.strict,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-empty-function': 'error',
      '@typescript-eslint/no-empty-object-type': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-require-imports': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'error',
      '@typescript-eslint/prefer-literal-enum-member': 'off',
      '@typescript-eslint/return-await': 'error',
      'no-return-await': 'off',
      useUnknownInCatchVariables: 'off',
    },
  },
  {
    // Repo tooling is new code with no legacy to accommodate, so it is held to
    // the type-aware strict tier rather than the syntactic one the packages use.
    files: ['tools/**/*.ts'],
    extends: tsEslint.configs.strictTypeChecked,
  },
  {
    // node:test registers a suite synchronously and reports the promise it
    // returns through the runner, so those calls are the documented exception
    // the rule provides for — an allowance for one known-safe caller, not the
    // check being switched off. Everything else in tools/ stays fully checked.
    files: ['tools/**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          allowForKnownSafeCalls: [
            { from: 'package', package: 'node:test', name: ['describe', 'it'] },
          ],
        },
      ],
    },
  },
  eslintPluginPrettierRecommended
);

export default config;
