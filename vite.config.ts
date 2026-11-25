import { defineConfig, loadEnv, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import QRCode from 'qrcode'

export default defineConfig(async ({ command, mode }) => {
  const fixture = command === 'serve' && mode === 'fixture'
  const local = command === 'serve' && mode === 'supabase-local'
  const hosted = mode === 'supabase-hosted'
  const deploy = hosted && command === 'build'
  const keyName = hosted ? 'RADIO_HOSTED_PUBLISHABLE_KEY' : 'RADIO_LOCAL_PUBLISHABLE_KEY'
  const key = local || hosted ? loadEnv(mode, '.', keyName)[keyName] : ''
  if ((local || hosted) && !key?.startsWith('sb_publishable_'))
    throw Error('Set ' + keyName + ' for the selected Supabase project.')
  const publicOrigin = deploy ? loadEnv(mode, '.', 'RADIO_DEPLOYED_ORIGIN').RADIO_DEPLOYED_ORIGIN : ''
  if (deploy) {
    const origin = URL.parse(publicOrigin || '')
    if (!origin || origin.protocol !== 'https:' || origin.origin !== publicOrigin)
      throw Error('Set RADIO_DEPLOYED_ORIGIN to the exact public HTTPS site origin.')
  }
  return {
    plugins: [
      tailwindcss(),
      ...(fixture ? [(await import('./scripts/fixture-server.mjs')).fixturePlugin()] : []),
      ...(publicOrigin ? [{
        name: 'listener-qr',
        async generateBundle() {
          this.emitFile({
            type: 'asset', fileName: 'listen-qr.svg',
            source: await QRCode.toString(publicOrigin + '/listen', { type: 'svg', margin: 4 }),
          })
        },
      } satisfies Plugin] : []),
    ],
    envPrefix: [],
    define: {
      __RADIO_MODE__: JSON.stringify(fixture ? 'fixture' : local ? 'local' : hosted ? 'hosted' : 'disconnected'),
      __RADIO_PUBLISHABLE_KEY__: JSON.stringify(key || ''),
      __RADIO_DEPLOYED_ORIGIN__: JSON.stringify(publicOrigin || ''),
    },
    server: {
      host: '127.0.0.1',
      watch: { ignored: ['**/.verification/**'] },
      fs: {
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key}',
          '**/.git/**',
          '**/.verification/**',
          '**/supabase/.temp/**',
        ],
      },
    },
  }
})
