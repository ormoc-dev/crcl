/**
 * Generate Web Push VAPID keys for closed-app notifications.
 * Usage: npm i -D web-push && node scripts/generate-vapid.mjs
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const webpush = require('web-push')

const keys = webpush.generateVAPIDKeys()
console.log(`
Add to .env (and Vercel):
VITE_VAPID_PUBLIC_KEY=${keys.publicKey}

Add to Supabase → Edge Functions → Secrets (NOT the client):
VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:choir@christusrex.app

Then:
  npm run sync-env
  supabase functions deploy send-choir-push --no-verify-jwt
`)
