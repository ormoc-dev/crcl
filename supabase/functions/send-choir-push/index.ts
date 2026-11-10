/**
 * Broadcast Web Push to all choir devices (works when CRC is closed).
 *
 * Secrets (Supabase → Edge Functions → Secrets):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 *
 * Deploy:
 *   supabase functions deploy send-choir-push --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import webpush from 'npm:web-push@3.6.7'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushBody = {
  kind?: string
  title?: string
  body?: string
  url?: string
  tag?: string
  excludeEndpoint?: string
  excludeDeviceId?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  try {
    const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || ''
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:choir@christusrex.app'
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

    if (!vapidPublic || !vapidPrivate) {
      return json({ error: 'VAPID keys not configured' }, 500)
    }
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Supabase env missing' }, 500)
    }

    const payload = (await req.json()) as PushBody
    const excludeEndpoint = String(payload.excludeEndpoint || '').trim()
    const excludeDeviceId = String(payload.excludeDeviceId || '').trim()

    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: rows, error: subErr } = await admin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, device_id')

    if (subErr) return json({ error: subErr.message }, 500)
    if (!rows?.length) return json({ ok: true, sent: 0 })

    const notification = {
      title: String(payload.title || 'Christus Rex Choir').slice(0, 80),
      body: String(payload.body || '').slice(0, 180),
      tag: payload.tag || undefined,
      url: payload.url || '#/',
      kind: payload.kind || 'generic',
      data: {
        url: payload.url || '#/',
        kind: payload.kind || 'generic',
      },
    }

    let sent = 0
    const stale: string[] = []

    for (const row of rows) {
      if (excludeEndpoint && row.endpoint === excludeEndpoint) continue
      if (excludeDeviceId && row.device_id === excludeDeviceId) continue

      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          JSON.stringify(notification),
          { TTL: 60 * 60 * 24, urgency: 'normal' },
        )
        sent += 1
      } catch (err) {
        const status = (err as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) stale.push(row.id)
      }
    }

    if (stale.length) {
      await admin.from('push_subscriptions').delete().in('id', stale)
    }

    return json({ ok: true, sent, pruned: stale.length })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Push failed' }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
