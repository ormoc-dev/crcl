# CRCL · Choir Lyrics PWA

Plain HTML, CSS, and JavaScript choir lyrics viewer. Installable as a PWA and usable offline.

## Features

- Lyrics list + full lyrics view
- Progressive Web App (install on phone/desktop)
- Offline app shell via service worker
- Lyrics saved in IndexedDB for offline reading
- Ready for Supabase + Vercel

## Structure

```text
crcl/
├── index.html
├── manifest.webmanifest
├── sw.js
├── css/main.css
├── js/
│   ├── main.js
│   ├── router.js
│   ├── config.js
│   ├── components/
│   ├── pages/
│   └── lib/
│       ├── lyrics-store.js
│       ├── register-sw.js
│       └── supabase.js
└── public/assets/icon/
```

## Local

Service workers need HTTPS or `localhost`:

```bash
cd crcl
npx serve .
```

Open the URL, use the app once online, then try airplane mode.

## Offline notes

1. First visit caches the app files in the service worker
2. Sample lyrics are stored in IndexedDB automatically
3. Later, sync from Supabase into `lyrics-store` so choir songs stay available offline
