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
5. Redeploy

Also run `supabase/schema.sql` once in the Supabase SQL editor.
