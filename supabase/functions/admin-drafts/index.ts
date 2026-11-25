import { draftsHandler } from '../_shared/drafts-handler.mjs'
import { programSync } from '../_shared/program-sync.mjs'
import { dailyOrderSync } from '../_shared/daily-order.mjs'

const url = Deno.env.get('SUPABASE_URL')
const station = {
  url,
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  provider: {
    AZURACAST_ORIGIN: Deno.env.get('AZURACAST_ORIGIN'),
    AZURACAST_STATION_ID: Deno.env.get('AZURACAST_STATION_ID'),
    AZURACAST_API_KEY: Deno.env.get('AZURACAST_API_KEY'),
    AZURACAST_DAILY_PLAYLIST_ID: Deno.env.get('AZURACAST_DAILY_PLAYLIST_ID'),
    AZURACAST_RECOVERY_PLAYLIST_ID: Deno.env.get('AZURACAST_RECOVERY_PLAYLIST_ID'),
    AZURACAST_PREVIEW_ONLY_MEDIA_IDS: Deno.env.get('AZURACAST_PREVIEW_ONLY_MEDIA_IDS'),
  },
}

Deno.serve(
  draftsHandler({
    url,
    publicKey: Deno.env.get('SUPABASE_ANON_KEY'),
    origin: Deno.env.get('RADIO_WEB_ORIGIN'),
    deployedOrigin: Deno.env.get('RADIO_DEPLOYED_ORIGIN'),
    sync: programSync(station),
    dailyOrder: dailyOrderSync(station),
  }),
)
