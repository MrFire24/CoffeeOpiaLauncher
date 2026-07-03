/**
 * LastShot CDN — Cloudflare Worker that serves the launcher's distribution
 * files (distribution.json + mod jars) out of an R2 bucket.
 *
 * Setup:
 *   1. Create an R2 bucket (e.g. "lastshot-pack") and upload the Nebula output tree into it.
 *   2. Create a Worker, paste this code.
 *   3. Bind the bucket to the Worker with variable name  BUCKET
 *      (Worker → Settings → Bindings → Add → R2 bucket → name it exactly "BUCKET").
 *   4. Deploy. The public URL becomes  https://<worker>.<subdomain>.workers.dev
 *   5. In the launcher, set in app/assets/js/distromanager.js:
 *        exports.REMOTE_DISTRO_URL = 'https://<worker>.<subdomain>.workers.dev/distribution.json'
 *      and in Nebula's .env set  BASE_URL=https://<worker>.<subdomain>.workers.dev/
 *
 * Edge cache (caches.default): many clients download the SAME pack — the first
 * download of each file warms Cloudflare's edge cache, the rest are served from
 * it without hitting R2. Good under a launch spike.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    const key = decodeURIComponent(url.pathname.slice(1)) // strip leading "/"
    if (!key) return new Response('LastShot CDN', { status: 200 })
    if (request.method !== 'GET') return new Response('Method Not Allowed', { status: 405 })

    const cache = caches.default
    let response = await cache.match(request)
    if (response) return response

    const object = await env.BUCKET.get(key)
    if (!object) return new Response('Not Found', { status: 404 })

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')

    response = new Response(object.body, { headers })
    ctx.waitUntil(cache.put(request, response.clone()))
    return response
  }
}
