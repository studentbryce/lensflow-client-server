import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist/**', '**/node_modules/**']),

  // Browser-based React application only.
  {
    files: ['src/**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Express API, Node.js tests, and local tooling.
  {
    files: [
      'server/**/*.{js,mjs}',
      'documents/**/*.{js,mjs}',
      '*.{js,mjs}',
    ],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
  },
])
