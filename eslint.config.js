import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', '.verification/**', '.wrangler/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { files: ['src/**/*.{ts,tsx}'], languageOptions: { globals: globals.browser } },
  { files: ['**/*.{js,mjs}', 'vite.config.ts'], languageOptions: { globals: globals.node } },
  {
    files: ['scripts/check-shell.mjs', 'scripts/check-fixture.mjs', 'scripts/check-public-player.mjs', 'scripts/check-player-recovery.mjs'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
)
