# Christus Rex Choir Song Lyrics

Static HTML/CSS/JS PWA. Deployed the same way as the movie/lantaw app.

## Local

```bash
cp .env.example .env
# fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm run sync-env
npx serve .
```

## Build (same as movie app)

```bash
npm run build
```

Creates `dist/` with env synced + stamped cache busting.

## Vercel

1. Import `ormoc-dev/crcl`
2. Framework: **Other** (vercel.json sets `framework: null`)
3. Build uses `vercel.json`:
   - Install: `echo skip-install`
   - Build: sync-env → build-dist → stamp-build
   - Output: `dist`
4. Add Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_VAPID_PUBLIC_KEY` (for closed-app notifications)
5. Redeploy

Also run these once in the Supabase SQL editor (in order):
`supabase/lyrics.sql`, `supabase/schedule.sql`, `supabase/practice-docs.sql`, `supabase/push-subscriptions.sql`.

## Closed-app notifications (like the movie app)

CRC used to notify only while the app was open. Closed-app alerts need **Web Push** (same idea as LANTAW).

1. Generate keys: `npm i -D web-push && npm run generate-vapid`
2. Put `VITE_VAPID_PUBLIC_KEY` in `.env` + Vercel
3. Put `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Supabase → Edge Functions → Secrets
4. Run `supabase/push-subscriptions.sql`
5. Deploy: `supabase functions deploy send-choir-push --no-verify-jwt`
6. `npm run sync-env` and redeploy the site
7. On each choir phone:
   - Install CRC to **Home Screen** (required on iPhone)
   - Settings → Notifications → **Enable**

Details: `supabase/functions/send-choir-push/README.md`
