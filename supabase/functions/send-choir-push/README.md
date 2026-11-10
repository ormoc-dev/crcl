# send-choir-push

Sends Web Push to every subscribed choir device — including when the CRC app is **fully closed**.

## One-time setup

1. Run SQL: `supabase/push-subscriptions.sql`
2. Generate keys (from project root):

```bash
npm i -D web-push
node scripts/generate-vapid.mjs
```

3. Add to `.env` + Vercel:

```
VITE_VAPID_PUBLIC_KEY=...
```

4. Add Supabase Edge secrets (Dashboard → Edge Functions → Secrets):

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:choir@christusrex.app
```

5. Deploy:

```bash
supabase functions deploy send-choir-push --no-verify-jwt
```

6. `npm run sync-env` then redeploy the website.

## Choir phones

1. Install CRC to Home Screen (required on iPhone).
2. Settings → Notifications → **Enable** (allow the browser prompt).
3. Keep the PWA installed so push can wake it when closed.
