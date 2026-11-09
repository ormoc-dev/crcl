import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { config } from '../config.js'

let client = null

export function getSupabase() {
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn(
      'Missing Supabase keys. Set them in js/config.js (see .env.example).',
    )
    return null
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey)
  }

  return client
}
