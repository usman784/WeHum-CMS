import { resolve } from 'node:path';
import js from '@eslint/js';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'starter', 'design', 'public', 'playwright-report', 'test-results', 'src/lib/api-types.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tailwind.configs['flat/recommended'],
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
    languageOptions: { globals: globals.browser },
    settings: { tailwindcss: { callees: ['cn', 'cva'], config: resolve(import.meta.dirname, 'tailwind.config.ts') } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Class order is Prettier's job; the plugin checks only that classes exist in the Tailwind config (tokens only, spec §16).
      'tailwindcss/classnames-order': 'off',
      'tailwindcss/no-custom-classname': ['error', { whitelist: ['tabular'] }],
      // Components never call fetch directly (spec §6.1): only lib/api.ts and lib/upload.ts may.
      'no-restricted-globals': ['error', { name: 'fetch', message: 'Use api() from lib/api.ts.' }],
    },
  },
  { files: ['src/lib/api.ts', 'src/lib/upload.ts', 'src/**/*.test.{ts,tsx}'], rules: { 'no-restricted-globals': 'off' } },
  { files: ['*.{js,ts,mjs}', 'scripts/**', 'e2e/**'], languageOptions: { globals: globals.node } },
);
